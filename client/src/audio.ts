import type { Vec3, WeaponId } from '@kinetic/shared';
import { settings } from './settings';

interface NoiseOpts {
  type: BiquadFilterType;
  freq: number;
  q?: number;
  dur: number;
  vol: number;
  delay?: number;
}

interface ToneOpts {
  type: OscillatorType;
  f0: number;
  f1: number;
  dur: number;
  vol: number;
  delay?: number;
}

const SHOTS: Record<Exclude<WeaponId, 'knife'>, { noise: NoiseOpts; tone: ToneOpts }> = {
  rifle: { noise: { type: 'lowpass', freq: 2600, dur: 0.16, vol: 0.8 }, tone: { type: 'sine', f0: 140, f1: 50, dur: 0.12, vol: 0.6 } },
  smg: { noise: { type: 'lowpass', freq: 3200, dur: 0.1, vol: 0.6 }, tone: { type: 'sine', f0: 180, f1: 70, dur: 0.08, vol: 0.4 } },
  shotgun: { noise: { type: 'lowpass', freq: 1500, dur: 0.38, vol: 1.0 }, tone: { type: 'sine', f0: 90, f1: 35, dur: 0.26, vol: 0.9 } },
  sniper: { noise: { type: 'lowpass', freq: 2200, dur: 0.55, vol: 1.0 }, tone: { type: 'sine', f0: 75, f1: 30, dur: 0.42, vol: 1.0 } },
  pistol: { noise: { type: 'lowpass', freq: 3500, dur: 0.12, vol: 0.65 }, tone: { type: 'sine', f0: 220, f1: 80, dur: 0.08, vol: 0.4 } },
};

/** Fully procedural sound effects (no asset files needed for the prototype). */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private listenerPos: Vec3 = { x: 0, y: 0, z: 0 };

  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = settings.volume;
    this.master.connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  setVolume(v: number): void {
    if (this.ctx) this.master.gain.value = v;
  }

  setListener(pos: Vec3, fwd: Vec3): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.listenerPos = { x: pos.x, y: pos.y, z: pos.z };
    const l = ctx.listener;
    if (l.positionX) {
      const t = ctx.currentTime;
      l.positionX.setValueAtTime(pos.x, t);
      l.positionY.setValueAtTime(pos.y, t);
      l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(fwd.x, t);
      l.forwardY.setValueAtTime(fwd.y, t);
      l.forwardZ.setValueAtTime(fwd.z, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  private out(pos?: Vec3): AudioNode {
    const ctx = this.ctx!;
    if (!pos) return this.master;
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 5;
    p.maxDistance = 100;
    p.rolloffFactor = 1.3;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    // Distant sounds lose their high end, which helps judge range by ear.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const l = this.listenerPos;
    const dist = Math.hypot(pos.x - l.x, pos.y - l.y, pos.z - l.z);
    lp.frequency.value = dist < 10 ? 18000 : Math.max(900, 18000 * Math.pow(10 / dist, 1.3));
    lp.connect(p);
    p.connect(this.master);
    return lp;
  }

  private burst(dest: AudioNode, o: NoiseOpts): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = o.type;
    f.frequency.value = o.freq;
    f.Q.value = o.q ?? 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.05);
  }

  private tone(dest: AudioNode, o: ToneOpts): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  shot(id: WeaponId, pos?: Vec3): void {
    if (!this.ctx) return;
    if (id === 'knife') {
      this.knifeSwing(pos);
      return;
    }
    const d = this.out(pos);
    const s = SHOTS[id];
    this.burst(d, s.noise);
    this.tone(d, s.tone);
    if (id === 'sniper') this.burst(d, { type: 'highpass', freq: 4000, dur: 0.08, vol: 0.5 });
  }

  knifeSwing(pos?: Vec3): void {
    if (!this.ctx) return;
    const d = this.out(pos);
    this.burst(d, { type: 'bandpass', freq: 2200, q: 1.2, dur: 0.16, vol: 0.35 });
    this.burst(d, { type: 'bandpass', freq: 900, q: 1, dur: 0.12, vol: 0.2, delay: 0.04 });
  }

  jumpPad(): void {
    if (!this.ctx) return;
    this.tone(this.master, { type: 'sine', f0: 300, f1: 1200, dur: 0.25, vol: 0.3 });
    this.burst(this.master, { type: 'bandpass', freq: 1800, q: 1, dur: 0.3, vol: 0.2 });
  }

  knifeHit(): void {
    if (!this.ctx) return;
    this.burst(this.master, { type: 'lowpass', freq: 700, dur: 0.12, vol: 0.6 });
    this.tone(this.master, { type: 'triangle', f0: 160, f1: 70, dur: 0.1, vol: 0.4 });
  }

  pump(): void {
    if (!this.ctx) return;
    this.burst(this.master, { type: 'bandpass', freq: 1400, q: 2, dur: 0.06, vol: 0.35 });
    this.burst(this.master, { type: 'bandpass', freq: 1000, q: 2, dur: 0.07, vol: 0.35, delay: 0.14 });
  }

  bolt(): void {
    if (!this.ctx) return;
    this.burst(this.master, { type: 'highpass', freq: 2200, dur: 0.05, vol: 0.3 });
    this.burst(this.master, { type: 'bandpass', freq: 1600, q: 3, dur: 0.06, vol: 0.3, delay: 0.22 });
  }

  shell(): void {
    if (!this.ctx) return;
    this.burst(this.master, { type: 'bandpass', freq: 1300, q: 2.5, dur: 0.07, vol: 0.3 });
  }

  casing(): void {
    if (!this.ctx) return;
    this.tone(this.master, { type: 'sine', f0: 4200 + Math.random() * 900, f1: 3900, dur: 0.05, vol: 0.05, delay: 0.35 + Math.random() * 0.1 });
  }

  hit(head: boolean): void {
    if (!this.ctx) return;
    this.tone(this.master, { type: 'triangle', f0: head ? 2400 : 1700, f1: head ? 2300 : 1600, dur: 0.06, vol: 0.25 });
  }

  kill(): void {
    if (!this.ctx) return;
    this.tone(this.master, { type: 'triangle', f0: 900, f1: 900, dur: 0.08, vol: 0.3 });
    this.tone(this.master, { type: 'triangle', f0: 1400, f1: 1400, dur: 0.14, vol: 0.3, delay: 0.07 });
  }

  hurt(): void {
    if (!this.ctx) return;
    this.burst(this.master, { type: 'lowpass', freq: 500, dur: 0.18, vol: 0.5 });
    this.tone(this.master, { type: 'sawtooth', f0: 180, f1: 90, dur: 0.12, vol: 0.12 });
  }

  reload(duration: number): void {
    if (!this.ctx) return;
    this.burst(this.master, { type: 'highpass', freq: 2500, dur: 0.04, vol: 0.3, delay: 0.05 });
    this.burst(this.master, { type: 'bandpass', freq: 1200, q: 3, dur: 0.06, vol: 0.35, delay: duration * 0.45 });
    this.burst(this.master, { type: 'highpass', freq: 3000, dur: 0.05, vol: 0.35, delay: duration * 0.85 });
  }

  dry(): void {
    if (!this.ctx) return;
    this.burst(this.master, { type: 'highpass', freq: 3500, dur: 0.03, vol: 0.25 });
  }

  swap(): void {
    if (!this.ctx) return;
    this.burst(this.master, { type: 'bandpass', freq: 1800, q: 2, dur: 0.05, vol: 0.25 });
  }

  jump(): void {
    if (!this.ctx) return;
    this.burst(this.master, { type: 'lowpass', freq: 500, dur: 0.07, vol: 0.18 });
  }

  land(strength: number): void {
    if (!this.ctx) return;
    this.burst(this.master, { type: 'lowpass', freq: 350, dur: 0.12, vol: Math.min(0.5, 0.1 + strength * 0.03) });
  }

  footstep(): void {
    if (!this.ctx) return;
    this.burst(this.master, { type: 'bandpass', freq: 700 + Math.random() * 400, q: 1.5, dur: 0.06, vol: 0.12 });
  }

  slide(): void {
    if (!this.ctx) return;
    this.burst(this.master, { type: 'bandpass', freq: 1100, q: 0.8, dur: 0.55, vol: 0.18 });
  }
}
