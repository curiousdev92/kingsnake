import type { IconName } from '@snake/assets';
import { token } from '@snake/design-tokens';
import { MODES, getMode } from '@snake/game-modes';
import { Button, CurrencyPill, Chip, Icon, IconButton, Modal, Panel } from '@snake/ui-kit';
import { useState, type ReactNode } from 'react';
import { AvatarBadge, DailyReward, ProfileModal, Shop, inputStyle } from './AccountUi';
import { useAccount } from './account';
import type { JoinRequest } from './game/OnlineGame';
import { LeaderboardModal, SeasonReward } from './RankedUi';
import { navigate } from './routes';

export const CODE_LENGTH = 5;
export const normalizeCode = (c: string) =>
  c
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);

const MODE_KEY = 'snake.mode';
const PRACTICE = 'practice';

/** Mode cards: the online modes plus offline practice. */
const CARDS = [
  ...MODES.map((m) => ({ id: m.id, name: m.name, description: m.description, tag: m.ranked ? 'Ranked' : `${m.maxPlayers} players` })),
  { id: PRACTICE, name: 'Practice', description: 'Offline against bots, nothing at stake', tag: 'Offline' },
];

function savedCard(): string {
  try {
    const id = localStorage.getItem(MODE_KEY);
    return CARDS.some((c) => c.id === id) ? id! : CARDS[0]!.id;
  } catch {
    return CARDS[0]!.id;
  }
}

function saveCard(id: string): void {
  try {
    localStorage.setItem(MODE_KEY, id);
  } catch {
    // remembered for this visit only
  }
}

const small = { fontSize: token('font.sizeSm'), color: token('color.textMuted') } as const;

type Sheet = 'profile' | 'shop' | 'leaderboard' | 'coins' | 'private' | null;

/**
 * The home screen: resources and settings along the top, mode selection in the
 * middle, and shop, leaderboard and profile along the bottom. Nothing starts until
 * the player presses Play.
 */
export function Home({ onJoin }: { onJoin: (j: JoinRequest) => void }) {
  const { status, profile } = useAccount();
  const [cardId, setCardId] = useState(savedCard);
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = () => setSheet(null);
  const online = status === 'ready' && profile !== null;
  const card = CARDS.find((c) => c.id === cardId) ?? CARDS[0]!;

  const pick = (id: string) => {
    setCardId(id);
    saveCard(id);
  };
  const play = () => (card.id === PRACTICE ? navigate('practice') : onJoin({ kind: 'quick', mode: getMode(card.id).id }));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflowY: 'auto',
        background: token('color.background'),
        color: token('color.text'),
      }}
    >
      <div
        style={{
          minHeight: '100%',
          maxWidth: 480,
          margin: '0 auto',
          padding: 16,
          boxSizing: 'border-box',
          display: 'grid',
          gridTemplateRows: 'auto 1fr auto',
          gap: token('space.lg'),
        }}
      >
        {/* Top bar: who you are, what you have, settings. */}
        <header style={{ display: 'flex', alignItems: 'center', gap: token('space.sm') }}>
          <button
            onClick={() => online && setSheet('profile')}
            aria-label="Open profile"
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: token('space.sm'),
              padding: 0,
              background: 'none',
              border: 'none',
              color: 'inherit',
              font: 'inherit',
              textAlign: 'left',
              cursor: online ? 'pointer' : 'default',
            }}
          >
            <AvatarBadge id={profile?.avatar ?? 'snake'} size={44} />
            <span style={{ minWidth: 0 }}>
              <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile?.name ?? (status === 'loading' ? 'Signing in…' : 'Offline')}
              </b>
              <span style={small}>{profile ? `Level ${profile.level}` : 'Progress is not saved'}</span>
            </span>
          </button>
          {profile && (
            <>
              <Chip aria-label={`Duel rating ${profile.rating}`}>
                <Icon name="icon.trophy" size={16} />
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{profile.rating}</span>
              </Chip>
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                <CurrencyPill currency="coin" amount={profile.coins} />
                <Button
                  aria-label={profile.daily.available ? 'Get more coins (daily reward ready)' : 'Get more coins'}
                  title="Get more coins"
                  onClick={() => setSheet('coins')}
                  style={{ width: 28, height: 28, padding: 0, marginLeft: 4, lineHeight: 1, fontSize: token('font.sizeLg') }}
                >
                  +
                </Button>
              </span>
            </>
          )}
          <IconButton icon="icon.settings" label="Settings" onClick={() => navigate('settings')} />
        </header>

        {/* Centre: pick a mode, then play. */}
        <main style={{ display: 'grid', alignContent: 'center', gap: token('space.md') }}>
          <h1 style={{ margin: 0, textAlign: 'center', fontFamily: token('font.display'), fontSize: token('font.sizeXl') }}>KingSnake</h1>
          {profile && <XpBar xpIntoLevel={profile.xpIntoLevel} xpForNext={profile.xpForNext} />}
          <DailyReward />
          <SeasonReward />
          <div role="radiogroup" aria-label="Game mode" style={{ display: 'grid', gap: token('space.sm') }}>
            {CARDS.map((c) => (
              <ModeCard key={c.id} selected={c.id === card.id} onSelect={() => pick(c.id)} name={c.name} description={c.description} tag={c.tag} />
            ))}
          </div>
          <Button onClick={play} style={{ fontSize: token('font.sizeLg'), padding: `${token('space.md')} ${token('space.lg')}` }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: token('space.sm') }}>
              <Icon name="icon.play" size={20} /> Play {card.name}
            </span>
          </Button>
          <Button variant="secondary" onClick={() => setSheet('private')}>
            Play with friends
          </Button>
        </main>

        {/* Bottom bar. */}
        <Panel style={{ padding: token('space.sm') }}>
          <nav style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: token('space.sm') }}>
            <NavButton icon="icon.shop" label="Shop" disabled={!online} onClick={() => setSheet('shop')} />
            <NavButton icon="icon.leaderboard" label="Leaderboard" onClick={() => setSheet('leaderboard')} />
            <NavButton icon="icon.profile" label="Profile" disabled={!online} onClick={() => setSheet('profile')} />
          </nav>
        </Panel>
      </div>

      <ProfileModal open={sheet === 'profile'} onClose={close} />
      <Shop open={sheet === 'shop'} onClose={close} />
      {sheet === 'leaderboard' && <LeaderboardModal onClose={close} />}
      <CoinsModal open={sheet === 'coins'} onClose={close} onShop={() => setSheet('shop')} />
      <PrivateRoomModal open={sheet === 'private'} onClose={close} modeId={card.id === PRACTICE ? MODES[0]!.id : card.id} onJoin={onJoin} />
    </div>
  );
}

function XpBar({ xpIntoLevel, xpForNext }: { xpIntoLevel: number; xpForNext: number }) {
  return (
    <div aria-label={`${xpIntoLevel} of ${xpForNext} XP to the next level`} style={{ display: 'flex', alignItems: 'center', gap: token('space.sm') }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: token('color.surfaceRaised'), overflow: 'hidden' }}>
        <div style={{ width: `${(100 * xpIntoLevel) / xpForNext}%`, height: '100%', background: token('color.accent') }} />
      </div>
      <span style={small}>
        {xpIntoLevel} / {xpForNext} XP
      </span>
    </div>
  );
}

function ModeCard(props: { name: string; description: string; tag: string; selected: boolean; onSelect: () => void }) {
  return (
    <Panel
      role="radio"
      aria-checked={props.selected}
      tabIndex={0}
      variant="inset"
      selected={props.selected}
      onClick={props.onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), props.onSelect())}
      style={{
        cursor: 'pointer',
        display: 'grid',
        gap: token('space.xs'),
        padding: token('space.md'),
        outline: props.selected ? `3px solid ${token('color.accent')}` : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: token('space.sm') }}>
        <b style={{ fontFamily: token('font.display'), fontSize: token('font.sizeLg') }}>{props.name}</b>
        <Chip>{props.tag}</Chip>
      </div>
      <span style={small}>{props.description}</span>
    </Panel>
  );
}

function NavButton({ icon, label, onClick, disabled }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="secondary" disabled={disabled} onClick={onClick} style={{ padding: token('space.sm') }}>
      <span style={{ display: 'grid', justifyItems: 'center', gap: 2, fontSize: token('font.sizeSm') }}>
        <Icon name={icon} size={24} />
        {label}
      </span>
    </Button>
  );
}

function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={380}>
      <div style={{ display: 'grid', gap: token('space.md') }}>{children}</div>
    </Modal>
  );
}

/** Where coins come from. There is nothing to buy with money: coins are earned. */
function CoinsModal({ open, onClose, onShop }: { open: boolean; onClose: () => void; onShop: () => void }) {
  const profile = useAccount((s) => s.profile);
  if (!profile) return null;
  return (
    <Sheet open={open} onClose={onClose} title="Coins">
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <CurrencyPill currency="coin" amount={profile.coins} />
      </div>
      <DailyReward />
      <SeasonReward />
      <div style={small}>Earn more by playing: every match pays coins and XP, more for kills and a better placement.</div>
      <Button variant="secondary" onClick={onShop}>
        Spend them in the shop
      </Button>
    </Sheet>
  );
}

function PrivateRoomModal({ open, onClose, modeId, onJoin }: { open: boolean; onClose: () => void; modeId: string; onJoin: (j: JoinRequest) => void }) {
  const [code, setCode] = useState('');
  const mode = getMode(modeId);
  return (
    <Sheet open={open} onClose={onClose} title="Play with friends">
      <div style={small}>Create a private room and share its code, or join a friend's room.</div>
      <Button onClick={() => onJoin({ kind: 'create', mode: mode.id })}>Create private room · {mode.name}</Button>
      <form
        style={{ display: 'flex', gap: token('space.sm') }}
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === CODE_LENGTH) onJoin({ kind: 'code', code });
        }}
      >
        <input
          style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '0.15em' }}
          value={code}
          placeholder="Room code"
          aria-label="Room code"
          onChange={(e) => setCode(normalizeCode(e.target.value))}
        />
        <Button variant="secondary" type="submit" disabled={code.length !== CODE_LENGTH}>
          Join
        </Button>
      </form>
    </Sheet>
  );
}
