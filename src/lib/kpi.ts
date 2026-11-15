import { db } from "./db";
import type { AdKpis, Kpis, Totals } from "./types";

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function toKpis(t: Totals): Kpis {
  return {
    ...t,
    ctr: div(t.clicks, t.impressions),
    cpc: div(t.spend, t.clicks),
    cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : null,
    cvr: div(t.leads, t.clicks),
    cpl: div(t.spend, t.leads),
    roas: div(t.revenue, t.spend),
  };
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type Period = { start: string; end: string };

/**
 * The reporting window ends on the latest day that has data, not on today:
 * imports can lag, and a window full of empty days would look like a collapse.
 */
export function latestPeriod(clientId: number, days = 7): { current: Period; previous: Period } | null {
  const row = db().prepare("SELECT MAX(date) AS d FROM metrics_daily WHERE client_id = ?").get(clientId) as { d: string | null };
  if (!row.d) return null;
  const end = row.d;
  const start = addDays(end, -(days - 1));
  return {
    current: { start, end },
    previous: { start: addDays(start, -days), end: addDays(start, -1) },
  };
}

const SUMS = `COALESCE(SUM(spend),0) AS spend, COALESCE(SUM(impressions),0) AS impressions,
  COALESCE(SUM(clicks),0) AS clicks, COALESCE(SUM(leads),0) AS leads, COALESCE(SUM(revenue),0) AS revenue`;

export function totals(clientId: number, p: Period): Kpis {
  const t = db()
    .prepare(`SELECT ${SUMS} FROM metrics_daily WHERE client_id = ? AND date BETWEEN ? AND ?`)
    .get(clientId, p.start, p.end) as Totals;
  return toKpis(t);
}

export function byAd(clientId: number, p: Period): AdKpis[] {
  const rows = db()
    .prepare(
      `SELECT platform, campaign, adset, ad, ${SUMS} FROM metrics_daily
       WHERE client_id = ? AND date BETWEEN ? AND ?
       GROUP BY platform, campaign, adset, ad ORDER BY spend DESC`,
    )
    .all(clientId, p.start, p.end) as (Totals & { platform: string; campaign: string; adset: string; ad: string })[];
  return rows.map((r) => ({ ...toKpis(r), platform: r.platform, campaign: r.campaign, adset: r.adset, ad: r.ad }));
}

export function dailySeries(clientId: number, p: Period): (Totals & { date: string })[] {
  const rows = db()
    .prepare(
      `SELECT date, ${SUMS} FROM metrics_daily WHERE client_id = ? AND date BETWEEN ? AND ?
       GROUP BY date ORDER BY date`,
    )
    .all(clientId, p.start, p.end) as (Totals & { date: string })[];
  // Fill gaps so a day without delivery shows as zero instead of vanishing.
  const map = new Map(rows.map((r) => [r.date, r]));
  const out: (Totals & { date: string })[] = [];
  for (let d = p.start; d <= p.end; d = addDays(d, 1)) {
    out.push(map.get(d) ?? { date: d, spend: 0, impressions: 0, clicks: 0, leads: 0, revenue: 0 });
  }
  return out;
}

/** Relative change, null when there is no previous value to compare against. */
export function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}
