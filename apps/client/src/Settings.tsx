import { token } from '@snake/design-tokens';
import { MAX_NAME_LENGTH } from '@snake/meta';
import { Button, IconButton, Panel } from '@snake/ui-kit';
import { useState, type ReactNode } from 'react';
import { ProfileModal, inputStyle } from './AccountUi';
import { ApiFailure, rename, saveName, savedName, signOut, useAccount } from './account';
import { hapticsEnabled, setHapticsEnabled } from './haptics';
import { goHome } from './routes';
import { setSoundEnabled, setSoundVolume, sfx, soundEnabled, soundVolume } from './sound';

const small = { fontSize: token('font.sizeSm'), color: token('color.textMuted') } as const;

/**
 * Player preferences only. The game's tuning is fixed for everyone and is not a
 * setting (see game-core `defaultConfig`).
 */
export function SettingsPage() {
  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: token('color.background'), color: token('color.text') }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: 16, boxSizing: 'border-box', display: 'grid', gap: token('space.lg') }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: token('space.md') }}>
          <IconButton icon="icon.back" label="Back to home" onClick={goHome} />
          <h1 style={{ margin: 0, fontFamily: token('font.display'), fontSize: token('font.sizeXl') }}>Settings</h1>
        </header>
        <NameSetting />
        <Section title="Sound">
          <Toggle
            label="Sound effects"
            hint="Menu clicks, eating, kills, deaths and match results"
            initial={soundEnabled()}
            onChange={(on) => {
              setSoundEnabled(on);
              if (on) sfx('select');
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
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: `${token('space.xs')} ${token('space.md')}`, ...small }}>
            <dt>Steer</dt>
            <dd style={{ margin: 0 }}>Move the mouse, WASD or arrow keys; on touch, drag anywhere</dd>
            <dt>Boost</dt>
            <dd style={{ margin: 0 }}>Hold the mouse button or Space; on touch, the boost button</dd>
          </dl>
        </Section>
        <AccountSetting />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel style={{ display: 'grid', gap: token('space.sm') }}>
      <h2 style={{ margin: 0, fontFamily: token('font.display'), fontSize: token('font.sizeMd') }}>{title}</h2>
      {children}
    </Panel>
  );
}

function Toggle({ label, hint, initial, onChange }: { label: string; hint: string; initial: boolean; onChange: (on: boolean) => void }) {
  const [on, setOn] = useState(initial);
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: token('space.md'), cursor: 'pointer' }}>
      <span style={{ flex: 1, display: 'grid' }}>
        <span>{label}</span>
        <span style={small}>{hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked);
          onChange(e.target.checked);
        }}
        style={{ width: 22, height: 22, accentColor: token('color.accent') }}
      />
    </label>
  );
}

function VolumeSlider() {
  const [volume, setVolume] = useState(soundVolume);
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: token('space.md') }}>
      <span style={{ flex: 1 }}>Volume</span>
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
          sfx('eat'); // a preview at the new level
        }}
        style={{ width: 160, accentColor: token('color.accent') }}
      />
    </label>
  );
}

/** The player's display name: saved to the account, or locally while offline. */
function NameSetting() {
  const profile = useAccount((s) => s.profile);
  const current = profile?.name ?? savedName();
  const [name, setName] = useState(current);
  const [note, setNote] = useState<string | null>(null);
  const clean = name.trim();

  return (
    <Section title="Name">
      <form
        style={{ display: 'flex', gap: token('space.sm') }}
        onSubmit={async (e) => {
          e.preventDefault();
          setNote(null);
          try {
            if (profile) await rename(clean);
            else saveName(clean);
            setNote('Saved');
          } catch (err) {
            setNote(err instanceof ApiFailure ? err.message : 'Could not save, try again');
          }
        }}
      >
        <input style={inputStyle} aria-label="Name" value={name} maxLength={MAX_NAME_LENGTH} placeholder="Player" onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={!clean || clean === current}>
          Save
        </Button>
      </form>
      {note && <div style={small}>{note}</div>}
    </Section>
  );
}

function AccountSetting() {
  const { status, profile } = useAccount();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Section title="Account">
      <div style={small}>
        {status === 'loading'
          ? 'Signing in…'
          : !profile
            ? 'Offline: progress and rewards are not saved until the server is reachable.'
            : profile.email
              ? `Signed in as ${profile.email}`
              : 'Playing as a guest. Sign up to keep your progress on any device.'}
      </div>
      {profile && (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {profile.email ? 'Open profile' : 'Sign up or log in'}
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
