import { db, transaction } from "./db";
import type { MetricRow } from "./types";

/** Insert or update daily rows. Returns how many rows were written. */
export function upsertMetrics(clientId: number, rows: MetricRow[]): number {
  const stmt = db().prepare(
    `INSERT INTO metrics_daily (client_id, date, platform, campaign, adset, ad, spend, impressions, clicks, leads, revenue)
     VALUES (@client_id, @date, @platform, @campaign, @adset, @ad, @spend, @impressions, @clicks, @leads, @revenue)
     ON CONFLICT (client_id, date, platform, campaign, adset, ad) DO UPDATE SET
       spend = excluded.spend, impressions = excluded.impressions, clicks = excluded.clicks,
       leads = excluded.leads, revenue = excluded.revenue`,
  );
  return transaction(() => {
    for (const r of rows) stmt.run({ client_id: clientId, ...r });
    return rows.length;
  });
}

export function dataCoverage(clientId: number): { first: string | null; last: string | null; rows: number; days: number } {
  return db()
    .prepare("SELECT MIN(date) AS first, MAX(date) AS last, COUNT(*) AS rows, COUNT(DISTINCT date) AS days FROM metrics_daily WHERE client_id = ?")
    .get(clientId) as { first: string | null; last: string | null; rows: number; days: number };
}
