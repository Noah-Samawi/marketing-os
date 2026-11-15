import crypto from "node:crypto";
import { getBrain } from "../brain";
import { db, logActivity, transaction } from "../db";
import { completeStructured } from "../llm";
import { normalize, RSA, type AdGroupContent } from "../search";
import { getSearchTerms, termsSummary } from "../searchTerms";
import type { Client } from "../types";
import { creativeBlocker } from "./creative";

const SYSTEM = `You plan Google Search campaigns for a small or medium-sized business. A human reviews everything before it is uploaded.

For each ad group you deliver keywords, negative keywords and the text assets of one responsive search ad.

Hard format rules (Google rejects anything else):
- Each headline has at most ${RSA.headlineMax} characters including spaces. Count carefully. German compound words are long: prefer short words.
- Each description has at most ${RSA.descriptionMax} characters including spaces.
- path1 and path2: at most ${RSA.pathMax} characters each, no spaces.
- No exclamation marks in headlines. No ALL CAPS words. No phone numbers in the text.
- 8 to 12 headlines and 3 to 4 descriptions per ad group. Every headline must make sense alone and next to any other headline.

Content rules:
- One ad group is one search intent. Do not mix intents.
- 5 to 12 keywords per ad group, written the way people actually search. Use mostly "phrase" and "exact" match; "broad" only when clearly sensible.
- Keywords and negatives are your hypotheses. You have no search volume data. Do not claim otherwise.
- Negative keywords: terms that signal the wrong intent (jobs, training, free, DIY, unrelated meanings) for this offer.
- Put the main keyword in at least three headlines. Other headlines carry benefits, proof, and a call to action.
- Use a city or region only if the knowledge names it.
- Work only from the client knowledge you are given. Never invent facts, prices, numbers, awards, ratings or testimonials. No claim without proof in the knowledge.
- Follow the brand rules, including forbidden words and tone. No guarantees, no superlatives without proof, no fake urgency.`;

const SCHEMA = {
  properties: {
    ad_groups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          theme: { type: "string", description: "The search intent in a few words; used as ad group name" },
          keywords: {
            type: "array",
            items: { type: "object", properties: { text: { type: "string" }, match: { type: "string", enum: ["broad", "phrase", "exact"] } }, required: ["text", "match"] },
          },
          negative_keywords: { type: "array", items: { type: "string" } },
          headlines: { type: "array", items: { type: "string" } },
          descriptions: { type: "array", items: { type: "string" } },
          path1: { type: "string" },
          path2: { type: "string" },
        },
        required: ["theme", "keywords", "negative_keywords", "headlines", "descriptions", "path1", "path2"],
      },
    },
  },
  required: ["ad_groups"],
};

type ModelGroup = { theme: string; keywords: AdGroupContent["keywords"]; negative_keywords: string[]; headlines: string[]; descriptions: string[]; path1: string; path2: string };

export function saveAdGroups(client: Client, groups: AdGroupContent[], source: "llm" | "demo" | "manual"): string {
  const batch = crypto.randomUUID().slice(0, 8);
  const stmt = db().prepare(
    `INSERT INTO search_adgroups (client_id, batch_id, theme, keywords_json, negatives_json, headlines_json, descriptions_json, path1, path2, final_url, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  transaction(() => {
    for (const raw of groups) {
      const g = normalize(raw);
      stmt.run(client.id, batch, g.theme, JSON.stringify(g.keywords), JSON.stringify(g.negatives), JSON.stringify(g.headlines), JSON.stringify(g.descriptions), g.path1, g.path2, g.final_url, source);
    }
  });
  return batch;
}

export function updateAdGroup(clientId: number, id: number, content: AdGroupContent): void {
  const g = normalize(content);
  const res = db()
    .prepare(
      `UPDATE search_adgroups SET theme = ?, keywords_json = ?, negatives_json = ?, headlines_json = ?, descriptions_json = ?, path1 = ?, path2 = ?, final_url = ?
       WHERE id = ? AND client_id = ?`,
    )
    .run(g.theme, JSON.stringify(g.keywords), JSON.stringify(g.negatives), JSON.stringify(g.headlines), JSON.stringify(g.descriptions), g.path1, g.path2, g.final_url, id, clientId);
  // Only log what actually happened: an id from another client changes nothing.
  if (res.changes > 0) logActivity(clientId, "human", "search_adgroup_edited", `#${id}`);
}

export function decideAdGroup(clientId: number, id: number, status: "approved" | "rejected" | "draft", note: string): void {
  const res = db()
    .prepare("UPDATE search_adgroups SET status = ?, note = ?, decided_at = CASE WHEN ? = 'draft' THEN NULL ELSE datetime('now') END WHERE id = ? AND client_id = ?")
    .run(status, note, status, id, clientId);
  if (res.changes > 0) logActivity(clientId, "human", `search_adgroup_${status}`, `#${id}${note ? `: ${note}` : ""}`);
}

export async function generateAdGroups(client: Client, count = 2, brief = ""): Promise<{ batch: string; count: number }> {
  const blocker = creativeBlocker(client.id);
  if (blocker) throw new Error(blocker);

  const brain = getBrain(client.id);
  const terms = termsSummary(getSearchTerms(client.id).rows, client.target_cpl).judged;
  const evidence = {
    note: "From the client's own search terms report, if one was imported. This is real data; everything else about search behaviour is your hypothesis.",
    converting_terms: terms.filter((t) => t.conversions > 0).slice(0, 15).map((t) => ({ term: t.term, conversions: t.conversions, cost: t.cost })),
    costly_terms_without_conversion: terms.filter((t) => t.verdict === "exclude").slice(0, 15).map((t) => ({ term: t.term, cost: t.cost, clicks: t.clicks })),
  };
  const previous = db()
    .prepare("SELECT theme, status, note FROM search_adgroups WHERE client_id = ? AND status != 'draft' ORDER BY id DESC LIMIT 10")
    .all(client.id) as { theme: string; status: string; note: string }[];

  const lang = client.language === "de" ? "German" : client.language === "ar" ? "Arabic" : "English";
  const user = [
    `Propose ${count} ad group(s) in ${lang}.`,
    brief ? `Extra brief from the reviewer: ${brief}` : "",
    `# Client\n${client.name} (${client.industry || "industry not given"}), landing page: ${client.website || "not given"}`,
    `# Offer\n${brain.offer}`,
    `# Audience\n${brain.audience}`,
    `# Customer voice\n${brain.customer_voice || "(empty)"}`,
    `# Brand rules\n${brain.brand_rules || "(empty)"}`,
    `# Competitors\n${brain.competitors || "(empty)"}`,
    `# Search terms evidence\n${JSON.stringify(evidence)}`,
    `# Earlier decisions by the reviewer (notes say why)\n${JSON.stringify(previous)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await completeStructured<{ ad_groups: ModelGroup[] }>({
    system: SYSTEM,
    user,
    toolName: "submit_ad_groups",
    toolDescription: "Submit the proposed ad groups for human review.",
    schema: SCHEMA,
    maxTokens: 6000,
  });
  const groups = (result.ad_groups ?? []).slice(0, count).map<AdGroupContent>((g) => ({
    theme: g.theme,
    keywords: g.keywords ?? [],
    negatives: g.negative_keywords ?? [],
    headlines: g.headlines ?? [],
    descriptions: g.descriptions ?? [],
    path1: g.path1 ?? "",
    path2: g.path2 ?? "",
    final_url: client.website,
  }));
  if (!groups.length) throw new Error("The model returned no ad groups.");
  const batch = saveAdGroups(client, groups, "llm");
  logActivity(client.id, "agent", "search_adgroups_generated", `${groups.length} ad group(s), batch ${batch}`);
  return { batch, count: groups.length };
}
