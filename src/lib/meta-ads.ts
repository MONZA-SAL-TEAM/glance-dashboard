import { attempt, graph, metaProfiles } from "./meta";
import type { AdCampaignRow, AdsSummary } from "./types";

/**
 * Paid performance via the Marketing API — a different system from the
 * organic Graph endpoints, with its own permission (`ads_read`) and its own
 * object model (ad account → campaign → insights).
 *
 * Cost-per-result is deliberately derived from *lead* actions rather than
 * raw clicks: a click is not a result, and reporting cost-per-click as if it
 * were cost-per-lead would flatter every campaign.
 */

interface ActionRow {
  action_type: string;
  value: string;
}

interface InsightRow {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  actions?: ActionRow[];
  cost_per_action_type?: ActionRow[];
}

/** Action types Meta uses for a "lead", across pixel/on-platform variants. */
const LEAD_ACTIONS = [
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "onsite_web_lead",
];

const MESSAGE_ACTIONS = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.total_messaging_connection",
];

function sumActions(rows: ActionRow[] | undefined, wanted: string[]): number {
  if (!rows) return 0;
  return rows
    .filter((r) => wanted.includes(r.action_type))
    .reduce((a, r) => a + (Number(r.value) || 0), 0);
}

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function adsConfigured(): boolean {
  return metaProfiles().some((p) => p.adAccountId);
}

export async function fetchAds(
  since: string,
  until: string,
  notes: string[],
): Promise<AdsSummary> {
  const accounts = metaProfiles().filter((p) => p.adAccountId);
  if (accounts.length === 0) {
    return { configured: false, campaigns: [], spend: 0, leads: 0, clicks: 0, impressions: 0, reach: 0 };
  }

  const campaigns: AdCampaignRow[] = [];

  for (const acct of accounts) {
    const id = acct.adAccountId as string;
    const res = await attempt(`${acct.label} · ads insights`, notes, () =>
      graph<{ data: InsightRow[] }>(`${id}/insights`, {
        level: "campaign",
        time_range: JSON.stringify({ since, until }),
        fields:
          "campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,actions,cost_per_action_type",
        limit: "50",
      }),
    );

    for (const row of res?.data ?? []) {
      const spend = num(row.spend);
      const leads = sumActions(row.actions, LEAD_ACTIONS);
      const messages = sumActions(row.actions, MESSAGE_ACTIONS);
      // A conversation started is a real result for a dealership, so it
      // counts toward results alongside form leads.
      const results = leads + messages;
      campaigns.push({
        account: acct.label,
        id: row.campaign_id ?? "",
        name: row.campaign_name ?? "(unnamed campaign)",
        spend,
        impressions: num(row.impressions),
        reach: num(row.reach),
        clicks: num(row.clicks),
        ctr: num(row.ctr),
        cpc: num(row.cpc),
        leads,
        messages,
        results,
        costPerResult: results > 0 ? spend / results : null,
      });
    }
  }

  campaigns.sort((a, b) => b.spend - a.spend);

  return {
    configured: true,
    campaigns,
    spend: campaigns.reduce((a, c) => a + c.spend, 0),
    leads: campaigns.reduce((a, c) => a + c.results, 0),
    clicks: campaigns.reduce((a, c) => a + c.clicks, 0),
    impressions: campaigns.reduce((a, c) => a + c.impressions, 0),
    reach: campaigns.reduce((a, c) => a + c.reach, 0),
  };
}
