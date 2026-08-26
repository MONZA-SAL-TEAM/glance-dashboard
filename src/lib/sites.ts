/**
 * GA4 property id → site identity. The env GA_PROPERTIES labels drifted
 * (names duplicated, url set to fragments like "monza"), so the three known
 * Monza properties are pinned here and win over env/discovery labels.
 */
export const KNOWN_SITES: Record<string, { domain: string; name: string }> = {
  "547222815": { domain: "monzasal.com", name: "Monza SAL" },
  "541962515": { domain: "voyahlebanon.com", name: "VOYAH Lebanon" },
  "540543412": { domain: "mherolebanon.com", name: "MHERO Lebanon" },
};

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
