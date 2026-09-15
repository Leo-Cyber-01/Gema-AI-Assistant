export class Mp3StreamPlayer {
  constructor() {
    this.audio = null;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.queue = [];
    this.isAppending = false;
    this.analyser = null;
    this.audioContext = null;
    this.gainNode = null;
    this.mimeType = "audio/mpeg";
    this.hasStarted = false;
  }

  async init({ mimeType = "audio/mpeg" } = {}) {
    if (this.audio && this.mediaSource) {
      return;
    }

    this.mimeType = mimeType;
    this.audio = new Audio();
    this.audio.autoplay = false;
    this.audio.playsInline = true;
    this.audio.setAttribute("playsinline", "true");
    this.audio.style.position = "fixed";
    this.audio.style.left = "-9999px";
    this.audio.style.width = "1px";
    this.audio.style.height = "1px";
    if (typeof document !== "undefined") {
      document.body.appendChild(this.audio);
    }

    this.mediaSource = new MediaSource();
    this.audio.src = URL.createObjectURL(this.mediaSource);

    this.mediaSource.addEventListener("sourceopen", () => {
      if (this.sourceBuffer) return;
      this.sourceBuffer = this.mediaSource.addSourceBuffer(this.mimeType);
      this.sourceBuffer.mode = "sequence";
      this.sourceBuffer.addEventListener("updateend", () => {
        this.isAppending = false;
        this._appendNext();
      });
    });

    await this._initAnalyser();
  }

  async _initAnalyser() {
    if (this.analyser || !this.audio) return;
    this.audioContext = new AudioContext();
    // Route audio through Web Audio for reliable analyser data.
    this.audio.muted = true;
    const source = this.audioContext.createMediaElementSource(this.audio);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.85;
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 1;
    source.connect(this.analyser);
    this.analyser.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);
  }

  async unlock() {
    if (!this.audio) return;
    try {
      if (this.audioContext && this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }
      await this.audio.play();
    } catch (err) {
      // Autoplay may be blocked until user gesture.
    }
  }

  async play() {
    if (!this.audio) return;
    if (this.audioContext && this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    if (!this.hasStarted) {
      this.hasStarted = true;
      try {
        await this.audio.play();
      } catch (err) {
        // Autoplay may be blocked until user gesture.
      }
    }
  }

  push(chunk) {
    if (!chunk || !this.sourceBuffer) {
      this.queue.push(chunk);
      return;
    }
    const buffer = chunk.buffer.slice(
      chunk.byteOffset,
      chunk.byteOffset + chunk.byteLength
    );
    this.queue.push(buffer);
    this._appendNext();
  }

  _appendNext() {
    if (!this.sourceBuffer || this.isAppending || this.queue.length === 0) return;
    if (this.sourceBuffer.updating) return;
    const next = this.queue.shift();
    if (!next) return;
    this.isAppending = true;
    this.sourceBuffer.appendBuffer(next);
    this.play();
  }

  clear() {
    this.queue.length = 0;
    this.isAppending = false;
  }

  getAnalyser() {
    return this.analyser;
  }
}
