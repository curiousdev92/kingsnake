import { MAX_SNAKES, type LobbyInfo } from '@snake/protocol';
import { token } from '@snake/design-tokens';
import { Button, Panel } from '@snake/ui-kit';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { create } from 'zustand';
import { OnlineGame, type JoinRequest, type OnlineStats } from './game/OnlineGame';
import { Renderer } from './game/Renderer';

const useOnline = create<OnlineStats | null>(() => null);

const NAME_KEY = 'snake.name';
const CODE_LENGTH = 5;

// The name is a per-device convenience; storage can be unavailable (private mode), so never rely on it.
function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // ignore
  }
}

const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
const serverUrl = () => new URLSearchParams(location.search).get('server') ?? `ws://${location.hostname}:2567`;

function codeFromUrl(): string | null {
  const c = new URLSearchParams(location.search).get('room');
  return c ? normalizeCode(c) : null;
}

/** Shareable link that opens the game straight into a private room. */
function inviteLink(code: string): string {
  const u = new URL(location.href);
  u.search = '';
  u.searchParams.set('room', code);
  u.hash = 'online';
  return u.toString();
}

/**
 * Online play: a menu (quick play, create or join a private room), then the room.
 * Open with `#online`; `?room=CODE#online` joins a private room directly; `?server=` overrides the URL.
 */
export function OnlineApp() {
  const [name, setName] = useState(loadName);
  const [fallbackName] = useState(() => `Player${Math.floor(Math.random() * 900 + 100)}`);
  const [join, setJoin] = useState<JoinRequest | null>(() => {
    const code = codeFromUrl();
    return code ? { kind: 'code', code } : null;
  });

  if (!join) {
    return (
      <Menu
        name={name}
        onName={setName}
        onJoin={(j) => {
          saveName(name.trim());
          setJoin(j);
        }}
      />
    );
  }
  return (
    <GameView
      join={join}
      name={name.trim() || fallbackName}
      onLeave={() => {
        // Drop ?room= so a reload lands on the menu, not back in the room.
        history.replaceState(null, '', `${location.pathname}#online`);
        setJoin(null);
      }}
    />
  );
}

const input: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  padding: `${token('space.sm')} ${token('space.md')}`,
  background: token('color.background'),
  color: token('color.text'),
  border: `${token('border.width')} solid ${token('color.textMuted')}`,
  borderRadius: token('radius.button'),
  fontFamily: token('font.body'),
  fontSize: token('font.sizeMd'),
};

function Menu({ name, onName, onJoin }: { name: string; onName: (n: string) => void; onJoin: (j: JoinRequest) => void }) {
  const [code, setCode] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 16, background: token('color.background'), overflowY: 'auto' }}>
      <Panel style={{ width: 'min(360px, 100%)', boxSizing: 'border-box', display: 'grid', gap: token('space.md') }}>
        <h1 style={{ ...title, margin: 0, textAlign: 'center' }}>Snake Arena</h1>
        <label style={{ display: 'grid', gap: token('space.xs'), fontSize: token('font.sizeSm'), color: token('color.textMuted') }}>
          Your name
          <input style={input} value={name} maxLength={16} placeholder="Player" onChange={(e) => onName(e.target.value)} />
        </label>
        <Button onClick={() => onJoin({ kind: 'quick' })} style={{ fontSize: token('font.sizeLg') }}>
          Quick play
        </Button>
        <Button variant="secondary" onClick={() => onJoin({ kind: 'create' })}>
          Create private room
        </Button>
        <form
          style={{ display: 'flex', gap: token('space.sm') }}
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === CODE_LENGTH) onJoin({ kind: 'code', code });
          }}
        >
          <input
            style={{ ...input, textTransform: 'uppercase', letterSpacing: '0.15em' }}
            value={code}
            placeholder="Room code"
            aria-label="Room code"
            onChange={(e) => setCode(normalizeCode(e.target.value))}
          />
          <Button variant="secondary" type="submit" disabled={code.length !== CODE_LENGTH}>
            Join
          </Button>
        </form>
        <Button variant="secondary" onClick={() => (location.hash = '')} style={{ fontSize: token('font.sizeSm') }}>
          Offline sandbox
        </Button>
      </Panel>
    </div>
  );
}

function GameView({ join, name, onLeave }: { join: JoinRequest; name: string; onLeave: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<OnlineGame | null>(null);

  useEffect(() => {
    let cancelled = false;
    let g: OnlineGame | null = null;
    const renderer = new Renderer();
    renderer.init(host.current!).then(() => {
      if (cancelled) return renderer.app.destroy(true);
      g = new OnlineGame(renderer, (s) => useOnline.setState(s, true), { url: serverUrl(), name, join });
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
  }, [join, name]);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <Hud />
      <PhaseOverlay game={game} onLeave={onLeave} />
      {game && <NetPanel game={game} onLeave={onLeave} />}
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
      <Panel style={{ textAlign: 'center', pointerEvents: 'auto', minWidth: 240, maxWidth: 420, boxSizing: 'border-box' }}>{children}</Panel>
    </div>
  );
}

const title = { fontFamily: token('font.display'), fontSize: token('font.sizeXl') } as const;
const muted = { color: token('color.textMuted'), marginTop: token('space.sm') } as const;

function PhaseOverlay({ game, onLeave }: { game: OnlineGame | null; onLeave: () => void }) {
  const s = useOnline();
  if (!s || s.connection === 'connecting') {
    return (
      <Center>
        <div style={title}>Connecting…</div>
      </Center>
    );
  }
  if (s.connection !== 'connected') {
    return (
      <Center>
        <div style={title}>Can't join</div>
        <div style={muted}>{s.error}</div>
        <div style={{ marginTop: token('space.lg') }}>
          <Button onClick={onLeave}>Back to menu</Button>
        </div>
      </Center>
    );
  }
  const lobby = s.lobby;
  switch (s.phase) {
    case 'waiting':
      if (lobby?.private && game) return <PrivateLobby game={game} lobby={lobby} />;
      return (
        <Center>
          <div style={title}>Finding players…</div>
        </Center>
      );
    case 'countdown':
      return (
        <Center>
          <div style={muted}>Match starts in</div>
          <div style={{ ...title, fontSize: 64 }}>{s.phaseSecondsLeft ?? ''}</div>
          {lobby && (
            <div style={muted}>
              {lobby.players.length} {lobby.players.length === 1 ? 'player' : 'players'}
              {lobby.bots > 0 && ` + ${lobby.bots} bots`}
              {!lobby.private && lobby.players.length < lobby.maxPlayers && <> · waiting for more players</>}
            </div>
          )}
        </Center>
      );
    case 'ended':
      return (
        <Center>
          <div style={title}>{s.winnerName ? `${s.winnerName} wins!` : 'Draw'}</div>
          <div style={muted}>
            {lobby?.private ? 'Back to the lobby' : 'Next match'} in {s.phaseSecondsLeft ?? 0}s
          </div>
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

/** Private room before a match: share the code, see who's here; the host sets bots and starts. */
function PrivateLobby({ game, lobby }: { game: OnlineGame; lobby: LobbyInfo }) {
  const [copied, setCopied] = useState(false);
  const link = inviteLink(lobby.code);
  const total = lobby.players.length + lobby.bots;
  const maxBots = MAX_SNAKES - lobby.players.length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt('Copy this invite link', link);
    }
  };

  return (
    <Center>
      <div style={{ color: token('color.textMuted') }}>Private room code</div>
      <div style={{ ...title, fontSize: 40, letterSpacing: '0.2em', margin: `${token('space.xs')} 0 ${token('space.md')}` }}>{lobby.code}</div>
      <Button variant="secondary" onClick={copy}>
        {copied ? 'Link copied' : 'Copy invite link'}
      </Button>

      <div style={{ textAlign: 'left', margin: `${token('space.lg')} 0`, display: 'grid', gap: token('space.xs') }}>
        <div style={{ color: token('color.textMuted'), fontSize: token('font.sizeSm') }}>
          Players ({lobby.players.length}/{lobby.maxPlayers})
        </div>
        {lobby.players.map((p, i) => (
          <Panel key={i} variant="inset" selected={p.you} style={{ padding: `${token('space.xs')} ${token('space.md')}` }}>
            {p.name}
            {p.host && <span style={{ color: token('color.textMuted') }}> · host</span>}
            {p.you && <span style={{ color: token('color.textMuted') }}> · you</span>}
          </Panel>
        ))}
      </div>

      {lobby.youAreHost ? (
        <div style={{ display: 'grid', gap: token('space.md') }}>
          <label style={{ display: 'grid', gap: token('space.xs'), textAlign: 'left', fontSize: token('font.sizeSm') }}>
            <span>
              Bots: <b>{lobby.bots}</b>
            </span>
            <input type="range" min={0} max={maxBots} value={lobby.bots} onChange={(e) => game.setBots(Number(e.target.value))} />
          </label>
          <Button onClick={() => game.start()} disabled={total < 2}>
            Start match
          </Button>
          {total < 2 && <div style={{ ...muted, fontSize: token('font.sizeSm') }}>Add a bot or invite a friend first.</div>}
        </div>
      ) : (
        <div style={muted}>Waiting for the host to start the match.</div>
      )}
    </Center>
  );
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
function NetPanel({ game, onLeave }: { game: OnlineGame; onLeave: () => void }) {
  const s = useOnline();
  const [open, setOpen] = useState(false);
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
        <Button variant="secondary" onClick={onLeave} style={{ fontSize: token('font.sizeSm') }}>
          Leave
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
