"use client";

import type { SiteProperty } from "@/lib/types";

/**
 * One heading in the switcher. Views are grouped by brand so a brand's
 * website and its Social view sit together, and a brand missing a Social
 * entry is visible as a gap under its own heading rather than being
 * invisible in a flat list.
 */
export interface SwitcherGroup {
  label: string;
  sites: SiteProperty[];
}

interface SiteSwitcherProps {
  groups: SwitcherGroup[];
  value: string;
  onChange: (propertyId: string) => void;
}

export function SiteSwitcher({ groups, value, onChange }: SiteSwitcherProps) {
  const populated = groups.filter((g) => g.sites.length > 0);
  if (populated.length === 0) return null;

  return (
    <label className="block w-full min-w-0 sm:w-auto">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
        Website
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-11 w-full appearance-none rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-2.5 pr-10 text-sm font-medium text-ink outline-none ring-teal/25 focus:ring-4 sm:min-w-[220px]"
          aria-label="Switch website"
        >
          {populated.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                  {site.url ? ` · ${site.url}` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-soft">
          ▾
        </span>
      </div>
    </label>
  );
}
