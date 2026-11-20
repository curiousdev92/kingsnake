import type { IconName } from "@snake/assets";
import type { LucideIcon } from "lucide-react";
import {
  ChartColumn,
  ChevronLeft,
  CircleHelp,
  Clock,
  Coins,
  Copy,
  Crown,
  Gem,
  Heart,
  ListChecks,
  Play,
  Settings,
  Share2,
  Shield,
  ShoppingBag,
  Skull,
  Smartphone,
  Star,
  Trophy,
  User,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";

const ICONS: Record<IconName, LucideIcon> = {
  "icon.coin": Coins,
  "icon.gem": Gem,
  "icon.xp": Star,
  "icon.trophy": Trophy,
  "icon.play": Play,
  "icon.shop": ShoppingBag,
  "icon.profile": User,
  "icon.friends": Users,
  "icon.missions": ListChecks,
  "icon.settings": Settings,
  "icon.leaderboard": ChartColumn,
  "icon.close": X,
  "icon.back": ChevronLeft,
  "icon.copy": Copy,
  "icon.share": Share2,
  "icon.sound.on": Volume2,
  "icon.sound.off": VolumeX,
  "icon.vibration": Smartphone,
  "icon.crown": Crown,
  "icon.skull": Skull,
  "icon.clock": Clock,
  "icon.heart": Heart,
  "icon.speed": Zap,
  "icon.shield": Shield,
};

export function fallbackGlyph(name: IconName): string {
  return name.split(".")[1]?.charAt(0).toUpperCase() ?? "?";
}

export interface IconProps {
  name: IconName;
  size?: number;
  /** Accessible label; omit for decorative icons. */
  label?: string;
}

/** Renders a Lucide icon for the given semantic icon name. */
export function Icon({ name, size = 20, label }: IconProps) {
  const Lucide = ICONS[name] ?? CircleHelp;
  const a11y = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);
  return (
    <span
      {...a11y}
      data-icon={name}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        color: "currentColor",
        flexShrink: 0,
      }}
    >
      <Lucide size={Math.round(size * 0.9)} strokeWidth={2.25} absoluteStrokeWidth />
    </span>
  );
}
