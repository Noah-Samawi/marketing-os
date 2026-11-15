import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DB_PATH = ":memory:";

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

import { decideAdGroup, generateAdGroups, updateAdGroup } from "../src/lib/agents/search";
import { saveBrain } from "../src/lib/brain";
import { createClient, getClient } from "../src/lib/clients";
import { db } from "../src/lib/db";
import { formatKeyword, normalize, parseKeyword, rowToContent, validateAdGroup, type AdGroupContent, type AdGroupRow } from "../src/lib/search";
import { classifyTerm, getSearchTerms, parseSearchTermsCsv, replaceSearchTerms, termsSummary } from "../src/lib/searchTerms";

const group = (over: Partial<AdGroupContent> = {}): AdGroupContent => ({
  theme: "Wallbox",
  keywords: [{ text: "wallbox installation", match: "phrase" }],
  negatives: ["gebraucht"],
  headlines: ["Wallbox Installation", "Festpreis nach Termin", "Termin anfragen"],
  descriptions: ["Wir installieren Ihre Wallbox.", "Wir prüfen Ihren Hausanschluss."],
  path1: "wallbox",
  path2: "",
  final_url: "https://example.com",
  ...over,
});
const messages = (c: AdGroupContent, forbidden: string[] = []) => validateAdGroup(c, forbidden).map((f) => f.message).join(" | ");

describe("keyword notation", () => {
  it("round-trips Google's match type notation", () => {
    expect(parseKeyword("[wallbox elektriker]")).toEqual({ text: "wallbox elektriker", match: "exact" });
    expect(parseKeyword('"wallbox installation"')).toEqual({ text: "wallbox installation", match: "phrase" });
    expect(parseKeyword("„wallbox montage“")).toEqual({ text: "wallbox montage", match: "phrase" });
    expect(parseKeyword("  wallbox   kosten ")).toEqual({ text: "wallbox kosten", match: "broad" });
    expect(parseKeyword("   ")).toBeNull();
    for (const line of ["[a b]", '"a b"', "a b"]) expect(formatKeyword(parseKeyword(line)!)).toBe(line);
  });
});

describe("ad group validation", () => {
  it("passes a clean ad group", () => {
    expect(validateAdGroup(group(), [])).toEqual([]);
  });
  it("accepts exactly 30 and 90 characters and rejects 31 and 91", () => {
    const ok = group({ headlines: ["a".repeat(30), "b".repeat(30), "c".repeat(30)], descriptions: ["d".repeat(90), "e".repeat(90)] });
    expect(validateAdGroup(ok, [])).toEqual([]);
    expect(messages(group({ headlines: [...group().headlines, "a".repeat(31)] }))).toMatch(/Headline too long \(31\/30\)/);
    expect(messages(group({ descriptions: [...group().descriptions, "d".repeat(91)] }))).toMatch(/Description too long \(91\/90\)/);
  });
  it("counts only usable texts towards Google's minimum", () => {
    const m = messages(group({ headlines: ["Kurz", "Auch kurz", "x".repeat(40)] }));
    expect(m).toMatch(/Only 2 usable headline/);
    expect(messages(group({ descriptions: ["Eine."] }))).toMatch(/Only 1 usable description/);
  });
  it("flags paths, missing keywords, keyword/negative clashes, exclamation marks and risky claims", () => {
    expect(messages(group({ path1: "wallbox installation" }))).toMatch(/too long \(20\/15\).*must not contain spaces/);
    expect(messages(group({ keywords: [] }))).toMatch(/No keywords/);
    expect(messages(group({ negatives: ["Wallbox Installation"] }))).toMatch(/both a keyword and a negative/);
    expect(messages(group({ headlines: [...group().headlines, "Jetzt anfragen!"] }))).toMatch(/Exclamation mark/);
    expect(messages(group({ headlines: [...group().headlines, "Garantiert billig"] }), ["billig"])).toMatch(/forbidden term.*Guarantee/);
  });
  it("normalize trims and de-duplicates but never shortens a text", () => {
    const long = "Wallbox Installation im Rhein-Main-Gebiet";
    const n = normalize(group({ headlines: ["  Termin  anfragen ", "termin anfragen", long], path1: "/wallbox/", keywords: [{ text: "a", match: "phrase" }, { text: "A", match: "phrase" }, { text: "a", match: "exact" }] }));
    expect(n.headlines).toEqual(["termin anfragen", long]);
    expect(n.path1).toBe("wallbox");
    expect(n.keywords).toHaveLength(2);
  });
});

describe("search terms report", () => {
  const sample = fs.readFileSync("samples/google-search-terms-example.csv", "utf8");

  it("reads a Google Ads export with title lines and a total row", () => {
    const r = parseSearchTermsCsv(sample);
    expect(r.error).toBeUndefined();
    expect(r.rows).toHaveLength(7);
    expect(r.skipped).toBe(1);
    expect(r.rows[0]).toMatchObject({ term: "wallbox installation frankfurt", campaign: "Search DE", adgroup: "Wallbox", impressions: 420, clicks: 38, cost: 61.2, conversions: 4 });
  });
  it("reads German column names and number formats", () => {
    const r = parseSearchTermsCsv('Suchbegriff,Kampagne,Anzeigengruppe,Impr.,Klicks,Kosten,Conversions\nwallbox kosten,K,A,"1.200",14,"23,50","1,00"\nGesamt: Konto,,,"1.200",14,"23,50","1,00"\n');
    expect(r.rows).toEqual([{ term: "wallbox kosten", campaign: "K", adgroup: "A", impressions: 1200, clicks: 14, cost: 23.5, conversions: 1 }]);
  });
  it("fails clearly on the wrong report", () => {
    expect(parseSearchTermsCsv("Day,Campaign,Cost\n2026-11-01,A,5\n").error).toMatch(/Search term/);
    expect(parseSearchTermsCsv("Search term,Impr.\nx,5\n").error).toMatch(/clicks, cost/);
  });
  it("classifies terms by fixed rules", () => {
    const t = (clicks: number, cost: number, conversions: number) => ({ term: "x", campaign: "", adgroup: "", impressions: 100, clicks, cost, conversions });
    expect(classifyTerm(t(30, 50, 2), 40)).toBe("add");
    expect(classifyTerm(t(30, 90, 1), 40)).toBe("none"); // converted once: not waste, not yet proven
    expect(classifyTerm(t(31, 40, 0), 40)).toBe("exclude");
    expect(classifyTerm(t(12, 18, 0), 40)).toBe("review");
    expect(classifyTerm(t(4, 39, 0), 40)).toBe("none");
    expect(classifyTerm(t(10, 5, 0), null)).toBe("exclude");
    expect(classifyTerm(t(9, 500, 0), null)).toBe("review");
  });
  it("replaces the previous report and totals the flagged cost", () => {
    const id = createClient({ name: "Terms GmbH", industry: "", website: "", language: "de", currency: "EUR", channel: "google", daily_budget: null, target_cpl: 40, meta_ad_account_id: "" });
    replaceSearchTerms(id, parseSearchTermsCsv(sample).rows);
    replaceSearchTerms(id, parseSearchTermsCsv(sample).rows);
    const { rows } = getSearchTerms(id);
    expect(rows).toHaveLength(7);
    expect(rows[0].term).toBe("wallbox installation frankfurt"); // highest cost first
    const s = termsSummary(rows, 40);
    expect(s.cost).toBeCloseTo(205.3);
    expect(s.conversions).toBe(7);
    expect(s.judged.filter((r) => r.verdict === "exclude").map((r) => r.term)).toEqual(["wallbox selber installieren anleitung"]);
    expect(s.wasted).toBeCloseTo(47.9);
    expect(s.judged.filter((r) => r.verdict === "add").map((r) => r.term)).toEqual(["wallbox installation frankfurt", "wallbox installieren lassen kosten"]);
    // without a target, the report's own cost per conversion is the benchmark
    expect(termsSummary(rows, null)).toMatchObject({ benchmarkSource: "report" });
    expect(termsSummary(rows, null).benchmark).toBeCloseTo(205.3 / 7);
  });
});

describe("search agent", () => {
  beforeEach(() => {
    create.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });
  function setup() {
    const id = createClient({ name: `Such ${Math.random()}`, industry: "", website: "https://example.com/wallbox", language: "de", currency: "EUR", channel: "google", daily_budget: null, target_cpl: 40, meta_ad_account_id: "" });
    saveBrain(id, "offer", "Wir installieren Wallboxen für Hausbesitzer im Rhein-Main-Gebiet zum Festpreis.");
    saveBrain(id, "audience", "Hausbesitzer mit E-Auto im Rhein-Main-Gebiet, die eine Wallbox brauchen.");
    return getClient(id)!;
  }
  const modelGroup = { theme: "Wallbox", keywords: [{ text: "wallbox installation", match: "phrase" }, { text: "x", match: "weird" }], negative_keywords: ["gebraucht"], headlines: ["Wallbox Installation", "Wallbox Installation im Rhein-Main-Gebiet", "Termin anfragen"], descriptions: ["Eins.", "Zwei."], path1: "wallbox", path2: "" };

  it("stores proposals as drafts, keeps over-length text for the human, and sets the landing page", async () => {
    const c = setup();
    replaceSearchTerms(c.id, [{ term: "wallbox frankfurt", campaign: "", adgroup: "", impressions: 10, clicks: 5, cost: 9, conversions: 2 }]);
    create.mockResolvedValue({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "submit_ad_groups", input: { ad_groups: [modelGroup, modelGroup, modelGroup] } }] });
    expect((await generateAdGroups(c, 2)).count).toBe(2);

    const rows = db().prepare("SELECT * FROM search_adgroups WHERE client_id = ? ORDER BY id").all(c.id) as AdGroupRow[];
    expect(rows.map((r) => r.status)).toEqual(["draft", "draft"]);
    const content = rowToContent(rows[0]);
    expect(content.final_url).toBe("https://example.com/wallbox");
    expect(content.headlines).toContain("Wallbox Installation im Rhein-Main-Gebiet"); // not silently cut
    expect(content.keywords[1].match).toBe("phrase"); // unknown match type falls back
    expect(validateAdGroup(content, []).map((f) => f.message).join()).toMatch(/Headline too long \(41\/30\)/);

    const req = create.mock.calls[0][0];
    expect(req.messages[0].content).toContain("wallbox frankfurt"); // real search terms are passed as evidence
    expect(req.system).toContain("at most 30 characters");
  });

  it("lets the human edit and decide", async () => {
    const c = setup();
    create.mockResolvedValue({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "submit_ad_groups", input: { ad_groups: [modelGroup] } }] });
    await generateAdGroups(c, 1);
    const row = db().prepare("SELECT * FROM search_adgroups WHERE client_id = ?").get(c.id) as AdGroupRow;
    updateAdGroup(c.id, row.id, { ...rowToContent(row), headlines: ["Wallbox Installation", "Wallbox im Rhein-Main-Gebiet", "Termin anfragen"] });
    decideAdGroup(c.id, row.id, "approved", "");
    const after = db().prepare("SELECT * FROM search_adgroups WHERE id = ?").get(row.id) as AdGroupRow;
    expect(after.status).toBe("approved");
    expect(validateAdGroup(rowToContent(after), [])).toEqual([]);
    // another client's id cannot touch it
    decideAdGroup(c.id + 999, row.id, "rejected", "");
    expect((db().prepare("SELECT status FROM search_adgroups WHERE id = ?").get(row.id) as { status: string }).status).toBe("approved");
  });

  it("fails loudly on empty output", async () => {
    const c = setup();
    create.mockResolvedValue({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "submit_ad_groups", input: { ad_groups: [] } }] });
    await expect(generateAdGroups(c, 2)).rejects.toThrow(/no ad groups/);
  });
});
