import { beforeAll, describe, expect, it } from "vitest";

process.env.DB_PATH = ":memory:";

import { forbiddenTerms, isFilled, BRAIN } from "../src/lib/brain";
import { createClient } from "../src/lib/clients";
import { checkCopy } from "../src/lib/compliance";
import { parseDate, parseMetricsCsv, parseNumber } from "../src/lib/importers/csv";
import { mapInsight } from "../src/lib/importers/meta";
import { byAd, change, dailySeries, latestPeriod, toKpis, totals } from "../src/lib/kpi";
import { dataCoverage, upsertMetrics } from "../src/lib/metrics";
import { recommend } from "../src/lib/rules";
import type { AdKpis } from "../src/lib/types";

describe("parseNumber", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["12,50", 12.5],
    ["12.5", 12.5],
    ["€ 1.234", 1234],
    ["1,234", 1234],
    ["0.125", 0.125],
    ["0,125", 0.125],
    ["1.234.567", 1234567],
    ["", 0],
    ["--", 0],
    ["-3,5", -3.5],
  ])("%s -> %d", (input, expected) => expect(parseNumber(input)).toBeCloseTo(expected));
});

describe("parseDate", () => {
  it("handles ISO, German and US formats", () => {
    expect(parseDate("2026-11-03")).toBe("2026-11-03");
    expect(parseDate("03.11.2026")).toBe("2026-11-03");
    expect(parseDate("11/03/2026")).toBe("2026-11-03");
    expect(parseDate("25/03/2026")).toBe("2026-03-25");
  });
  it("rejects non-dates and impossible dates", () => {
    expect(parseDate("Total")).toBeNull();
    expect(parseDate("31.02.2026")).toBeNull();
  });
});

describe("parseMetricsCsv", () => {
  it("reads a German Meta Ads Manager export", () => {
    const csv = `﻿Tag,Kampagnenname,Anzeigengruppenname,Anzeigenname,Ausgegebener Betrag (EUR),Impressionen,Klicks (alle),Link-Klicks,Ergebnisse
2026-11-01,K1,AG1,Anzeige A,"12,50","1.200",40,18,2
2026-11-02,K1,AG1,Anzeige A,"10,00",900,30,12,
`;
    const r = parseMetricsCsv(csv, "meta");
    expect(r.error).toBeUndefined();
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ date: "2026-11-01", campaign: "K1", ad: "Anzeige A", spend: 12.5, impressions: 1200, clicks: 18, leads: 2 });
    expect(r.mapped.clicks).toBe("Link-Klicks"); // link clicks win over all clicks
    expect(r.rows[1].leads).toBe(0);
  });

  it("reads a Google Ads export with title lines and a total row", () => {
    const csv = `Ad report
"November 1, 2026 - November 7, 2026"
Day,Campaign,Ad group,Cost,Impr.,Clicks,Conversions,Conv. value
2026-11-01,Search DE,IT Support,"1,234.50","10,000",150,3.00,0
Total: Account,,,"1,234.50","10,000",150,3.00,0
`;
    const r = parseMetricsCsv(csv, "google");
    expect(r.rows).toHaveLength(1);
    expect(r.skipped).toBe(1);
    expect(r.rows[0]).toMatchObject({ spend: 1234.5, impressions: 10000, clicks: 150, leads: 3, platform: "google", adset: "IT Support" });
  });

  it("sums repeated ad/day rows from breakdown exports", () => {
    const csv = `Day,Ad name,Amount spent (EUR),Impressions,Link clicks
2026-11-01,A,5,100,2
2026-11-01,A,7,200,3
`;
    const r = parseMetricsCsv(csv, "meta");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ spend: 12, impressions: 300, clicks: 5 });
  });

  it("fails clearly when there is no daily breakdown or a required column is missing", () => {
    expect(parseMetricsCsv("Campaign,Cost\nA,5\n", "google").error).toMatch(/date column/i);
    expect(parseMetricsCsv("Day,Campaign\n2026-11-01,A\n", "google").error).toMatch(/spend/);
  });
});

describe("meta insight mapping", () => {
  it("uses the combined lead count and never adds lead types together", () => {
    const row = mapInsight({
      date_start: "2026-11-01", ad_name: "A", spend: "10.5", impressions: "1000", inline_link_clicks: "20",
      actions: [{ action_type: "offsite_conversion.fb_pixel_lead", value: "2" }, { action_type: "lead", value: "2" }, { action_type: "link_click", value: "20" }],
    });
    expect(row).toMatchObject({ spend: 10.5, impressions: 1000, clicks: 20, leads: 2, revenue: 0 });
  });
});

describe("kpis", () => {
  it("returns null ratios instead of dividing by zero", () => {
    const k = toKpis({ spend: 50, impressions: 0, clicks: 0, leads: 0, revenue: 0 });
    expect(k.ctr).toBeNull();
    expect(k.cpl).toBeNull();
    expect(k.cpm).toBeNull();
  });
  it("computes the standard ratios", () => {
    const k = toKpis({ spend: 100, impressions: 10000, clicks: 200, leads: 5, revenue: 300 });
    expect(k).toMatchObject({ ctr: 0.02, cpc: 0.5, cpm: 10, cvr: 0.025, cpl: 20, roas: 3 });
  });
  it("change is null without a previous value", () => {
    expect(change(10, 0)).toBeNull();
    expect(change(null, 5)).toBeNull();
    expect(change(15, 10)).toBeCloseTo(0.5);
  });
});

describe("database round trip", () => {
  let id: number;
  beforeAll(() => {
    id = createClient({ name: "Test Kunde GmbH", industry: "", website: "", language: "de", currency: "EUR", channel: "meta", daily_budget: null, target_cpl: 40, meta_ad_account_id: "" });
  });
  const row = (date: string, ad: string, spend: number, leads: number) => ({ date, platform: "meta", campaign: "C", adset: "S", ad, spend, impressions: 1000, clicks: 20, leads, revenue: 0 });

  it("re-importing the same rows does not duplicate them", () => {
    const rows = [row("2026-11-01", "A", 10, 1), row("2026-11-07", "A", 10, 0), row("2026-11-07", "B", 30, 2)];
    upsertMetrics(id, rows);
    upsertMetrics(id, rows);
    upsertMetrics(id, [row("2026-11-07", "B", 35, 2)]); // corrected figure replaces the old one
    expect(dataCoverage(id)).toMatchObject({ rows: 3, days: 2, first: "2026-11-01", last: "2026-11-07" });
    const p = latestPeriod(id)!;
    expect(p.current).toEqual({ start: "2026-11-01", end: "2026-11-07" });
    expect(p.previous).toEqual({ start: "2026-10-25", end: "2026-10-31" });
    expect(totals(id, p.current)).toMatchObject({ spend: 55, leads: 3 });
    expect(byAd(id, p.current).map((a) => a.ad)).toEqual(["B", "A"]);
    const series = dailySeries(id, p.current);
    expect(series).toHaveLength(7);
    expect(series[1].spend).toBe(0); // gap day is filled with zero
  });

  it("gives umlaut names a clean, unique slug", () => {
    const a = createClient({ name: "Müller & Söhne", industry: "", website: "", language: "de", currency: "EUR", channel: "meta", daily_budget: null, target_cpl: null, meta_ad_account_id: "" });
    const b = createClient({ name: "Müller & Söhne", industry: "", website: "", language: "de", currency: "EUR", channel: "meta", daily_budget: null, target_cpl: null, meta_ad_account_id: "" });
    expect(a).not.toBe(b);
  });
});

describe("rules", () => {
  const ad = (name: string, spend: number, impressions: number, clicks: number, leads: number): AdKpis => ({
    ...toKpis({ spend, impressions, clicks, leads, revenue: 0 }), platform: "meta", campaign: "C", adset: "S", ad: name,
  });
  const opts: { targetCpl: number | null; accountCpl: number | null; currency: string; lang: string } = { targetCpl: 40, accountCpl: 55, currency: "EUR", lang: "de" };
  const action = (a: AdKpis, o = opts) => recommend([a], o)[0].action;

  it("pauses spend without leads at 2x the benchmark", () => {
    expect(action(ad("x", 80, 6000, 60, 0))).toBe("pause");
    expect(action(ad("x", 79, 6000, 60, 0))).toBe("keep");
  });
  it("pauses clearly expensive ads only with enough leads", () => {
    expect(action(ad("x", 130, 6000, 60, 2))).toBe("pause");
    expect(action(ad("x", 70, 6000, 60, 1))).toBe("keep"); // one lead at 70 is not enough evidence
  });
  it("scales cheap ads only with at least 3 leads", () => {
    expect(action(ad("x", 90, 6000, 90, 3))).toBe("scale");
    expect(action(ad("x", 40, 6000, 90, 2))).toBe("keep");
  });
  it("flags low CTR and waits on thin data", () => {
    expect(action(ad("x", 20, 4000, 10, 1))).toBe("refresh_creative");
    expect(action(ad("x", 5, 300, 4, 0))).toBe("wait");
  });
  it("falls back to the account CPL, and to CTR only when there is no benchmark", () => {
    expect(action(ad("x", 100, 6000, 60, 0), { ...opts, targetCpl: null })).toBe("keep"); // 100 < 2 x 55
    expect(action(ad("x", 110, 6000, 60, 0), { ...opts, targetCpl: null })).toBe("pause");
    expect(action(ad("x", 500, 6000, 60, 0), { ...opts, targetCpl: null, accountCpl: null })).toBe("keep");
  });
  it("skips ads that did not run", () => {
    expect(recommend([ad("x", 0, 0, 0, 0)], opts)).toHaveLength(0);
  });
});

describe("knowledge base and copy checks", () => {
  it("reads forbidden terms only from the forbidden section", () => {
    const md = "## Tonalität\n- locker\n## Verbotene Wörter\nEin Begriff pro Zeile.\n- billig\n- Schnäppchen\n## Erlaubt\n- Festpreis";
    expect(forbiddenTerms(md)).toEqual(["billig", "Schnäppchen"]);
  });
  it("treats an untouched template as not filled", () => {
    const offer = BRAIN.find((b) => b.kind === "offer")!;
    expect(isFilled("offer", offer.template)).toBe(false);
    expect(isFilled("offer", "Wir installieren Wallboxen für Hausbesitzer im Rhein-Main-Gebiet.")).toBe(true);
  });
  it("flags risky claims, forbidden terms and long headlines", () => {
    const flags = checkCopy({ hook: "Garantiert billig", primary_text: "100 % zufrieden", headline: "x".repeat(41), description: "" }, ["billig"]);
    const text = flags.map((f) => f.message).join(" | ");
    expect(text).toMatch(/forbidden term/);
    expect(text).toMatch(/Guarantee/);
    expect(text).toMatch(/100 %/);
    expect(text).toMatch(/41 characters/);
  });
  it("leaves clean copy unflagged", () => {
    expect(checkCopy({ hook: "Reicht Ihr Hausanschluss?", primary_text: "Wir prüfen das vor Ort.", headline: "Anschluss prüfen lassen", description: "" }, ["billig"])).toEqual([]);
  });
});
