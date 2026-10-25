import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export type HapticKind = 'eat' | 'kill' | 'death' | 'win';

const VIBRATE_MS: Record<HapticKind, number | number[]> = { eat: 8, kill: [20, 40, 20], death: 120, win: [30, 60, 30, 60, 30] };
const MIN_GAP_MS: Record<HapticKind, number> = { eat: 90, kill: 0, death: 0, win: 0 };
const last: Partial<Record<HapticKind, number>> = {};

/**
 * Fire-and-forget feedback. Native builds use the Capacitor Haptics plugin; the web
 * falls back to `navigator.vibrate` (Android browsers only). Eats are throttled so
 * a pellet trail is a buzz, not a stutter.
 */
export function haptic(kind: HapticKind): void {
  const now = performance.now();
  if (now - (last[kind] ?? -Infinity) < MIN_GAP_MS[kind]) return;
  last[kind] = now;
  if (Capacitor.isNativePlatform()) {
    const p =
      kind === 'eat' ? Haptics.impact({ style: ImpactStyle.Light })
      : kind === 'kill' ? Haptics.impact({ style: ImpactStyle.Heavy })
      : Haptics.notification({ type: kind === 'win' ? NotificationType.Success : NotificationType.Error });
    p.catch(() => {});
  } else {
    // Browsers reject (and log) vibration before the first user gesture.
    if (navigator.userActivation?.hasBeenActive ?? true) navigator.vibrate?.(VIBRATE_MS[kind]);
  }
}
