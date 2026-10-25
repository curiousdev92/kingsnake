import {
  botInputs,
  createGame,
  makeConfig,
  step,
  type GameState,
  type Input,
  type SimConfig,
} from '@snake/game-core';
import { Renderer } from './Renderer';

export const PLAYER_ID = 1;
const MAX_STEPS_PER_FRAME = 5;

export type SandboxStatus = 'playing' | 'dead' | 'won' | 'lost';

export interface SandboxStats {
  mass: number;
  alive: number;
  total: number;
  status: SandboxStatus;
  placement: number;
}

/**
 * Local single-player loop: fixed-step game-core simulation against bots,
 * rendered at display rate with interpolation between the last two sim states.
 */
export class Sandbox {
  readonly cfg: SimConfig = makeConfig();
  private prev!: GameState;
  private state!: GameState;
  private acc = 0;
  private placement = 0;
  private readonly input: Input = { targetAngle: 0, boost: false };
  private readonly keys = new Set<string>();
  private pointer: { x: number; y: number } | null = null;
  private pointerBoost = false;
  private readonly inputs = new Map<number, Input>();
  private disposers: (() => void)[] = [];

  constructor(
    private readonly renderer: Renderer,
    private readonly onStats: (s: SandboxStats) => void,
    public botCount = 7,
  ) {
    this.restart();
    this.bindInput(renderer.canvas);
    renderer.app.ticker.add((t) => this.frame(t.deltaMS / 1000));
  }

  restart(): void {
    const players = [{ name: 'You' }, ...Array.from({ length: this.botCount }, (_, i) => ({ name: `Bot ${i + 1}`, isBot: true }))];
    this.state = createGame(players, this.cfg, (Math.random() * 2 ** 31) | 0);
    this.prev = this.state;
    this.input.targetAngle = this.state.snakes[0]!.angle;
    this.placement = 0;
    this.acc = 0;
  }

  private frame(dtSec: number): void {
    this.acc += Math.min(dtSec, 0.25);
    let steps = 0;
    while (this.acc >= this.cfg.dt && steps < MAX_STEPS_PER_FRAME) {
      this.tick();
      this.acc -= this.cfg.dt;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    this.renderer.render(this.prev, this.state, this.acc / this.cfg.dt, PLAYER_ID);
  }

  private tick(): void {
    this.updatePlayerInput();
    this.inputs.clear();
    botInputs(this.state, this.cfg, this.inputs);
    this.inputs.set(PLAYER_ID, { ...this.input });
    this.prev = this.state;
    this.state = step(this.state, this.inputs, this.cfg);

    for (const e of this.state.events) {
      if (e.type === 'death' && e.snakeId === PLAYER_ID) {
        this.placement = this.state.snakes.filter((s) => s.alive).length + 1;
      }
    }
    this.emitStats();
  }

  private emitStats(): void {
    const me = this.state.snakes.find((s) => s.id === PLAYER_ID)!;
    const alive = this.state.snakes.filter((s) => s.alive).length;
    let status: SandboxStatus = me.alive ? 'playing' : 'dead';
    if (this.state.finished) status = this.state.winnerId === PLAYER_ID ? 'won' : 'lost';
    this.onStats({
      mass: Math.round(me.mass),
      alive,
      total: this.state.snakes.length,
      status,
      placement: me.alive ? alive : this.placement,
    });
  }

  private updatePlayerInput(): void {
    const k = this.keys;
    const dx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const dy = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      this.input.targetAngle = Math.atan2(dy, dx);
    } else if (this.pointer) {
      // The camera keeps the player's head at the screen center.
      const c = this.renderer.canvas.getBoundingClientRect();
      this.input.targetAngle = Math.atan2(this.pointer.y - c.height / 2, this.pointer.x - c.width / 2);
    }
    this.input.boost = this.pointerBoost || k.has(' ');
  }

  private bindInput(canvas: HTMLCanvasElement): void {
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
      this.keys.add(e.key.toLowerCase());
      if (e.key === ' ') e.preventDefault();
    });
    on(window, 'keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    on(window, 'blur', () => {
      this.keys.clear();
      this.pointerBoost = false;
    });
  }

  destroy(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
  }
}
