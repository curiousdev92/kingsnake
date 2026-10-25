import type { Vec2 } from '@snake/game-core';
import { Graphics } from 'pixi.js';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds left, and the total it started with. */
  life: number;
  max: number;
  size: number;
  color: number;
  /** Pulled toward this point (eat sparkles fly into the mouth). */
  target?: Vec2;
}

const MAX_PARTICLES = 1500;

/**
 * Cosmetic particles in world space. Purely visual: nothing here feeds back into the
 * simulation, so it uses Math.random freely.
 */
export class Effects {
  readonly gfx = new Graphics();
  private parts: Particle[] = [];

  /** Sparkles from an eaten pellet into the eater's head. */
  eat(at: Vec2, head: Vec2, color: number): void {
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 60;
      this.add({ x: at.x, y: at.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.3, max: 0.3, size: 2.5, color, target: head });
    }
  }

  /** A body breaking apart: a puff from every few segments, plus a ring at the head. */
  death(segments: readonly Vec2[], radius: number, colors: readonly number[]): void {
    const stride = Math.max(1, Math.floor(segments.length / 60));
    for (let k = 0; k < segments.length; k += stride) {
      const p = segments[k]!;
      const color = colors[k % colors.length]!;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 30 + Math.random() * 120;
        const life = 0.5 + Math.random() * 0.5;
        this.add({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, size: radius * (0.3 + Math.random() * 0.4), color });
      }
    }
    const head = segments[0];
    if (!head) return;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.add({ x: head.x, y: head.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, life: 0.4, max: 0.4, size: 3, color: 0xffffff });
    }
  }

  /** Sparks shed from the tail while boosting. */
  boostTrail(tail: Vec2, angle: number, color: number): void {
    const a = angle + Math.PI + (Math.random() - 0.5) * 1.2;
    const sp = 20 + Math.random() * 40;
    this.add({ x: tail.x, y: tail.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4, max: 0.4, size: 2 + Math.random() * 2, color });
  }

  update(dt: number): void {
    const g = this.gfx.clear();
    const drag = Math.exp(-3 * dt);
    let n = 0;
    for (const p of this.parts) {
      p.life -= dt;
      if (p.life <= 0) continue;
      if (p.target) {
        // Steer harder as the sparkle ages, so it always lands in the mouth.
        const k = Math.min(1, dt * (6 + 30 * (1 - p.life / p.max)));
        p.x += (p.target.x - p.x) * k;
        p.y += (p.target.y - p.y) * k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
      const t = p.life / p.max;
      g.circle(p.x, p.y, p.size * (0.4 + 0.6 * t)).fill({ color: p.color, alpha: t });
      this.parts[n++] = p;
    }
    this.parts.length = n;
  }

  clear(): void {
    this.parts = [];
    this.gfx.clear();
  }

  private add(p: Particle): void {
    if (this.parts.length < MAX_PARTICLES) this.parts.push(p);
  }
}
