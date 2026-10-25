import { token } from '@snake/design-tokens';
import { Button, Panel } from '@snake/ui-kit';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { OnlineGame, type OnlineStats } from './game/OnlineGame';
import { Renderer } from './game/Renderer';

const useOnline = create<OnlineStats | null>(() => null);

function onlineOptions() {
  const q = new URLSearchParams(location.search);
  return {
    url: q.get('server') ?? `ws://${location.hostname}:2567`,
    name: q.get('name') ?? `Player${Math.floor(Math.random() * 900 + 100)}`,
    bots: Number(q.get('bots') ?? 0),
  };
}

/** Online play against the game-server. Open with `#online`; `?bots=7` adds bots, `?server=` overrides the URL. */
export function OnlineApp() {
  const host = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<OnlineGame | null>(null);

  useEffect(() => {
    let cancelled = false;
    let g: OnlineGame | null = null;
    const renderer = new Renderer();
    renderer.init(host.current!).then(() => {
      if (cancelled) return renderer.app.destroy(true);
      g = new OnlineGame(renderer, (s) => useOnline.setState(s, true), onlineOptions());
      setGame(g);
    });
    return () => {
      cancelled = true;
      useOnline.setState(null, true);
      if (g) {
        g.destroy();
        renderer.app.destroy(true);
      }
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <Hud />
      <PhaseOverlay />
      {game && <NetPanel game={game} />}
    </div>
  );
}

function Hud() {
  const s = useOnline();
  if (!s || s.phase !== 'playing') return null;
  return (
    <Panel style={{ position: 'absolute', top: 12, left: 12, padding: token('space.md'), pointerEvents: 'none' }}>
      <div style={{ fontFamily: token('font.display'), fontSize: token('font.sizeLg') }}>{s.youAlive ? s.mass : '—'}</div>
      <div style={{ color: token('color.textMuted'), fontSize: token('font.sizeSm') }}>
        {s.alive} / {s.total} alive
      </div>
    </Panel>
  );
}

function Center({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', padding: 16 }}>
      <Panel style={{ textAlign: 'center', pointerEvents: 'auto', minWidth: 240, maxWidth: 420 }}>{children}</Panel>
    </div>
  );
}

const title = { fontFamily: token('font.display'), fontSize: token('font.sizeXl') } as const;
const muted = { color: token('color.textMuted'), marginTop: token('space.sm') } as const;

function PhaseOverlay() {
  const s = useOnline();
  if (!s || s.connection === 'connecting') return <Center><div style={title}>Connecting…</div></Center>;
  if (s.connection !== 'connected') {
    return (
      <Center>
        <div style={title}>Offline</div>
        <div style={muted}>{s.error}</div>
        <div style={{ ...muted, fontSize: token('font.sizeSm') }}>Start the server with <code>pnpm dev</code>.</div>
        <div style={{ marginTop: token('space.lg') }}>
          <Button onClick={() => location.reload()}>Retry</Button>
        </div>
      </Center>
    );
  }
  switch (s.phase) {
    case 'waiting':
      return (
        <Center>
          <div style={title}>Waiting for players</div>
          <div style={muted}>
            {s.needPlayers} more needed. Open this page in another tab to join, or add <code>?bots=7</code> to the URL.
          </div>
        </Center>
      );
    case 'countdown':
      return (
        <Center>
          <div style={muted}>Match starts in</div>
          <div style={{ ...title, fontSize: 64 }}>{s.phaseSecondsLeft ?? ''}</div>
        </Center>
      );
    case 'ended':
      return (
        <Center>
          <div style={title}>{s.winnerName ? `${s.winnerName} wins!` : 'Draw'}</div>
          <div style={muted}>Next match in {s.phaseSecondsLeft ?? 0}s</div>
        </Center>
      );
    case 'playing':
      if (s.you === null) return <Banner>Spectating: you will join the next match</Banner>;
      if (!s.youAlive && s.placement > 0) {
        return (
          <Banner>
            You {s.deathReason ?? 'died'} (#{s.placement} of {s.total}). Spectating
          </Banner>
        );
      }
      return null;
  }
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <Panel style={{ padding: `${token('space.sm')} ${token('space.lg')}` }}>{children}</Panel>
    </div>
  );
}

const KNOBS = [
  { key: 'rtt', label: 'Latency (RTT ms)', min: 0, max: 400, step: 10 },
  { key: 'jitter', label: 'Jitter (ms)', min: 0, max: 100, step: 5 },
  { key: 'loss', label: 'Loss (%)', min: 0, max: 20, step: 1 },
  { key: 'interp', label: 'Interp delay (ms)', min: 30, max: 400, step: 10 },
  { key: 'smoothing', label: 'Correction smoothing (ms)', min: 0, max: 300, step: 10 },
] as const;
type KnobKey = (typeof KNOBS)[number]['key'];

/** Network simulator, prediction and interpolation controls with live diagnostics. */
function NetPanel({ game }: { game: OnlineGame }) {
  const s = useOnline();
  const [open, setOpen] = useState(true);
  const [v, setV] = useState<Record<KnobKey, number>>({
    rtt: 0,
    jitter: 0,
    loss: 0,
    interp: game.manualInterpMs,
    smoothing: game.predictor.smoothingMs,
  });
  const [predict, setPredict] = useState(game.predict);
  const [autoInterp, setAutoInterp] = useState(game.autoInterp);

  const update = (key: KnobKey, value: number) => {
    const next = { ...v, [key]: value };
    setV(next);
    game.setConditions(next.rtt, next.jitter, next.loss / 100);
    game.manualInterpMs = next.interp;
    game.predictor.smoothingMs = next.smoothing;
  };

  const toggle = (label: string, checked: boolean, set: (on: boolean) => void) => (
    <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );

  return (
    <div style={{ position: 'absolute', top: 12, right: 12, display: 'grid', gap: 8, justifyItems: 'end' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="secondary" onClick={() => (location.hash = '')} style={{ fontSize: token('font.sizeSm') }}>
          Sandbox
        </Button>
        <Button variant="secondary" onClick={() => setOpen(!open)} style={{ fontSize: token('font.sizeSm') }}>
          {open ? 'Hide net' : 'Net'}
        </Button>
      </div>
      {open && (
        <Panel style={{ width: 250, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', fontSize: token('font.sizeSm'), display: 'grid', gap: 8 }}>
          {KNOBS.filter((k) => !(k.key === 'interp' && autoInterp)).map((k) => (
            <label key={k.key} style={{ display: 'grid', gap: 2 }}>
              <span>
                {k.label}: <b>{v[k.key]}</b>
              </span>
              <input type="range" min={k.min} max={k.max} step={k.step} value={v[k.key]} onChange={(e) => update(k.key, Number(e.target.value))} />
            </label>
          ))}
          {toggle('Predict own snake', predict, (on) => {
            game.predict = on;
            setPredict(on);
          })}
          {toggle('Auto interp delay', autoInterp, (on) => {
            game.autoInterp = on;
            setAutoInterp(on);
          })}
          {s && (
            <div style={{ color: token('color.textMuted'), fontVariantNumeric: 'tabular-nums', lineHeight: 1.5 }}>
              RTT {s.rttMs} ms · {s.snapshotsPerSec} snap/s
              <br />
              {s.kbpsDown} kbps down · buffer {s.buffered}
              <br />
              interp {s.interpMs} ms{autoInterp ? ' (auto)' : ''}
              {s.extrapolating && <b style={{ color: token('color.text') }}> · extrapolating</b>}
              <br />
              {s.predErr === null ? 'prediction off' : `pred error ${s.predErr} · snaps ${s.predSnaps}`}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
