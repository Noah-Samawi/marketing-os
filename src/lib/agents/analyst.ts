import { getBrain } from "../brain";
import { db, logActivity } from "../db";
import { money, pct, int, signedPct } from "../format";
import { byAd, change, latestPeriod, totals, type Period } from "../kpi";
import { completeText, llmConfigured } from "../llm";
import { recommend } from "../rules";
import type { AdKpis, Client, Kpis, Recommendation } from "../types";

export type ReportData = {
  period: Period;
  previous: Period;
  current: Kpis;
  prior: Kpis;
  ads: AdKpis[];
  recommendations: Recommendation[];
  benchmarkCpl: number | null;
  benchmarkSource: "target" | "account" | "none";
};

/** All numbers in a report come from here. The LLM receives them and may not add its own. */
export function buildReportData(client: Client): ReportData | null {
  const p = latestPeriod(client.id);
  if (!p) return null;
  const current = totals(client.id, p.current);
  const prior = totals(client.id, p.previous);
  const ads = byAd(client.id, p.current);
  const recommendations = recommend(ads, { targetCpl: client.target_cpl, accountCpl: current.cpl, currency: client.currency, lang: client.language });
  return {
    period: p.current,
    previous: p.previous,
    current,
    prior,
    ads,
    recommendations,
    benchmarkCpl: client.target_cpl ?? current.cpl,
    benchmarkSource: client.target_cpl !== null ? "target" : current.cpl !== null ? "account" : "none",
  };
}

const ACTION_LABEL: Record<string, Record<Recommendation["action"], string>> = {
  de: { pause: "Pausieren", scale: "Skalieren", refresh_creative: "Neues Creative", keep: "Laufen lassen", wait: "Abwarten" },
  en: { pause: "Pause", scale: "Scale", refresh_creative: "New creative", keep: "Keep", wait: "Wait" },
};
export const actionLabel = (a: Recommendation["action"], lang: string) => (ACTION_LABEL[lang] ?? ACTION_LABEL.en)[a];

export function rulesNarrative(client: Client, d: ReportData): string {
  const de = client.language === "de";
  const m = (v: number | null) => money(v, client.currency, client.language);
  const delta = (c: number | null, p: number | null) => {
    const s = signedPct(change(c, p), client.language);
    return s ? ` (${s} ${de ? "zur Vorwoche" : "vs. previous week"})` : "";
  };
  const lines: string[] = [];
  lines.push(
    de
      ? `Zeitraum ${d.period.start} bis ${d.period.end}. Ausgaben ${m(d.current.spend)}${delta(d.current.spend, d.prior.spend)}, ${int(d.current.leads, "de")} Leads${delta(d.current.leads, d.prior.leads)}, CPL ${m(d.current.cpl)}${delta(d.current.cpl, d.prior.cpl)}, CTR ${pct(d.current.ctr, "de")}.`
      : `Period ${d.period.start} to ${d.period.end}. Spend ${m(d.current.spend)}${delta(d.current.spend, d.prior.spend)}, ${int(d.current.leads, "en")} leads${delta(d.current.leads, d.prior.leads)}, CPL ${m(d.current.cpl)}${delta(d.current.cpl, d.prior.cpl)}, CTR ${pct(d.current.ctr, "en")}.`,
  );
  const act = d.recommendations.filter((r) => r.action !== "keep" && r.action !== "wait");
  if (act.length) {
    lines.push("");
    lines.push(de ? "Empfohlene Maßnahmen:" : "Recommended actions:");
    for (const r of act) lines.push(`- ${actionLabel(r.action, client.language)} – „${r.ad}“: ${r.reason}`);
  } else {
    lines.push("");
    lines.push(de ? "Keine Maßnahme nötig. Alle Anzeigen laufen im erwarteten Bereich oder haben noch zu wenig Daten." : "No action needed. All ads are within range or still lack data.");
  }
  lines.push("");
  lines.push(
    de
      ? "Hinweis: Regelbasierter Bericht ohne KI-Text. Bei wenigen Leads pro Anzeige sind die Zahlen unsicher."
      : "Note: rule-based report without AI text. With few leads per ad the figures are uncertain.",
  );
  return lines.join("\n");
}

const SYSTEM = `You are a performance marketing analyst writing a weekly report for the person who decides what goes live.

Rules:
- Use only the figures in the data you are given. Never compute, estimate or invent other figures.
- The recommended actions are fixed. They were produced by deterministic rules. Explain them; do not change, add or remove actions.
- Say plainly when a number rests on very few leads or impressions.
- No hype, no filler. Short sentences. Plain text only: no markdown tables, no bold, no headings with #.
- Structure: (1) Summary in 2 sentences. (2) What worked. (3) What did not. (4) Actions for this week, one line each. (5) Up to 3 questions the human should answer.
- At most 250 words.`;

export async function generateReport(client: Client): Promise<{ id: number; source: "rules" | "llm"; llmError?: string } | null> {
  const data = buildReportData(client);
  if (!data) return null;

  let narrative = rulesNarrative(client, data);
  let source: "rules" | "llm" = "rules";
  let llmError: string | undefined;

  if (llmConfigured()) {
    try {
      const brain = getBrain(client.id);
      const payload = {
        client: { name: client.name, goal: client.goal_type, currency: client.currency, target_cpl: client.target_cpl },
        offer: brain.offer.slice(0, 1500),
        period: data.period,
        previous_period: data.previous,
        totals_current: data.current,
        totals_previous: data.prior,
        cpl_benchmark: { value: data.benchmarkCpl, source: data.benchmarkSource },
        ads: data.ads,
        fixed_recommendations: data.recommendations,
      };
      const lang = client.language === "de" ? "German" : client.language === "ar" ? "Arabic" : "English";
      narrative = await completeText(SYSTEM, `Write the report in ${lang}.\n\nData (JSON):\n${JSON.stringify(payload, null, 1)}`);
      source = "llm";
    } catch (e) {
      // The numbers and recommendations are still valid, so the report is saved with the rule-based text.
      llmError = e instanceof Error ? e.message : String(e);
    }
  }

  const res = db()
    .prepare("INSERT INTO reports (client_id, period_start, period_end, kpis_json, recommendations_json, narrative, source) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(client.id, data.period.start, data.period.end, JSON.stringify({ current: data.current, prior: data.prior, ads: data.ads, benchmarkCpl: data.benchmarkCpl, benchmarkSource: data.benchmarkSource }), JSON.stringify(data.recommendations), narrative, source);
  logActivity(client.id, "agent", "report_generated", `${data.period.start}..${data.period.end} (${source})`);
  return { id: Number(res.lastInsertRowid), source, llmError };
}
