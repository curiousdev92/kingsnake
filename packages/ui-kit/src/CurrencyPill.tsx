import { Chip } from "./Chip";
import { Icon } from "./Icon";

export type Currency = "coin" | "gem" | "xp";

export interface CurrencyPillProps {
  currency: Currency;
  amount: number;
  animate?: boolean;
}

const CHIP = { coin: "gold", gem: "gem", xp: "default" } as const;
const LABEL = { coin: "Coins", gem: "Gems", xp: "XP" } as const;

export function CurrencyPill({ currency, amount }: CurrencyPillProps) {
  return (
    <Chip variant={CHIP[currency]} aria-label={`${amount.toLocaleString()} ${LABEL[currency]}`}>
      <Icon name={`icon.${currency}`} size={16} />
      <span className="tabular-nums">{Math.round(amount).toLocaleString()}</span>
    </Chip>
  );
}
