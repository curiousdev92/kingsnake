import type { Vec2 } from '@snake/game-core';
import { getSkin } from '@snake/meta';
import { Application, Container, Graphics } from 'pixi.js';

/** A skin's palette as Pixi colours, banded along the body. */
interface Paint {
  colors: number[];
  band: number;
}

// Phase 1 placeholder look: plain circles in each skin's palette. Atlases plug in later.
const COLORS = {
  grid: 0x1c1c1c,
  edge: 0xffffff,
  storm: 0xffffff,
  pellet: 0xffffff,
  player: 0xffffff,
  bot: 0xb5b5b5,
  outline: 0x000000,
  eye: 0x000000,
};
const GRID = 64;
const GRID_EXTENT = 4000;

/** What the renderer needs from a snake. Satisfied by game-core's Snake and netcode's ViewSnake. */
export interface RenderSnake {
  id: number;
  alive: boolean;
  head: Vec2;
  angle: number;
  radius: number;
  mass: number;
  boosting: boolean;
  segments: Vec2[];
}

/** One moment of the world. Satisfied by game-core's GameState and by netcode views plus pellets. */
export interface RenderWorld {
  snakes: readonly RenderSnake[];
  pellets: readonly { x: number; y: number; value: number }[];
  arena: { center: Vec2; radius: number; targetRadius: number };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class Renderer {
  readonly app = new Application();
  private readonly world = new Container();
  private readonly grid = new Graphics();
  private readonly arena = new Graphics();
  private readonly pellets = new Graphics();
  private readonly snakes = new Graphics();
  private zoom = 1;
  private camera: Vec2 = { x: 0, y: 0 };
  private paints = new Map<number, Paint>();

  /** Skin per snake id. Snakes without one are white when focused, grey otherwise. */
  setSkins(skins: ReadonlyMap<number, string>): void {
    this.paints = new Map();
    for (const [id, skinId] of skins) {
      const skin = getSkin(skinId);
      if (skin) this.paints.set(id, { colors: skin.palette.map((c) => parseInt(c.slice(1), 16)), band: skin.band });
    }
  }

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: 0x000000,
      antialias: true,
      resolution: window.devicePixelRatio,
      autoDensity: true,
    });
    host.appendChild(this.app.canvas);
    this.world.addChild(this.grid, this.pellets, this.snakes, this.arena);
    this.app.stage.addChild(this.world);
    this.drawGrid();
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  /** Draws the world between two sim states; `alpha` in [0, 1) is progress from prev to cur. */
  render(prev: RenderWorld, cur: RenderWorld, alpha: number, focusId: number | null): void {
    const prevById = new Map(prev.snakes.map((s) => [s.id, s]));
    const focus = cur.snakes.find((s) => s.id === focusId);
    const focusPrev = focusId === null ? undefined : prevById.get(focusId);

    // Camera follows the focused head and zooms out as it grows; holds still once dead.
    if (focus?.alive && focusPrev) {
      this.camera = { x: lerp(focusPrev.head.x, focus.head.x, alpha), y: lerp(focusPrev.head.y, focus.head.y, alpha) };
      const targetZoom = Math.max(0.45, Math.min(1, 1 / (1 + (focus.mass - 20) / 300)));
      this.zoom += (targetZoom - this.zoom) * 0.05;
    }
    const { width, height } = this.app.screen;
    // Fit more of the arena on small screens.
    const screenScale = Math.min(1, Math.min(width, height) / 700);
    const z = this.zoom * screenScale;
    this.world.scale.set(z);
    this.world.position.set(width / 2 - this.camera.x * z, height / 2 - this.camera.y * z);

    this.drawArena(lerp(prev.arena.radius, cur.arena.radius, alpha), cur);
    this.drawPellets(cur);

    const g = this.snakes.clear();
    // Draw the focused snake last so it is always on top.
    const ordered = [...cur.snakes].sort((a, b) => Number(a.id === focusId) - Number(b.id === focusId));
    for (const s of ordered) {
      if (!s.alive) continue;
      const paint = this.paints.get(s.id) ?? { colors: [s.id === focusId ? COLORS.player : COLORS.bot], band: 1 };
      this.drawSnake(g, prevById.get(s.id) ?? s, s, alpha, paint);
    }
  }

  /** Clears the world (between matches) but keeps the grid. */
  clear(): void {
    this.arena.clear();
    this.pellets.clear();
    this.snakes.clear();
  }

  private drawGrid(): void {
    const g = this.grid;
    for (let v = -GRID_EXTENT; v <= GRID_EXTENT; v += GRID) {
      g.moveTo(v, -GRID_EXTENT).lineTo(v, GRID_EXTENT);
      g.moveTo(-GRID_EXTENT, v).lineTo(GRID_EXTENT, v);
    }
    g.stroke({ width: 1, color: COLORS.grid });
  }

  private drawArena(radius: number, s: RenderWorld): void {
    const { x, y } = s.arena.center;
    const g = this.arena.clear();
    // Storm: everything outside the circle is hatched over.
    g.circle(x, y, radius + GRID_EXTENT).fill({ color: COLORS.storm, alpha: 0.12 });
    g.circle(x, y, radius).cut();
    g.circle(x, y, radius).stroke({ width: 4, color: COLORS.edge });
    if (s.arena.targetRadius < radius - 1) {
      g.circle(x, y, s.arena.targetRadius).stroke({ width: 2, color: COLORS.edge, alpha: 0.3 });
    }
  }

  private drawPellets(s: RenderWorld): void {
    const g = this.pellets.clear();
    for (const p of s.pellets) {
      g.circle(p.x, p.y, Math.min(14, 3 + Math.sqrt(p.value) * 2));
    }
    g.fill({ color: COLORS.pellet, alpha: 0.85 });
  }

  private drawSnake(g: Graphics, prev: RenderSnake, cur: RenderSnake, alpha: number, paint: Paint): void {
    const { colors, band } = paint;
    const color = colors[0]!;
    const r = lerp(prev.radius, cur.radius, alpha);
    const segs = cur.segments;
    // Segment k sits at the same distance behind the head in both states, so lerp index-wise.
    const at = (k: number): Vec2 => {
      const b = segs[k]!;
      const a = prev.segments[k] ?? b;
      return { x: lerp(a.x, b.x, alpha), y: lerp(a.y, b.y, alpha) };
    };

    if (cur.boosting) {
      for (let k = segs.length - 1; k >= 0; k -= 2) {
        const p = at(k);
        g.circle(p.x, p.y, r * 1.6).fill({ color, alpha: 0.08 });
      }
    }
    for (let k = segs.length - 1; k >= 0; k--) {
      const p = at(k);
      // Bands are counted from the head, so the pattern stays put on the body as it moves.
      const c = colors[Math.floor(k / band) % colors.length]!;
      g.circle(p.x, p.y, r).fill(c).stroke({ width: 1.5, color: COLORS.outline, alpha: 0.6 });
    }

    // Eyes look along the heading.
    const head = at(0);
    const angle = prev.angle + angleDelta(prev.angle, cur.angle) * alpha;
    for (const side of [-1, 1]) {
      const ex = head.x + Math.cos(angle + side * 0.6) * r * 0.55;
      const ey = head.y + Math.sin(angle + side * 0.6) * r * 0.55;
      g.circle(ex, ey, r * 0.22).fill(COLORS.eye);
    }
  }
}

function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
