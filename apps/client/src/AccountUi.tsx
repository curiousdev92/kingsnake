import { token } from '@snake/design-tokens';
import { SKINS, type SnakeSkin } from '@snake/meta';
import { Badge, Button, CurrencyPill, Modal, Panel, ProgressBar } from '@snake/ui-kit';
import { useState } from 'react';
import { ApiFailure, buySkin, claimDaily, equipSkin, useAccount } from './account';

const small = { fontSize: token('font.sizeSm'), color: token('color.textMuted') } as const;

/** Level, XP bar and coins; or a note when the API is unreachable. */
export function ProfileCard() {
  const { status, profile } = useAccount();
  if (status === 'loading') return <div style={small}>Signing in…</div>;
  if (!profile) return <div style={small}>Offline: you can play, but progress and rewards aren't saved.</div>;
  return (
    <div style={{ display: 'grid', gap: token('space.xs') }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b style={{ fontFamily: token('font.display') }}>Level {profile.level}</b>
        <CurrencyPill currency="coin" amount={profile.coins} />
      </div>
      <ProgressBar value={profile.xpIntoLevel / profile.xpForNext} label="XP to next level" />
      <div style={{ ...small, display: 'flex', justifyContent: 'space-between' }}>
        <span>
          {profile.xpIntoLevel} / {profile.xpForNext} XP
        </span>
        <span>
          Duel rating {profile.rating}
          {profile.season.rank !== null && ` · #${profile.season.rank}`}
        </span>
      </div>
    </div>
  );
}

export function DailyReward() {
  const profile = useAccount((s) => s.profile);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState<number | null>(null);
  if (!profile) return null;
  if (claimed !== null) return <div style={small}>+{claimed} coins. See you tomorrow!</div>;
  if (!profile.daily.available) return <div style={small}>Daily reward claimed · day {profile.daily.streak} streak</div>;
  return (
    <Badge count>
      <Button
        variant="secondary"
        disabled={busy}
        style={{ width: '100%' }}
        onClick={async () => {
          setBusy(true);
          try {
            setClaimed(await claimDaily());
          } catch {
            setBusy(false);
          }
        }}
      >
        Daily reward: +{profile.daily.reward} coins (day {profile.daily.streak})
      </Button>
    </Badge>
  );
}

/** Colour preview of a skin: a short row of body segments. */
export function SkinSwatch({ skin, size = 14 }: { skin: SnakeSkin; size?: number }) {
  return (
    <span aria-hidden style={{ display: 'inline-flex' }}>
      {Array.from({ length: 6 }, (_, k) => (
        <span
          key={k}
          style={{
            width: size,
            height: size,
            marginLeft: k === 0 ? 0 : -size * 0.3,
            borderRadius: '50%',
            background: skin.palette[Math.floor(k / skin.band) % skin.palette.length],
            border: '1.5px solid #000',
          }}
        />
      ))}
    </span>
  );
}

export function ShopButton() {
  const profile = useAccount((s) => s.profile);
  const [open, setOpen] = useState(false);
  if (!profile) return null;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Shop
      </Button>
      <Shop open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function Shop({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useAccount((s) => s.profile);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!profile) return null;

  const act = async (id: string, fn: (id: string) => Promise<void>) => {
    setBusy(id);
    setError(null);
    try {
      await fn(id);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Shop is unavailable right now');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Skins" width={420}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: token('space.md') }}>
        <CurrencyPill currency="coin" amount={profile.coins} />
      </div>
      <div style={{ display: 'grid', gap: token('space.sm'), maxHeight: '60vh', overflowY: 'auto' }}>
        {SKINS.map((skin) => {
          const owned = profile.owned.includes(skin.id);
          const equipped = profile.equippedSkin === skin.id;
          return (
            <Panel key={skin.id} variant="inset" selected={equipped} style={{ display: 'flex', alignItems: 'center', gap: token('space.md') }}>
              <SkinSwatch skin={skin} />
              <span style={{ flex: 1 }}>{skin.name}</span>
              {equipped ? (
                <span style={small}>Equipped</span>
              ) : owned ? (
                <Button variant="secondary" disabled={busy !== null} onClick={() => act(skin.id, equipSkin)} style={{ fontSize: token('font.sizeSm') }}>
                  Equip
                </Button>
              ) : (
                <Button disabled={busy !== null || profile.coins < skin.price} onClick={() => act(skin.id, buySkin)} style={{ fontSize: token('font.sizeSm') }}>
                  Buy {skin.price}
                </Button>
              )}
            </Panel>
          );
        })}
      </div>
      {error && <div style={{ ...small, marginTop: token('space.md') }}>{error}</div>}
      <div style={{ ...small, marginTop: token('space.md') }}>Earn coins by playing matches and claiming the daily reward.</div>
    </Modal>
  );
}
