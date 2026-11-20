/**
 * Client-only procedural Web Audio engine:
 * - Soft pentatonic night background music loop
 * - SFX for pickup, deposit, lantern lit, pulse, hit, jump, dash, charm, drifter, shade spawn, wind warning, final 10s countdown, win, lose.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume = 0.7;
  private bgmTimer: number | null = null;
  private bgmStep = 0;

  setVolume(norm: number): void {
    this.volume = Math.max(0, Math.min(1, norm));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03);
    }
  }

  getVolume(): number {
    return this.volume;
  }

  private ensureContext(): AudioContext | null {
    if (this.volume <= 0.001 || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      this.ctx = new AudioCtor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  startBgm(): void {
    if (this.bgmTimer !== null) return;
    const notes = [261.63, 293.66, 329.63, 392.0, 440.0, 392.0, 329.63, 293.66];
    this.bgmTimer = window.setInterval(() => {
      if (this.volume <= 0.001 || !this.ctx || this.ctx.state !== 'running') return;
      const freq = notes[this.bgmStep % notes.length];
      this.bgmStep += 1;
      this.playTone(freq, 0.9, 'sine', 0.045);
      if (this.bgmStep % 4 === 0) {
        this.playTone(freq * 0.5, 1.3, 'triangle', 0.03);
      }
    }, 850);
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
    endFreq?: number,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  playJump(): void {
    this.playTone(280, 0.16, 'sine', 0.1, 0, 520);
  }

  playDash(): void {
    this.playTone(540, 0.18, 'triangle', 0.15, 0, 220);
    this.playTone(760, 0.12, 'sine', 0.08, 0.02, 420);
  }

  playPickup(carried: number): void {
    const pentatonic = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    const freq = pentatonic[Math.max(0, Math.min(carried - 1, pentatonic.length - 1))];
    this.playTone(freq, 0.22, 'sine', 0.13);
    this.playTone(freq * 2, 0.15, 'triangle', 0.04, 0.03);
  }

  playCharm(): void {
    this.playTone(587.33, 0.2, 'sine', 0.14, 0);
    this.playTone(880.0, 0.25, 'sine', 0.14, 0.07);
    this.playTone(1174.66, 0.35, 'triangle', 0.12, 0.14);
  }

  playDeposit(): void {
    this.playTone(440, 0.18, 'triangle', 0.12);
    this.playTone(554.37, 0.22, 'sine', 0.1, 0.06);
  }

  playLanternLit(litCount: number): void {
    const base = 392 * Math.pow(1.06, litCount);
    this.playTone(base, 0.45, 'triangle', 0.16, 0);
    this.playTone(base * 1.25, 0.5, 'sine', 0.14, 0.08);
    this.playTone(base * 1.5, 0.65, 'sine', 0.14, 0.16);
  }

  playPulse(): void {
    this.playTone(680, 0.35, 'sine', 0.18, 0, 200);
    this.playTone(420, 0.3, 'triangle', 0.1, 0.03, 140);
  }

  playHit(): void {
    this.playTone(180, 0.24, 'sawtooth', 0.12, 0, 95);
    this.playTone(125, 0.3, 'triangle', 0.14, 0.06);
  }

  playShadeSpawn(): void {
    this.playTone(145, 0.45, 'sawtooth', 0.08, 0, 90);
    this.playTone(210, 0.38, 'sine', 0.07, 0.08, 120);
  }

  playDrifterSteal(): void {
    this.playTone(720, 0.2, 'triangle', 0.12, 0, 340);
  }

  playDrifterDrop(): void {
    this.playTone(500, 0.24, 'sine', 0.12, 0, 820);
  }

  playWindWarning(): void {
    this.playTone(320, 0.55, 'sine', 0.07, 0, 480);
  }

  playCountdownTick(): void {
    this.playTone(880, 0.08, 'square', 0.07);
  }

  playWin(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => this.playTone(f, 0.55, 'sine', 0.15, idx * 0.11));
  }

  playLose(): void {
    const notes = [349.23, 311.13, 261.63];
    notes.forEach((f, idx) => this.playTone(f, 0.45, 'triangle', 0.12, idx * 0.16));
  }
}
