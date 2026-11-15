import crypto from "node:crypto";
import { forbiddenTerms, getBrain, isFilled } from "../brain";
import { checkCopy } from "../compliance";
import { db, logActivity, transaction } from "../db";
import { byAd, latestPeriod } from "../kpi";
import { completeStructured, llmConfigured } from "../llm";
import type { Client } from "../types";

export type Draft = {
  angle: string;
  hook: string;
  primary_text: string;
  headline: string;
  description: string;
  cta: string;
  visual_concept: string;
  format: string;
};

const SYSTEM = `You write paid social and search ad drafts for a small or medium-sized business. A human reviews every draft before anything goes live.

Rules:
- Work only from the client knowledge you are given. Never invent facts, numbers, prices, testimonials, awards or client names.
- If the knowledge has no proof for a claim, do not make the claim.
- Follow the brand rules exactly, including forbidden words and tone.
- No guarantees, no superlatives without proof, no fake urgency, no health or income promises.
- Do not address personal attributes of the reader (health, finances, origin, religion) directly.
- Each draft uses a different angle (pain, outcome, objection, proof, comparison, question).
- Build angles from the customer's own words and from gaps in what competitors say.
- Headline at most 40 characters. Primary text 2 to 5 short sentences. Hook is the first line and must work alone.
- visual_concept describes an image or short video a designer or image tool could produce. No real people's likenesses, no competitor logos.`;

const SCHEMA = {
  properties: {
    drafts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          angle: { type: "string", description: "The strategic angle in a few words" },
          hook: { type: "string" },
          primary_text: { type: "string" },
          headline: { type: "string" },
          description: { type: "string", description: "Short link description" },
          cta: { type: "string", description: "Button label, e.g. 'Termin buchen'" },
          visual_concept: { type: "string" },
          format: { type: "string", enum: ["static", "video", "carousel"] },
        },
        required: ["angle", "hook", "primary_text", "headline", "description", "cta", "visual_concept", "format"],
      },
    },
  },
  required: ["drafts"],
};

/** Why generation cannot run yet, or null when it can. */
export function creativeBlocker(clientId: number): string | null {
  if (!llmConfigured()) return "ANTHROPIC_API_KEY is not set. Add it to .env.local to enable draft generation.";
  const brain = getBrain(clientId);
  const missing = (["offer", "audience"] as const).filter((k) => !isFilled(k, brain[k]));
  if (missing.length) return `Fill in the knowledge base first: ${missing.join(", ")}. Drafts written without it would be guesses.`;
  return null;
}

export function saveDrafts(client: Client, drafts: Draft[], source: "llm" | "demo" | "manual"): string {
  const forbidden = forbiddenTerms(getBrain(client.id).brand_rules);
  const batch = crypto.randomUUID().slice(0, 8);
  const stmt = db().prepare(
    `INSERT INTO creatives (client_id, batch_id, angle, hook, primary_text, headline, description, cta, visual_concept, format, flags_json, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  transaction(() => {
    for (const d of drafts) {
      const flags = checkCopy(d, forbidden);
      stmt.run(client.id, batch, d.angle ?? "", d.hook ?? "", d.primary_text ?? "", d.headline ?? "", d.description ?? "", d.cta ?? "", d.visual_concept ?? "", d.format ?? "static", JSON.stringify(flags), source);
    }
  });
  return batch;
}

export async function generateCreatives(client: Client, count = 5, brief = ""): Promise<{ batch: string; count: number }> {
  const blocker = creativeBlocker(client.id);
  if (blocker) throw new Error(blocker);

  const brain = getBrain(client.id);
  const p = latestPeriod(client.id, 14);
  const ads = p ? byAd(client.id, p.current) : [];
  const withLeads = ads.filter((a) => a.leads > 0 && a.cpl !== null).sort((a, b) => a.cpl! - b.cpl!);
  const performance = {
    note: "Ad names with results from the last 14 days. Names are all you know about them; do not assume their copy.",
    best_by_cpl: withLeads.slice(0, 3).map((a) => ({ ad: a.ad, cpl: a.cpl, leads: a.leads, ctr: a.ctr })),
    spent_without_leads: ads.filter((a) => a.leads === 0 && a.spend > 0).slice(0, 3).map((a) => ({ ad: a.ad, spend: a.spend, ctr: a.ctr })),
  };
  const approved = db()
    .prepare("SELECT angle, hook FROM creatives WHERE client_id = ? AND status = 'approved' ORDER BY id DESC LIMIT 8")
    .all(client.id) as { angle: string; hook: string }[];
  const rejected = db()
    .prepare("SELECT angle, hook, note FROM creatives WHERE client_id = ? AND status = 'rejected' ORDER BY id DESC LIMIT 8")
    .all(client.id) as { angle: string; hook: string; note: string }[];

  const lang = client.language === "de" ? "German" : client.language === "ar" ? "Arabic" : "English";
  const user = [
    `Write ${count} ad drafts in ${lang} for the channel "${client.channel}".`,
    brief ? `Extra brief from the reviewer: ${brief}` : "",
    `# Client\n${client.name} (${client.industry || "industry not given"}), website: ${client.website || "not given"}`,
    `# Offer\n${brain.offer}`,
    `# Audience\n${brain.audience}`,
    `# Customer voice\n${brain.customer_voice || "(empty)"}`,
    `# Brand rules\n${brain.brand_rules || "(empty)"}`,
    `# Competitors\n${brain.competitors || "(empty)"}`,
    `# Performance\n${JSON.stringify(performance)}`,
    `# Previously approved by the reviewer (do more in this spirit, do not repeat)\n${JSON.stringify(approved)}`,
    `# Previously rejected by the reviewer (avoid these directions; notes say why)\n${JSON.stringify(rejected)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await completeStructured<{ drafts: Draft[] }>({
    system: SYSTEM,
    user,
    toolName: "submit_ad_drafts",
    toolDescription: "Submit the finished ad drafts for human review.",
    schema: SCHEMA,
  });
  const drafts = (result.drafts ?? []).slice(0, count);
  if (!drafts.length) throw new Error("The model returned no drafts.");
  const batch = saveDrafts(client, drafts, "llm");
  logActivity(client.id, "agent", "creatives_generated", `${drafts.length} drafts, batch ${batch}`);
  return { batch, count: drafts.length };
}

export function decideCreative(clientId: number, creativeId: number, status: "approved" | "rejected" | "draft", note: string): void {
  db()
    .prepare("UPDATE creatives SET status = ?, note = ?, decided_at = CASE WHEN ? = 'draft' THEN NULL ELSE datetime('now') END WHERE id = ? AND client_id = ?")
    .run(status, note, status, creativeId, clientId);
  logActivity(clientId, "human", `creative_${status}`, `#${creativeId}${note ? `: ${note}` : ""}`);
}
