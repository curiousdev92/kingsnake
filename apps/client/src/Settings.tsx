import { MAX_NAME_LENGTH } from "@snake/meta";
import { Button, IconButton, Panel } from "@snake/ui-kit";
import { useState, type ReactNode } from "react";
import { ProfileModal, inputClass } from "./AccountUi";
import { ApiFailure, rename, saveName, savedName, signOut, useAccount } from "./account";
import { hapticsEnabled, setHapticsEnabled } from "./haptics";
import { goHome } from "./routes";
import { setSoundEnabled, setSoundVolume, sfx, soundEnabled, soundVolume } from "./sound";

const small = "text-sm text-[var(--color-muted)]";

export function SettingsPage() {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div className="mx-auto grid max-w-[480px] gap-5 p-4">
        <header className="flex items-center gap-3">
          <IconButton icon="icon.back" label="Back to home" onClick={goHome} />
          <h1 className="m-0 text-3xl ">Settings</h1>
        </header>
        <NameSetting />
        <Section title="Sound">
          <Toggle
            label="Sound effects"
            hint="Menu clicks, eating, kills, deaths and match results"
            initial={soundEnabled()}
            onChange={(on) => {
              setSoundEnabled(on);
              if (on) sfx("select");
            }}
          />
          <VolumeSlider />
        </Section>
        <Section title="Gameplay">
          <Toggle
            label="Vibration"
            hint="Buzz when you eat, get a kill, die or win (phones only)"
            initial={hapticsEnabled()}
            onChange={setHapticsEnabled}
          />
        </Section>
        <Section title="Controls">
          <dl className={`m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 ${small}`}>
            <dt className="font-medium text-[var(--color-fg)]">Steer</dt>
            <dd className="m-0">Move the mouse, WASD or arrow keys; on touch, drag anywhere</dd>
            <dt className="font-medium text-[var(--color-fg)]">Boost</dt>
            <dd className="m-0">Hold the mouse button or Space; on touch, the boost button</dd>
          </dl>
        </Section>
        <AccountSetting />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel className="grid gap-2">
      <h2 className="m-0 text-base ">{title}</h2>
      {children}
    </Panel>
  );
}

function Toggle({
  label,
  hint,
  initial,
  onChange,
}: {
  label: string;
  hint: string;
  initial: boolean;
  onChange: (on: boolean) => void;
}) {
  const [on, setOn] = useState(initial);
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <span className="grid flex-1">
        <span className="text-sm font-medium">{label}</span>
        <span className={small}>{hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked);
          onChange(e.target.checked);
        }}
        className="h-5 w-5 accent-[var(--color-accent)]"
      />
    </label>
  );
}

function VolumeSlider() {
  const [volume, setVolume] = useState(soundVolume);
  return (
    <label className="flex items-center gap-3">
      <span className="flex-1 text-sm font-medium">Volume</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        aria-label="Sound volume"
        onChange={(e) => {
          const v = Number(e.target.value);
          setVolume(v);
          setSoundVolume(v);
          sfx("eat");
        }}
        className="w-40 accent-[var(--color-accent)]"
      />
    </label>
  );
}

function NameSetting() {
  const profile = useAccount((s) => s.profile);
  const current = profile?.name ?? savedName();
  const [name, setName] = useState(current);
  const [note, setNote] = useState<string | null>(null);
  const clean = name.trim();

  return (
    <Section title="Name">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setNote(null);
          try {
            if (profile) await rename(clean);
            else saveName(clean);
            setNote("Saved");
          } catch (err) {
            setNote(err instanceof ApiFailure ? err.message : "Could not save, try again");
          }
        }}
      >
        <input
          className={inputClass}
          aria-label="Name"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Player"
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={!clean || clean === current}>
          Save
        </Button>
      </form>
      {note && <div className={small}>{note}</div>}
    </Section>
  );
}

function AccountSetting() {
  const { status, profile } = useAccount();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Section title="Account">
      <div className={small}>
        {status === "loading"
          ? "Signing in…"
          : !profile
            ? "Offline: progress and rewards are not saved until the server is reachable."
            : profile.email
              ? `Signed in as ${profile.email}`
              : "Playing as a guest. Sign up to keep your progress on any device."}
      </div>
      {profile && (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {profile.email ? "Open profile" : "Sign up or log in"}
        </Button>
      )}
      {profile?.email && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await signOut();
            setBusy(false);
          }}
        >
          Sign out
        </Button>
      )}
      <ProfileModal open={open} onClose={() => setOpen(false)} />
    </Section>
  );
}
