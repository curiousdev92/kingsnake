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
import type { ComponentPropsWithoutRef } from "react";

export type IconName =
  | "icon.coin"
  | "icon.gem"
  | "icon.xp"
  | "icon.trophy"
  | "icon.play"
  | "icon.shop"
  | "icon.profile"
  | "icon.friends"
  | "icon.missions"
  | "icon.settings"
  | "icon.leaderboard"
  | "icon.close"
  | "icon.back"
  | "icon.copy"
  | "icon.share"
  | "icon.sound.on"
  | "icon.sound.off"
  | "icon.vibration"
  | "icon.crown"
  | "icon.skull"
  | "icon.clock"
  | "icon.heart"
  | "icon.speed"
  | "icon.shield";

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

export interface IconProps extends Omit<ComponentPropsWithoutRef<"span">, "children"> {
  name: IconName;
  size?: number;
  label?: string;
}

export function Icon({ name, size = 20, label, className = "", ...rest }: IconProps) {
  const Lucide = ICONS[name] ?? CircleHelp;
  const a11y = label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true as const };
  return (
    <span
      {...a11y}
      {...rest}
      data-icon={name}
      className={`inline-flex shrink-0 items-center justify-center text-current ${className}`.trim()}
      style={{ width: size, height: size, ...rest.style }}
    >
      <Lucide size={Math.round(size * 0.9)} strokeWidth={2.25} absoluteStrokeWidth />
    </span>
  );
}
