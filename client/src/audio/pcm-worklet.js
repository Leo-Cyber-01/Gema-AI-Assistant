class PcmPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.current = null;
    this.currentOffset = 0;
    this.volume = 1.0;
    this.port.onmessage = (event) => {
      const { type, buffer, value } = event.data || {};
      if (type === "push" && buffer) {
        const samples =
          buffer instanceof Int16Array ? buffer : new Int16Array(buffer);
        if (samples.length > 0) {
          this.queue.push(samples);
        }
      } else if (type === "clear") {
        this.queue.length = 0;
        this.current = null;
        this.currentOffset = 0;
      } else if (type === "volume" && typeof value === "number") {
        this.volume = Math.max(0, Math.min(1, value));
      }
    };
  }

  process(_, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }

    const channelCount = output.length;
    const frameCount = output[0].length;

    for (let i = 0; i < frameCount; i += 1) {
      if (!this.current || this.currentOffset >= this.current.length) {
        this.current = this.queue.shift() || null;
        this.currentOffset = 0;
      }

      let sample = 0;
      if (this.current) {
        sample = this.current[this.currentOffset] / 32768;
        this.currentOffset += 1;
      }

      sample *= this.volume;

      for (let ch = 0; ch < channelCount; ch += 1) {
        output[ch][i] = sample;
      }
    }

    return true;
  }
}

registerProcessor("pcm-player", PcmPlayerProcessor);
