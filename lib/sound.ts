export type SoundCue = 'click' | 'win' | 'lose' | 'liquidated' | 'jackpot';

class CasinoSoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = false;
  private unlocked = false;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  async unlock() {
    if (typeof window === 'undefined') return;

    if (!this.ctx) {
      const AudioCtor = window.AudioContext || (window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;
      if (!AudioCtor) return;
      this.ctx = new AudioCtor();
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        return;
      }
    }

    this.unlocked = true;
  }

  playCue(cue: SoundCue) {
    if (!this.enabled || !this.unlocked || !this.ctx) return;

    if (cue === 'click') {
      this.playTone(740, 0.04, 'square', 0.02, 0);
      return;
    }

    if (cue === 'win') {
      this.playTone(620, 0.07, 'triangle', 0.03, 0);
      this.playTone(800, 0.08, 'triangle', 0.03, 0.07);
      this.playTone(980, 0.1, 'triangle', 0.03, 0.15);
      return;
    }

    if (cue === 'jackpot') {
      this.playTone(520, 0.08, 'triangle', 0.035, 0);
      this.playTone(730, 0.08, 'triangle', 0.035, 0.08);
      this.playTone(980, 0.1, 'triangle', 0.035, 0.16);
      this.playTone(1180, 0.12, 'triangle', 0.04, 0.27);
      return;
    }

    if (cue === 'lose') {
      this.playTone(280, 0.1, 'sawtooth', 0.03, 0);
      this.playTone(220, 0.12, 'sawtooth', 0.03, 0.1);
      return;
    }

    this.playTone(180, 0.12, 'sawtooth', 0.035, 0);
    this.playTone(130, 0.2, 'sawtooth', 0.035, 0.12);
  }

  private playTone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delaySeconds: number
  ) {
    if (!this.ctx) return;

    const now = this.ctx.currentTime + delaySeconds;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gain);
    gain.connect(this.ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}

export const soundEngine = new CasinoSoundEngine();
