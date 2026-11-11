/**
 * Snake skins. A skin is data, not code (PLAN.md section 8): until art exists it is a
 * colour palette cycled along the body. Later each skin also names its texture atlas.
 */
export interface SnakeSkin {
  id: string;
  name: string;
  /** Price in coins; 0 means everyone owns it. */
  price: number;
  /** Body colours (hex), cycled along the body. */
  palette: string[];
  /** Segments per colour band. */
  band: number;
  /** Not for sale: earned only as a reward, described here (e.g. "Gold season reward"). */
  exclusive?: string;
}

export const DEFAULT_SKIN = 'classic';

export const SKINS: readonly SnakeSkin[] = [
  { id: 'classic', name: 'Classic', price: 0, palette: ['#ffffff'], band: 1 },
  { id: 'slate', name: 'Slate', price: 0, palette: ['#b5b5b5'], band: 1 },
  { id: 'mint', name: 'Mint', price: 100, palette: ['#80ed99', '#c7f9cc'], band: 3 },
  { id: 'ember', name: 'Ember', price: 250, palette: ['#ff6b35', '#ffd23f'], band: 2 },
  { id: 'lagoon', name: 'Lagoon', price: 250, palette: ['#2ec4b6', '#e0fbfc'], band: 2 },
  { id: 'toxic', name: 'Toxic', price: 400, palette: ['#9ef01a', '#38b000'], band: 4 },
  { id: 'grape', name: 'Grape', price: 500, palette: ['#7b2cbf', '#c77dff'], band: 3 },
  { id: 'candy', name: 'Candy', price: 600, palette: ['#ff8fab', '#ffffff'], band: 1 },
  { id: 'sunset', name: 'Sunset', price: 800, palette: ['#ff477e', '#ff9e00', '#ffd60a'], band: 2 },
  { id: 'midnight', name: 'Midnight', price: 1000, palette: ['#3a0ca3', '#4361ee', '#4cc9f0'], band: 3 },
  // Ranked duel season rewards (see SEASON_REWARD_TIERS). Never sold, never given to bots.
  { id: 'gold', name: 'Gold', price: 0, palette: ['#ffd700', '#fff3b0'], band: 2, exclusive: 'Gold season reward' },
  { id: 'diamond', name: 'Diamond', price: 0, palette: ['#b9f2ff', '#ffffff', '#7dd3fc'], band: 3, exclusive: 'Diamond season reward' },
];

const byId = new Map(SKINS.map((s) => [s.id, s]));

export function getSkin(id: string | null | undefined): SnakeSkin | undefined {
  return id ? byId.get(id) : undefined;
}

/** Skins every player owns without buying (exclusive reward skins are not among them). */
export const FREE_SKINS = SKINS.filter((s) => s.price === 0 && !s.exclusive).map((s) => s.id);

/** Skins anyone could own, which is what bots may wear. */
export const PUBLIC_SKINS = SKINS.filter((s) => !s.exclusive);
