import Papa from "papaparse";
import { db, transaction } from "./db";
import { mapColumns, matches, parseNumber } from "./importers/csv";

export type SearchTerm = { term: string; campaign: string; adgroup: string; impressions: number; clicks: number; cost: number; conversions: number };

// Column names in the Google Ads search terms report (English and German UI).
const ALIASES: Record<string, string[]> = {
  term: ["search term", "suchbegriff", "suchanfrage", "query"],
  campaign: ["campaign", "kampagne"],
  adgroup: ["ad group", "anzeigengruppe"],
  impressions: ["impr.", "impressions", "impressionen"],
  clicks: ["clicks", "klicks"],
  cost: ["cost", "kosten"],
  conversions: ["conversions"],
};

export type TermsResult = { rows: SearchTerm[]; skipped: number; mapped: Record<string, string>; error?: string };

export function parseSearchTermsCsv(text: string): TermsResult {
  const data = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: true }).data;
  const headerIdx = data.slice(0, 10).findIndex((l) => l.some((c) => ALIASES.term.some((a) => matches(String(c), a))));
  if (headerIdx < 0) return { rows: [], skipped: 0, mapped: {}, error: 'No "Search term" column found. Export the search terms report from Google Ads.' };
  const headers = data[headerIdx].map(String);
  const cols = mapColumns(headers, ALIASES);
  const mapped = Object.fromEntries(Object.entries(cols).map(([f, i]) => [f, headers[i].trim()]));
  const missing = ["clicks", "cost"].filter((f) => !(f in cols));
  if (missing.length) return { rows: [], skipped: 0, mapped, error: `Missing required column(s): ${missing.join(", ")}.` };

  const get = (l: string[], f: string) => (f in cols ? String(l[cols[f]] ?? "") : "");
  const agg = new Map<string, SearchTerm>();
  let skipped = 0;
  for (const l of data.slice(headerIdx + 1)) {
    const term = get(l, "term").trim();
    // Footer rows: "Total: Account", "Gesamt: ..." and similar.
    if (!term || /^(total|gesamt|summe)\b/i.test(term) || term === "--") {
      skipped++;
      continue;
    }
    const row: SearchTerm = {
      term,
      campaign: get(l, "campaign").trim(),
      adgroup: get(l, "adgroup").trim(),
      impressions: Math.round(parseNumber(get(l, "impressions"))),
      clicks: Math.round(parseNumber(get(l, "clicks"))),
      cost: parseNumber(get(l, "cost")),
      conversions: parseNumber(get(l, "conversions")),
    };
    const key = [row.term.toLowerCase(), row.campaign, row.adgroup].join("\u0001");
    const prev = agg.get(key);
    if (prev) {
      prev.impressions += row.impressions;
      prev.clicks += row.clicks;
      prev.cost += row.cost;
      prev.conversions += row.conversions;
    } else agg.set(key, row);
  }
  return { rows: [...agg.values()], skipped, mapped };
}

/** A report is a snapshot of one period, so a new import replaces the old one. */
export function replaceSearchTerms(clientId: number, rows: SearchTerm[]): number {
  return transaction(() => {
    db().prepare("DELETE FROM search_terms WHERE client_id = ?").run(clientId);
    const stmt = db().prepare("INSERT INTO search_terms (client_id, term, campaign, adgroup, impressions, clicks, cost, conversions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    for (const r of rows) stmt.run(clientId, r.term, r.campaign, r.adgroup, r.impressions, r.clicks, r.cost, r.conversions);
    return rows.length;
  });
}

export function getSearchTerms(clientId: number): { rows: SearchTerm[]; importedAt: string | null } {
  const rows = db().prepare("SELECT term, campaign, adgroup, impressions, clicks, cost, conversions FROM search_terms WHERE client_id = ? ORDER BY cost DESC").all(clientId) as SearchTerm[];
  const at = db().prepare("SELECT MAX(imported_at) AS t FROM search_terms WHERE client_id = ?").get(clientId) as { t: string | null };
  return { rows, importedAt: at.t };
}

export type TermVerdict = "exclude" | "review" | "add" | "none";

export const TERM_THRESHOLDS = {
  /** Conversions from one search term before suggesting it as its own keyword. */
  addMinConversions: 2,
  /** Clicks without a conversion before a term is worth a look. */
  reviewMinClicks: 5,
  /** Clicks without a conversion that count as waste when there is no cost benchmark. */
  excludeMinClicksNoBenchmark: 10,
};

/**
 * Fixed rules, no model. "exclude" means: candidate for a negative keyword. The human decides,
 * because a term can be relevant and simply not have converted yet.
 */
export function classifyTerm(t: SearchTerm, benchmarkCostPerConversion: number | null): TermVerdict {
  if (t.conversions >= TERM_THRESHOLDS.addMinConversions) return "add";
  if (t.conversions > 0) return "none";
  if (benchmarkCostPerConversion !== null && t.cost >= benchmarkCostPerConversion) return "exclude";
  if (benchmarkCostPerConversion === null && t.clicks >= TERM_THRESHOLDS.excludeMinClicksNoBenchmark) return "exclude";
  if (t.clicks >= TERM_THRESHOLDS.reviewMinClicks) return "review";
  return "none";
}

export function termsSummary(rows: SearchTerm[], targetCpl: number | null) {
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  const conversions = rows.reduce((s, r) => s + r.conversions, 0);
  const benchmark = targetCpl ?? (conversions > 0 ? cost / conversions : null);
  const judged = rows.map((r) => ({ ...r, verdict: classifyTerm(r, benchmark) }));
  const wasted = judged.filter((r) => r.verdict === "exclude").reduce((s, r) => s + r.cost, 0);
  return { cost, conversions, benchmark, benchmarkSource: targetCpl !== null ? "target" : conversions > 0 ? "report" : "none", wasted, judged };
}
