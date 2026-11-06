import { setManifest, shippedManifest, type SkinArt } from '@snake/assets';
import { SKINS } from '@snake/meta';

/**
 * Generated placeholder skin art for trying the art path before real atlases exist.
 * Dev builds only: open the game with `?art=demo` (e.g. `/?art=demo#practice`).
 * The parts are greyscale and tinted per band by each skin's palette, so one set
 * covers every skin. Everything faces right (toward the head), per ART_SPEC.md.
 */
const svg = (size: number, body: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`,
  )}`;

const shade = `<defs><radialGradient id="g" cx="45%" cy="38%" r="65%">
  <stop offset="0" stop-color="#fff"/><stop offset="0.7" stop-color="#d6d6d6"/><stop offset="1" stop-color="#8a8a8a"/>
</radialGradient></defs>`;

// Overlapping round scale with a chevron pointing toward the head.
const segment = svg(
  64,
  `${shade}<circle cx="32" cy="32" r="30" fill="url(#g)" stroke="#3a3a3a" stroke-width="3"/>
  <path d="M22 16 L38 32 L22 48" fill="none" stroke="#9c9c9c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
);

// Same scale with a darker ring, so bands read as stripes.
const segmentAlt = svg(
  64,
  `${shade}<circle cx="32" cy="32" r="30" fill="url(#g)" stroke="#3a3a3a" stroke-width="3"/>
  <circle cx="32" cy="32" r="17" fill="none" stroke="#a8a8a8" stroke-width="7"/>`,
);

// Tapered tip: full width at the body end (right), narrowing to a point (left).
const tail = svg(
  64,
  `${shade}<path d="M4 32 C 14 14, 34 3, 50 3 A 29 29 0 0 1 50 61 C 34 61, 14 50, 4 32 Z" fill="url(#g)" stroke="#3a3a3a" stroke-width="3"/>`,
);

// Head: a rounded wedge toward the right with nostrils. Eyes are a separate, untinted layer.
const head = svg(
  96,
  `${shade}<path d="M10 48 C 10 20, 40 12, 62 16 C 82 20, 92 36, 92 48 C 92 60, 82 76, 62 80 C 40 84, 10 76, 10 48 Z" fill="url(#g)" stroke="#3a3a3a" stroke-width="3.5"/>
  <circle cx="84" cy="41" r="2.5" fill="#444"/><circle cx="84" cy="55" r="2.5" fill="#444"/>`,
);

// Boosting: the same head with a forked tongue out.
const headBoost = svg(
  96,
  `<path d="M88 48 L96 48 M93 48 L96 44 M93 48 L96 52" stroke="#e23" stroke-width="2.5" stroke-linecap="round"/>
  ${shade}<path d="M10 48 C 10 20, 40 12, 62 16 C 82 20, 92 36, 92 48 C 92 60, 82 76, 62 80 C 40 84, 10 76, 10 48 Z" fill="url(#g)" stroke="#3a3a3a" stroke-width="3.5"/>
  <circle cx="84" cy="41" r="2.5" fill="#444"/><circle cx="84" cy="55" r="2.5" fill="#444"/>`,
);

const eyes = svg(
  96,
  `<g stroke="#222" stroke-width="2"><circle cx="62" cy="30" r="10" fill="#fff"/><circle cx="62" cy="66" r="10" fill="#fff"/></g>
  <circle cx="66" cy="30" r="5" fill="#111"/><circle cx="66" cy="66" r="5" fill="#111"/>
  <circle cx="68" cy="27" r="1.8" fill="#fff"/><circle cx="68" cy="63" r="1.8" fill="#fff"/>`,
);

const demo: SkinArt = {
  tint: true,
  parts: { head, 'head.boost': headBoost, eyes, 'body.segment': segment, 'body.segment.alt': segmentAlt, 'tail.tip': tail },
};

/** Installs the demo art for every skin when the URL asks for it (dev builds only). */
export function installDemoSkinArt(): void {
  if (!import.meta.env.DEV || new URLSearchParams(location.search).get('art') !== 'demo') return;
  setManifest({ ...shippedManifest, skins: Object.fromEntries(SKINS.map((s) => [s.id, demo])) });
}
