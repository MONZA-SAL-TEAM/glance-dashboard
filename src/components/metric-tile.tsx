interface MetricTileProps {
  label: string;
  value: string;
  hint?: string;
  accent?: "teal" | "coral" | "ink";
  delayClass?: string;
}

const accents = {
  teal: "from-teal/15 to-transparent text-teal-deep",
  coral: "from-coral/15 to-transparent text-coral",
  ink: "from-ink/10 to-transparent text-ink",
};

export function MetricTile({
  label,
  value,
  hint,
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
      <p className="relative text-xs font-medium tracking-wide text-ink-soft sm:text-sm">
        {label}
      </p>
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
