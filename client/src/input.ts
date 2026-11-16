/** True on phones/tablets (coarse primary pointer). Override with ?touch=1 or ?touch=0. */
export function isTouchDevice(): boolean {
  const q = new URLSearchParams(location.search).get('touch');
  if (q === '1') return true;
  if (q === '0') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

const fromTouchUi = (e: Event) => (e.target as Element | null)?.closest?.('#touch-ui') != null;

/**
 * Keyboard + mouse state with per-frame edge detection and pointer lock.
 * In touch mode there is no pointer lock: on-screen controls feed the same
 * state through the virtual*() methods, so the game can't tell the difference.
 */
export class Input {
  readonly touch = isTouchDevice();
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private buttons = new Set<number>();
  private buttonsPressed = new Set<number>();
  private dx = 0;
  private dy = 0;
  wheel = 0;
  locked = false;
  onLockChange: (locked: boolean) => void = () => {};

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'AltLeft', 'F1'].includes(e.code) && this.locked) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.clear();
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked || this.touch || fromTouchUi(e)) return;
      this.buttons.add(e.button);
      this.buttonsPressed.add(e.button);
    });
    document.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || this.touch) return;
      // Some browsers emit occasional huge spikes under pointer lock.
      if (Math.abs(e.movementX) > 500 || Math.abs(e.movementY) > 500) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    document.addEventListener(
      'wheel',
      (e) => {
        if (this.locked) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) {
        this.buttons.clear();
        this.keys.clear();
      }
      this.onLockChange(this.locked);
    });
  }

  lock(): void {
    if (this.touch) {
      this.enterMobileFullscreen();
      if (!this.locked) {
        this.locked = true;
        this.onLockChange(true);
      }
      return;
    }
    const el = this.el as HTMLElement & {
      requestPointerLock(opts?: { unadjustedMovement?: boolean }): Promise<void> | void;
    };
    try {
      const p = el.requestPointerLock({ unadjustedMovement: true });
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          const p2 = el.requestPointerLock();
          if (p2 && typeof p2.catch === 'function') p2.catch(() => {});
        });
      }
    } catch {
      el.requestPointerLock();
    }
  }

  unlock(): void {
    if (this.touch) {
      if (this.locked) {
        this.locked = false;
        this.keys.clear();
        this.buttons.clear();
        this.onLockChange(false);
      }
      return;
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Best effort: fullscreen + landscape on phones (unsupported on some browsers, e.g. iPhone Safari). */
  private enterMobileFullscreen(): void {
    try {
      const doc = document.documentElement;
      if (!document.fullscreenElement && doc.requestFullscreen) {
        doc
          .requestFullscreen({ navigationUI: 'hide' })
          .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
          .catch(() => {});
      }
    } catch {
      /* not supported */
    }
  }

  // ── Virtual input used by on-screen touch controls ──
  virtualKey(code: string, down: boolean): void {
    if (down) {
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
    } else {
      this.keys.delete(code);
    }
  }

  virtualButton(b: number, down: boolean): void {
    if (down) {
      if (!this.buttons.has(b)) this.buttonsPressed.add(b);
      this.buttons.add(b);
    } else {
      this.buttons.delete(b);
    }
  }

  virtualLook(dx: number, dy: number): void {
    if (!this.locked) return;
    this.dx += dx;
    this.dy += dy;
  }

  virtualWheel(n: number): void {
    if (this.locked) this.wheel += n;
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  button(b: number): boolean {
    return this.buttons.has(b);
  }

  buttonPressed(b: number): boolean {
    return this.buttonsPressed.has(b);
  }

  consumeMouse(): { dx: number; dy: number } {
    const r = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return r;
  }

  endFrame(): void {
    this.pressed.clear();
    this.buttonsPressed.clear();
    this.wheel = 0;
  }
}
