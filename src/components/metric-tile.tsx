interface MetricTileProps {
  label: string;
  value: string;
  hint?: string;
  /** Preformatted change vs previous period, e.g. "▲ 12.4%". */
  delta?: string | null;
  /** Set when a rising number is bad (unused today, kept for bounce-like metrics). */
  deltaInverted?: boolean;
  accent?: "teal" | "coral" | "ink";
  delayClass?: string;
}

const accents = {
  teal: "from-teal/15 to-transparent text-teal-deep",
  coral: "from-coral/15 to-transparent text-coral",
  ink: "from-ink/10 to-transparent text-ink",
};

function deltaClasses(delta: string, inverted: boolean) {
  const up = delta.startsWith("▲");
  const down = delta.startsWith("▼");
  const good = inverted ? down : up;
  if (!up && !down) return "bg-sand/70 text-ink-soft";
  return good ? "bg-teal/15 text-teal-deep" : "bg-coral/15 text-coral";
}

export function MetricTile({
  label,
  value,
  hint,
  delta,
  deltaInverted = false,
  accent = "teal",
  delayClass = "",
}: MetricTileProps) {
  return (
    <div
      className={`panel relative overflow-hidden rounded-2xl p-3.5 animate-rise sm:p-5 ${delayClass}`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b sm:h-24 ${accents[accent]}`}
      />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-ink-soft sm:text-sm">
          {label}
        </p>
        {delta ? (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums sm:text-[11px] ${deltaClasses(delta, deltaInverted)}`}
            title="vs previous period"
          >
            {delta}
          </span>
        ) : null}
      </div>
      <p className="relative mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-ink sm:mt-3 sm:text-3xl md:text-4xl">
        {value}
      </p>
      {hint ? (
        <p className="relative mt-1.5 line-clamp-2 text-[11px] leading-snug text-ink-soft/80 sm:mt-2 sm:text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
