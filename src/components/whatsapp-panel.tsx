import { formatNumber } from "@/lib/format";
import type { WhatsAppPayload } from "@/lib/whatsapp";
import type { WhatsAppNumberHealth } from "@/lib/whatsapp-meta";

/**
 * The WhatsApp view: what drives customers to open WhatsApp, from
 * first-party click data — plus optional read-only number health from Meta.
 *
 * Everything on this page is read-only. It cannot send messages, cannot
 * register or deregister anything, and cannot affect the phone's WhatsApp
 * login. The page says so, because after 2026-08-29 that guarantee is the
 * first thing anyone looking at it will want to know.
 */

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function hourLabel(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) return null;
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.5) {
    return <span className="text-[11px] text-ink-soft">flat</span>;
  }
  return (
    <span
      className={`text-[11px] tabular-nums ${change > 0 ? "text-teal-deep" : "text-ink-soft"}`}
    >
      {change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(0)}%
    </span>
  );
}

function Tile({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-sand/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-[11px] uppercase tracking-[0.12em] text-ink-soft">
          {label}
        </p>
        {delta}
      </div>
      <p className="mt-0.5 font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-ink">
        {value}
      </p>
      {hint ? <p className="text-[11px] text-ink-soft">{hint}</p> : null}
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  index,
  sublabel,
}: {
  label: string;
  value: number;
  max: number;
  index: number;
  sublabel?: string;
}) {
  return (
    <li className="min-w-0" title={label}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm text-ink">
          {label}
          {sublabel ? <span className="text-ink-soft"> · {sublabel}</span> : null}
        </p>
        <p className="shrink-0 text-sm tabular-nums text-ink">
          {formatNumber(value)}
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sand">
        <div
          className="bar-fill h-full rounded-full bg-gradient-to-r from-teal to-teal-deep"
          style={{
            width: `${(value / max) * 100}%`,
            animationDelay: `${index * 40}ms`,
          }}
        />
      </div>
    </li>
  );
}

/** Compact time-of-day / day-of-week column chart. */
function ColumnChart({
  values,
  labelFor,
  labelEvery,
}: {
  values: number[];
  labelFor: (index: number) => string;
  labelEvery: number;
}) {
  const max = Math.max(...values, 1);
  return (
    <div>
      <div className="flex h-24 items-end gap-[3px]">
        {values.map((v, i) => (
          <div
            key={i}
            className="group relative min-w-0 flex-1"
            title={`${labelFor(i)} — ${v}`}
          >
            <div
              className="w-full rounded-t bg-gradient-to-t from-teal to-teal-deep transition-opacity group-hover:opacity-80"
              style={{
                height: `${Math.max((v / max) * 100, v > 0 ? 6 : 2)}%`,
                opacity: v > 0 ? 1 : 0.15,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[3px] text-[10px] text-ink-soft">
        {values.map((_, i) => (
          // Labeled cells overflow their ~10px column instead of truncating —
          // 24 columns leave no room for "12am" on a phone otherwise.
          <div
            key={i}
            className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center"
          >
            {i % labelEvery === 0 ? labelFor(i) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function NumberHealthCard({ health }: { health: WhatsAppNumberHealth }) {
  if (!health.configured) {
    return (
      <section className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
          Number health
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Optional — live status of +961 70 708 585 from Meta, read-only
        </p>
        <p className="mt-4 text-sm text-ink-soft">
          Not connected — and optional; everything above works without it.
          Lighting it up means giving the Glance Analytics system user the
          WhatsApp account as an asset plus the{" "}
          <code className="text-[12px]">whatsapp_business_management</code>{" "}
          permission. Know what that permission is before granting it: Meta
          scopes it for <em>managing</em> a WhatsApp account, not just
          reading one. This dashboard only ever sends read requests — it
          contains no code that can register, deregister, message, or touch
          the phone&apos;s login — but the permission itself is broader than
          what the dashboard uses, so grant it knowingly or not at all.
        </p>
        {health.notes.length > 0 ? (
          <p className="mt-3 text-[11px] leading-snug text-ink-soft/80">
            {health.notes.join(" · ")}
          </p>
        ) : null}
      </section>
    );
  }

  const quality = (health.qualityRating ?? "").toUpperCase();
  const qualityTone =
    quality === "GREEN"
      ? "text-teal-deep"
      : quality === "RED"
        ? "text-red-600"
        : "text-ink";

  return (
    <section className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
        Number health
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        {health.displayNumber ?? "+961 70 708 585"} · read directly from Meta,
        read-only
      </p>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-ink-soft">
            Quality rating
          </p>
          <p className={`mt-0.5 text-xl font-semibold ${qualityTone}`}>
            {health.qualityRating ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-ink-soft">
            Display name
          </p>
          <p className="mt-0.5 text-xl font-semibold text-ink">
            {health.verifiedName ?? "—"}
          </p>
          <p className="text-[11px] text-ink-soft">{health.nameStatus ?? ""}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-ink-soft">
            Status
          </p>
          <p className="mt-0.5 text-xl font-semibold text-ink">
            {health.status ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-ink-soft">
            Messaging limit
          </p>
          <p className="mt-0.5 text-xl font-semibold text-ink">
            {health.messagingLimit ?? "—"}
          </p>
        </div>
      </div>
      {health.notes.length > 0 ? (
        <p className="mt-3 text-[11px] leading-snug text-ink-soft/80">
          {health.notes.join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

export function WhatsAppPanel({
  data,
  numberHealth,
}: {
  data: WhatsAppPayload;
  numberHealth: WhatsAppNumberHealth;
}) {
  const hasHours = data.byHour.some((v) => v > 0);
  const hasDows = data.byDow.some((v) => v > 0);
  const peakHour = data.byHour.indexOf(Math.max(...data.byHour));
  const peakDow = data.byDow.indexOf(Math.max(...data.byDow));
  const topModel = data.byModel[0];
  const modelMax = Math.max(...data.byModel.map((m) => m.total), 1);
  const pageMax = Math.max(...data.byPage.map((p) => p.total), 1);
  const brandTotal = data.brandLevel.reduce((a, b) => a + b.total, 0);
  const dailyMax = Math.max(...data.daily.map((d) => d.total), 1);

  return (
    <>
      <section className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
              WhatsApp demand
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Taps that opened WhatsApp from your websites — measured
              first-party at the moment of the tap. Whether a message was then
              sent happens inside WhatsApp, out of measurable sight.
            </p>
          </div>
          <span className="rounded-full bg-sand/80 px-3 py-1 text-[11px] font-medium text-ink-soft">
            read-only · cannot affect the phone&apos;s login
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile
            label="WhatsApp opens"
            value={formatNumber(data.total)}
            hint={`last ${data.windowDays} days`}
            delta={<Delta current={data.total} previous={data.previousTotal} />}
          />
          <Tile
            label="Top model"
            value={topModel ? topModel.label : "—"}
            hint={topModel ? `${formatNumber(topModel.total)} taps` : "no model context"}
          />
          <Tile
            label="Busiest hour"
            value={hasHours ? hourLabel(peakHour) : "—"}
            hint="Beirut time"
          />
          <Tile label="Busiest day" value={hasDows ? DOW_LABELS[peakDow] : "—"} />
        </div>

        {/* Daily trend — zeros drawn, because quiet days are information */}
        {data.daily.length > 1 ? (
          <div className="mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
              Day by day
            </p>
            <div className="mt-2 flex h-12 items-end gap-px">
              {data.daily.map((d) => (
                <div
                  key={d.date}
                  className="min-w-0 flex-1"
                  title={`${d.date} — ${d.total}`}
                >
                  <div
                    className="w-full rounded-t bg-teal"
                    style={{
                      height: `${Math.max((d.total / dailyMax) * 100, d.total > 0 ? 8 : 2)}%`,
                      opacity: d.total > 0 ? 0.9 : 0.15,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-2">
        <section className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
            What sends them to WhatsApp
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            The car on screen at the moment they tapped — the closest honest
            proxy for what the conversation will be about
          </p>
          <ul className="mt-4 space-y-2.5">
            {data.byModel.length === 0 ? (
              <li className="text-sm text-ink-soft">
                No model-specific WhatsApp taps in this range.
              </li>
            ) : (
              data.byModel.map((m, i) => (
                <BarRow
                  key={m.label}
                  label={m.label}
                  value={m.total}
                  max={modelMax}
                  index={i}
                />
              ))
            )}
          </ul>
          {brandTotal > 0 ? (
            <div className="mt-4 border-t border-[var(--line)] pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
                Brand-level · no model named
              </p>
              <p className="mt-1 text-sm text-ink">
                {data.brandLevel.map((b) => `${b.label} ${b.total}`).join(" · ")}
              </p>
            </div>
          ) : null}
        </section>

        <section className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
            Where they tap WhatsApp
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            The page they were reading when they tapped WhatsApp
          </p>
          <ul className="mt-4 space-y-2.5">
            {data.byPage.length === 0 ? (
              <li className="text-sm text-ink-soft">No WhatsApp taps yet.</li>
            ) : (
              data.byPage.map((p, i) => (
                <BarRow
                  key={`${p.site}|${p.page}`}
                  label={p.page}
                  value={p.total}
                  max={pageMax}
                  index={i}
                  sublabel={p.page.startsWith(p.site) ? undefined : p.site}
                />
              ))
            )}
          </ul>
        </section>
      </div>

      <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-2">
        <section className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
            When customers reach out
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            By hour of day, Beirut time — staff the phone when it matters
          </p>
          <div className="mt-4">
            <ColumnChart values={data.byHour} labelFor={hourLabel} labelEvery={4} />
          </div>
        </section>

        <section className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
            By day of week
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Which days produce the most enquiries
          </p>
          <div className="mt-4">
            <ColumnChart
              values={data.byDow}
              labelFor={(i) => DOW_LABELS[i]}
              labelEvery={1}
            />
          </div>
        </section>
      </div>

      <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-2">
        <section className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
            By site
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Which website sends people to WhatsApp
          </p>
          <ul className="mt-4 space-y-2.5">
            {data.bySite.map((s, i) => (
              <BarRow
                key={s.label}
                label={s.label}
                value={s.total}
                max={Math.max(...data.bySite.map((x) => x.total), 1)}
                index={i}
              />
            ))}
          </ul>
        </section>

        <NumberHealthCard health={numberHealth} />
      </div>

      <section className="panel animate-rise rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6 mt-3 sm:mt-4">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
          What this page can&apos;t tell you yet
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          What customers say <em>inside</em> the chats — exact questions,
          colour preferences, reported issues — stays end-to-end encrypted on
          the phone. No API can read it, and this page deliberately does not
          try. Getting content-level analysis means one of two separate
          projects: connecting the number to the Cloud API via a fully
          completed Coexistence setup (new messages mirror to the dashboard;
          the phone keeps working), or analysing exported chat files you
          upload by hand. Neither happens from this page, and neither will be
          started without an explicit go-ahead.
        </p>
        <p className="mt-3 text-[11px] leading-snug text-ink-soft/80">
          Everything above is measured first-party on your own websites plus,
          optionally, read-only metadata from Meta. This view sends nothing,
          registers nothing, and cannot log the phone out of WhatsApp.
        </p>
      </section>
    </>
  );
}
