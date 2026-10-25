import { tokenVar } from '@snake/design-tokens';
import { useEffect, useRef, useState } from 'react';

/** Reads a token's current value (e.g. `motion.countUp.duration` -> `600ms`) from the document. */
export function readToken(path: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(tokenVar(path)).trim();
}

/** `180ms` / `0.6s` -> milliseconds. */
export function parseDuration(value: string, fallbackMs: number): number {
  const m = /^([\d.]+)\s*(ms|s)$/.exec(value.trim());
  if (!m) return fallbackMs;
  return Number(m[1]) * (m[2] === 's' ? 1000 : 1);
}

const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Number that eases from its previous value to `target` over `motion.countUp.duration`. */
export function useCountUp(target: number, animate = true): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    if (!animate || prefersReducedMotion()) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const begin = from.current;
    const duration = parseDuration(readToken('motion.countUp.duration'), 600);
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      const v = begin + (target - begin) * eased;
      from.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, animate]);

  return value;
}

const STYLE_ID = 'snake-ui-kit-keyframes';

/** Injects the shared keyframes once. Durations and easings stay in tokens. */
export function ensureKeyframes(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
@keyframes snake-pop { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes snake-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { [data-motion] { animation: none !important; } }
`;
  document.head.appendChild(el);
}
