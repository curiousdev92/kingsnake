import type { SimConfig } from '@snake/game-core';
import { token } from '@snake/design-tokens';
import { Button, Panel } from '@snake/ui-kit';
import { useEffect, useRef, useState } from 'react';
import { Renderer } from './game/Renderer';
import { Sandbox } from './game/Sandbox';
import { useHud } from './store';

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const [sandbox, setSandbox] = useState<Sandbox | null>(null);

  useEffect(() => {
    let cancelled = false;
    let sb: Sandbox | null = null;
    const renderer = new Renderer();
    renderer.init(host.current!).then(() => {
      if (cancelled) return renderer.app.destroy(true);
      sb = new Sandbox(renderer, (stats) => useHud.setState(stats));
      setSandbox(sb);
    });
    return () => {
      cancelled = true;
      if (sb) {
        sb.destroy();
        renderer.app.destroy(true);
      }
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <Hud />
      {sandbox && <GameOver sandbox={sandbox} />}
      {sandbox && <Tuning sandbox={sandbox} />}
    </div>
  );
}

function Hud() {
  const { mass, alive, total } = useHud();
  return (
    <Panel style={{ position: 'absolute', top: 12, left: 12, padding: token('space.md'), pointerEvents: 'none' }}>
      <div style={{ fontFamily: token('font.display'), fontSize: token('font.sizeLg') }}>{mass}</div>
      <div style={{ color: token('color.textMuted'), fontSize: token('font.sizeSm') }}>
        {alive} / {total} alive
      </div>
    </Panel>
  );
}

function GameOver({ sandbox }: { sandbox: Sandbox }) {
  const { status, placement, total } = useHud();
  if (status === 'playing') return null;
  const title = status === 'won' ? 'You win!' : status === 'dead' ? 'You died' : 'Match over';
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <Panel style={{ textAlign: 'center', pointerEvents: 'auto', minWidth: 220 }}>
        <div style={{ fontFamily: token('font.display'), fontSize: token('font.sizeXl') }}>{title}</div>
        <div style={{ color: token('color.textMuted'), margin: `${token('space.sm')} 0 ${token('space.lg')}` }}>
          {status === 'dead' ? `#${placement} of ${total}, spectating` : `Placed #${placement} of ${total}`}
        </div>
        <Button onClick={() => sandbox.restart()}>Play again</Button>
      </Panel>
    </div>
  );
}

type Knob = { key: keyof SimConfig; label: string; min: number; max: number; step: number };
const KNOBS: Knob[] = [
  { key: 'baseSpeed', label: 'Speed', min: 60, max: 400, step: 5 },
  { key: 'baseTurnRate', label: 'Turn rate', min: 1, max: 12, step: 0.1 },
  { key: 'turnRateMassFalloff', label: 'Turn falloff (mass)', min: 50, max: 1000, step: 10 },
  { key: 'boostMultiplier', label: 'Boost x', min: 1, max: 4, step: 0.1 },
  { key: 'boostCostPerSecond', label: 'Boost cost/s', min: 0, max: 30, step: 0.5 },
  { key: 'segmentSpacing', label: 'Segment spacing', min: 4, max: 20, step: 1 },
  { key: 'lengthPerMass', label: 'Length per mass', min: 1, max: 15, step: 0.5 },
];

/** Live tuning for judging the feel. Toggle with the button or the ` key. */
function Tuning({ sandbox }: { sandbox: Sandbox }) {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === '`' && setOpen((o) => !o);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cfg = sandbox.cfg as unknown as Record<string, number>;
  return (
    <div style={{ position: 'absolute', top: 12, right: 12, display: 'grid', gap: 8, justifyItems: 'end' }}>
      <Button variant="secondary" onClick={() => setOpen(!open)} style={{ fontSize: token('font.sizeSm') }}>
        {open ? 'Close' : 'Tune'}
      </Button>
      {open && (
        <Panel style={{ width: 240, fontSize: token('font.sizeSm'), display: 'grid', gap: 8 }}>
          {KNOBS.map((k) => (
            <label key={k.key} style={{ display: 'grid', gap: 2 }}>
              <span>
                {k.label}: <b>{cfg[k.key]}</b>
              </span>
              <input
                type="range"
                min={k.min}
                max={k.max}
                step={k.step}
                value={cfg[k.key]}
                onChange={(e) => {
                  cfg[k.key] = Number(e.target.value);
                  force((n) => n + 1);
                }}
              />
            </label>
          ))}
          <label style={{ display: 'grid', gap: 2 }}>
            <span>
              Bots (on restart): <b>{sandbox.botCount}</b>
            </span>
            <input
              type="range"
              min={0}
              max={15}
              value={sandbox.botCount}
              onChange={(e) => {
                sandbox.botCount = Number(e.target.value);
                force((n) => n + 1);
              }}
            />
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={sandbox.cfg.headToHead === 'bigger-wins'}
              onChange={(e) => {
                sandbox.cfg.headToHead = e.target.checked ? 'bigger-wins' : 'both-die';
                force((n) => n + 1);
              }}
            />
            Head-to-head: bigger wins
          </label>
          <Button onClick={() => sandbox.restart()}>Restart</Button>
        </Panel>
      )}
    </div>
  );
}
