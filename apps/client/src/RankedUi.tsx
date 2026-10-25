import { token } from '@snake/design-tokens';
import { getSkin, previousSeason, seasonAt, type Leaderboard, type LeaderboardEntry } from '@snake/meta';
import { Badge, Button, Modal, Panel, Tabs } from '@snake/ui-kit';
import { useEffect, useState } from 'react';
import { ApiFailure, claimSeasonReward, fetchLeaderboard, useAccount } from './account';
import { SkinSwatch } from './AccountUi';

const small = { fontSize: token('font.sizeSm'), color: token('color.textMuted') } as const;

/** Last season's reward, shown on the menu until it is claimed. */
export function SeasonReward() {
  const reward = useAccount((s) => s.profile?.seasonReward ?? null);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState<number | null>(null);
  if (claimed !== null) return <div style={small}>+{claimed} coins. Good luck this season!</div>;
  if (!reward) return null;
  const { standing } = reward;
  return (
    <Badge count>
      <Button
        variant="secondary"
        disabled={busy}
        style={{ width: '100%' }}
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
      </Button>
    </Badge>
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

function LeaderboardModal({ onClose }: { onClose: () => void }) {
  const current = seasonAt(new Date());
  const last = previousSeason(current);
  const [seasonId, setSeasonId] = useState(current.id);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setBoard(null);
    setError(null);
    fetchLeaderboard(seasonId).then(
      (b) => live && setBoard(b),
      (e) => live && setError(e instanceof ApiFailure ? e.message : 'Leaderboard is unavailable right now'),
    );
    return () => {
      live = false;
    };
  }, [seasonId]);

  const youInTop = board?.top.some((e) => e.you) ?? false;
  return (
    <Modal open onClose={onClose} title="Ranked duels" width={440}>
      <div style={{ display: 'grid', gap: token('space.md') }}>
        <Tabs
          items={[
            { value: current.id, label: current.name },
            { value: last.id, label: last.name },
          ]}
          value={seasonId}
          onChange={setSeasonId}
        />
        <div style={small}>
          {seasonId === current.id
            ? `Season ends in ${daysLeft(current.endsAt)} days. Final ratings earn coins; next season starts halfway back to 1000.`
            : 'Final standings.'}
        </div>
        {error && <div style={small}>{error}</div>}
        {!board && !error && <div style={small}>Loading…</div>}
        {board && board.top.length === 0 && <div style={small}>No ranked duels yet. Be the first!</div>}
        {board && board.top.length > 0 && (
          <div style={{ display: 'grid', gap: token('space.xs'), maxHeight: '50vh', overflowY: 'auto' }}>
            {board.top.map((e) => (
              <Row key={`${e.rank}-${e.name}-${e.rating}`} entry={e} />
            ))}
          </div>
        )}
        {board?.you && !youInTop && (
          <>
            <div style={{ ...small, textAlign: 'center' }}>…</div>
            <Row entry={board.you} />
          </>
        )}
      </div>
    </Modal>
  );
}

function Row({ entry }: { entry: LeaderboardEntry }) {
  const skin = getSkin(entry.skin);
  return (
    <Panel variant="inset" selected={entry.you} style={{ display: 'flex', alignItems: 'center', gap: token('space.sm'), padding: token('space.sm') }}>
      <b style={{ width: 32, textAlign: 'right', fontFamily: token('font.display') }}>{entry.rank}</b>
      {skin && <SkinSwatch skin={skin} size={10} />}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {entry.name}
        {entry.you && ' (you)'}
      </span>
      <span style={small}>
        {entry.wins}W {entry.losses}L
      </span>
      <b style={{ width: 48, textAlign: 'right' }}>{entry.rating}</b>
    </Panel>
  );
}
