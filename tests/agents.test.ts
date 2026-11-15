import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DB_PATH = ":memory:";

// The real API is replaced: these tests check our handling around the model call,
// not the quality of what a model writes.
const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

import { generateReport } from "../src/lib/agents/analyst";
import { creativeBlocker, generateCreatives } from "../src/lib/agents/creative";
import { saveBrain } from "../src/lib/brain";
import { createClient, getClient } from "../src/lib/clients";
import { db } from "../src/lib/db";
import { upsertMetrics } from "../src/lib/metrics";

const draft = (hook: string) => ({ angle: "Einwand", hook, primary_text: "Text.", headline: "Kurz", description: "", cta: "Termin", visual_concept: "Foto", format: "static" });

function setup() {
  const id = createClient({ name: `Kunde ${Math.random()}`, industry: "", website: "", language: "de", currency: "EUR", channel: "meta", daily_budget: null, target_cpl: 40, meta_ad_account_id: "" });
  upsertMetrics(id, [{ date: "2026-11-07", platform: "meta", campaign: "C", adset: "S", ad: "A", spend: 90, impressions: 6000, clicks: 60, leads: 0, revenue: 0 }]);
  return getClient(id)!;
}

beforeEach(() => {
  create.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("creative agent", () => {
  it("refuses to run without a key or without offer and audience", () => {
    const c = setup();
    expect(creativeBlocker(c.id)).toMatch(/offer, audience/);
    delete process.env.ANTHROPIC_API_KEY;
    expect(creativeBlocker(c.id)).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("stores drafts as 'draft', flags risky copy, and sends the knowledge base to the model", async () => {
    const c = setup();
    saveBrain(c.id, "offer", "Wir installieren Wallboxen für Hausbesitzer im Rhein-Main-Gebiet zum Festpreis.");
    saveBrain(c.id, "audience", "Hausbesitzer mit E-Auto im Rhein-Main-Gebiet, die eine Wallbox brauchen.");
    saveBrain(c.id, "brand_rules", "## Verbotene Wörter\n- billig");
    create.mockResolvedValue({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "submit_ad_drafts", input: { drafts: [draft("Reicht Ihr Anschluss?"), draft("Garantiert billig"), draft("Dritter")] } }] });

    const res = await generateCreatives(c, 2);
    expect(res.count).toBe(2); // never more than asked for

    const rows = db().prepare("SELECT hook, status, flags_json, source FROM creatives WHERE client_id = ? ORDER BY id").all(c.id) as { hook: string; status: string; flags_json: string; source: string }[];
    expect(rows.map((r) => r.status)).toEqual(["draft", "draft"]);
    expect(JSON.parse(rows[0].flags_json)).toEqual([]);
    expect(rows[1].flags_json).toMatch(/forbidden term/);

    const req = create.mock.calls[0][0];
    expect(req.tool_choice).toEqual({ type: "tool", name: "submit_ad_drafts" });
    expect(req.messages[0].content).toContain("Wallboxen");
    expect(req.messages[0].content).toContain("billig");
  });

  it("fails loudly when the model output is cut off or empty", async () => {
    const c = setup();
    saveBrain(c.id, "offer", "Wir installieren Wallboxen für Hausbesitzer im Rhein-Main-Gebiet zum Festpreis.");
    saveBrain(c.id, "audience", "Hausbesitzer mit E-Auto im Rhein-Main-Gebiet, die eine Wallbox brauchen.");
    create.mockResolvedValue({ stop_reason: "max_tokens", content: [{ type: "tool_use", name: "submit_ad_drafts", input: { drafts: [] } }] });
    await expect(generateCreatives(c, 5)).rejects.toThrow(/cut off/);
    create.mockResolvedValue({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "submit_ad_drafts", input: { drafts: [] } }] });
    await expect(generateCreatives(c, 5)).rejects.toThrow(/no drafts/);
    expect((db().prepare("SELECT COUNT(*) AS n FROM creatives WHERE client_id = ?").get(c.id) as { n: number }).n).toBe(0);
  });
});

describe("analyst agent", () => {
  it("uses the model text but keeps the rule-based recommendations", async () => {
    const c = setup();
    create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "KI-Bericht." }] });
    const res = await generateReport(c);
    const row = db().prepare("SELECT narrative, source, recommendations_json FROM reports WHERE id = ?").get(res!.id) as { narrative: string; source: string; recommendations_json: string };
    expect(row).toMatchObject({ narrative: "KI-Bericht.", source: "llm" });
    expect(JSON.parse(row.recommendations_json)[0]).toMatchObject({ ad: "A", action: "pause" });
    expect(create.mock.calls[0][0].messages[0].content).toContain("fixed_recommendations");
  });

  it("falls back to the rule-based text when the model call fails", async () => {
    const c = setup();
    create.mockRejectedValue(new Error("401 invalid x-api-key"));
    const res = await generateReport(c);
    expect(res).toMatchObject({ source: "rules", llmError: "401 invalid x-api-key" });
    const row = db().prepare("SELECT narrative FROM reports WHERE id = ?").get(res!.id) as { narrative: string };
    expect(row.narrative).toMatch(/Pausieren/);
  });

  it("returns null when the client has no data", async () => {
    const id = createClient({ name: "Leer", industry: "", website: "", language: "de", currency: "EUR", channel: "meta", daily_budget: null, target_cpl: null, meta_ad_account_id: "" });
    expect(await generateReport(getClient(id)!)).toBeNull();
  });
});
