/**
 * Client-only procedural pentatonic Web Audio synth.
 * Adds warm fairy-tale chimes without external assets or any effect on headless simulation.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      this.ctx = new AudioCtor();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(freq: number, duration: number, type: OscillatorType, volume: number, delay = 0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playPickup(carried: number): void {
    const pentatonic = [523.25, 587.33, 659.25, 783.99, 880.0];
    const freq = pentatonic[Math.max(0, Math.min(carried - 1, pentatonic.length - 1))];
    this.playTone(freq, 0.24, 'sine', 0.14);
    this.playTone(freq * 2, 0.18, 'triangle', 0.05, 0.03);
  }

  playDeposit(): void {
    this.playTone(440, 0.2, 'triangle', 0.12);
    this.playTone(554.37, 0.24, 'sine', 0.1, 0.06);
  }

  playLanternLit(litCount: number): void {
    const base = 392 * Math.pow(1.06, litCount);
    this.playTone(base, 0.45, 'triangle', 0.16, 0);
    this.playTone(base * 1.25, 0.5, 'sine', 0.14, 0.08);
    this.playTone(base * 1.5, 0.65, 'sine', 0.14, 0.16);
  }

  playPulse(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.35);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  playHit(): void {
    this.playTone(170, 0.26, 'sawtooth', 0.12, 0);
    this.playTone(125, 0.32, 'triangle', 0.14, 0.07);
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
