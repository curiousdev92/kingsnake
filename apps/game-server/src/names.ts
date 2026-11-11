const BOT_NAMES = [
  'Noodle', 'Slinky', 'Zigzag', 'Pretzel', 'Wiggles', 'Spaghetti', 'Sprocket', 'Doodle',
  'Biscuit', 'Mango', 'Pickle', 'Ziggy', 'Boba', 'Taco', 'Nugget', 'Pixel',
];

/** `n` distinct bot names in random order. */
export function botNames(n: number): string[] {
  const pool = [...BOT_NAMES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return Array.from({ length: n }, (_, i) => (i < pool.length ? pool[i]! : `Bot ${i + 1}`));
}

// No 0/O, 1/I/L: codes get read aloud and typed on phones.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;

/** Short room code for private rooms (31^5 ≈ 28M combinations). */
export function roomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
