/**
 * Sound effects, synthesized with WebAudio: no audio files to ship or license, and
 * every effect is a few lines of oscillators and filtered noise. Browsers only let a
 * page make sound after a user gesture, so the AudioContext is created lazily on the
 * first effect that follows one (a click or key press); effects before that are skipped.
 *
 * Use `sfx('name')` from anywhere. Buttons, tabs, cards and switches get their sound
 * from one document-level listener (`installUiSounds`), so components need no wiring.
 */
export type SfxName =
  | 'click' // a button
  | 'select' // a tab, card, switch or checkbox
  | 'open' // a modal appears
  | 'eat' // you ate a pellet
  | 'boost' // you started boosting
  | 'death' // you died
  | 'kill' // you killed someone
  | 'pop' // another snake died nearby
  | 'tick' // countdown second
  | 'go' // match start
  | 'win' // you won the match
  | 'coin' // coins or XP granted
  | 'levelup'
  | 'reward' // a bigger prize (season reward, cash prize)
  | 'purchase'
  | 'equip'
  | 'error';

const ENABLED_KEY = 'snake.sound';
const VOLUME_KEY = 'snake.volume';
const DEFAULT_VOLUME = 0.7;

/** Fastest repeat per effect, so a pellet trail or a button mash is a texture, not a buzz. */
const MIN_GAP_MS: Partial<Record<SfxName, number>> = { click: 30, select: 30, eat: 45, boost: 300, pop: 90, kill: 80 };

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'off';
  } catch {
    return true;
  }
}

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

let enabled = readEnabled();
let volume = readVolume();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
const lastPlayed: Partial<Record<SfxName, number>> = {};

export const soundEnabled = (): boolean => enabled;
export const soundVolume = (): number => volume;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(ENABLED_KEY, on ? 'on' : 'off');
  } catch {
    // applies until reload only
  }
}

export function setSoundVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v));
  if (master) master.gain.value = volume;
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // applies until reload only
  }
}

/** The running AudioContext, or null while muted, unsupported or before the first user gesture. */
function audio(): AudioContext | null {
  if (!enabled || volume <= 0) return null;
  if (!ctx) {
    // Creating a context before a gesture only logs a warning and stays silent.
    if (!(navigator.userActivation?.hasBeenActive ?? true)) return null;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

interface ToneOptions {
  type?: OscillatorType;
  gain?: number;
  /** End frequency of an exponential glide. */
  to?: number;
  /** Seconds before it starts. */
  delay?: number;
}

function tone(c: AudioContext, freq: number, dur: number, { type = 'sine', gain = 0.2, to, delay = 0 }: ToneOptions = {}): void {
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  // A short attack avoids clicks; the exponential decay is the "pluck".
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.01, dur / 4));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(env).connect(master!);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

interface NoiseOptions {
  from: number;
  to: number;
  q?: number;
  gain?: number;
  delay?: number;
}

/** A band of noise whose centre frequency sweeps from `from` to `to`: whooshes and crunches. */
function burst(c: AudioContext, dur: number, { from, to, q = 1, gain = 0.2, delay = 0 }: NoiseOptions): void {
  if (!noise) {
    noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t0 = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur / 3));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(env).connect(master!);
  src.start(t0);
  src.stop(t0 + dur + 0.03);
}

/** Notes played one after another. */
function arpeggio(c: AudioContext, freqs: number[], step: number, dur: number, type: OscillatorType, gain: number): void {
  freqs.forEach((f, i) => tone(c, f, i === freqs.length - 1 ? dur * 2 : dur, { type, gain, delay: i * step }));
}

const SOUNDS: Record<SfxName, (c: AudioContext) => void> = {
  click: (c) => tone(c, 880, 0.05, { type: 'square', gain: 0.12, to: 660 }),
  select: (c) => {
    tone(c, 520, 0.06, { type: 'triangle', gain: 0.2 });
    tone(c, 780, 0.08, { type: 'triangle', gain: 0.2, delay: 0.05 });
  },
  open: (c) => tone(c, 380, 0.14, { type: 'sine', gain: 0.18, to: 720 }),
  eat: (c) => {
    const f = 480 + Math.random() * 260;
    tone(c, f, 0.07, { type: 'sine', gain: 0.2, to: f * 1.7 });
  },
  boost: (c) => burst(c, 0.35, { from: 400, to: 1800, q: 1.2, gain: 0.18 }),
  death: (c) => {
    tone(c, 330, 0.55, { type: 'sawtooth', gain: 0.26, to: 55 });
    burst(c, 0.4, { from: 1400, to: 180, q: 0.8, gain: 0.22 });
  },
  kill: (c) => {
    tone(c, 660, 0.08, { type: 'square', gain: 0.16 });
    tone(c, 990, 0.16, { type: 'square', gain: 0.16, delay: 0.07 });
  },
  pop: (c) => burst(c, 0.14, { from: 900, to: 280, q: 0.9, gain: 0.08 }),
  tick: (c) => tone(c, 700, 0.07, { type: 'square', gain: 0.16 }),
  go: (c) => {
    tone(c, 660, 0.1, { type: 'square', gain: 0.18 });
    tone(c, 990, 0.28, { type: 'square', gain: 0.18, delay: 0.1 });
  },
  win: (c) => arpeggio(c, [523, 659, 784, 1047], 0.12, 0.16, 'triangle', 0.26),
  coin: (c) => {
    tone(c, 1200, 0.08, { type: 'sine', gain: 0.2 });
    tone(c, 1600, 0.2, { type: 'sine', gain: 0.2, delay: 0.07 });
  },
  levelup: (c) => arpeggio(c, [392, 523, 659, 784, 1047], 0.09, 0.14, 'triangle', 0.24),
  reward: (c) => arpeggio(c, [659, 784, 988, 1319], 0.1, 0.16, 'triangle', 0.24),
  purchase: (c) => {
    tone(c, 260, 0.08, { type: 'triangle', gain: 0.22, to: 180 });
    tone(c, 1200, 0.08, { type: 'sine', gain: 0.2, delay: 0.07 });
    tone(c, 1600, 0.2, { type: 'sine', gain: 0.2, delay: 0.14 });
  },
  equip: (c) => {
    tone(c, 600, 0.07, { type: 'triangle', gain: 0.2 });
    tone(c, 900, 0.1, { type: 'triangle', gain: 0.2, delay: 0.06 });
  },
  error: (c) => {
    tone(c, 190, 0.16, { type: 'sawtooth', gain: 0.16 });
    tone(c, 150, 0.22, { type: 'sawtooth', gain: 0.16, delay: 0.12 });
  },
};

/** Plays an effect. Fire and forget: silent when muted, unsupported, or before the first gesture. */
export function sfx(name: SfxName): void {
  const now = performance.now();
  if (now - (lastPlayed[name] ?? -Infinity) < (MIN_GAP_MS[name] ?? 0)) return;
  const c = audio();
  if (!c) return;
  lastPlayed[name] = now;
  try {
    SOUNDS[name](c);
  } catch {
    // never let audio break the game
  }
}

const CLICKABLE = 'button, [role="button"], [role="tab"], [role="radio"], [role="switch"], input[type="checkbox"], input[type="radio"], a[href]';
const SELECTABLE = '[role="tab"], [role="radio"], [role="switch"], input[type="checkbox"], input[type="radio"]';

/**
 * Menu sounds for the whole app from two document-level hooks: a click on any button
 * ("click") or selector such as a tab, mode card or switch ("select"), and a modal
 * appearing ("open"). Returns a function that removes them.
 */
export function installUiSounds(): () => void {
  const onClick = (e: MouseEvent) => {
    const el = (e.target as Element | null)?.closest?.(CLICKABLE);
    if (!el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
    sfx(el.matches(SELECTABLE) ? 'select' : 'click');
  };
  document.addEventListener('click', onClick, true);

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n instanceof Element && (n.matches('[role="dialog"]') || n.querySelector('[role="dialog"]'))) return sfx('open');
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    document.removeEventListener('click', onClick, true);
    observer.disconnect();
  };
}
