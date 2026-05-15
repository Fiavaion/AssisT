/**
 * Ambient Sound Detector — frequency-band classifier
 * Analyzes an AnalyserNode to classify ambient audio as speech, typing,
 * noise, or silence without ML — using frequency band energy ratios only.
 *
 * Keyboard clicks concentrate energy in 2–8 kHz; human speech sits in
 * 80–3000 Hz. Comparing the two bands distinguishes them reliably.
 *
 * Usage:
 *   const detector = new AmbientDetector();
 *   detector.onStateChange = (state) => { ... };
 *   detector.setAnalyser(analyserNode);
 *   detector.start();
 *   // later:
 *   detector.stop();
 */

export class AmbientDetector {
  constructor(options = {}) {
    this.analyser = null;
    this.enabled = true;
    this.state = 'idle'; // 'idle' | 'speech' | 'typing' | 'noise'
    this.onStateChange = null; // callback(newState, oldState)

    this._animFrame = null;
    this._dataArray = null;
    this._rollingAvg = { speech: 0, typing: 0 };

    this._speechFreqLow = options.speechFreqLow ?? 80;
    this._speechFreqHigh = options.speechFreqHigh ?? 3000;
    this._typingFreqLow = options.typingFreqLow ?? 2000;
    this._typingFreqHigh = options.typingFreqHigh ?? 8000;
    this._silenceThreshold = options.silenceThreshold ?? 10;
    this._typingRatio = options.typingRatio ?? 1.5;
    this._smoothing = options.smoothing ?? 0.85;

    // Sustained guards — prevent flickering on transient sounds
    this._typingSustainMs = options.typingSustainMs ?? 500;
    this._speechSustainMs = options.speechSustainMs ?? 200;
    this._candidateState = null;
    this._candidateSince = 0;

    this.onDebugFrame = null; // (data: { speechEnergy, typingEnergy, state }) => void
  }

  setAnalyser(analyserNode) {
    this.analyser = analyserNode;
    if (analyserNode) {
      this._dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    }
  }

  start() {
    if (!this.analyser) {
      return;
    }
    this._resetRolling();
    this._detect();
  }

  stop() {
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
    this._candidateState = null;
    this._candidateSince = 0;
    this._setState('idle');
  }

  setEnabled(flag) {
    this.enabled = !!flag;
    if (!this.enabled) {
      this._resetRolling();
      this._setState('idle');
    }
  }

  reset() {
    this._resetRolling();
    this._candidateState = null;
    this._candidateSince = 0;
    this._setState('idle');
  }

  _detect() {
    if (!this.analyser) {
      return;
    }

    if (this.enabled) {
      this.analyser.getByteFrequencyData(this._dataArray);

      const sampleRate = this.analyser.context.sampleRate;
      const binHz = sampleRate / (this.analyser.fftSize || 2048);

      const speechEnergy = this._bandEnergy(
        this._dataArray,
        binHz,
        this._speechFreqLow,
        this._speechFreqHigh
      );
      const typingEnergy = this._bandEnergy(
        this._dataArray,
        binHz,
        this._typingFreqLow,
        this._typingFreqHigh
      );

      this._rollingAvg.speech =
        this._rollingAvg.speech * this._smoothing + speechEnergy * (1 - this._smoothing);
      this._rollingAvg.typing =
        this._rollingAvg.typing * this._smoothing + typingEnergy * (1 - this._smoothing);

      this._classify();

      this.onDebugFrame?.({
        speechEnergy: this._rollingAvg.speech,
        typingEnergy: this._rollingAvg.typing,
        state: this.state,
      });
    }

    this._animFrame = requestAnimationFrame(() => this._detect());
  }

  _bandEnergy(dataArray, binHz, lowHz, highHz) {
    const lowBin = Math.floor(lowHz / binHz);
    const highBin = Math.min(Math.ceil(highHz / binHz), dataArray.length - 1);
    if (highBin <= lowBin) {
      return 0;
    }

    let sum = 0;
    for (let i = lowBin; i <= highBin; i++) {
      sum += dataArray[i];
    }
    return sum / (highBin - lowBin + 1);
  }

  _classify() {
    const { speech, typing } = this._rollingAvg;
    const threshold = this._silenceThreshold;

    let raw;
    if (speech < threshold && typing < threshold) {
      raw = 'idle';
    } else if (typing > speech * this._typingRatio && typing > threshold) {
      raw = 'typing';
    } else if (speech > threshold) {
      raw = 'speech';
    } else {
      raw = 'noise';
    }

    if (raw === 'idle') {
      this._candidateState = null;
      this._candidateSince = 0;
      this._setState('idle');
      return;
    }

    const now = performance.now();
    if (raw !== this._candidateState) {
      this._candidateState = raw;
      this._candidateSince = now;
      return;
    }

    const requiredMs = raw === 'typing' ? this._typingSustainMs : this._speechSustainMs;
    if (now - this._candidateSince >= requiredMs) {
      this._setState(raw);
    }
  }

  _setState(newState) {
    if (newState === this.state) {
      return;
    }
    const oldState = this.state;
    this.state = newState;
    this.onStateChange?.(newState, oldState);
  }

  _resetRolling() {
    this._rollingAvg.speech = 0;
    this._rollingAvg.typing = 0;
  }
}
