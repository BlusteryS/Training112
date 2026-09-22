class Pcm16CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    if (sampleRate !== 48000) throw new Error("Ожидается аудиоконтекст 48 кГц");
    this.history = new Float32Array(127);
    this.filter = new Float64Array(127);
    this.cursor = 0;
    this.phase = 0;
    this.frame = new Int16Array(512);
    this.length = 0;
    // Windowed-sinc low-pass prevents high-frequency noise aliasing into Russian speech.
    let sum = 0;
    for (let i = 0; i < 127; i += 1) {
      const offset = i - 63;
      const sinc = offset === 0 ? 2 * 7500 / 48000 : Math.sin(2 * Math.PI * 7500 / 48000 * offset) / (Math.PI * offset);
      const window = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / 126) + 0.08 * Math.cos(4 * Math.PI * i / 126);
      this.filter[i] = sinc * window;
      sum += this.filter[i];
    }
    for (let i = 0; i < 127; i += 1) this.filter[i] /= sum;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (let i = 0; i < input.length; i += 1) {
      this.history[this.cursor] = input[i];
      this.cursor = (this.cursor + 1) % 127;
      this.phase += 1;
      if (this.phase !== 3) continue;
      this.phase = 0;
      let sample = 0;
      let index = this.cursor;
      for (let tap = 0; tap < 127; tap += 1) {
        sample += this.history[index] * this.filter[tap];
        index = (index + 1) % 127;
      }
      sample = Math.max(-1, Math.min(1, sample));
      this.frame[this.length++] = Math.round(sample * (sample < 0 ? 32768 : 32767));
      if (this.length === 512) {
        this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
        this.frame = new Int16Array(512);
        this.length = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm16-capture", Pcm16CaptureProcessor);
