/** Continuous 24 kHz PCM queue. Rendering and acknowledgements use the audio clock. */
class PcmPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = 12000; // At most 500 ms, independent of network credit.
    this.samples = new Float32Array(this.capacity);
    this.generation = 0;
    this.target = 1536; // 64 ms initial jitter buffer; adapts only after underrun.
    this.reset();
    this.port.onmessage = ({ data }) => {
      if (data.type === 'reset') {
        this.generation = data.generation;
        this.reset();
        return;
      }
      if (data.generation !== this.generation) return;
      const pcm = data.samples;
      if (!(pcm instanceof Float32Array) || this.written - this.read + pcm.length > this.capacity) {
        this.port.postMessage({ type: 'overflow' });
        return;
      }
      for (let i = 0; i < pcm.length; i++) this.samples[(this.written + i) % this.capacity] = pcm[i];
      this.written += pcm.length;
      this.markers.push({ end: this.written, id: data.id });
    };
  }

  reset() {
    this.read = this.written = this.phase = 0;
    this.markers = [];
    this.running = false;
    this.last = 0;
    this.fade = 0;
  }

  process(_inputs, outputs) {
    const output = outputs[0][0];
    if (!output) return true;
    if (!this.running && this.written - this.read >= this.target) {
      this.running = true;
      this.fade = 64;
    }
    for (let i = 0; i < output.length; i++) {
      if (this.running && this.read >= this.written) {
        this.running = false;
        this.target = Math.min(3840, this.target + 768); // Up to 160 ms on unstable links.
        this.port.postMessage({ type: 'underrun', generation: this.generation });
      }
      if (!this.running) {
        this.last *= 0.94; // Short fade instead of a discontinuity on a real underrun.
        output[i] = this.last;
        continue;
      }
      const first = this.samples[this.read % this.capacity];
      const second = this.read + 1 < this.written ? this.samples[(this.read + 1) % this.capacity] : first;
      let value = first + (second - first) * this.phase;
      if (this.fade > 0) value *= 1 - this.fade-- / 64;
      output[i] = this.last = value;
      this.phase += 24000 / sampleRate;
      const advance = Math.floor(this.phase);
      this.phase -= advance;
      this.read += advance;
      while (this.markers.length && this.markers[0].end <= this.read) {
        this.port.postMessage({ type: 'played', generation: this.generation, id: this.markers.shift().id });
      }
    }
    return true;
  }
}
registerProcessor('pcm24-playback', PcmPlaybackProcessor);
