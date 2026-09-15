/**
 * Continuous PCM Audio Stream Player
 * Queues and plays raw PCM chunks without decodeAudioData overhead.
 */
export class AudioStreamPlayer {
  constructor() {
    this.context = null;
    this.workletNode = null;
    this.analyser = null;
    this.sampleRate = null;
    this.initialized = false;
    this.initToken = 0;
  }

  /**
   * Initialize AudioContext and Worklet.
   * Call this on a user gesture.
   */
  async init({ sampleRate = 24000, channels = 1 } = {}) {
    if (this.initialized && this.sampleRate === sampleRate) return;
    if (this.context) await this.close();

    const token = ++this.initToken;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextCtor({ sampleRate });
    this.context = context;

    // Load PCM Player Worklet
    await context.audioWorklet.addModule(
      new URL("./pcm-worklet.js", import.meta.url)
    );

    if (token !== this.initToken || this.context !== context) {
      await context.close();
      return;
    }

    this.workletNode = new AudioWorkletNode(context, "pcm-player", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [channels],
    });

    // Create High-Res Analyser for LipSync Engine
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;

    // Connect Pipeline: Worklet -> Analyser -> Destination
    this.workletNode.connect(this.analyser);
    this.analyser.connect(context.destination);

    this.sampleRate = sampleRate;
    this.initialized = true;

    if (context.state === "suspended") {
      await context.resume();
    }
  }

  async resume() {
    if (this.context?.state === "suspended") {
      await this.context.resume();
    }
  }

  /**
   * Push Int16 or Float32 PCM samples to the queue.
   */
  push(samples) {
    if (!this.workletNode || !samples) return;
    let int16;
    if (samples instanceof Float32Array) {
      int16 = new Int16Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        int16[i] = Math.max(-1, Math.min(1, samples[i])) * 32768;
      }
    } else {
      int16 = samples instanceof Int16Array ? samples : new Int16Array(samples);
    }
    this.workletNode.port.postMessage({ type: "push", buffer: int16 }, [int16.buffer]);
  }

  clear() {
    this.workletNode?.port.postMessage({ type: "clear" });
  }

  getAnalyser() {
    return this.analyser;
  }

  async close() {
    this.initToken++;
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    this.initialized = false;
  }
}
