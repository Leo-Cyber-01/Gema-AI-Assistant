import { AudioStreamPlayer } from "./audio/AudioStreamPlayer.js";

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const arrayBufferToBase64 = (buffer) => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
};

const base64ToInt16 = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Int16Array(bytes.buffer);
};

const getWebSocketUrl = (params = {}) => {
  const explicitUrl = import.meta.env.VITE_GEMINI_WS_URL;
  let baseUrl = "";
  
  if (explicitUrl) {
    baseUrl = explicitUrl;
  } else {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host = import.meta.env.VITE_GEMINI_WS_HOST || window.location.hostname;
    const port = import.meta.env.VITE_GEMINI_WS_PORT || "8765";
    baseUrl = `${protocol}://${host}:${port}`;
  }

  // Append query parameters (e.g. ?voice=Aoede&persona=Miya)
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) urlParams.append(key, value);
  }
  
  const queryString = urlParams.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
};

export class GeminiLiveSession {
  constructor() {
    this.wsUrl = null; // Will be set on connect
    this.ws = null;
    this.callbacks = {};
    this.audioPlayer = new AudioStreamPlayer();
    this.audioSampleRate = null;
    this.manualDisconnect = false;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.pingInterval = null;
    this.status = "OFFLINE";
    this.connectParams = {};

    this.micStream = null;
    this.micContext = null;
    this.micSource = null;
    this.micNode = null;
    this.micSink = null;
    this.micActive = false;

    this.screenStream = null;
    this.screenVideo = null;
    this.screenCanvas = null;
    this.screenInterval = null;
    this.screenActive = false;

    this.lastAudioAt = 0;
    this.lastUpdateAt = performance.now();
    this.visemeScores = {};
    this.frequencyBuffer = null;
    this.timeDomainBuffer = null;
    this.visemeState = {
      jawOpen: 0,
      aa: 0,
      ih: 0,
      ou: 0,
      ee: 0,
      oh: 0,
      mouthWidth: 0,
    };
  }

  async connect(callbacks = {}, params = {}) {
    this.callbacks = callbacks;
    this.connectParams = params;
    this.manualDisconnect = false;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    await this.#openSocket();
  }

  /**
   * Resume all audio contexts. Call this on a user gesture (click/input).
   */
  async resume() {
    try {
      if (this.micContext && this.micContext.state === "suspended") {
        await this.micContext.resume();
      }
      if (this.audioPlayer) {
        // Pre-initialize with default sample rate if not already initialized
        // This ensures the AudioContext is created/resumed during a user gesture.
        if (!this.audioPlayer.initialized) {
          await this.audioPlayer.init({ sampleRate: 24000 });
        }
        await this.audioPlayer.resume();
      }
    } catch (err) {
      console.warn("[GeminiLiveSession] failed to resume audio contexts:", err);
    }
  }

  async #openSocket() {
    this.callbacks.onStatus?.("CONNECTING");

    const url = getWebSocketUrl(this.connectParams);
    this.wsUrl = url;

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.callbacks.onConnectionChange?.(true);
        this.callbacks.onStatus?.("IDLE");
        
        // Start Heartbeat
        this.pingInterval = window.setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 10000); // Ping every 10s

        resolve();
      };

      ws.onmessage = async (event) => {
        const text = typeof event.data === "string" ? event.data : await event.data.text();
        try {
          const payload = JSON.parse(text);
          await this.#handleServerMessage(payload);
        } catch (error) {
          console.error("[GeminiRelay] Invalid message", error);
        }
      };

      ws.onerror = (error) => {
        this.callbacks.onError?.("WebSocket error while talking to the relay server.");
        reject(error);
      };

      ws.onclose = () => {
        if (this.pingInterval) {
          window.clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        this.callbacks.onConnectionChange?.(false);
        this.ws = null;

        if (this.manualDisconnect) {
          this.callbacks.onStatus?.("OFFLINE");
          return;
        }

        this.callbacks.onStatus?.("RECONNECTING");
        this.#scheduleReconnect();
      };
    });
  }

  #scheduleReconnect() {
    if (this.reconnectTimer || this.manualDisconnect) return;
    const delay = Math.min(5000, 500 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.#openSocket();
      } catch (error) {
        console.error("[GeminiRelay] reconnect failed", error);
        this.#scheduleReconnect();
      }
    }, delay);
  }

  async #handleServerMessage(payload) {
    switch (payload.type) {
      case "session.connected":
        this.callbacks.onSessionConnected?.(payload);
        break;
      case "session.ready":
        this.callbacks.onStatus?.("IDLE");
        this.callbacks.onReady?.();
        break;
      case "session.disconnected":
        await this.stopMicrophone();
        this.stopScreenShare();
        this.callbacks.onStatus?.("OFFLINE");
        this.callbacks.onError?.(payload.message || "Gemini live session disconnected");
        break;
      case "input.transcript":
        this.callbacks.onUserTranscript?.(payload.text || "");
        break;
      case "output.text":
      case "output.transcript":
        this.callbacks.onAssistantText?.(payload.text || "");
        break;
      case "output.audio":
        await this.#playAudioChunk(payload);
        break;
      case "micro-expression":
        this.callbacks.onMicroExpression?.(payload);
        break;
      case "turn.complete":
        window.setTimeout(() => {
          if (performance.now() - this.lastAudioAt > 220) {
            this.callbacks.onStatus?.("IDLE");
          }
        }, 120);
        this.callbacks.onTurnComplete?.(payload);
        break;
      case "turn.interrupted":
        this.callbacks.onStatus?.("IDLE");
        this.callbacks.onInterrupted?.();
        break;
      case "session.waiting_for_input":
        if (performance.now() - this.lastAudioAt > 220) {
          this.callbacks.onStatus?.("IDLE");
        }
        break;
      case "error":
        this.callbacks.onError?.(payload.message || "Gemini relay error");
        break;
      default:
        break;
    }
  }

  async #playAudioChunk(payload) {
    if (payload.expression) {
      this.callbacks.onMicroExpression?.(payload);
    }
    const sampleRate = payload.sampleRate || 24000;
    if (!this.audioSampleRate || sampleRate !== this.audioSampleRate) {
      this.audioSampleRate = sampleRate;
      await this.audioPlayer.init({ sampleRate, channels: 1 });
    }

    try {
      await this.audioPlayer.resume();
      const headAudio = this.audioPlayer.getHeadAudio();
      if (headAudio && !headAudio.onvalue) {
        headAudio.onvalue = (name, value) => { this.visemeScores[name] = value; };
      }
    } catch (error) {
      console.warn("[GeminiRelay] audio resume deferred until next user gesture", error);
    }
    this.audioPlayer.push(base64ToInt16(payload.data));
    this.lastAudioAt = performance.now();
    this.callbacks.onStatus?.("SPEAKING");
  }

  #send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Gemini relay is not connected");
    }
    this.ws.send(JSON.stringify(payload));
  }

  async sendText(text) {
    const trimmed = text?.trim();
    if (!trimmed) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect(this.callbacks);
    }
    this.callbacks.onStatus?.("THINKING");
    this.#send({ type: "input.text", text: trimmed });
  }

  async startMicrophone() {
    if (this.micActive) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect(this.callbacks);
    }

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.micContext = new AudioContext({ sampleRate: 16000 });
    await this.micContext.audioWorklet.addModule(
      new URL("./audio/pcm-capture-worklet.js", import.meta.url)
    );

    this.micSource = this.micContext.createMediaStreamSource(this.micStream);
    this.micNode = new AudioWorkletNode(this.micContext, "pcm-capture-worklet");
    this.micSink = this.micContext.createGain();
    this.micSink.gain.value = 0;

    this.micNode.port.onmessage = (event) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const { buffer } = event.data || {};
      if (!buffer) return;

      this.#send({
        type: "input.audio",
        data: arrayBufferToBase64(buffer),
        mimeType: "audio/pcm;rate=16000",
        sampleRate: 16000,
      });
    };

    this.micSource.connect(this.micNode);
    this.micNode.connect(this.micSink);
    this.micSink.connect(this.micContext.destination);
    await this.micContext.resume();

    this.micActive = true;
    this.callbacks.onMicStateChange?.(true);
    this.callbacks.onStatus?.("IDLE");
  }

  async stopMicrophone() {
    if (!this.micActive) return;

    this.micNode?.disconnect();
    this.micSource?.disconnect();
    this.micSink?.disconnect();
    this.micStream?.getTracks().forEach((track) => track.stop());

    if (this.micContext) {
      await this.micContext.close();
    }

    this.micContext = null;
    this.micSource = null;
    this.micNode = null;
    this.micSink = null;
    this.micStream = null;
    this.micActive = false;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.#send({ type: "input.audio_end" });
    }
    this.callbacks.onMicStateChange?.(false);
  }

  async startScreenShare() {
    if (this.screenActive) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect(this.callbacks);
    }

    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 2, max: 2 },
      },
      audio: false,
    });

    this.screenVideo = document.createElement("video");
    this.screenVideo.srcObject = this.screenStream;
    this.screenVideo.muted = true;
    this.screenVideo.playsInline = true;
    await this.screenVideo.play();

    this.screenCanvas = document.createElement("canvas");

    const sendFrame = () => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      if (!this.screenVideo?.videoWidth || !this.screenVideo?.videoHeight) return;

      const maxWidth = 960;
      const scale = Math.min(1, maxWidth / this.screenVideo.videoWidth);
      const width = Math.max(320, Math.round(this.screenVideo.videoWidth * scale));
      const height = Math.max(180, Math.round(this.screenVideo.videoHeight * scale));

      this.screenCanvas.width = width;
      this.screenCanvas.height = height;
      const context = this.screenCanvas.getContext("2d", { alpha: false });
      context?.drawImage(this.screenVideo, 0, 0, width, height);

      const dataUrl = this.screenCanvas.toDataURL("image/jpeg", 0.72);
      this.#send({
        type: "input.image",
        data: dataUrl.split(",")[1],
        mimeType: "image/jpeg",
      });
    };

    sendFrame();
    this.screenInterval = window.setInterval(sendFrame, 800);
    this.screenStream.getVideoTracks()[0]?.addEventListener("ended", () => {
      this.stopScreenShare();
    });

    this.screenActive = true;
    this.callbacks.onScreenStateChange?.(true);
  }

  stopScreenShare() {
    if (!this.screenActive) return;
    if (this.screenInterval) {
      window.clearInterval(this.screenInterval);
    }

    this.screenStream?.getTracks().forEach((track) => track.stop());
    if (this.screenVideo) {
      this.screenVideo.pause();
      this.screenVideo.srcObject = null;
    }

    this.screenInterval = null;
    this.screenCanvas = null;
    this.screenVideo = null;
    this.screenStream = null;
    this.screenActive = false;
    this.callbacks.onScreenStateChange?.(false);
  }

  getAnalyser() {
    return this.audioPlayer.getAnalyser();
  }

  getSampleRate() {
    return this.audioSampleRate || 24000;
  }

  getLipSyncFrame() {
    // Legacy method - the new system uses getAnalyser() directly.
    return { speaking: performance.now() - this.lastAudioAt < 800 };
  }

  async disconnect() {
    this.manualDisconnect = true;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingInterval) {
      window.clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    await this.stopMicrophone();
    this.stopScreenShare();

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    await this.audioPlayer.close();
    this.audioSampleRate = null;
    this.callbacks.onConnectionChange?.(false);
    this.callbacks.onStatus?.("OFFLINE");
  }
}
