import type { Input } from './input';
import { settings } from './settings';

type HoldKey = 'Space' | 'ShiftLeft' | 'Tab';

/** Base look speed for touch drags (multiplied by the Touch look sensitivity setting). */
const TOUCH_LOOK = 1.6;
const JOY_RADIUS = 56;
const JOY_DEADZONE = 0.3;

/** Keep receiving a finger's moves even if it slides off the control (never fatal). */
function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* pointer already gone */
  }
}

/**
 * On-screen controls for phones/tablets. Everything feeds the shared Input,
 * so movement, shooting and netcode behave exactly like keyboard + mouse.
 */
export class TouchControls {
  readonly root = document.createElement('div');
  private joyBase = document.createElement('div');
  private joyKnob = document.createElement('div');
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private joyKeys = { KeyW: false, KeyS: false, KeyA: false, KeyD: false };
  private lookPointers = new Map<number, { x: number; y: number }>();
  private adsOn = false;
  private adsBtn!: HTMLElement;

  constructor(
    private input: Input,
    private onPause: () => void,
  ) {
    this.root.id = 'touch-ui';
    this.root.className = 'hidden';

    // Right side (and anywhere not covered by a control): drag to look
    const look = this.div('t-look');
    this.trackLook(look);

    // Left side: floating joystick wherever the thumb lands
    const joy = this.div('t-joy');
    this.joyBase.className = 't-joy-base hidden';
    this.joyKnob.className = 't-joy-knob';
    this.joyBase.appendChild(this.joyKnob);
    this.root.appendChild(this.joyBase);
    this.trackJoystick(joy);

    // Buttons
    const fire = this.button('t-fire', 'FIRE');
    this.trackLook(fire); // aim while holding fire
    this.hold(fire, () => this.input.virtualButton(0, true), () => this.input.virtualButton(0, false));

    this.adsBtn = this.button('t-ads', 'AIM');
    this.tap(this.adsBtn, () => this.setAds(!this.adsOn));

    this.holdKey(this.button('t-jump', 'JUMP'), 'Space');
    this.holdKey(this.button('t-crouch', 'SLIDE'), 'ShiftLeft');
    this.tapKey(this.button('t-reload', 'R'), 'KeyR');
    this.tapKey(this.button('t-knife', '🔪'), 'KeyV');
    this.tap(this.button('t-swap', '⇄'), () => this.input.virtualWheel(1));
    this.holdKey(this.button('t-score', '☰'), 'Tab');
    this.tap(this.button('t-pause', 'II'), () => this.onPause());

    document.body.appendChild(this.root);
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
    if (!on) this.releaseAll();
  }

  private div(cls: string): HTMLElement {
    const d = document.createElement('div');
    d.className = cls;
    this.root.appendChild(d);
    return d;
  }

  private button(cls: string, label: string): HTMLElement {
    const b = document.createElement('div');
    b.className = `t-btn ${cls}`;
    b.textContent = label;
    this.root.appendChild(b);
    return b;
  }

  private setAds(on: boolean): void {
    this.adsOn = on;
    this.input.virtualButton(2, on);
    this.adsBtn.classList.toggle('active', on);
  }

  private hold(el: HTMLElement, down: () => void, up: () => void): void {
    const pointers = new Set<number>();
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      capture(el, e.pointerId);
      if (pointers.size === 0) down();
      pointers.add(e.pointerId);
      el.classList.add('active');
    });
    const end = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size === 0) {
        up();
        el.classList.remove('active');
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private holdKey(el: HTMLElement, code: HoldKey): void {
    this.hold(el, () => this.input.virtualKey(code, true), () => this.input.virtualKey(code, false));
  }

  private tap(el: HTMLElement, action: () => void): void {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      action();
      el.classList.add('active');
    });
    const off = () => el.classList.remove('active');
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
  }

  private tapKey(el: HTMLElement, code: string): void {
    this.hold(el, () => this.input.virtualKey(code, true), () => this.input.virtualKey(code, false));
  }

  private trackLook(el: HTMLElement): void {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      capture(el, e.pointerId);
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    el.addEventListener('pointermove', (e) => {
      const last = this.lookPointers.get(e.pointerId);
      if (!last) return;
      e.preventDefault();
      const k = TOUCH_LOOK * settings.touchSens;
      this.input.virtualLook((e.clientX - last.x) * k, (e.clientY - last.y) * k);
      last.x = e.clientX;
      last.y = e.clientY;
    });
    const end = (e: PointerEvent) => this.lookPointers.delete(e.pointerId);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private trackJoystick(zone: HTMLElement): void {
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.joyId !== null) return;
      capture(zone, e.pointerId);
      this.joyId = e.pointerId;
      this.joyOrigin = { x: e.clientX, y: e.clientY };
      this.joyBase.style.left = `${e.clientX}px`;
      this.joyBase.style.top = `${e.clientY}px`;
      this.joyBase.classList.remove('hidden');
      this.moveJoy(0, 0);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyId) return;
      e.preventDefault();
      this.moveJoy(e.clientX - this.joyOrigin.x, e.clientY - this.joyOrigin.y);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      this.joyBase.classList.add('hidden');
      this.moveJoy(0, 0);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  /** Digital 8-way output: movement is sent to the server as -1/0/1 per axis. */
  private moveJoy(dx: number, dy: number): void {
    const len = Math.hypot(dx, dy);
    const k = len > JOY_RADIUS ? JOY_RADIUS / len : 1;
    this.joyKnob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const nx = (dx * k) / JOY_RADIUS;
    const ny = (dy * k) / JOY_RADIUS;
    const next = { KeyW: ny < -JOY_DEADZONE, KeyS: ny > JOY_DEADZONE, KeyA: nx < -JOY_DEADZONE, KeyD: nx > JOY_DEADZONE };
    for (const code of Object.keys(next) as (keyof typeof next)[]) {
      if (next[code] !== this.joyKeys[code]) this.input.virtualKey(code, next[code]);
    }
    this.joyKeys = next;
  }

  private releaseAll(): void {
    this.input.virtualButton(0, false);
    this.setAds(false);
    for (const k of ['Space', 'ShiftLeft', 'Tab', 'KeyR', 'KeyV']) this.input.virtualKey(k, false);
    this.joyId = null;
    this.joyBase.classList.add('hidden');
    this.moveJoy(0, 0);
    this.lookPointers.clear();
    for (const b of this.root.querySelectorAll('.t-btn.active')) b.classList.remove('active');
  }
}
