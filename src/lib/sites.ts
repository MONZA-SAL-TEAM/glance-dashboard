/**
 * GA4 property id → site identity. The env GA_PROPERTIES labels drifted
 * (names duplicated, url set to fragments like "monza"), so the three known
 * Monza properties are pinned here and win over env/discovery labels.
 */
export interface KnownSite {
  domain: string;
  name: string;
  /** Short slug used in shareable URLs (?site=voyah). */
  alias: string;
}

export const KNOWN_SITES: Record<string, KnownSite> = {
  "547222815": { domain: "monzasal.com", name: "Monza SAL", alias: "monza" },
  "541962515": {
    domain: "voyahlebanon.com",
    name: "VOYAH Lebanon",
    alias: "voyah",
  },
  "540543412": {
    domain: "mherolebanon.com",
    name: "MHERO Lebanon",
    alias: "mhero",
  },
};

/** Display order for the portfolio view: brand sites first, corporate last. */
export const PORTFOLIO_ORDER = ["541962515", "540543412", "547222815"];

export function aliasToPropertyId(alias: string): string | null {
  const entry = Object.entries(KNOWN_SITES).find(
    ([, site]) => site.alias === alias.toLowerCase(),
  );
  return entry ? entry[0] : null;
}

export function propertyIdToAlias(propertyId: string): string {
  return KNOWN_SITES[propertyId]?.alias ?? propertyId;
}

/**
 * Resolve the site domain used to join Supabase signals to a GA property.
 * Falls back to the property's url field when it already looks like a domain.
 */
export function siteDomainForProperty(
  propertyId: string,
  url?: string,
): string | null {
  const known = KNOWN_SITES[propertyId];
  if (known) return known.domain;
  if (url && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.trim())) {
    return url.trim().toLowerCase().replace(/^www\./, "");
  }
  return null;
}
