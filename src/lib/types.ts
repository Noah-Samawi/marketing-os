export type Client = {
  id: number;
  name: string;
  slug: string;
  industry: string;
  website: string;
  language: string;
  currency: string;
  channel: string;
  goal_type: string;
  daily_budget: number | null;
  target_cpl: number | null;
  meta_ad_account_id: string;
  is_demo: number;
  created_at: string;
};

export type MetricRow = {
  date: string;
  platform: string;
  campaign: string;
  adset: string;
  ad: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  revenue: number;
};

export type Totals = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  revenue: number;
};

/** Ratios are null when the denominator is zero: "no data" is not "0". */
export type Kpis = Totals & {
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cvr: number | null;
  cpl: number | null;
  roas: number | null;
};

export type AdKpis = Kpis & { platform: string; campaign: string; adset: string; ad: string };

export type RecommendationAction = "pause" | "scale" | "refresh_creative" | "keep" | "wait";

export type Recommendation = {
  ad: string;
  campaign: string;
  adset: string;
  action: RecommendationAction;
  reason: string;
};

export type Creative = {
  id: number;
  client_id: number;
  batch_id: string;
  angle: string;
  hook: string;
  primary_text: string;
  headline: string;
  description: string;
  cta: string;
  visual_concept: string;
  format: string;
  status: "draft" | "approved" | "rejected";
  flags_json: string;
  note: string;
  source: string;
  created_at: string;
  decided_at: string | null;
};

export type Report = {
  id: number;
  client_id: number;
  period_start: string;
  period_end: string;
  kpis_json: string;
  recommendations_json: string;
  narrative: string;
  source: "rules" | "llm";
  created_at: string;
};
