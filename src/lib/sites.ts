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

/**
 * The actual vehicles. Anything else a signal carries — "VOYAH", "MHERO",
 * "the Monza lineup" — is brand-level interest recorded when no specific
 * model was in context, and must not be ranked as if it were a model.
 * Keep in step with PATH_RULES in src/lib/models.ts (the test script asserts
 * every mapped label appears here).
 */
export const CANONICAL_MODELS = [
  "VOYAH Free",
  "VOYAH Free+",
  "VOYAH Dream",
  "VOYAH Passion",
  "VOYAH Passion L",
  "VOYAH Courage",
  "VOYAH Taishan",
  "MHERO 1",
  "MHERO 2",
] as const;

const MODEL_SET: ReadonlySet<string> = new Set(CANONICAL_MODELS);

export function isCanonicalModel(vehicle: string): boolean {
  return MODEL_SET.has(vehicle);
}

/**
 * The three brands, and only three. A signal carrying no specific model
 * still names one of these.
 *
 * The database normalizes raw vehicle_context into this vocabulary
 * (public.glance_normalize_vehicle), but the sites write free text and the
 * spellings drift — "Monza" first appeared on 2026-09-02 alongside the older
 * "the Monza lineup", and briefly rendered as a fourth brand. Anything that
 * matches neither a model nor a brand is UNRECOGNISED and must be shown as
 * such rather than silently promoted to a brand, which is how that bug hid.
 */
export const CANONICAL_BRANDS = ["VOYAH", "MHERO", "Monza SAL"] as const;

const BRAND_SET: ReadonlySet<string> = new Set(CANONICAL_BRANDS);

export function isCanonicalBrand(vehicle: string): boolean {
  return BRAND_SET.has(vehicle);
}

/**
 * Classify a normalized vehicle label. "unrecognised" means the database
 * normalizer needs a new spelling adding — a prompt, not a category.
 */
export function classifyVehicle(
  vehicle: string,
): "model" | "brand" | "unspecified" | "unrecognised" {
  if (MODEL_SET.has(vehicle)) return "model";
  if (BRAND_SET.has(vehicle)) return "brand";
  if (vehicle === "unspecified") return "unspecified";
  return "unrecognised";
}

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
