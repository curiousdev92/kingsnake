import { MODES, getMode } from "@snake/game-modes";
import {
  Button,
  Chip,
  CurrencyPill,
  Icon,
  IconButton,
  Modal,
  Panel,
  type IconName,
} from "@snake/ui-kit";
import { useState, type ReactNode } from "react";
import { useAccount } from "./account";
import { AvatarBadge, DailyReward, ProfileModal, Shop, inputClass } from "./AccountUi";
import type { JoinRequest } from "./game/OnlineGame";
import { LeaderboardModal, MonthlyPrizeCard, SeasonReward } from "./RankedUi";
import { navigate } from "./routes";

export const CODE_LENGTH = 5;
export const normalizeCode = (c: string) =>
  c
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LENGTH);

const MODE_KEY = "snake.mode";
const PRACTICE = "practice";

const CARDS = [
  ...MODES.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    tag: m.ranked ? "Ranked" : `${m.maxPlayers} players`,
  })),
  {
    id: PRACTICE,
    name: "Practice",
    description: "Offline against bots, nothing at stake",
    tag: "Offline",
  },
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

const small = "text-sm text-[var(--color-muted)]";
type Sheet = "profile" | "shop" | "leaderboard" | "coins" | "private" | null;

export function Home({ onJoin }: { onJoin: (j: JoinRequest) => void }) {
  const { status, profile } = useAccount();
  const [cardId, setCardId] = useState(savedCard);
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = () => setSheet(null);
  const online = status === "ready" && profile !== null;
  const card = CARDS.find((c) => c.id === cardId) ?? CARDS[0]!;

  const pick = (id: string) => {
    setCardId(id);
    saveCard(id);
  };
  const play = () =>
    card.id === PRACTICE
      ? navigate("practice")
      : onJoin({ kind: "quick", mode: getMode(card.id).id });

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div className="mx-auto grid min-h-full max-w-[480px] grid-rows-[auto_1fr_auto] gap-5 p-4">
        <header className="flex items-center gap-2">
          <button
            onClick={() => online && setSheet("profile")}
            aria-label="Open profile"
            className={`flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 text-left text-inherit ${
              online ? "cursor-pointer" : "cursor-default"
            }`}
          >
            <AvatarBadge id={profile?.avatar ?? "snake"} size={44} />
            <span className="min-w-0">
              <span className="block truncate">
                {profile?.name ?? (status === "loading" ? "Signing in…" : "Offline")}
              </span>
              <span className={small}>
                {profile ? `Level ${profile.level}` : "Progress is not saved"}
              </span>
            </span>
          </button>
          {profile && (
            <>
              <Chip aria-label={`Duel rating ${profile.rating}`}>
                <Icon name="icon.trophy" size={16} />
                <span className="tabular-nums">{profile.rating}</span>
              </Chip>
              <span className="inline-flex items-center gap-1">
                <CurrencyPill currency="coin" amount={profile.coins} />
                <Button
                  aria-label={
                    profile.daily.available
                      ? "Get more coins (daily reward ready)"
                      : "Get more coins"
                  }
                  title="Get more coins"
                  onClick={() => setSheet("coins")}
                  className="h-7 w-7 p-0 text-lg leading-none"
                >
                  +
                </Button>
              </span>
            </>
          )}
          <IconButton icon="icon.settings" label="Settings" onClick={() => navigate("settings")} />
        </header>

        <main className="grid content-center gap-3">
          <h1 className="m-0 text-center text-3xl ">KingSnake</h1>
          {profile && <XpBar xpIntoLevel={profile.xpIntoLevel} xpForNext={profile.xpForNext} />}
          <DailyReward />
          <SeasonReward />
          <MonthlyPrizeCard />
          <div role="radiogroup" aria-label="Game mode" className="grid gap-2">
            {CARDS.map((c) => (
              <ModeCard
                key={c.id}
                selected={c.id === card.id}
                onSelect={() => pick(c.id)}
                name={c.name}
                description={c.description}
                tag={c.tag}
              />
            ))}
          </div>
          <Button onClick={play} className="px-5 py-3 text-base">
            <span className="inline-flex items-center gap-2">
              <Icon name="icon.play" size={20} /> Play {card.name}
            </span>
          </Button>
          <Button variant="secondary" onClick={() => setSheet("private")}>
            Play with friends
          </Button>
        </main>

        <Panel className="p-2">
          <nav className="grid grid-cols-3 gap-2">
            <NavButton
              icon="icon.shop"
              label="Shop"
              disabled={!online}
              onClick={() => setSheet("shop")}
            />
            <NavButton
              icon="icon.leaderboard"
              label="Leaderboard"
              onClick={() => setSheet("leaderboard")}
            />
            <NavButton
              icon="icon.profile"
              label="Profile"
              disabled={!online}
              onClick={() => setSheet("profile")}
            />
          </nav>
        </Panel>
      </div>

      <ProfileModal open={sheet === "profile"} onClose={close} />
      <Shop open={sheet === "shop"} onClose={close} />
      {sheet === "leaderboard" && <LeaderboardModal onClose={close} />}
      <CoinsModal open={sheet === "coins"} onClose={close} onShop={() => setSheet("shop")} />
      <PrivateRoomModal
        open={sheet === "private"}
        onClose={close}
        modeId={card.id === PRACTICE ? MODES[0]!.id : card.id}
        onJoin={onJoin}
      />
    </div>
  );
}

function XpBar({ xpIntoLevel, xpForNext }: { xpIntoLevel: number; xpForNext: number }) {
  return (
    <div
      aria-label={`${xpIntoLevel} of ${xpForNext} XP to the next level`}
      className="flex items-center gap-2"
    >
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
        <div
          className="h-full rounded-full bg-[var(--color-accent)]"
          style={{ width: `${(100 * xpIntoLevel) / xpForNext}%` }}
        />
      </div>
      <span className={small}>
        {xpIntoLevel} / {xpForNext} XP
      </span>
    </div>
  );
}

function ModeCard(props: {
  name: string;
  description: string;
  tag: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Panel
      role="radio"
      aria-checked={props.selected}
      tabIndex={0}
      variant="inset"
      selected={props.selected}
      onClick={props.onSelect}
      onKeyDown={(e) =>
        (e.key === "Enter" || e.key === " ") && (e.preventDefault(), props.onSelect())
      }
      className={`grid cursor-pointer gap-1 p-3 ${props.selected ? "outline-none" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg ">{props.name}</span>
        <Chip>{props.tag}</Chip>
      </div>
      <span className={small}>{props.description}</span>
    </Panel>
  );
}

function NavButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button variant="secondary" disabled={disabled} onClick={onClick} className="p-2">
      <span className="grid justify-items-center gap-0.5 text-xs">
        <Icon name={icon} size={24} />
        {label}
      </span>
    </Button>
  );
}

function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={380}>
      <div className="grid gap-3">{children}</div>
    </Modal>
  );
}

function CoinsModal({
  open,
  onClose,
  onShop,
}: {
  open: boolean;
  onClose: () => void;
  onShop: () => void;
}) {
  const profile = useAccount((s) => s.profile);
  if (!profile) return null;
  return (
    <Sheet open={open} onClose={onClose} title="Coins">
      <div className="flex justify-center">
        <CurrencyPill currency="coin" amount={profile.coins} />
      </div>
      <DailyReward />
      <SeasonReward />
      <div className={small}>
        Earn more by playing: every match pays coins and XP, more for kills and a better placement.
      </div>
      <Button variant="secondary" onClick={onShop}>
        Spend them in the shop
      </Button>
    </Sheet>
  );
}

function PrivateRoomModal({
  open,
  onClose,
  modeId,
  onJoin,
}: {
  open: boolean;
  onClose: () => void;
  modeId: string;
  onJoin: (j: JoinRequest) => void;
}) {
  const [code, setCode] = useState("");
  const mode = getMode(modeId);
  return (
    <Sheet open={open} onClose={onClose} title="Play with friends">
      <div className={small}>
        Create a private room and share its code, or join a friend’s room.
      </div>
      <Button onClick={() => onJoin({ kind: "create", mode: mode.id })}>
        Create private room · {mode.name}
      </Button>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === CODE_LENGTH) onJoin({ kind: "code", code });
        }}
      >
        <input
          className={`${inputClass} uppercase tracking-[0.15em]`}
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
