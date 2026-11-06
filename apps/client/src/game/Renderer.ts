import type { Vec2 } from '@snake/game-core';
import { getSkin } from '@snake/meta';
import { Application, Container, Graphics } from 'pixi.js';
import { Effects } from './Effects';
import { makeRoundTextures, SpritePool } from './SpritePool';

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
  eye: 0x000000,
};
const GRID = 64;
const GRID_EXTENT = 4000;
/** World units drawn beyond the screen edge, so nothing pops in at the border. */
const CULL_MARGIN = 40;

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

export interface RenderPellet {
  id: number;
  x: number;
  y: number;
  value: number;
}

/** One moment of the world. Satisfied by game-core's GameState and by netcode views plus pellets. */
export interface RenderWorld {
  snakes: readonly RenderSnake[];
  pellets: readonly RenderPellet[];
  arena: { center: Vec2; radius: number; targetRadius: number };
}

interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Draws the world with pooled sprites of pre-drawn circles (one batch per layer) and
 * skips everything outside the view, so cost follows what is on screen rather than
 * total snake length or pellet count.
 */
export class Renderer {
  readonly app = new Application();
  private readonly world = new Container();
  private readonly grid = new Graphics();
  private readonly arena = new Graphics();
  private readonly textures = makeRoundTextures();
  private readonly pellets = new SpritePool(this.textures.disc);
  private readonly snakes = new SpritePool(this.textures.body);
  private readonly effects = new Effects(this.textures.disc);
  private zoom = 1;
  private camera: Vec2 = { x: 0, y: 0 };
  private paints = new Map<number, Paint>();
  private arenaDrawn = { radius: -1, target: -1 };
  // Last frame's living snakes and pellets, diffed to spawn death and eat effects.
  private lastSnakes = new Map<number, { segments: Vec2[]; radius: number; colors: number[] }>();
  private lastPellets: readonly RenderPellet[] = [];

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
    this.world.addChild(this.grid, this.pellets.container, this.snakes.container, this.effects.container, this.arena);
    this.app.stage.addChild(this.world);
    this.drawGrid();
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  /** Draws the world between two sim states; `alpha` in [0, 1) is progress from prev to cur. */
  render(prev: RenderWorld, cur: RenderWorld, alpha: number, focusId: number | null): void {
    const prevById = new Map<number, RenderSnake>();
    for (const s of prev.snakes) prevById.set(s.id, s);
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
    const hw = width / 2 / z + CULL_MARGIN;
    const hh = height / 2 / z + CULL_MARGIN;
    const view: Bounds = { x0: this.camera.x - hw, y0: this.camera.y - hh, x1: this.camera.x + hw, y1: this.camera.y + hh };

    this.drawArena(lerp(prev.arena.radius, cur.arena.radius, alpha), cur);
    this.drawPellets(cur, view);

    const pool = this.snakes;
    pool.begin();
    // Draw the focused snake last so it is always on top.
    for (const s of cur.snakes) {
      if (s.alive && s.id !== focusId) this.drawSnake(prevById.get(s.id) ?? s, s, alpha, this.paintOf(s.id, focusId), view);
    }
    if (focus?.alive) this.drawSnake(focusPrev ?? focus, focus, alpha, this.paintOf(focus.id, focusId), view);
    pool.end();

    this.spawnEffects(cur, focusId);
    this.effects.update(Math.min(this.app.ticker.deltaMS / 1000, 0.1));
  }

  /** Clears the world (between matches) but keeps the grid. */
  clear(): void {
    this.arena.clear();
    this.arenaDrawn = { radius: -1, target: -1 };
    this.pellets.clear();
    this.snakes.clear();
    this.effects.clear();
    this.lastSnakes.clear();
    this.lastPellets = [];
  }

  private paintOf(id: number, focusId: number | null): Paint {
    return this.paints.get(id) ?? { colors: [id === focusId ? COLORS.player : COLORS.bot], band: 1 };
  }

  private spawnEffects(cur: RenderWorld, focusId: number | null): void {
    let living = 0;
    for (const s of cur.snakes) if (s.alive) living++;
    if (living < this.lastSnakes.size) {
      const alive = new Set<number>();
      for (const s of cur.snakes) if (s.alive) alive.add(s.id);
      for (const [id, last] of this.lastSnakes) {
        if (!alive.has(id)) this.effects.death(last.segments, last.radius, last.colors);
      }
    }

    // Pellets only change when the sim steps or events land, not every frame.
    if (cur.pellets !== this.lastPellets) {
      // A pellet that vanished right next to a head was eaten by that snake.
      const ids = new Set<number>();
      for (const p of cur.pellets) ids.add(p.id);
      for (const p of this.lastPellets) {
        if (ids.has(p.id)) continue;
        for (const s of cur.snakes) {
          if (!s.alive) continue;
          const reach = s.radius * 3 + 16;
          if ((s.head.x - p.x) ** 2 + (s.head.y - p.y) ** 2 < reach * reach) {
            this.effects.eat(p, s.head, this.paintOf(s.id, focusId).colors[0]!);
            break;
          }
        }
      }
      this.lastPellets = cur.pellets;
    }

    this.lastSnakes.clear();
    for (const s of cur.snakes) {
      if (!s.alive) continue;
      const colors = this.paintOf(s.id, focusId).colors;
      this.lastSnakes.set(s.id, { segments: s.segments, radius: s.radius, colors });
      const tail = s.segments[s.segments.length - 1];
      if (s.boosting && tail && Math.random() < 0.6) this.effects.boostTrail(tail, s.angle, colors[0]!);
    }
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
    // Rebuilding this geometry is costly, so only redraw when the edge has visibly moved.
    const drawn = this.arenaDrawn;
    if (Math.abs(drawn.radius - radius) < 0.25 && drawn.target === s.arena.targetRadius) return;
    this.arenaDrawn = { radius, target: s.arena.targetRadius };
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

  private drawPellets(s: RenderWorld, v: Bounds): void {
    const pool = this.pellets;
    pool.begin();
    for (const p of s.pellets) {
      if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
      pool.place(p.x, p.y, Math.min(14, 3 + Math.sqrt(p.value) * 2), COLORS.pellet, 0.85);
    }
    pool.end();
  }

  private drawSnake(prev: RenderSnake, cur: RenderSnake, alpha: number, paint: Paint, v: Bounds): void {
    const { colors, band } = paint;
    const color = colors[0]!;
    const pool = this.snakes;
    const disc = this.textures.disc;
    const r = lerp(prev.radius, cur.radius, alpha);
    const segs = cur.segments;
    const prevSegs = prev.segments;
    const glow = r * 1.8;
    // Segments outside the view (padded by their own size) are skipped.
    const x0 = v.x0 - glow;
    const y0 = v.y0 - glow;
    const x1 = v.x1 + glow;
    const y1 = v.y1 + glow;

    // Segment k sits at the same distance behind the head in both states, so lerp index-wise.
    if (cur.boosting) {
      for (let k = segs.length - 1; k >= 0; k -= 2) {
        const b = segs[k]!;
        const a = prevSegs[k] ?? b;
        const x = a.x + (b.x - a.x) * alpha;
        const y = a.y + (b.y - a.y) * alpha;
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        pool.place(x, y, glow, color, 0.14, disc);
      }
    }
    for (let k = segs.length - 1; k >= 0; k--) {
      const b = segs[k]!;
      const a = prevSegs[k] ?? b;
      const x = a.x + (b.x - a.x) * alpha;
      const y = a.y + (b.y - a.y) * alpha;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      // Bands are counted from the head, so the pattern stays put on the body as it moves.
      pool.place(x, y, r, colors[Math.floor(k / band) % colors.length]!);
    }

    // Eyes look along the heading.
    const hb = segs[0];
    if (!hb) return;
    const ha = prevSegs[0] ?? hb;
    const hx = lerp(ha.x, hb.x, alpha);
    const hy = lerp(ha.y, hb.y, alpha);
    if (hx < x0 || hx > x1 || hy < y0 || hy > y1) return;
    const angle = prev.angle + angleDelta(prev.angle, cur.angle) * alpha;
    for (const side of [-1, 1]) {
      const ex = hx + Math.cos(angle + side * 0.6) * r * 0.55;
      const ey = hy + Math.sin(angle + side * 0.6) * r * 0.55;
      pool.place(ex, ey, r * 0.22, COLORS.eye, 1, disc);
    }
  }
}

function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
