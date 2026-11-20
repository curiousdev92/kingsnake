import {
  AVATARS,
  MAX_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  SKINS,
  getAvatar,
  getSkin,
  type Profile,
  type SnakeSkin,
} from "@snake/meta";
import { Badge, Button, CurrencyPill, Modal, Panel, ProgressBar, Tabs } from "@snake/ui-kit";
import { useState, type FormEvent } from "react";
import {
  ApiFailure,
  buySkin,
  claimDaily,
  equipSkin,
  login,
  register,
  rename,
  setAvatar,
  signOut,
  useAccount,
} from "./account";
import { sfx } from "./sound";

const small = "text-sm text-[var(--color-muted)]";
export const inputClass =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-fg)] outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15";

const errorText = (e: unknown, fallback: string) =>
  e instanceof ApiFailure ? e.message : fallback;

/** Avatar glyph on its colour, until avatar art exists. */
export function AvatarBadge({ id, size = 40 }: { id: string; size?: number }) {
  const avatar = getAvatar(id) ?? AVATARS[0]!;
  return (
    <span
      aria-label={avatar.name}
      role="img"
      className="inline-grid shrink-0 place-items-center rounded-full border-2 border-black leading-none text-black"
      style={{ width: size, height: size, background: avatar.color, fontSize: size * 0.5 }}
    >
      {avatar.glyph}
    </span>
  );
}

export function ProfileCard() {
  const { status, profile } = useAccount();
  const [open, setOpen] = useState(false);
  if (status === "loading") return <div className={small}>Signing in…</div>;
  if (!profile)
    return (
      <div className={small}>Offline: you can play, but progress and rewards aren’t saved.</div>
    );
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <AvatarBadge id={profile.avatar} />
        <div className="min-w-0 flex-1">
          <div className="truncate ">{profile.name}</div>
          <div className={small}>
            {profile.email ? "Signed in" : "Guest: sign up to keep your progress"}
          </div>
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)} className="px-3 py-1.5 text-xs">
          Profile
        </Button>
      </div>
      <ProfileModal open={open} onClose={() => setOpen(false)} />
      <div className="flex items-center justify-between">
        <span className="text-sm">Level {profile.level}</span>
        <CurrencyPill currency="coin" amount={profile.coins} />
      </div>
      <ProgressBar value={profile.xpIntoLevel / profile.xpForNext} label="XP to next level" />
      <div className={`${small} flex justify-between`}>
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
  if (claimed !== null) return <div className={small}>+{claimed} coins. See you tomorrow!</div>;
  if (!profile.daily.available)
    return <div className={small}>Daily reward claimed · day {profile.daily.streak} streak</div>;
  return (
    <Badge count>
      <Button
        variant="secondary"
        disabled={busy}
        className="w-full"
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

export function SkinSwatch({ skin, size = 14 }: { skin: SnakeSkin; size?: number }) {
  return (
    <span aria-hidden className="inline-flex">
      {Array.from({ length: 6 }, (_, k) => (
        <span
          key={k}
          className="rounded-full border border-black"
          style={{
            width: size,
            height: size,
            marginLeft: k === 0 ? 0 : -size * 0.3,
            background: skin.palette[Math.floor(k / skin.band) % skin.palette.length],
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
      sfx("error");
      setError(e instanceof ApiFailure ? e.message : "Shop is unavailable right now");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Skins" width={420}>
      <div className="mb-3 flex justify-end">
        <CurrencyPill currency="coin" amount={profile.coins} />
      </div>
      <div className="grid max-h-[60vh] gap-2 overflow-y-auto pr-1">
        {SKINS.map((skin) => {
          const owned = profile.owned.includes(skin.id);
          const equipped = profile.equippedSkin === skin.id;
          return (
            <Panel
              key={skin.id}
              variant="inset"
              selected={equipped}
              className="flex items-center gap-3"
            >
              <SkinSwatch skin={skin} />
              <span className="flex-1 text-sm">{skin.name}</span>
              {owned || equipped ? (
                <Button
                  variant="secondary"
                  disabled={busy !== null || equipped}
                  onClick={() => act(skin.id, equipSkin)}
                  // className="px-3 py-1.5 text-xs"
                >
                  {equipped ? "Equipped" : "Equip"}
                </Button>
              ) : skin.exclusive ? (
                <span className={small}>{skin.exclusive}</span>
              ) : (
                <Button
                  disabled={busy !== null || profile.coins < skin.price}
                  onClick={() => act(skin.id, buySkin)}
                  className="px-3 py-1.5 text-xs"
                >
                  Buy {skin.price}
                </Button>
              )}
            </Panel>
          );
        })}
      </div>
      {error && <div className={`${small} mt-3`}>{error}</div>}
      <div className={`${small} mt-3`}>
        Earn coins by playing matches and claiming the daily reward.
      </div>
    </Modal>
  );
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

export function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useAccount((s) => s.profile);
  if (!profile) return null;
  return (
    <Modal open={open} onClose={onClose} title="Profile" width={420}>
      <div className="grid max-h-[70vh] gap-5 overflow-y-auto pr-1">
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
      sfx("error");
      setError(errorText(e, "Could not save, try again"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-3">
        <AvatarBadge id={profile.avatar} size={64} />
        <div className="grid gap-1">
          <span className="text-xl">Level {profile.level}</span>
          {skin && (
            <span className={`${small} flex items-center gap-1.5`}>
              <SkinSwatch skin={skin} size={12} /> {skin.name}
            </span>
          )}
        </div>
      </div>
      <div role="radiogroup" aria-label="Avatar" className="flex flex-wrap gap-2">
        {AVATARS.map((a) => (
          <button
            key={a.id}
            role="radio"
            aria-checked={profile.avatar === a.id}
            disabled={busy}
            onClick={() => profile.avatar !== a.id && run(() => setAvatar(a.id))}
            className={`cursor-pointer rounded-full border-[3px] bg-transparent p-0.5 ${
              profile.avatar === a.id ? "border-[var(--color-accent)]" : "border-transparent"
            }`}
          >
            <AvatarBadge id={a.id} size={36} />
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && name.trim() !== profile.name) void run(() => rename(name.trim()));
        }}
      >
        <input
          className={inputClass}
          aria-label="Name"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={busy || !name.trim() || name.trim() === profile.name}
        >
          Save
        </Button>
      </form>
      {error && <div className={small}>{error}</div>}
    </div>
  );
}

function Stats({ profile }: { profile: Profile }) {
  const { stats, season } = profile;
  const items: [string, string | number][] = [
    ["Matches", stats.matches],
    ["Wins", stats.wins],
    ["Kills", stats.kills],
    ["Best place", stats.bestPlacement === null ? "–" : `#${stats.bestPlacement}`],
    ["Time alive", formatDuration(stats.survivalMs)],
    ["Duel rating", season.rank === null ? profile.rating : `${profile.rating} · #${season.rank}`],
  ];
  return (
    <div className="grid gap-2">
      <h3 className="m-0 text-base ">Stats</h3>
      <div className="grid grid-cols-3 gap-2">
        {items.map(([label, value]) => (
          <Panel key={label} variant="inset" className="p-2 text-center">
            <div className="text-lg ">{value}</div>
            <div className={small}>{label}</div>
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
      <div className="grid gap-2">
        <h3 className="m-0 text-base ">Account</h3>
        <div className={small}>Signed in as {profile.email}</div>
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

function AuthForm() {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (mode === "register" ? register : login)(email, password);
    } catch (err) {
      sfx("error");
      setError(errorText(err, "Could not reach the server, try again"));
      setBusy(false);
    }
  };

  return (
    <form className="grid gap-2 px-1" onSubmit={submit}>
      <h3 className="m-0 text-base ">Account</h3>
      <Tabs
        items={[
          { value: "register", label: "Sign up" },
          { value: "login", label: "Log in" },
        ]}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
      />
      <div className={small}>
        {mode === "register"
          ? "Save this guest account with an email and password, so you can log in on any device."
          : "Switch to an account you already have. Progress on this guest stays with the guest."}
      </div>
      <input
        className={inputClass}
        type="email"
        autoComplete="email"
        placeholder="Email"
        aria-label="Email"
        value={email}
        required
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className={inputClass}
        type="password"
        autoComplete={mode === "register" ? "new-password" : "current-password"}
        placeholder={
          mode === "register" ? `Password (${MIN_PASSWORD_LENGTH}+ characters)` : "Password"
        }
        aria-label="Password"
        value={password}
        minLength={MIN_PASSWORD_LENGTH}
        required
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" disabled={busy}>
        {mode === "register" ? "Create account" : "Log in"}
      </Button>
      {error && <div className={small}>{error}</div>}
    </form>
  );
}
