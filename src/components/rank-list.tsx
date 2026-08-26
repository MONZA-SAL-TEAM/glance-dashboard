import { formatNumber } from "@/lib/format";

interface RankItem {
  label: string;
  sublabel?: string;
  value: number;
}

interface RankListProps {
  title: string;
  subtitle: string;
  items: RankItem[];
  delayClass?: string;
  valueLabel?: string;
}

export function RankList({
  title,
  subtitle,
  items,
  delayClass = "",
  valueLabel = "users",
}: RankListProps) {
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <section
      className={`panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6 ${delayClass}`}
    >
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
        {title}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
      <ul className="mt-4 space-y-3 sm:mt-5">
        {items.length === 0 ? (
          <li className="text-sm text-ink-soft">No data for this range yet.</li>
        ) : (
          items.map((item, index) => (
            <li key={`${item.label}-${index}`} className="group min-w-0">
              <div className="mb-1.5 flex items-baseline justify-between gap-2 sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink [overflow-wrap:anywhere] sm:overflow-hidden">
                    {item.label}
                  </p>
                  {item.sublabel ? (
                    <p className="truncate text-xs text-ink-soft">{item.sublabel}</p>
                  ) : null}
                </div>
                <p className="shrink-0 text-sm tabular-nums text-ink">
                  {formatNumber(item.value)}
                  <span className="ml-1 text-xs text-ink-soft">{valueLabel}</span>
                </p>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-sand">
                <div
                  className="bar-fill h-full rounded-full bg-gradient-to-r from-teal to-teal-deep transition-transform duration-300 group-hover:scale-x-[1.01]"
                  style={{
                    width: `${(item.value / max) * 100}%`,
                    animationDelay: `${index * 40}ms`,
                  }}
                />
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
