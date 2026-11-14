// Reproduces the two live AnalyserNodes (see AudioManager.init) from decoded
// samples, so an offline export reacts to the music exactly like the preview.
// Follows the Web Audio spec: Blackman window -> FFT -> smoothing over time ->
// decibels -> bytes.
const FFT_SIZE = 256;
const BINS = FFT_SIZE / 2;

export class OfflineAnalyser {
  constructor(audioBuffer) {
    this.sampleRate = audioBuffer.sampleRate;
    this.length = audioBuffer.length;
    this.channels = [];
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
      this.channels.push(audioBuffer.getChannelData(c));
    }

    this.window = new Float32Array(FFT_SIZE);
    for (let n = 0; n < FFT_SIZE; n++) {
      const a = (2 * Math.PI * n) / FFT_SIZE;
      this.window[n] = 0.42 - 0.5 * Math.cos(a) + 0.08 * Math.cos(2 * a);
    }

    // Radix-2 FFT tables
    this.cos = new Float32Array(BINS);
    this.sin = new Float32Array(BINS);
    for (let i = 0; i < BINS; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / FFT_SIZE);
      this.sin[i] = Math.sin((2 * Math.PI * i) / FFT_SIZE);
    }
    const bits = Math.log2(FFT_SIZE);
    this.reversed = new Uint16Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.reversed[i] = r;
    }

    this.re = new Float32Array(FFT_SIZE);
    this.im = new Float32Array(FFT_SIZE);

    // Same settings as the live analysers: main (visual bands) and beat (fast attack)
    this.main = { smoothing: 0.7, minDb: -100, maxDb: -30, state: new Float32Array(BINS) };
    this.beat = { smoothing: 0.15, minDb: -70, maxDb: 0, state: new Float32Array(BINS) };
  }

  // Fill both byte spectra with what the live analysers would report at
  // `timeSec`. Call once per simulated frame, in order — smoothing carries over.
  analyse(timeSec, mainOut, beatOut) {
    const { re, im, window, channels, reversed } = this;
    const end = Math.floor(timeSec * this.sampleRate);
    const channelCount = channels.length;

    // Most recent FFT_SIZE samples, down-mixed to mono, in bit-reversed order
    for (let n = 0; n < FFT_SIZE; n++) {
      const index = end - FFT_SIZE + n;
      let sample = 0;
      if (index >= 0 && index < this.length) {
        for (let c = 0; c < channelCount; c++) sample += channels[c][index];
        sample /= channelCount;
      }
      re[reversed[n]] = sample * window[n];
      im[reversed[n]] = 0;
    }

    for (let size = 2; size <= FFT_SIZE; size *= 2) {
      const half = size / 2;
      const step = FFT_SIZE / size;
      for (let start = 0; start < FFT_SIZE; start += size) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * step];
          const wi = -this.sin[k * step];
          const a = start + k;
          const b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }

    for (let k = 0; k < BINS; k++) {
      const magnitude = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / FFT_SIZE;
      mainOut[k] = this.toByte(this.main, k, magnitude);
      beatOut[k] = this.toByte(this.beat, k, magnitude);
    }
  }

  toByte(analyser, k, magnitude) {
    const smoothed = analyser.smoothing * analyser.state[k] + (1 - analyser.smoothing) * magnitude;
    analyser.state[k] = smoothed;
    const db = 20 * Math.log10(smoothed);
    const scaled = (255 / (analyser.maxDb - analyser.minDb)) * (db - analyser.minDb);
    return scaled > 0 ? Math.min(255, Math.floor(scaled)) : 0; // -Infinity/NaN -> 0
  }
}
