import type { Input } from '@snake/game-core';

/**
 * Turns mouse/keyboard into a game-core Input. The camera keeps the player's head
 * at the screen center, so the pointer's offset from the center is the heading.
 */
export class PlayerInput {
  readonly input: Input = { targetAngle: 0, boost: false };
  private readonly keys = new Set<string>();
  private pointer: { x: number; y: number } | null = null;
  private pointerBoost = false;
  private disposers: (() => void)[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void) => {
      target.addEventListener(type, fn as EventListener);
      this.disposers.push(() => target.removeEventListener(type, fn as EventListener));
    };
    on(canvas, 'pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    on(canvas, 'pointerdown', (e) => {
      if (e.button === 0) this.pointerBoost = true;
    });
    on(window, 'pointerup', () => (this.pointerBoost = false));
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
    });
  }

  /** Reads the current devices into `input` and returns it. */
  sample(): Input {
    const k = this.keys;
    const dx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const dy = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      this.input.targetAngle = Math.atan2(dy, dx);
    } else if (this.pointer) {
      const c = this.canvas.getBoundingClientRect();
      this.input.targetAngle = Math.atan2(this.pointer.y - c.height / 2, this.pointer.x - c.width / 2);
    }
    this.input.boost = this.pointerBoost || k.has(' ');
    return this.input;
  }

  destroy(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
  }
}
