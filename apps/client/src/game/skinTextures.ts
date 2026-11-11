import { getSkinArt, resolveSrc, type ImageSource, type SkinArt, type SkinPart } from '@snake/assets';
import { Assets, type Spritesheet, type Texture } from 'pixi.js';

/** A skin's art ready to draw, with optional parts already filled in from the required ones. */
export interface SkinTextures {
  head: Texture;
  headBoost: Texture;
  eyes?: Texture;
  segment: Texture;
  segmentAlt: Texture;
  tail: Texture;
  /** Multiply by the skin's palette, per band. */
  tint: boolean;
}

/** ART_SPEC.md: a segment is 64 px wide at 1x and is drawn as wide as the snake. */
export const SEGMENT_PX = 64;

const cache = new Map<string, Promise<SkinTextures | undefined>>();

/**
 * Loads a skin's art once and caches it. Resolves undefined when the skin has no art
 * or it fails to load, so the renderer keeps drawing palette circles.
 */
export function loadSkinTextures(skinId: string, art: SkinArt | undefined = getSkinArt(skinId)): Promise<SkinTextures | undefined> {
  if (!art) return Promise.resolve(undefined);
  let p = cache.get(skinId);
  if (!p) {
    p = load(art).catch((err: unknown) => {
      console.warn(`skin "${skinId}": art failed to load, using circles`, err);
      return undefined;
    });
    cache.set(skinId, p);
  }
  return p;
}

async function load(art: SkinArt): Promise<SkinTextures | undefined> {
  const parts: Partial<Record<SkinPart, Texture>> = {};
  if ('atlas' in art) {
    // Mipmaps keep the body smooth when zoomed out.
    const sheet = await Assets.load<Spritesheet>({ src: art.atlas, data: { textureOptions: { autoGenerateMipmaps: true } } });
    for (const [name, tex] of Object.entries(sheet.textures)) parts[name.replace(/\.png$/, '') as SkinPart] = tex;
  } else {
    await Promise.all(
      (Object.entries(art.parts) as [SkinPart, ImageSource][]).map(async ([name, src]) => {
        const url = resolveSrc(src);
        // SVGs are rasterised on load, so rasterise them sharp enough for big snakes.
        const svg = url.startsWith('data:image/svg+xml') || url.endsWith('.svg');
        parts[name] = await Assets.load<Texture>({ src: url, data: { autoGenerateMipmaps: true, ...(svg ? { resolution: 3 } : {}) } });
      }),
    );
  }
  const head = parts.head;
  const segment = parts['body.segment'];
  if (!head || !segment) return undefined;
  return {
    head,
    headBoost: parts['head.boost'] ?? head,
    eyes: parts.eyes,
    segment,
    segmentAlt: parts['body.segment.alt'] ?? segment,
    tail: parts['tail.tip'] ?? segment,
    tint: art.tint ?? false,
  };
}
