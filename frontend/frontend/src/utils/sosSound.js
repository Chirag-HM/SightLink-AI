// Web Audio API Emergency Siren and SOS Audio Synthesizer
// Works reliably across all modern browsers without external asset dependencies.

class SOSSirenEngine {
  constructor() {
    this.audioCtx = null;
    this.oscillator1 = null;
    this.oscillator2 = null;
    this.lfo = null;
    this.gainNode = null;
    this.isPlaying = false;
    this.pulseInterval = null;
  }

  initContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  startSiren(volume = 0.35) {
    if (this.isPlaying) return;
    try {
      this.initContext();

      const now = this.audioCtx.currentTime;

      // Master gain for volume control
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.setValueAtTime(0.01, now);
      this.gainNode.gain.exponentialRampToValueAtTime(volume, now + 0.15);
      this.gainNode.connect(this.audioCtx.destination);

      // Primary oscillator (alarm pitch)
      this.oscillator1 = this.audioCtx.createOscillator();
      this.oscillator1.type = 'sawtooth';
      this.oscillator1.frequency.setValueAtTime(750, now);

      // Secondary oscillator (harmonics for acoustic urgency)
      this.oscillator2 = this.audioCtx.createOscillator();
      this.oscillator2.type = 'square';
      this.oscillator2.frequency.setValueAtTime(750, now);

      // LFO (Low-Frequency Oscillator) to modulate frequency like an emergency siren
      this.lfo = this.audioCtx.createOscillator();
      this.lfo.frequency.setValueAtTime(1.8, now); // ~1.8 Hz siren cycle
      this.lfo.type = 'triangle';

      const lfoGain = this.audioCtx.createGain();
      lfoGain.gain.setValueAtTime(220, now); // Modulate ±220 Hz (530 Hz to 970 Hz)

      this.lfo.connect(lfoGain);
      lfoGain.connect(this.oscillator1.frequency);
      lfoGain.connect(this.oscillator2.frequency);

      // Connect oscillators to gain
      const oscGain2 = this.audioCtx.createGain();
      oscGain2.gain.setValueAtTime(0.3, now);
      this.oscillator2.connect(oscGain2);
      oscGain2.connect(this.gainNode);

      this.oscillator1.connect(this.gainNode);

      // Start all sound generators
      this.lfo.start(now);
      this.oscillator1.start(now);
      this.oscillator2.start(now);

      this.isPlaying = true;
    } catch (err) {
      console.warn('AudioContext playback error:', err);
    }
  }

  stopSiren() {
    if (!this.isPlaying) return;
    try {
      if (this.gainNode && this.audioCtx) {
        const now = this.audioCtx.currentTime;
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        setTimeout(() => {
          try {
            if (this.oscillator1) {
              this.oscillator1.stop();
              this.oscillator1.disconnect();
              this.oscillator1 = null;
            }
            if (this.oscillator2) {
              this.oscillator2.stop();
              this.oscillator2.disconnect();
              this.oscillator2 = null;
            }
            if (this.lfo) {
              this.lfo.stop();
              this.lfo.disconnect();
              this.lfo = null;
            }
            if (this.gainNode) {
              this.gainNode.disconnect();
              this.gainNode = null;
            }
          } catch (e) {
            // cleanup safely
          }
        }, 160);
      }
      this.isPlaying = false;
    } catch (err) {
      console.warn('AudioContext stop error:', err);
      this.isPlaying = false;
    }
  }

  playStepChime(frequency = 880) {
    try {
      this.initContext();
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, now);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {
      // safe fallback
    }
  }
}

export const sosSiren = new SOSSirenEngine();
