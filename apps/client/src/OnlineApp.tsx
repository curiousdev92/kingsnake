import { getMode } from "@snake/game-modes";
import type { LobbyInfo } from "@snake/protocol";
import { Button, Modal, Panel } from "@snake/ui-kit";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";
import { refreshProfile, savedName, sessionToken, useAccount } from "./account";
import {
  OnlineGame,
  type JoinRequest,
  type OnlineStats,
  type StandingRow,
} from "./game/OnlineGame";
import { Renderer } from "./game/Renderer";
import { Home, normalizeCode } from "./Home";

const useOnline = create<OnlineStats | null>(() => null);

const serverUrl = (): string | null => {
  const override = new URLSearchParams(location.search).get("server");
  if (override?.trim()) return override.trim();

  const configured = import.meta.env.VITE_GAME_SERVER_URL?.trim();
  if (configured) return configured;

  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return `ws://${location.hostname}:2567`;
  }

  return null;
};

function codeFromUrl(): string | null {
  const c = new URLSearchParams(location.search).get("room");
  return c ? normalizeCode(c) : null;
}

function inviteLink(code: string): string {
  const u = new URL(location.href);
  u.search = "";
  u.hash = "";
  u.searchParams.set("room", code);
  return u.toString();
}

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
      <div className="grid min-h-screen place-items-center p-5">
        <Panel className="grid max-w-[520px] gap-3">
          <strong>Online play is unavailable</strong>
          <p className="m-0 text-sm text-[var(--color-muted)]">
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
    <div className="fixed inset-0">
      <div ref={host} className="absolute inset-0" />
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
    <div className="pointer-events-none absolute left-3 top-3 grid justify-items-start gap-2">
      <Panel className="p-3">
        <div className="text-xl ">{s.youAlive ? s.mass : "—"}</div>
        <div className="text-sm text-[var(--color-muted)]">
          {s.alive} / {s.total} alive
        </div>
      </Panel>
      <Standings rows={s.standings} />
    </div>
  );
}

function Standings({ rows }: { rows: StandingRow[] }) {
  if (rows.length === 0) return null;
  const gap =
    rows.length > 1 && rows[rows.length - 1]!.you && rows[rows.length - 1]!.rank > rows.length;
  return (
    <Panel className="box-border w-[190px] p-2 text-sm tabular-nums">
      <div className="mb-1 text-[var(--color-muted)]">Standings</div>
      {rows.map((r, i) => (
        <div key={r.you ? "you" : r.rank}>
          {gap && i === rows.length - 1 && (
            <div className="text-center leading-none text-[var(--color-muted)]">⋯</div>
          )}
          <div className={`flex gap-1.5 py-px ${r.you ? "" : ""} ${r.out ? "opacity-60" : ""}`}>
            <span className="w-[18px] text-right">{r.rank}</span>
            <span className="flex-1 truncate">{r.you ? `${r.name} (you)` : r.name}</span>
            <span>{r.out ? "out" : r.mass}</span>
          </div>
        </div>
      ))}
    </Panel>
  );
}

const formatTime = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

function GameOverModal({ onLeave }: { onLeave: () => void }) {
  const s = useOnline();
  const [hidden, setHidden] = useState(false);
  const alive = s?.youAlive ?? false;
  useEffect(() => {
    if (alive) setHidden(false);
  }, [alive]);

  const d = s?.deathStats;
  const open = !!s && !!d && (s.phase === "playing" || s.phase === "ended") && !hidden;
  if (!s || !d) return null;

  const row = (label: string, value: ReactNode) => (
    <div className="flex justify-between gap-4">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span>{value}</span>
    </div>
  );
  return (
    <Modal open={open} onClose={() => setHidden(true)} title="You died" width={380}>
      <div className="grid gap-3">
        <div className="text-[var(--color-muted)]">You {d.deathReason ?? "died"}</div>
        <div className="text-center text-3xl ">
          #{d.placement} <span className="text-base font-normal">of {d.total}</span>
        </div>
        <div className="grid gap-1.5">
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
          <div className="text-center text-[var(--color-muted)]">{s.winnerName} won the match</div>
        )}
        <div className="grid gap-2">
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
    <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
      <Panel className="pointer-events-auto box-border w-full min-w-[240px] max-w-[420px] text-center">
        {children}
      </Panel>
    </div>
  );
}

const titleCls = "text-3xl ";
const mutedCls = "mt-2 text-sm text-[var(--color-muted)]";

function PhaseOverlay({ game, onLeave }: { game: OnlineGame | null; onLeave: () => void }) {
  const s = useOnline();
  if (!s || s.connection === "connecting") {
    return (
      <Center>
        <div className={titleCls}>Connecting…</div>
      </Center>
    );
  }
  if (s.connection === "searching") {
    return (
      <Center>
        <div className={titleCls}>Finding an opponent…</div>
        {s.queue && (
          <div className={mutedCls}>
            Your rating {s.queue.rating} · {s.queue.seconds}s
            {s.queue.seconds >= 10 && <div>Widening the search to more ratings</div>}
          </div>
        )}
        <div className="mt-5">
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
        <div className={titleCls}>Can’t join</div>
        <div className={mutedCls}>{s.error}</div>
        <div className="mt-5">
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
          <div className={titleCls}>Finding players…</div>
        </Center>
      );
    case "countdown":
      return (
        <Center>
          <div className={mutedCls}>Match starts in</div>
          <div className="text-6xl ">{s.phaseSecondsLeft ?? ""}</div>
          {lobby && (
            <div className={mutedCls}>
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
          <div className={titleCls}>{s.winnerName ? `${s.winnerName} wins!` : "Draw"}</div>
          {s.rewards && (
            <div className="my-3 text-xl ">
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
          <div className={mutedCls}>
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
      <div className="text-sm text-[var(--color-muted)]">Private room code · {mode.name}</div>
      <div className="my-3 text-4xl  tracking-[0.2em]">{lobby.code}</div>
      <Button variant="secondary" onClick={copy}>
        {copied ? "Link copied" : "Copy invite link"}
      </Button>

      <div className="my-5 grid gap-1 text-left">
        <div className="text-sm text-[var(--color-muted)]">
          Players ({lobby.players.length}/{lobby.maxPlayers})
        </div>
        {lobby.players.map((p, i) => (
          <Panel key={i} variant="inset" selected={p.you} className="px-3 py-1.5">
            {p.name}
            {p.host && <span className="text-[var(--color-muted)]"> · host</span>}
            {p.you && <span className="text-[var(--color-muted)]"> · you</span>}
          </Panel>
        ))}
      </div>

      {lobby.youAreHost ? (
        <div className="grid gap-3">
          <label className="grid gap-1 text-left text-sm">
            <span>
              Bots: <span>{lobby.bots}</span>
            </span>
            <input
              type="range"
              min={0}
              max={maxBots}
              value={lobby.bots}
              onChange={(e) => game.setBots(Number(e.target.value))}
              className="w-full"
            />
          </label>
          <Button onClick={() => game.start()} disabled={total < 2}>
            Start match
          </Button>
          {total < 2 && (
            <div className={`${mutedCls} text-sm`}>Add a bot or invite a friend first.</div>
          )}
        </div>
      ) : (
        <div className={mutedCls}>Waiting for the host to start the match.</div>
      )}
    </Center>
  );
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 grid place-items-center">
      <Panel className="px-5 py-2">{children}</Panel>
    </div>
  );
}

const KNOBS = [
  { key: "rtt", label: "Latency (RTT ms)", min: 0, max: 400, step: 10 },
  { key: "jitter", label: "Jitter (ms)", min: 0, max: 100, step: 5 },
  { key: "loss", label: "Loss (%)", min: 0, max: 20, step: 1 },
  { key: "interp", label: "Interp delay (ms)", min: 30, max: 400, step: 10 },
  { key: "smoothing", label: "Correction smoothing (ms)", min: 0, max: 300, step: 10 },
] as const;
type KnobKey = (typeof KNOBS)[number]["key"];

const DEV_TOOLS = import.meta.env.DEV;

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
    <label className="flex items-center gap-1.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );

  return (
    <div className="absolute right-3 top-3 grid justify-items-end gap-2">
      <div className="flex gap-2">
        <Button variant="secondary" onClick={requestLeave} className="text-xs">
          Leave
        </Button>
        <Modal
          open={confirming && inMatch}
          onClose={() => setConfirming(false)}
          title="Leave the game?"
          width={380}
        >
          <div className="grid gap-3">
            <div>If you leave now:</div>
            <ul className="m-0 grid list-disc gap-1.5 pl-5 text-sm">
              <li>
                You give up your run: your snake is taken over by a bot, and you can’t win this
                match.
              </li>
              <li>
                Your rewards use where you stand right now (about #{s?.alive} of {s?.total}) and the
                time you survived, so you earn less XP and fewer coins than by playing on.
              </li>
              {ranked && (
                <li>
                  This is a ranked duel: the match carries on against a bot, and you will likely
                  lose rating.
                </li>
              )}
            </ul>
            <div className="grid gap-2">
              <Button onClick={() => setConfirming(false)}>Keep playing</Button>
              <Button variant="secondary" onClick={onLeave}>
                Leave anyway
              </Button>
            </div>
          </div>
        </Modal>
        {DEV_TOOLS && (
          <Button variant="secondary" onClick={() => setOpen(!open)} className="text-xs">
            {open ? "Hide net" : "Net"}
          </Button>
        )}
      </div>
      {DEV_TOOLS && open && (
        <Panel className="grid max-h-[calc(100vh-80px)] w-[250px] gap-2 overflow-y-auto text-sm">
          {KNOBS.filter((k) => !(k.key === "interp" && autoInterp)).map((k) => (
            <label key={k.key} className="grid gap-0.5">
              <span>
                {k.label}: <span>{v[k.key]}</span>
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
            <div className="leading-6 text-[var(--color-muted)] tabular-nums">
              RTT {s.rttMs} ms · {s.snapshotsPerSec} snap/s
              <br />
              {s.kbpsDown} kbps down · buffer {s.buffered}
              <br />
              interp {s.interpMs} ms{autoInterp ? " (auto)" : ""}
              {s.extrapolating && <span className="text-[var(--color-fg)]"> · extrapolating</span>}
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
