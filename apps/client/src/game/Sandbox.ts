import {
  botInputs,
  createGame,
  makeConfig,
  step,
  type GameState,
  type Input,
  type SimConfig,
} from '@snake/game-core';
import { DEFAULT_SKIN, SKINS } from '@snake/meta';
import { useAccount } from '../account';
import { PlayerInput } from './PlayerInput';
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
  private readonly player: PlayerInput;
  private readonly inputs = new Map<number, Input>();
  private readonly onTick = (t: { deltaMS: number }) => this.frame(t.deltaMS / 1000);

  constructor(
    private readonly renderer: Renderer,
    private readonly onStats: (s: SandboxStats) => void,
    public botCount = 7,
  ) {
    this.player = new PlayerInput(renderer.canvas);
    this.restart();
    renderer.app.ticker.add(this.onTick);
  }

  restart(): void {
    const players = [{ name: 'You' }, ...Array.from({ length: this.botCount }, (_, i) => ({ name: `Bot ${i + 1}`, isBot: true }))];
    this.state = createGame(players, this.cfg, (Math.random() * 2 ** 31) | 0);
    this.prev = this.state;
    this.player.resetAim(this.state.snakes[0]!.angle);
    // Your equipped skin; bots get random ones.
    const mine = useAccount.getState().profile?.equippedSkin ?? DEFAULT_SKIN;
    this.renderer.setSkins(new Map(this.state.snakes.map((s) => [s.id, s.id === PLAYER_ID ? mine : SKINS[Math.floor(Math.random() * SKINS.length)]!.id])));
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
    this.inputs.clear();
    botInputs(this.state, this.cfg, this.inputs);
    this.inputs.set(PLAYER_ID, { ...this.player.sample() });
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

  destroy(): void {
    this.renderer.app.ticker.remove(this.onTick);
    this.player.destroy();
  }
}
