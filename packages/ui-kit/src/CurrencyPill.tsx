import { Chip } from './Chip';
import { Icon } from './Icon';
import { useCountUp } from './motion';

export type Currency = 'coin' | 'gem' | 'xp';

export interface CurrencyPillProps {
  currency: Currency;
  amount: number;
  /** Animate changes with the `motion.countUp` token. Default true. */
  animate?: boolean;
}

const CHIP = { coin: 'gold', gem: 'gem', xp: 'default' } as const;
const LABEL = { coin: 'Coins', gem: 'Gems', xp: 'XP' } as const;

export function CurrencyPill({ currency, amount, animate = true }: CurrencyPillProps) {
  const shown = useCountUp(amount, animate);
  return (
    <Chip variant={CHIP[currency]} aria-label={`${amount.toLocaleString()} ${LABEL[currency]}`}>
      <Icon name={`icon.${currency}`} size={16} />
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(shown).toLocaleString()}</span>
    </Chip>
  );
}
