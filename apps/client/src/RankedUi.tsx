import {
  MAX_PAYOUT_DETAILS,
  MONTHLY_PRIZES,
  SEASON_REWARD_TIERS,
  getSkin,
  seasonAt,
  type Leaderboard,
  type LeaderboardEntry,
  type ScoreBoard,
  type ScoreEntry,
} from "@snake/meta";
import { Badge, Button, Modal, Panel, Tabs } from "@snake/ui-kit";
import { useEffect, useState } from "react";
import {
  ApiFailure,
  claimMonthlyPrize,
  claimSeasonReward,
  fetchLeaderboard,
  fetchScoreBoard,
  useAccount,
} from "./account";
import { SkinSwatch, inputClass } from "./AccountUi";
import { sfx } from "./sound";

const small = "text-sm text-[var(--color-muted)]";

export function SeasonReward() {
  const reward = useAccount((s) => s.profile?.seasonReward ?? null);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState<number | null>(null);
  if (claimed !== null)
    return <div className={small}>+{claimed} coins. Good luck this season!</div>;
  if (!reward) return null;
  const { standing } = reward;
  return (
    <Badge count>
      <Button
        variant="secondary"
        disabled={busy}
        className="w-full"
        onClick={async () => {
          setBusy(true);
          try {
            setClaimed(await claimSeasonReward());
          } catch {
            setBusy(false);
          }
        }}
      >
        {standing.season.name}: {reward.tier} (#{standing.rank}) · claim {reward.coins} coins
        {reward.skin && ` + ${getSkin(reward.skin)?.name ?? ""} skin`}
      </Button>
    </Badge>
  );
}

export function MonthlyPrizeCard() {
  const profile = useAccount((s) => s.profile);
  const prize = profile?.monthlyPrize ?? null;
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!profile || !prize) return null;
  const what = `${prize.month.name}: #${prize.rank} on the monthly board`;
  if (prize.status === "requested")
    return (
      <div className={small}>
        {what}. Your ${prize.amountUsd} prize is on its way: we pay it by hand using the details you
        sent.
      </div>
    );
  if (prize.status === "paid")
    return (
      <div className={small}>
        {what}. Your ${prize.amountUsd} prize has been paid. Congratulations!
      </div>
    );
  return (
    <>
      <Badge count>
        <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
          {what} · claim ${prize.amountUsd}
        </Button>
      </Badge>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`You won $${prize.amountUsd}`}
        width={400}
      >
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await claimMonthlyPrize(details);
              setOpen(false);
            } catch (err) {
              sfx("error");
              setError(
                err instanceof ApiFailure ? err.message : "Could not send your claim, try again",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            {what}. Prizes are paid by hand, so tell us how to reach you: a PayPal email or other
            payout details.
          </div>
          {!profile.email && (
            <div className={small}>
              You are playing as a guest. Sign up from your profile first, then come back to claim.
            </div>
          )}
          <input
            className={inputClass}
            aria-label="Payout details"
            value={details}
            maxLength={MAX_PAYOUT_DETAILS}
            placeholder="PayPal email or payout details"
            onChange={(e) => setDetails(e.target.value)}
          />
          {error && <div className={small}>{error}</div>}
          <Button type="submit" disabled={busy || !profile.email || details.trim().length < 3}>
            Claim ${prize.amountUsd}
          </Button>
        </form>
      </Modal>
    </>
  );
}

export function LeaderboardButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Leaderboard
      </Button>
      {open && <LeaderboardModal onClose={() => setOpen(false)} />}
    </>
  );
}

function daysLeft(endsAt: string): number {
  return Math.max(0, Math.ceil((Date.parse(endsAt) - Date.now()) / 86_400_000));
}

type BoardTab = "overall" | "monthly" | "duel";
type Loaded =
  | { tab: "overall" | "monthly"; board: ScoreBoard }
  | { tab: "duel"; board: Leaderboard };

export function LeaderboardModal({ onClose }: { onClose: () => void }) {
  const current = seasonAt(new Date());
  const [tab, setTab] = useState<BoardTab>("overall");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoaded(null);
    setError(null);
    const request: Promise<Loaded> =
      tab === "duel"
        ? fetchLeaderboard(current.id).then((board) => ({ tab, board }))
        : fetchScoreBoard(tab).then((board) => ({ tab, board }));
    request.then(
      (l) => live && setLoaded(l),
      (e) =>
        live &&
        setError(e instanceof ApiFailure ? e.message : "Leaderboard is unavailable right now"),
    );
    return () => {
      live = false;
    };
  }, [tab, current.id]);

  const cash = MONTHLY_PRIZES.map((p) => `#${p.rank} $${p.amountUsd}`).join(" · ");
  const bonuses = SEASON_REWARD_TIERS.map(
    (t) =>
      `${t.name} ${t.minRating}+: ${t.coins} coins${t.skin ? ` + ${getSkin(t.skin)?.name} skin` : ""}`,
  );
  const note =
    tab === "overall"
      ? "Every player and mode, all time. Score is the XP your matches earned. No prizes: this one is for bragging rights."
      : tab === "monthly"
        ? `${current.name}: XP earned in every mode. Resets in ${daysLeft(current.endsAt)} days. Cash prizes for the top 3 when the month ends: ${cash}.`
        : `${current.name} ranked 1v1 duels. Season ends in ${daysLeft(current.endsAt)} days. Game bonuses by final rating: ${bonuses.join("; ")}.`;

  return (
    <Modal open onClose={onClose} title="Leaderboards" width={440}>
      <div className="grid gap-3">
        <Tabs
          items={[
            { value: "overall", label: "All time" },
            { value: "monthly", label: "This month" },
            { value: "duel", label: "1v1 Duels" },
          ]}
          value={tab}
          onChange={(v) => setTab(v as BoardTab)}
        />
        <div className={small}>{note}</div>
        {error && <div className={small}>{error}</div>}
        {!loaded && !error && <div className={small}>Loading…</div>}
        {loaded && loaded.tab === tab && <BoardList loaded={loaded} />}
      </div>
    </Modal>
  );
}

function BoardList({ loaded }: { loaded: Loaded }) {
  const duel = loaded.tab === "duel";
  const entries: (LeaderboardEntry | ScoreEntry)[] = loaded.board.top;
  const you = loaded.board.you;
  const row = (e: LeaderboardEntry | ScoreEntry) =>
    duel ? <DuelRow entry={e as LeaderboardEntry} /> : <ScoreRow entry={e as ScoreEntry} />;

  if (entries.length === 0) {
    return (
      <div className={small}>
        {duel ? "No ranked duels yet. Be the first!" : "No matches played yet. Be the first!"}
      </div>
    );
  }
  return (
    <>
      <div className="grid max-h-[50vh] gap-1 overflow-y-auto pr-1">
        {entries.map((e) => (
          <div key={`${e.rank}-${e.name}`}>{row(e)}</div>
        ))}
      </div>
      {you && !entries.some((e) => e.you) && (
        <>
          <div className={`${small} text-center`}>…</div>
          {row(you)}
        </>
      )}
    </>
  );
}

function RowShell(p: {
  rank: number;
  skin: string;
  name: string;
  you: boolean;
  detail: string;
  value: number;
}) {
  const skin = getSkin(p.skin);
  return (
    <Panel variant="inset" selected={p.you} className="flex items-center gap-2 p-2">
      <span className="w-8 text-right tabular-nums">{p.rank}</span>
      {skin && <SkinSwatch skin={skin} size={10} />}
      <span className="flex-1 truncate">
        {p.name}
        {p.you && " (you)"}
      </span>
      <span className={small}>{p.detail}</span>
      <span className="w-14 text-right tabular-nums">{p.value}</span>
    </Panel>
  );
}

function DuelRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <RowShell
      rank={entry.rank}
      skin={entry.skin}
      name={entry.name}
      you={entry.you}
      detail={`${entry.wins}W ${entry.losses}L`}
      value={entry.rating}
    />
  );
}

function ScoreRow({ entry }: { entry: ScoreEntry }) {
  return (
    <RowShell
      rank={entry.rank}
      skin={entry.skin}
      name={entry.name}
      you={entry.you}
      detail={`${entry.wins}W ${entry.kills}K`}
      value={entry.score}
    />
  );
}
