/**
 * TECH-13, YG-05, FX-06, SND-03: the only place that makes sound. Sound plays only when no
 * silence reason is active and the player has not switched it off. Until the mp3 effects of
 * Stage 5 (SND-01) the sounds are synthesised on the fly.
 */

export type SilenceReason = 'hidden' | 'blur' | 'pagehide' | 'sdk_pause' | 'ad';

export type Sfx =
  | 'grab'
  | 'drop'
  | 'merge'
  | 'cascade'
  | 'combo'
  | 'whirlpool'
  | 'deliver'
  | 'lost'
  | 'invalid'
  | 'win'
  | 'lose'
  | 'button';

/** FX-06: at most 6 sounds a second. */
const MAX_PER_SECOND = 6;

interface Note {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  slide?: number;
  delay?: number;
}

/** Temporary sound design: short notes; the merge pitch rises with the item level and combo. */
function notes(name: Sfx, pitch: number): Note[] {
  switch (name) {
    case 'grab':
      return [{ freq: 520, dur: 0.05, type: 'triangle', gain: 0.25 }];
    case 'drop':
      return [{ freq: 380, dur: 0.06, type: 'triangle', gain: 0.25 }];
    case 'merge':
      return [{ freq: 330 * pitch, dur: 0.12, type: 'sine', slide: 1.5 }];
    case 'cascade':
      return [
        { freq: 440 * pitch, dur: 0.08, type: 'sine' },
        { freq: 660 * pitch, dur: 0.1, type: 'sine', delay: 0.07 },
      ];
    case 'combo':
      return [{ freq: 880 * pitch, dur: 0.1, type: 'square', gain: 0.12 }];
    case 'whirlpool':
      return [{ freq: 300, dur: 0.6, type: 'sine', slide: 0.4, gain: 0.35 }];
    case 'deliver':
      return [
        { freq: 523, dur: 0.1, type: 'triangle' },
        { freq: 784, dur: 0.16, type: 'triangle', delay: 0.09 },
      ];
    case 'lost':
      return [{ freq: 180, dur: 0.3, type: 'sawtooth', slide: 0.4, gain: 0.2 }];
    case 'invalid':
      return [{ freq: 150, dur: 0.12, type: 'square', gain: 0.12 }];
    case 'win':
      return [523, 659, 784, 1047].map((freq, i) => ({ freq, dur: 0.18, delay: i * 0.12 }));
    case 'lose':
      return [392, 330, 262].map((freq, i) => ({
        freq,
        dur: 0.25,
        delay: i * 0.18,
        type: 'triangle',
      }));
    case 'button':
      return [{ freq: 660, dur: 0.04, type: 'triangle', gain: 0.2 }];
  }
}

export class AudioService {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly reasons = new Set<SilenceReason>();
  private enabled = true;
  private readonly recent: number[] = [];
  /** For tests: what would have been played. */
  readonly played: Sfx[] = [];

  /** SND-03: browsers allow sound only after a user gesture; call from the first one. */
  unlock(): void {
    if (this.ctx) return;
    const Ctor = window.AudioContext as typeof AudioContext | undefined;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
      return;
    }
    this.sync();
  }

  setSilenced(reason: SilenceReason, on: boolean): void {
    if (on) this.reasons.add(reason);
    else this.reasons.delete(reason);
    this.sync();
  }

  /** UI-06: the player's sound switch. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.sync();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  audible(): boolean {
    return this.enabled && this.reasons.size === 0;
  }

  silenceReasons(): SilenceReason[] {
    return [...this.reasons];
  }

  /** `pitch` — a frequency factor for merges (level and combo). */
  play(name: Sfx, pitch = 1): void {
    if (!this.audible()) return;
    const now = performance.now();
    while (this.recent.length > 0 && now - (this.recent[0] as number) > 1000) this.recent.shift();
    if (this.recent.length >= MAX_PER_SECOND) return;
    this.recent.push(now);
    this.played.push(name);
    if (this.played.length > 50) this.played.shift();
    const ctx = this.ctx;
    const out = this.master;
    if (ctx?.state !== 'running' || !out) return;
    for (const n of notes(name, pitch)) {
      const t0 = ctx.currentTime + (n.delay ?? 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type ?? 'sine';
      osc.frequency.setValueAtTime(n.freq, t0);
      if (n.slide) osc.frequency.exponentialRampToValueAtTime(n.freq * n.slide, t0 + n.dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(n.gain ?? 0.3, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
      osc.connect(gain).connect(out);
      osc.start(t0);
      osc.stop(t0 + n.dur + 0.02);
    }
  }

  private sync(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.audible()) void ctx.resume().catch(() => undefined);
    else void ctx.suspend().catch(() => undefined);
  }
}
