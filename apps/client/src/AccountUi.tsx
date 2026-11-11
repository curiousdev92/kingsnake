import { token } from '@snake/design-tokens';
import { AVATARS, MAX_NAME_LENGTH, MIN_PASSWORD_LENGTH, SKINS, getAvatar, getSkin, type Profile, type SnakeSkin } from '@snake/meta';
import { Badge, Button, CurrencyPill, Modal, Panel, ProgressBar, Tabs } from '@snake/ui-kit';
import { useState, type CSSProperties, type FormEvent } from 'react';
import { sfx } from './sound';
import { ApiFailure, buySkin, claimDaily, equipSkin, login, register, rename, setAvatar, signOut, useAccount } from './account';

const small = { fontSize: token('font.sizeSm'), color: token('color.textMuted') } as const;

export const inputStyle: CSSProperties = {
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

const errorText = (e: unknown, fallback: string) => (e instanceof ApiFailure ? e.message : fallback);

/** Avatar glyph on its colour, until `avatar.<id>` art exists. */
export function AvatarBadge({ id, size = 40 }: { id: string; size?: number }) {
  const avatar = getAvatar(id) ?? AVATARS[0]!;
  return (
    <span
      aria-label={avatar.name}
      role="img"
      style={{
        width: size,
        height: size,
        flex: 'none',
        display: 'inline-grid',
        placeItems: 'center',
        borderRadius: '50%',
        background: avatar.color,
        color: '#000',
        border: `${token('border.width')} solid #000`,
        fontSize: size * 0.5,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {avatar.glyph}
    </span>
  );
}

/** Avatar, name, level, XP bar and coins, opening the profile; or a note when the API is unreachable. */
export function ProfileCard() {
  const { status, profile } = useAccount();
  const [open, setOpen] = useState(false);
  if (status === 'loading') return <div style={small}>Signing in…</div>;
  if (!profile) return <div style={small}>Offline: you can play, but progress and rewards aren't saved.</div>;
  return (
    <div style={{ display: 'grid', gap: token('space.xs') }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: token('space.sm') }}>
        <AvatarBadge id={profile.avatar} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.name}</div>
          <div style={small}>{profile.email ? 'Signed in' : 'Guest: sign up to keep your progress'}</div>
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)} style={{ fontSize: token('font.sizeSm') }}>
          Profile
        </Button>
      </div>
      <ProfileModal open={open} onClose={() => setOpen(false)} />
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

export function Shop({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      sfx('error');
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
              ) : skin.exclusive ? (
                <span style={small}>{skin.exclusive}</span>
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

const section = { display: 'grid', gap: token('space.sm') } as const;
const heading = { margin: 0, fontFamily: token('font.display'), fontSize: token('font.sizeMd') } as const;

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

/** The full profile: avatar, name, stats, ranked standing, and signing up, in or out. */
export function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useAccount((s) => s.profile);
  if (!profile) return null;
  return (
    <Modal open={open} onClose={onClose} title="Profile" width={420}>
      <div style={{ display: 'grid', gap: token('space.lg'), maxHeight: '70vh', overflowY: 'auto' }}>
        <Identity key={profile.id} profile={profile} />
        <Stats profile={profile} />
        <Account profile={profile} />
      </div>
    </Modal>
  );
}

function Identity({ profile }: { profile: Profile }) {
  const [name, setName] = useState(profile.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skin = getSkin(profile.equippedSkin);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      sfx('error');
      setError(errorText(e, 'Could not save, try again'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={section}>
      <div style={{ display: 'flex', alignItems: 'center', gap: token('space.md') }}>
        <AvatarBadge id={profile.avatar} size={64} />
        <div style={{ display: 'grid', gap: token('space.xs') }}>
          <b style={{ fontFamily: token('font.display'), fontSize: token('font.sizeLg') }}>Level {profile.level}</b>
          {skin && (
            <span style={{ ...small, display: 'flex', alignItems: 'center', gap: token('space.xs') }}>
              <SkinSwatch skin={skin} size={12} /> {skin.name}
            </span>
          )}
        </div>
      </div>
      <div role="radiogroup" aria-label="Avatar" style={{ display: 'flex', flexWrap: 'wrap', gap: token('space.sm') }}>
        {AVATARS.map((a) => (
          <button
            key={a.id}
            role="radio"
            aria-checked={profile.avatar === a.id}
            disabled={busy}
            onClick={() => profile.avatar !== a.id && run(() => setAvatar(a.id))}
            style={{
              padding: 2,
              background: 'none',
              cursor: 'pointer',
              borderRadius: '50%',
              border: `3px solid ${profile.avatar === a.id ? token('color.accent') : 'transparent'}`,
            }}
          >
            <AvatarBadge id={a.id} size={36} />
          </button>
        ))}
      </div>
      <form
        style={{ display: 'flex', gap: token('space.sm') }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && name.trim() !== profile.name) void run(() => rename(name.trim()));
        }}
      >
        <input style={inputStyle} aria-label="Name" value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={busy || !name.trim() || name.trim() === profile.name}>
          Save
        </Button>
      </form>
      {error && <div style={small}>{error}</div>}
    </div>
  );
}

function Stats({ profile }: { profile: Profile }) {
  const { stats, season } = profile;
  const items: [string, string | number][] = [
    ['Matches', stats.matches],
    ['Wins', stats.wins],
    ['Kills', stats.kills],
    ['Best place', stats.bestPlacement === null ? '–' : `#${stats.bestPlacement}`],
    ['Time alive', formatDuration(stats.survivalMs)],
    ['Duel rating', season.rank === null ? profile.rating : `${profile.rating} · #${season.rank}`],
  ];
  return (
    <div style={section}>
      <h3 style={heading}>Stats</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: token('space.sm') }}>
        {items.map(([label, value]) => (
          <Panel key={label} variant="inset" style={{ textAlign: 'center', padding: token('space.sm') }}>
            <div style={{ fontFamily: token('font.display'), fontSize: token('font.sizeLg') }}>{value}</div>
            <div style={small}>{label}</div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function Account({ profile }: { profile: Profile }) {
  const [busy, setBusy] = useState(false);
  if (profile.email) {
    return (
      <div style={section}>
        <h3 style={heading}>Account</h3>
        <div style={small}>Signed in as {profile.email}</div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await signOut();
          }}
        >
          Sign out
        </Button>
      </div>
    );
  }
  return <AuthForm />;
}

/** Sign up (keeps this guest's progress) or log in to another account. */
function AuthForm() {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (mode === 'register' ? register : login)(email, password);
    } catch (err) {
      sfx('error');
      setError(errorText(err, 'Could not reach the server, try again'));
      setBusy(false);
    }
  };

  return (
    <form style={section} onSubmit={submit}>
      <h3 style={heading}>Account</h3>
      <Tabs
        items={[
          { value: 'register', label: 'Sign up' },
          { value: 'login', label: 'Log in' },
        ]}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
      />
      <div style={small}>
        {mode === 'register'
          ? 'Save this guest account with an email and password, so you can log in on any device.'
          : 'Switch to an account you already have. Progress on this guest stays with the guest.'}
      </div>
      <input style={inputStyle} type="email" autoComplete="email" placeholder="Email" aria-label="Email" value={email} required onChange={(e) => setEmail(e.target.value)} />
      <input
        style={inputStyle}
        type="password"
        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
        placeholder={mode === 'register' ? `Password (${MIN_PASSWORD_LENGTH}+ characters)` : 'Password'}
        aria-label="Password"
        value={password}
        minLength={MIN_PASSWORD_LENGTH}
        required
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" disabled={busy}>
        {mode === 'register' ? 'Create account' : 'Log in'}
      </Button>
      {error && <div style={small}>{error}</div>}
    </form>
  );
}
