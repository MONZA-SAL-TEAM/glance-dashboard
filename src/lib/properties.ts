import { AnalyticsAdminServiceClient } from "@google-analytics/admin";
import { getGoogleCredentials } from "./google-credentials";

export interface SiteProperty {
  id: string;
  name: string;
  url?: string;
}

export interface PropertiesResult {
  properties: SiteProperty[];
  /** Where the list came from, so the UI can explain an empty/short list. */
  source: "auto" | "env" | "mixed" | "none";
  /** Set when auto-discovery failed and we fell back to the env list. */
  warning?: string;
}

const DISCOVERY_CACHE_MS = 5 * 60 * 1000;

let cache: { at: number; value: PropertiesResult } | null = null;

function stripPrefix(value: string) {
  return value.replace(/^properties\//, "");
}

function parseEnvProperties(): SiteProperty[] {
  const raw = process.env.GA_PROPERTIES?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as SiteProperty[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .filter((p) => p?.id && p?.name)
          .map((p) => ({
            id: stripPrefix(String(p.id)),
            name: String(p.name),
            url: p.url ? String(p.url) : undefined,
          }));
      }
    } catch {
      // fall through to single-property env
    }
  }

  const id = process.env.GA_PROPERTY_ID?.replace(/^properties\//, "");
  if (!id) return [];

  return [
    {
      id,
      name: process.env.GA_PROPERTY_NAME || "Website",
      url: process.env.GA_PROPERTY_URL || undefined,
    },
  ];
}

/**
 * Every GA4 property the service account can read, via the Admin API.
 * Grant the service account Viewer on a property in GA and it shows up here —
 * no redeploy, no env edit.
 */
async function discoverProperties(): Promise<SiteProperty[]> {
  const client = new AnalyticsAdminServiceClient({
    credentials: getGoogleCredentials(),
  });

  const [summaries] = await client.listAccountSummaries({});
  const found: SiteProperty[] = [];

  for (const account of summaries ?? []) {
    for (const property of account.propertySummaries ?? []) {
      if (!property.property) continue;
      found.push({
        id: stripPrefix(property.property),
        name: property.displayName || property.property,
        url: account.displayName || undefined,
      });
    }
  }

  return found;
}

function mergeProperties(
  discovered: SiteProperty[],
  fromEnv: SiteProperty[],
): SiteProperty[] {
  const byId = new Map<string, SiteProperty>();

  for (const property of discovered) {
    byId.set(property.id, property);
  }

  // Env entries win on naming (hand-picked labels) and keep properties visible
  // even if the Admin API did not return them.
  for (const property of fromEnv) {
    const existing = byId.get(property.id);
    byId.set(property.id, {
      id: property.id,
      name: property.name || existing?.name || property.id,
      url: property.url ?? existing?.url,
    });
  }

  return [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export async function listProperties(
  options: { refresh?: boolean } = {},
): Promise<PropertiesResult> {
  if (!options.refresh && cache && Date.now() - cache.at < DISCOVERY_CACHE_MS) {
    return cache.value;
  }

  const fromEnv = parseEnvProperties();
  const autoDiscover = process.env.GA_AUTO_DISCOVER !== "false";

  let result: PropertiesResult;

  if (!autoDiscover) {
    result = {
      properties: fromEnv,
      source: fromEnv.length > 0 ? "env" : "none",
    };
  } else {
    try {
      const discovered = await discoverProperties();
      const properties = mergeProperties(discovered, fromEnv);
      result = {
        properties,
        source:
          discovered.length > 0 && fromEnv.length > 0
            ? "mixed"
            : discovered.length > 0
              ? "auto"
              : fromEnv.length > 0
                ? "env"
                : "none",
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      result = {
        properties: fromEnv,
        source: fromEnv.length > 0 ? "env" : "none",
        warning: `Could not auto-list your GA properties (${detail.split("\n")[0]}). Showing the sites from GA_PROPERTIES only.`,
      };
    }
  }

  cache = { at: Date.now(), value: result };
  return result;
}

export function clearPropertiesCache() {
  cache = null;
}

export async function resolvePropertyId(
  requested?: string | null,
): Promise<string> {
  let { properties, warning } = await listProperties();

  if (requested) {
    const cleaned = stripPrefix(requested);
    let match = properties.find((p) => p.id === cleaned);

    // Access granted since the last discovery would leave the property missing
    // from the cached list. Re-check against GA before turning the user away.
    if (!match) {
      ({ properties, warning } = await listProperties({ refresh: true }));
      match = properties.find((p) => p.id === cleaned);
    }

    if (match) return match.id;

    if (properties.length === 0) {
      throw new Error(
        warning ??
          "No GA properties available. Give the service account Viewer access in Google Analytics, or set GA_PROPERTIES.",
      );
    }

    throw new Error(
      `Property ${cleaned} is not available to this service account. Grant it Viewer access in Google Analytics.`,
    );
  }

  if (properties.length === 0) {
    throw new Error(
      warning ??
        "No GA properties available. Give the service account Viewer access in Google Analytics, or set GA_PROPERTIES.",
    );
  }

  return properties[0].id;
}

export async function getPropertyMeta(
  propertyId: string,
): Promise<SiteProperty> {
  const { properties } = await listProperties();
  return (
    properties.find((p) => p.id === propertyId) ?? {
      id: propertyId,
      name: "Website",
    }
  );
}
