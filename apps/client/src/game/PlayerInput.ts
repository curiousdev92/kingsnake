import type { Input } from '@snake/game-core';

const STICK_RADIUS = 56;
const STICK_DEAD_ZONE = 10;

/**
 * Turns mouse/keyboard/touch into a game-core Input. The camera keeps the player's head
 * at the screen center, so the mouse pointer's offset from the center is the heading.
 * On touch, a floating joystick appears wherever a finger lands and steers by the drag
 * direction; a boost button sits bottom-right.
 */
export class PlayerInput {
  readonly input: Input = { targetAngle: 0, boost: false };
  private readonly keys = new Set<string>();
  private pointer: { x: number; y: number } | null = null;
  private pointerBoost = false;
  private stick: { id: number; ox: number; oy: number } | null = null;
  private readonly boostTouches = new Set<number>();
  private touchUi: TouchUi | null = null;
  private disposers: (() => void)[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void) => {
      target.addEventListener(type, fn as EventListener);
      this.disposers.push(() => target.removeEventListener(type, fn as EventListener));
    };
    on(canvas, 'pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      if (e.pointerType === 'touch') {
        if (this.stick?.id === e.pointerId) this.moveStick(e.clientX - r.left, e.clientY - r.top);
        return;
      }
      this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    on(canvas, 'pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        const ui = this.ensureTouchUi();
        if (this.stick) return;
        const r = canvas.getBoundingClientRect();
        this.stick = { id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top };
        ui.showStick(this.stick.ox, this.stick.oy);
        return;
      }
      if (e.button === 0) this.pointerBoost = true;
    });
    on(window, 'pointerup', (e) => this.release(e));
    on(window, 'pointercancel', (e) => this.release(e));
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    on(window, 'keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      this.keys.add(e.key.toLowerCase());
      if (e.key === ' ') e.preventDefault();
    });
    on(window, 'keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    on(window, 'blur', () => {
      this.keys.clear();
      this.pointerBoost = false;
      this.stick = null;
      this.boostTouches.clear();
      this.touchUi?.hideStick();
      this.touchUi?.setBoost(false);
    });
    // Phones get the touch UI up front; touch laptops get it on first touch.
    if (window.matchMedia('(pointer: coarse)').matches) this.ensureTouchUi();
  }

  /**
   * Starts a new life: aim along `angle` and forget the old pointer position, so the
   * snake keeps its spawn heading until the player actually moves the mouse or presses a key.
   */
  resetAim(angle: number): void {
    this.input.targetAngle = angle;
    this.pointer = null;
  }

  /** Reads the current devices into `input` and returns it. */
  sample(): Input {
    const k = this.keys;
    const dx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const dy = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      this.input.targetAngle = Math.atan2(dy, dx);
    } else if (this.pointer && !this.stick) {
      const c = this.canvas.getBoundingClientRect();
      this.input.targetAngle = Math.atan2(this.pointer.y - c.height / 2, this.pointer.x - c.width / 2);
    }
    // The joystick writes targetAngle directly as it moves.
    this.input.boost = this.pointerBoost || this.boostTouches.size > 0 || k.has(' ');
    return this.input;
  }

  destroy(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
  }

  private release(e: PointerEvent): void {
    if (e.pointerType !== 'touch') {
      this.pointerBoost = false;
      return;
    }
    if (this.stick?.id === e.pointerId) {
      this.stick = null;
      this.touchUi?.hideStick();
    }
    if (this.boostTouches.delete(e.pointerId)) this.touchUi?.setBoost(this.boostTouches.size > 0);
  }

  private moveStick(x: number, y: number): void {
    const st = this.stick!;
    const dx = x - st.ox;
    const dy = y - st.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_DEAD_ZONE) this.input.targetAngle = Math.atan2(dy, dx);
    const k = d > STICK_RADIUS ? STICK_RADIUS / d : 1;
    this.touchUi?.moveKnob(dx * k, dy * k);
  }

  private ensureTouchUi(): TouchUi {
    if (!this.touchUi) {
      const ui = new TouchUi(this.canvas.parentElement ?? document.body, (id) => {
        this.boostTouches.add(id);
        ui.setBoost(true);
      });
      this.touchUi = ui;
      this.disposers.push(() => ui.destroy());
    }
    return this.touchUi;
  }
}

/** DOM overlay for touch: the floating joystick and the boost button. */
class TouchUi {
  private readonly base = document.createElement('div');
  private readonly knob = document.createElement('div');
  private readonly boost = document.createElement('div');

  constructor(host: HTMLElement, onBoost: (pointerId: number) => void) {
    const round = 'position:absolute;border-radius:50%;pointer-events:none;box-sizing:border-box;';
    this.base.style.cssText =
      `${round}width:${STICK_RADIUS * 2}px;height:${STICK_RADIUS * 2}px;margin:-${STICK_RADIUS}px 0 0 -${STICK_RADIUS}px;` +
      'border:2px solid rgba(255,255,255,.35);display:none;z-index:5;';
    this.knob.style.cssText = `${round}width:44px;height:44px;left:${STICK_RADIUS - 22}px;top:${STICK_RADIUS - 22}px;background:rgba(255,255,255,.45);`;
    this.base.appendChild(this.knob);
    this.boost.textContent = 'BOOST';
    this.boost.style.cssText =
      'position:absolute;right:calc(24px + env(safe-area-inset-right));bottom:calc(24px + env(safe-area-inset-bottom));' +
      'width:88px;height:88px;border-radius:50%;border:3px solid #fff;font:700 14px system-ui,sans-serif;' +
      'display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none;touch-action:none;z-index:5;';
    this.setBoost(false);
    this.boost.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onBoost(e.pointerId);
    });
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.append(this.base, this.boost);
  }

  showStick(x: number, y: number): void {
    this.base.style.left = `${x}px`;
    this.base.style.top = `${y}px`;
    this.base.style.display = 'block';
    this.moveKnob(0, 0);
  }

  moveKnob(dx: number, dy: number): void {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  hideStick(): void {
    this.base.style.display = 'none';
  }

  setBoost(on: boolean): void {
    this.boost.style.background = on ? '#fff' : 'rgba(0,0,0,.4)';
    this.boost.style.color = on ? '#000' : '#fff';
  }

  destroy(): void {
    this.base.remove();
    this.boost.remove();
  }
}
