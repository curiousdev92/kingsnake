import { token } from "@snake/design-tokens";
import { getMode } from "@snake/game-modes";
import type { LobbyInfo } from "@snake/protocol";
import { Button, Modal, Panel } from "@snake/ui-kit";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";
import { refreshProfile, savedName, sessionToken, useAccount } from "./account";
import { OnlineGame, type JoinRequest, type OnlineStats, type StandingRow } from "./game/OnlineGame";
import { Renderer } from "./game/Renderer";
import { Home, normalizeCode } from "./Home";

const useOnline = create<OnlineStats | null>(() => null);

const serverUrl = (): string | null => {
  const override = new URLSearchParams(location.search).get("server");
  if (override?.trim()) return override.trim();

  const configured = import.meta.env.VITE_GAME_SERVER_URL?.trim();
  if (configured) return configured;

  // Use the local game server only on local hosts. v0 and Vercel preview
  // hosts may run in development mode, but do not expose the game-server port.
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return `ws://${location.hostname}:2567`;
  }

  // A production frontend can still render normally when its game server has
  // not been deployed yet. The game view displays setup guidance instead of
  // throwing during the effect and polluting the preview with runtime errors.
  return null;
};

function codeFromUrl(): string | null {
  const c = new URLSearchParams(location.search).get("room");
  return c ? normalizeCode(c) : null;
}

/** Shareable link that opens the game straight into a private room. */
function inviteLink(code: string): string {
  const u = new URL(location.href);
  u.search = "";
  u.hash = "";
  u.searchParams.set("room", code);
  return u.toString();
}

/**
 * The home screen, then the room once the player presses Play.
 * `?room=CODE` (an invite link) joins a private room directly; `?server=` overrides the URL.
 */
export function OnlineApp() {
  const [fallbackName] = useState(() => `Player${Math.floor(Math.random() * 900 + 100)}`);
  const [join, setJoin] = useState<JoinRequest | null>(() => {
    const code = codeFromUrl();
    return code ? { kind: "code", code } : null;
  });

  if (!join) return <Home onJoin={setJoin} />;
  return (
    <GameView
      join={join}
      name={useAccount.getState().profile?.name ?? (savedName() || fallbackName)}
      onLeave={() => {
        // Drop ?room= so a reload lands on the home screen, not back in the room.
        history.replaceState(null, "", location.pathname);
        setJoin(null);
      }}
    />
  );
}

function GameView({
  join,
  name,
  onLeave,
}: {
  join: JoinRequest;
  name: string;
  onLeave: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<OnlineGame | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const url = serverUrl();
    if (!url) {
      setUnavailable(true);
      return;
    }

    let cancelled = false;
    let g: OnlineGame | null = null;
    const renderer = new Renderer();
    renderer.init(host.current!).then(() => {
      if (cancelled) return renderer.app.destroy(true);
      g = new OnlineGame(renderer, (s) => useOnline.setState(s, true), {
        url,
        name,
        join,
        token: useAccount.getState().status === "ready" ? sessionToken() : null,
        onRewards: () => void refreshProfile(),
      });
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

  if (unavailable) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: token("space.lg"),
        }}
      >
        <Panel style={{ maxWidth: 520, display: "grid", gap: token("space.md") }}>
          <strong>Online play is unavailable</strong>
          <p style={{ margin: 0, color: token("color.textMuted") }}>
            The web client is running, but its game server has not been configured for this
            deployment yet.
          </p>
          <Button variant="secondary" onClick={onLeave}>
            Back to menu
          </Button>
        </Panel>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <div ref={host} style={{ position: "absolute", inset: 0 }} />
      <Hud />
      <PhaseOverlay game={game} onLeave={onLeave} />
      <GameOverModal onLeave={onLeave} />
      {game && <NetPanel game={game} onLeave={onLeave} />}
    </div>
  );
}

function Hud() {
  const s = useOnline();
  if (!s || s.phase !== "playing") return null;
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        display: "grid",
        gap: 8,
        justifyItems: "start",
        pointerEvents: "none",
      }}
    >
      <Panel style={{ padding: token("space.md") }}>
        <div
          style={{
            fontFamily: token("font.display"),
            fontSize: token("font.sizeLg"),
          }}
        >
          {s.youAlive ? s.mass : "—"}
        </div>
        <div
          style={{
            color: token("color.textMuted"),
            fontSize: token("font.sizeSm"),
          }}
        >
          {s.alive} / {s.total} alive
        </div>
      </Panel>
      <Standings rows={s.standings} />
    </div>
  );
}

/** Top 5 by mass; the local player is added below a gap when ranked lower or eliminated. */
function Standings({ rows }: { rows: StandingRow[] }) {
  if (rows.length === 0) return null;
  const gap = rows.length > 1 && rows[rows.length - 1]!.you && rows[rows.length - 1]!.rank > rows.length;
  return (
    <Panel
      style={{
        padding: token("space.sm"),
        width: 190,
        boxSizing: "border-box",
        fontSize: token("font.sizeSm"),
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <div style={{ color: token("color.textMuted"), marginBottom: 4 }}>Standings</div>
      {rows.map((r, i) => (
        <div key={r.you ? "you" : r.rank}>
          {gap && i === rows.length - 1 && (
            <div style={{ color: token("color.textMuted"), textAlign: "center", lineHeight: 1 }}>⋯</div>
          )}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "1px 0",
              fontWeight: r.you ? 700 : 400,
              opacity: r.out ? 0.6 : 1,
            }}
          >
            <span style={{ width: 18, textAlign: "right" }}>{r.rank}</span>
            <span
              style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {r.you ? `${r.name} (you)` : r.name}
            </span>
            <span>{r.out ? "out" : r.mass}</span>
          </div>
        </div>
      ))}
    </Panel>
  );
}

const formatTime = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/** Shown once the local player dies: the game's numbers, and a way back to the main page. */
function GameOverModal({ onLeave }: { onLeave: () => void }) {
  const s = useOnline();
  const [hidden, setHidden] = useState(false);
  const alive = s?.youAlive ?? false;
  // A new life (next match) shows the modal again.
  useEffect(() => {
    if (alive) setHidden(false);
  }, [alive]);

  const d = s?.deathStats;
  const open = !!s && !!d && (s.phase === "playing" || s.phase === "ended") && !hidden;
  if (!s || !d) return null;

  const row = (label: string, value: ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <span style={{ color: token("color.textMuted") }}>{label}</span>
      <b>{value}</b>
    </div>
  );
  return (
    <Modal open={open} onClose={() => setHidden(true)} title="You died" width={380}>
      <div style={{ display: "grid", gap: token("space.md") }}>
        <div style={{ color: token("color.textMuted") }}>
          You {d.deathReason ?? "died"}
        </div>
        <div style={{ ...title, textAlign: "center" }}>
          #{d.placement} <span style={{ fontSize: token("font.sizeMd") }}>of {d.total}</span>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {row("Survived", formatTime(d.survivedSec))}
          {row("Kills", d.kills)}
          {row("Biggest size", d.peakMass)}
          {row("Final size", d.finalMass)}
          {s.rewards && row("Rewards", `+${s.rewards.xp} XP · +${s.rewards.coins} coins`)}
          {s.rewards?.rating &&
            row(
              "Rating",
              `${s.rewards.rating.after} (${s.rewards.rating.after >= s.rewards.rating.before ? "+" : ""}${s.rewards.rating.after - s.rewards.rating.before})`,
            )}
        </div>
        {s.phase === "ended" && s.winnerName && (
          <div style={{ textAlign: "center", color: token("color.textMuted") }}>
            {s.winnerName} won the match
          </div>
        )}
        <div style={{ display: "grid", gap: 8 }}>
          <Button onClick={onLeave}>Back to main page</Button>
          {s.phase === "playing" && (
            <Button variant="secondary" onClick={() => setHidden(true)}>
              Keep watching
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Center({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
        padding: 16,
      }}
    >
      <Panel
        style={{
          textAlign: "center",
          pointerEvents: "auto",
          minWidth: 240,
          maxWidth: 420,
          boxSizing: "border-box",
        }}
      >
        {children}
      </Panel>
    </div>
  );
}

const title = {
  fontFamily: token("font.display"),
  fontSize: token("font.sizeXl"),
} as const;
const muted = {
  color: token("color.textMuted"),
  marginTop: token("space.sm"),
} as const;

function PhaseOverlay({ game, onLeave }: { game: OnlineGame | null; onLeave: () => void }) {
  const s = useOnline();
  if (!s || s.connection === "connecting") {
    return (
      <Center>
        <div style={title}>Connecting…</div>
      </Center>
    );
  }
  if (s.connection === "searching") {
    return (
      <Center>
        <div style={title}>Finding an opponent…</div>
        {s.queue && (
          <div style={muted}>
            Your rating {s.queue.rating} · {s.queue.seconds}s
            {s.queue.seconds >= 10 && <div>Widening the search to more ratings</div>}
          </div>
        )}
        <div style={{ marginTop: token("space.lg") }}>
          <Button variant="secondary" onClick={onLeave}>
            Cancel
          </Button>
        </div>
      </Center>
    );
  }
  if (s.connection !== "connected") {
    return (
      <Center>
        <div style={title}>Can't join</div>
        <div style={muted}>{s.error}</div>
        <div style={{ marginTop: token("space.lg") }}>
          <Button onClick={onLeave}>Back to menu</Button>
        </div>
      </Center>
    );
  }
  const lobby = s.lobby;
  switch (s.phase) {
    case "waiting":
      if (lobby?.private && game) return <PrivateLobby game={game} lobby={lobby} />;
      return (
        <Center>
          <div style={title}>Finding players…</div>
        </Center>
      );
    case "countdown":
      return (
        <Center>
          <div style={muted}>Match starts in</div>
          <div style={{ ...title, fontSize: 64 }}>{s.phaseSecondsLeft ?? ""}</div>
          {lobby && (
            <div style={muted}>
              {lobby.players.length} {lobby.players.length === 1 ? "player" : "players"}
              {lobby.bots > 0 && ` + ${lobby.bots} bots`}
              {!lobby.private && lobby.players.length < lobby.maxPlayers && (
                <> · waiting for more players</>
              )}
            </div>
          )}
        </Center>
      );
    case "ended":
      return (
        <Center>
          <div style={title}>{s.winnerName ? `${s.winnerName} wins!` : "Draw"}</div>
          {s.rewards && (
            <div
              style={{
                margin: `${token("space.md")} 0`,
                fontFamily: token("font.display"),
                fontSize: token("font.sizeLg"),
              }}
            >
              +{s.rewards.xp} XP · +{s.rewards.coins} coins
              {s.rewards.levelAfter > s.rewards.levelBefore && (
                <div>Level up! Level {s.rewards.levelAfter}</div>
              )}
              {s.rewards.rating && (
                <div>
                  Rating {s.rewards.rating.after} (
                  {s.rewards.rating.after >= s.rewards.rating.before ? "+" : ""}
                  {s.rewards.rating.after - s.rewards.rating.before})
                </div>
              )}
            </div>
          )}
          <div style={muted}>
            {lobby?.private ? "Back to the lobby" : "Next match"} in {s.phaseSecondsLeft ?? 0}s
          </div>
        </Center>
      );
    case "playing":
      if (s.you === null) return <Banner>Spectating: you will join the next match</Banner>;
      if (!s.youAlive && s.placement > 0) {
        return (
          <Banner>
            You {s.deathReason ?? "died"} (#{s.placement} of {s.total})
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
  const mode = getMode(lobby.mode);
  const maxBots = Math.max(0, mode.maxPrivateSnakes - lobby.players.length);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt("Copy this invite link", link);
    }
  };

  return (
    <Center>
      <div style={{ color: token("color.textMuted") }}>Private room code · {mode.name}</div>
      <div
        style={{
          ...title,
          fontSize: 40,
          letterSpacing: "0.2em",
          margin: `${token("space.xs")} 0 ${token("space.md")}`,
        }}
      >
        {lobby.code}
      </div>
      <Button variant="secondary" onClick={copy}>
        {copied ? "Link copied" : "Copy invite link"}
      </Button>

      <div
        style={{
          textAlign: "left",
          margin: `${token("space.lg")} 0`,
          display: "grid",
          gap: token("space.xs"),
        }}
      >
        <div
          style={{
            color: token("color.textMuted"),
            fontSize: token("font.sizeSm"),
          }}
        >
          Players ({lobby.players.length}/{lobby.maxPlayers})
        </div>
        {lobby.players.map((p, i) => (
          <Panel
            key={i}
            variant="inset"
            selected={p.you}
            style={{ padding: `${token("space.xs")} ${token("space.md")}` }}
          >
            {p.name}
            {p.host && <span style={{ color: token("color.textMuted") }}> · host</span>}
            {p.you && <span style={{ color: token("color.textMuted") }}> · you</span>}
          </Panel>
        ))}
      </div>

      {lobby.youAreHost ? (
        <div style={{ display: "grid", gap: token("space.md") }}>
          <label
            style={{
              display: "grid",
              gap: token("space.xs"),
              textAlign: "left",
              fontSize: token("font.sizeSm"),
            }}
          >
            <span>
              Bots: <b>{lobby.bots}</b>
            </span>
            <input
              type="range"
              min={0}
              max={maxBots}
              value={lobby.bots}
              onChange={(e) => game.setBots(Number(e.target.value))}
            />
          </label>
          <Button onClick={() => game.start()} disabled={total < 2}>
            Start match
          </Button>
          {total < 2 && (
            <div style={{ ...muted, fontSize: token("font.sizeSm") }}>
              Add a bot or invite a friend first.
            </div>
          )}
        </div>
      ) : (
        <div style={muted}>Waiting for the host to start the match.</div>
      )}
    </Center>
  );
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: 0,
        right: 0,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
      }}
    >
      <Panel style={{ padding: `${token("space.sm")} ${token("space.lg")}` }}>{children}</Panel>
    </div>
  );
}

const KNOBS = [
  { key: "rtt", label: "Latency (RTT ms)", min: 0, max: 400, step: 10 },
  { key: "jitter", label: "Jitter (ms)", min: 0, max: 100, step: 5 },
  { key: "loss", label: "Loss (%)", min: 0, max: 20, step: 1 },
  { key: "interp", label: "Interp delay (ms)", min: 30, max: 400, step: 10 },
  {
    key: "smoothing",
    label: "Correction smoothing (ms)",
    min: 0,
    max: 300,
    step: 10,
  },
] as const;
type KnobKey = (typeof KNOBS)[number]["key"];

/** Network tuning is for development only: release builds never show it to players. */
const DEV_TOOLS = import.meta.env.DEV;

/** The Leave button, plus (dev builds only) network simulator, prediction and interpolation controls. */
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
  const [confirming, setConfirming] = useState(false);

  // Leaving costs something only while your snake is still alive in a running match.
  const inMatch = !!s && s.phase === "playing" && s.you !== null && s.youAlive;
  const ranked = !!s?.lobby && !s.lobby.private && getMode(s.lobby.mode).ranked;
  const requestLeave = () => (inMatch ? setConfirming(true) : onLeave());

  const update = (key: KnobKey, value: number) => {
    const next = { ...v, [key]: value };
    setV(next);
    game.setConditions(next.rtt, next.jitter, next.loss / 100);
    game.manualInterpMs = next.interp;
    game.predictor.smoothingMs = next.smoothing;
  };

  const toggle = (label: string, checked: boolean, set: (on: boolean) => void) => (
    <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        display: "grid",
        gap: 8,
        justifyItems: "end",
      }}
    >
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" onClick={requestLeave} style={{ fontSize: token("font.sizeSm") }}>
          Leave
        </Button>
        <Modal open={confirming && inMatch} onClose={() => setConfirming(false)} title="Leave the game?" width={380}>
          <div style={{ display: "grid", gap: token("space.md") }}>
            <div>If you leave now:</div>
            <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
              <li>
                You give up your run: your snake is taken over by a bot, and you can't win this match.
              </li>
              <li>
                Your rewards use where you stand right now (about #{s?.alive} of {s?.total}) and the
                time you survived, so you earn less XP and fewer coins than by playing on.
              </li>
              {ranked && (
                <li>This is a ranked duel: the match carries on against a bot, and you will likely lose rating.</li>
              )}
            </ul>
            <div style={{ display: "grid", gap: 8 }}>
              <Button onClick={() => setConfirming(false)}>Keep playing</Button>
              <Button variant="secondary" onClick={onLeave}>
                Leave anyway
              </Button>
            </div>
          </div>
        </Modal>
        {DEV_TOOLS && (
          <Button
            variant="secondary"
            onClick={() => setOpen(!open)}
            style={{ fontSize: token("font.sizeSm") }}
          >
            {open ? "Hide net" : "Net"}
          </Button>
        )}
      </div>
      {DEV_TOOLS && open && (
        <Panel
          style={{
            width: 250,
            maxHeight: "calc(100vh - 80px)",
            overflowY: "auto",
            fontSize: token("font.sizeSm"),
            display: "grid",
            gap: 8,
          }}
        >
          {KNOBS.filter((k) => !(k.key === "interp" && autoInterp)).map((k) => (
            <label key={k.key} style={{ display: "grid", gap: 2 }}>
              <span>
                {k.label}: <b>{v[k.key]}</b>
              </span>
              <input
                type="range"
                min={k.min}
                max={k.max}
                step={k.step}
                value={v[k.key]}
                onChange={(e) => update(k.key, Number(e.target.value))}
              />
            </label>
          ))}
          {toggle("Predict own snake", predict, (on) => {
            game.predict = on;
            setPredict(on);
          })}
          {toggle("Auto interp delay", autoInterp, (on) => {
            game.autoInterp = on;
            setAutoInterp(on);
          })}
          {s && (
            <div
              style={{
                color: token("color.textMuted"),
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1.5,
              }}
            >
              RTT {s.rttMs} ms · {s.snapshotsPerSec} snap/s
              <br />
              {s.kbpsDown} kbps down · buffer {s.buffered}
              <br />
              interp {s.interpMs} ms{autoInterp ? " (auto)" : ""}
              {s.extrapolating && <b style={{ color: token("color.text") }}> · extrapolating</b>}
              <br />
              {s.predErr === null
                ? "prediction off"
                : `pred error ${s.predErr} · snaps ${s.predSnaps}`}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
