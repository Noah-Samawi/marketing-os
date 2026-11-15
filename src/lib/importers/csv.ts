import Papa from "papaparse";
import type { MetricRow } from "../types";

/**
 * Column names as they appear in Meta Ads Manager and Google Ads exports
 * (English and German UI). Earlier aliases win, e.g. link clicks over all clicks.
 */
const ALIASES: Record<string, string[]> = {
  date: ["day", "date", "tag", "datum", "reporting starts", "berichtsstart"],
  campaign: ["campaign name", "campaign", "kampagnenname", "kampagne"],
  adset: ["ad set name", "ad set", "ad group", "anzeigengruppenname", "anzeigengruppe"],
  ad: ["ad name", "ad", "anzeigenname", "anzeige"],
  spend: ["amount spent", "spend", "cost", "ausgegebener betrag", "kosten", "ausgaben"],
  impressions: ["impressions", "impr.", "impressionen"],
  clicks: ["link clicks", "link-klicks", "clicks", "klicks", "clicks (all)", "klicks (alle)"],
  leads: ["leads", "results", "ergebnisse", "conversions"],
  revenue: ["purchase conversion value", "conv. value", "conversion value", "conversion-wert", "revenue", "umsatz"],
};

const norm = (h: string) => h.replace(/^﻿/, "").trim().toLowerCase();

/** A header matches an alias exactly, or with a trailing unit such as "(EUR)". */
export function matches(header: string, alias: string): boolean {
  const h = norm(header);
  return h === alias || (h.startsWith(alias + " (") && !alias.includes("("));
}

export function mapColumns(headers: string[], aliasMap: Record<string, string[]> = ALIASES): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(aliasMap)) {
    for (const alias of aliases) {
      const idx = headers.findIndex((h) => matches(h, alias));
      if (idx >= 0) {
        map[field] = idx;
        break;
      }
    }
  }
  return map;
}

/**
 * Parses "1.234,56", "1,234.56", "€ 12,50", "12.5". With a single separator
 * followed by exactly three digits ("1.234", "1,234") it is read as a thousands
 * separator, because exports write money with at most two decimals ("0.125" stays a decimal).
 */
export function parseNumber(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  let s = String(raw ?? "").replace(/[^\d.,-]/g, "");
  if (!s || s === "-") return 0;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const parts = s.split(sep);
    const thousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && !/^-?0*$/.test(parts[0]));
    s = thousands ? parts.join("") : parts.join(".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Accepts 2026-11-03, 03.11.2026 and 11/03/2026 (US order unless the first part is > 12). */
export function parseDate(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return valid(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return +m[1] > 12 ? valid(+m[3], +m[2], +m[1]) : valid(+m[3], +m[1], +m[2]);
  return null;
}

function valid(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export type CsvResult = {
  rows: MetricRow[];
  skipped: number;
  mapped: Record<string, string>;
  missing: string[];
  error?: string;
};

export function parseMetricsCsv(text: string, platform: string): CsvResult {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: true });
  const lines = parsed.data;

  // Google Ads exports start with a report title and a date range line.
  const headerIdx = lines.slice(0, 10).findIndex((l) => l.some((c) => ALIASES.date.some((a) => matches(String(c), a))));
  if (headerIdx < 0) {
    return { rows: [], skipped: 0, mapped: {}, missing: ["date"], error: "No date column found. The export must be broken down by day." };
  }
  const headers = lines[headerIdx].map(String);
  const cols = mapColumns(headers);
  const mapped = Object.fromEntries(Object.entries(cols).map(([f, i]) => [f, headers[i].trim()]));
  const missing = ["spend", "impressions", "clicks"].filter((f) => !(f in cols));
  if (missing.length) {
    return { rows: [], skipped: 0, mapped, missing, error: `Missing required column(s): ${missing.join(", ")}.` };
  }

  const get = (l: string[], f: string) => (f in cols ? l[cols[f]] : "");
  const agg = new Map<string, MetricRow>();
  let skipped = 0;

  for (const l of lines.slice(headerIdx + 1)) {
    const date = parseDate(get(l, "date"));
    if (!date) {
      skipped++; // total rows, footers
      continue;
    }
    const row: MetricRow = {
      date,
      platform,
      campaign: String(get(l, "campaign") ?? "").trim(),
      adset: String(get(l, "adset") ?? "").trim(),
      ad: String(get(l, "ad") ?? "").trim(),
      spend: parseNumber(get(l, "spend")),
      impressions: Math.round(parseNumber(get(l, "impressions"))),
      clicks: Math.round(parseNumber(get(l, "clicks"))),
      leads: parseNumber(get(l, "leads")),
      revenue: parseNumber(get(l, "revenue")),
    };
    // Exports with extra breakdowns repeat the same ad/day: sum them into one row.
    const key = [row.date, row.campaign, row.adset, row.ad].join("\u0001");
    const prev = agg.get(key);
    if (prev) {
      prev.spend += row.spend;
      prev.impressions += row.impressions;
      prev.clicks += row.clicks;
      prev.leads += row.leads;
      prev.revenue += row.revenue;
    } else {
      agg.set(key, row);
    }
  }
  return { rows: [...agg.values()], skipped, mapped, missing: [] };
}
