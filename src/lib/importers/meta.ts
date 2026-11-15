import type { MetricRow } from "../types";

/**
 * Read-only sync from the Meta Marketing API (Ads Insights, one row per ad per day).
 * NOTE: written against the documented API but not yet run against a live ad account.
 * Check the lead action type against your own account before trusting lead counts.
 */
type Action = { action_type: string; value: string };
type InsightRow = {
  date_start: string;
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  inline_link_clicks?: string;
  actions?: Action[];
  action_values?: Action[];
};

// "lead" is Meta's combined lead count. The others are only used when it is absent,
// never added on top, to avoid counting the same lead twice.
const LEAD_TYPES = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];
const REVENUE_TYPES = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];

function pick(actions: Action[] | undefined, types: string[]): number {
  for (const t of types) {
    const hit = actions?.find((a) => a.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

export function mapInsight(r: InsightRow): MetricRow {
  return {
    date: r.date_start,
    platform: "meta",
    campaign: r.campaign_name ?? "",
    adset: r.adset_name ?? "",
    ad: r.ad_name ?? "",
    spend: Number(r.spend) || 0,
    impressions: Number(r.impressions) || 0,
    clicks: Number(r.inline_link_clicks) || 0,
    leads: pick(r.actions, LEAD_TYPES),
    revenue: pick(r.action_values, REVENUE_TYPES),
  };
}

export async function fetchMetaInsights(adAccountId: string, since: string, until: string): Promise<MetricRow[]> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN is not set.");
  const version = process.env.META_API_VERSION || "v25.0";
  const account = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

  const params = new URLSearchParams({
    level: "ad",
    time_increment: "1",
    fields: "campaign_name,adset_name,ad_name,spend,impressions,inline_link_clicks,actions,action_values",
    time_range: JSON.stringify({ since, until }),
    limit: "500",
  });
  let url: string | null = `https://graph.facebook.com/${version}/${account}/insights?${params}`;
  const rows: MetricRow[] = [];

  for (let page = 0; url && page < 200; page++) {
    // Token goes in the header so it never ends up in logged URLs.
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    if (!res.ok || body.error) {
      throw new Error(`Meta API error: ${body.error?.message ?? res.statusText}`);
    }
    for (const r of body.data as InsightRow[]) rows.push(mapInsight(r));
    url = body.paging?.next ?? null;
  }
  return rows;
}
