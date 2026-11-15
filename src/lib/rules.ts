import { money, pct } from "./format";
import type { AdKpis, Recommendation } from "./types";

/**
 * Deterministic recommendations. The LLM never decides what to pause or scale:
 * it only explains these results. Thresholds live here so they can be reviewed.
 */
export const THRESHOLDS = {
  /** Spend without a single lead, as a multiple of the CPL benchmark, before pausing. */
  noLeadSpendMultiple: 2,
  /** CPL this far above the benchmark (with enough leads to trust it) means pause. */
  expensiveMultiple: 1.5,
  expensiveMinLeads: 2,
  /** CPL this far below the benchmark (with enough leads) means scale. */
  cheapMultiple: 0.8,
  cheapMinLeads: 3,
  scaleStep: 0.2,
  /** Link CTR below this, after enough impressions, means the creative is not stopping people. */
  lowCtr: 0.005,
  lowCtrMinImpressions: 2000,
  /** Below this many impressions nothing can be judged yet. */
  minImpressions: 1000,
};

type Opts = { targetCpl: number | null; accountCpl: number | null; currency: string; lang: string };

const T = {
  de: {
    noLead: (s: string, b: string) => `${s} ausgegeben, kein Lead. Das ist mindestens das ${THRESHOLDS.noLeadSpendMultiple}-Fache des CPL-Richtwerts (${b}).`,
    expensive: (c: string, b: string) => `CPL ${c} liegt deutlich über dem Richtwert ${b}.`,
    cheap: (c: string, b: string, n: string) => `CPL ${c} liegt unter dem Richtwert ${b} bei ${n} Leads. Budget schrittweise um ${THRESHOLDS.scaleStep * 100} % erhöhen.`,
    lowCtr: (c: string) => `CTR ${c} ist niedrig. Neuer Hook oder neues Motiv testen.`,
    wait: "Zu wenig Daten für eine Entscheidung. Weiterlaufen lassen.",
    keep: "Im erwarteten Bereich. Weiterlaufen lassen.",
    noBenchmark: "Kein CPL-Richtwert vorhanden (kein Ziel-CPL, noch keine Leads). Nur CTR bewertet.",
  },
  en: {
    noLead: (s: string, b: string) => `${s} spent, no lead. That is at least ${THRESHOLDS.noLeadSpendMultiple}x the CPL benchmark (${b}).`,
    expensive: (c: string, b: string) => `CPL ${c} is well above the benchmark ${b}.`,
    cheap: (c: string, b: string, n: string) => `CPL ${c} is below the benchmark ${b} with ${n} leads. Raise budget in steps of ${THRESHOLDS.scaleStep * 100}%.`,
    lowCtr: (c: string) => `CTR ${c} is low. Test a new hook or visual.`,
    wait: "Not enough data to decide. Keep running.",
    keep: "Within the expected range. Keep running.",
    noBenchmark: "No CPL benchmark (no target CPL, no leads yet). Only CTR was assessed.",
  },
};

export function recommend(ads: AdKpis[], opts: Opts): Recommendation[] {
  const t = opts.lang === "de" ? T.de : T.en;
  const benchmark = opts.targetCpl ?? opts.accountCpl;
  const m = (v: number | null) => money(v, opts.currency, opts.lang);
  const out: Recommendation[] = [];

  for (const a of ads) {
    if (a.spend <= 0 && a.impressions <= 0) continue;
    const base = { ad: a.ad || a.adset || a.campaign, campaign: a.campaign, adset: a.adset };
    const lowCtr = a.impressions >= THRESHOLDS.lowCtrMinImpressions && a.ctr !== null && a.ctr < THRESHOLDS.lowCtr;

    if (benchmark !== null && a.leads === 0 && a.spend >= THRESHOLDS.noLeadSpendMultiple * benchmark) {
      out.push({ ...base, action: "pause", reason: t.noLead(m(a.spend), m(benchmark)) });
    } else if (benchmark !== null && a.cpl !== null && a.leads >= THRESHOLDS.expensiveMinLeads && a.cpl >= THRESHOLDS.expensiveMultiple * benchmark) {
      out.push({ ...base, action: "pause", reason: t.expensive(m(a.cpl), m(benchmark)) });
    } else if (benchmark !== null && a.cpl !== null && a.leads >= THRESHOLDS.cheapMinLeads && a.cpl <= THRESHOLDS.cheapMultiple * benchmark) {
      out.push({ ...base, action: "scale", reason: t.cheap(m(a.cpl), m(benchmark), String(Math.round(a.leads))) });
    } else if (lowCtr) {
      out.push({ ...base, action: "refresh_creative", reason: t.lowCtr(pct(a.ctr, opts.lang)) });
    } else if (a.impressions < THRESHOLDS.minImpressions) {
      out.push({ ...base, action: "wait", reason: t.wait });
    } else {
      out.push({ ...base, action: "keep", reason: benchmark === null ? t.noBenchmark : t.keep });
    }
  }
  return out;
}
