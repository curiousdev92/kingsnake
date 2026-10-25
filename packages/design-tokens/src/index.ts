/**
 * The token contract. Components read only these semantic names, never raw values.
 * A theme is one object implementing `Theme`.
 */
export interface Theme {
  name: string;
  color: {
    background: string;
    surface: string;
    surfaceRaised: string;
    border: string;
    text: string;
    textMuted: string;
    accent: string;
    textOnAccent: string;
    danger: string;
    textOnDanger: string;
    disabled: string;
    textDisabled: string;
    /** Backdrop behind modals. */
    overlay: string;
    /** Empty part of progress bars. */
    track: string;
  };
  radius: { button: string; panel: string; chip: string };
  space: { xs: string; sm: string; md: string; lg: string; xl: string };
  border: { width: string };
  font: { display: string; body: string; sizeSm: string; sizeMd: string; sizeLg: string; sizeXl: string };
  shadow: { button: string; panel: string };
  motion: {
    pop: { duration: string; easing: string };
    press: { duration: string; easing: string; scale: string };
    countUp: { duration: string; easing: string };
  };
}

/** Phase 1 theme: plain black and white, no art. */
export const themeMono: Theme = {
  name: 'mono',
  color: {
    background: '#000000',
    surface: '#000000',
    surfaceRaised: '#111111',
    border: '#ffffff',
    text: '#ffffff',
    textMuted: '#9a9a9a',
    accent: '#ffffff',
    textOnAccent: '#000000',
    danger: '#000000',
    textOnDanger: '#ffffff',
    disabled: '#000000',
    textDisabled: '#5a5a5a',
    overlay: 'rgba(0, 0, 0, 0.7)',
    track: '#222222',
  },
  radius: { button: '10px', panel: '14px', chip: '999px' },
  space: { xs: '4px', sm: '8px', md: '12px', lg: '20px', xl: '32px' },
  border: { width: '2px' },
  font: {
    display: "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
    body: "'Helvetica Neue', Arial, sans-serif",
    sizeSm: '12px',
    sizeMd: '15px',
    sizeLg: '20px',
    sizeXl: '32px',
  },
  shadow: { button: 'none', panel: 'none' },
  motion: {
    pop: { duration: '180ms', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    press: { duration: '80ms', easing: 'ease-out', scale: '0.95' },
    countUp: { duration: '600ms', easing: 'ease-out' },
  },
};

/** CSS custom property name for a token path, e.g. `color.accent` -> `--color-accent`. */
export function tokenVar(path: string): string {
  return `--${path.replace(/\./g, '-')}`;
}

/** `var(--color-accent)` style reference for use in styles. */
export function token(path: string): string {
  return `var(${tokenVar(path)})`;
}

/** Flattens a theme into CSS custom properties. */
export function themeToCssVars(theme: Theme): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (obj: object, prefix: string) => {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string') {
        if (k !== 'name' || prefix) out[tokenVar(path)] = v;
      } else walk(v as object, path);
    }
  };
  walk(theme, '');
  return out;
}

/** Applies a theme's CSS variables to an element (defaults to the document root). */
export function applyTheme(theme: Theme, el: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(themeToCssVars(theme))) el.style.setProperty(k, v);
}
