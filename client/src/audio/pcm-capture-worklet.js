class PcmCaptureWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Int16Array(this.bufferSize);
    this.offset = 0;
  }

  flush() {
    if (!this.offset) return;
    const chunk = this.buffer.slice(0, this.offset);
    this.port.postMessage({ buffer: chunk.buffer }, [chunk.buffer]);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) {
      return true;
    }

    const channel = input[0];
    if (!channel) {
      return true;
    }

    for (let index = 0; index < channel.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, channel[index]));
      this.buffer[this.offset] = sample < 0 ? sample * 32768 : sample * 32767;
      this.offset += 1;

      if (this.offset >= this.bufferSize) {
        this.flush();
      }
    }

    return true;
  }
}

registerProcessor("pcm-capture-worklet", PcmCaptureWorklet);
