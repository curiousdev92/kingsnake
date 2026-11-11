import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';

/** Radius in texture pixels of the circle drawn into every round texture. */
export const TEX_RADIUS = 60;
const TEX_SIZE = 128;

function circleTexture(draw: (ctx: CanvasRenderingContext2D, c: number) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX_SIZE;
  draw(canvas.getContext('2d')!, TEX_SIZE / 2);
  // Mipmaps keep small, zoomed-out circles smooth instead of shimmering.
  return new Texture({ source: new CanvasSource({ resource: canvas, autoGenerateMipmaps: true }) });
}

/**
 * Pre-drawn circles, tinted per sprite. Drawing sprites from one shared texture batches
 * into a few draw calls, where rebuilding vector circles every frame did not scale with
 * thousands of pellets and long bodies.
 */
export interface RoundTextures {
  /** Plain white disc: pellets, particles, eyes, boost glow. */
  disc: Texture;
  /** White disc with a dark rim: body segments. */
  body: Texture;
}

export function makeRoundTextures(): RoundTextures {
  const disc = circleTexture((ctx, c) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(c, c, TEX_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  });
  const body = circleTexture((ctx, c) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(c, c, TEX_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(c, c, TEX_RADIUS - 3.5, 0, Math.PI * 2);
    ctx.stroke();
  });
  return { disc, body };
}

/**
 * A container of reusable sprites. Each frame: `begin()`, then `place()` once per sprite
 * in draw order, then `end()` hides whatever was left over from the last frame.
 */
export class SpritePool {
  readonly container = new Container();
  private used = 0;
  private shown = 0;

  constructor(private readonly texture: Texture) {}

  begin(): void {
    this.used = 0;
  }

  /** Places the next sprite as a circle of world radius `r` at (x, y). */
  place(x: number, y: number, r: number, tint: number, alpha = 1, texture = this.texture): void {
    this.placeSprite(texture, x, y, r / TEX_RADIUS, 0, tint, alpha);
  }

  /** Places the next sprite, centred on (x, y), scaled and rotated. */
  placeSprite(texture: Texture, x: number, y: number, scale: number, rotation: number, tint: number, alpha = 1): void {
    const children = this.container.children as Sprite[];
    let s = children[this.used];
    if (!s) {
      s = new Sprite(texture);
      s.anchor.set(0.5);
      this.container.addChild(s);
    } else if (s.texture !== texture) {
      s.texture = texture;
    }
    s.visible = true;
    s.position.set(x, y);
    s.scale.set(scale);
    s.rotation = rotation;
    s.tint = tint;
    s.alpha = alpha;
    this.used++;
  }

  end(): void {
    const children = this.container.children;
    for (let i = this.used; i < this.shown; i++) children[i]!.visible = false;
    this.shown = this.used;
  }

  clear(): void {
    this.begin();
    this.end();
  }
}
