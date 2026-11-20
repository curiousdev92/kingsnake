export type ProgressKind = "xp" | "health" | "timer";

export interface ProgressBarProps {
  value: number;
  kind?: ProgressKind;
  height?: number;
  label?: string;
}

export function ProgressBar({ value, kind = "xp", height = 12, label }: ProgressBarProps) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const fills: Record<ProgressKind, string> = {
    xp: "bg-[var(--color-accent)]",
    health: "bg-emerald-500",
    timer: "bg-amber-500",
  };
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className="w-full overflow-hidden rounded-full bg-[var(--color-surface-muted)] border border-[var(--color-border)]"
      style={{ height }}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ease-out ${fills[kind]}`}
        style={{ width: `${v * 100}%` }}
      />
    </div>
  );
}
