import { checkCopy, type Flag } from "./compliance";

/** Google responsive search ad limits (Google Ads Help, checked November 2026). */
export const RSA = { headlineMax: 30, descriptionMax: 90, pathMax: 15, minHeadlines: 3, maxHeadlines: 15, minDescriptions: 2, maxDescriptions: 4 };

export type Match = "broad" | "phrase" | "exact";
export type Keyword = { text: string; match: Match };

export type AdGroupContent = {
  theme: string;
  keywords: Keyword[];
  negatives: string[];
  headlines: string[];
  descriptions: string[];
  path1: string;
  path2: string;
  final_url: string;
};

export type AdGroupRow = {
  id: number;
  client_id: number;
  batch_id: string;
  theme: string;
  keywords_json: string;
  negatives_json: string;
  headlines_json: string;
  descriptions_json: string;
  path1: string;
  path2: string;
  final_url: string;
  status: "draft" | "approved" | "rejected";
  note: string;
  source: string;
  created_at: string;
  decided_at: string | null;
};

export function rowToContent(r: AdGroupRow): AdGroupContent {
  return {
    theme: r.theme,
    keywords: JSON.parse(r.keywords_json),
    negatives: JSON.parse(r.negatives_json),
    headlines: JSON.parse(r.headlines_json),
    descriptions: JSON.parse(r.descriptions_json),
    path1: r.path1,
    path2: r.path2,
    final_url: r.final_url,
  };
}

/** Google's own notation: [exact], "phrase", plain text = broad. */
export function formatKeyword(k: Keyword): string {
  return k.match === "exact" ? `[${k.text}]` : k.match === "phrase" ? `"${k.text}"` : k.text;
}

export function parseKeyword(line: string): Keyword | null {
  const s = line.trim();
  if (!s) return null;
  let m = s.match(/^\[(.+)\]$/);
  if (m) return clean(m[1], "exact");
  m = s.match(/^["“„”](.+)["“”]$/);
  if (m) return clean(m[1], "phrase");
  return clean(s, "broad");
}

function clean(text: string, match: Match): Keyword | null {
  const t = text.replace(/\s+/g, " ").trim();
  return t ? { text: t, match } : null;
}

export const lines = (text: string): string[] => text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

/** Trim, drop empties and exact repeats. Never shortens text: over-length lines are flagged for the human. */
export function normalize(c: AdGroupContent): AdGroupContent {
  const uniq = (xs: string[]) => [...new Map(xs.map((x) => [x.toLowerCase(), x])).values()];
  const seen = new Set<string>();
  const keywords = c.keywords
    .map((k) => clean(k.text ?? "", (["broad", "phrase", "exact"] as const).includes(k.match) ? k.match : "phrase"))
    .filter((k): k is Keyword => {
      if (!k) return false;
      const key = `${k.match}:${k.text.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return {
    theme: (c.theme ?? "").trim(),
    keywords,
    negatives: uniq(lines((c.negatives ?? []).join("\n"))),
    headlines: uniq(lines((c.headlines ?? []).join("\n"))),
    descriptions: uniq(lines((c.descriptions ?? []).join("\n"))),
    path1: (c.path1 ?? "").trim().replace(/^\/+|\/+$/g, ""),
    path2: (c.path2 ?? "").trim().replace(/^\/+|\/+$/g, ""),
    final_url: (c.final_url ?? "").trim(),
  };
}

/** Checks a proposed ad group against Google's format limits and the brand rules. Hints, not clearance. */
export function validateAdGroup(c: AdGroupContent, forbidden: string[]): Flag[] {
  const flags: Flag[] = [];
  const warn = (message: string) => flags.push({ level: "warn", message });
  const info = (message: string) => flags.push({ level: "info", message });

  for (const h of c.headlines) if (h.length > RSA.headlineMax) warn(`Headline too long (${h.length}/${RSA.headlineMax}): "${h}"`);
  for (const d of c.descriptions) if (d.length > RSA.descriptionMax) warn(`Description too long (${d.length}/${RSA.descriptionMax}): "${d}"`);
  for (const [name, p] of [["Path 1", c.path1], ["Path 2", c.path2]] as const) {
    if (p.length > RSA.pathMax) warn(`${name} too long (${p.length}/${RSA.pathMax}): "${p}"`);
    if (/\s/.test(p)) warn(`${name} must not contain spaces: "${p}"`);
  }
  const okHeadlines = c.headlines.filter((h) => h.length <= RSA.headlineMax).length;
  const okDescriptions = c.descriptions.filter((d) => d.length <= RSA.descriptionMax).length;
  if (okHeadlines < RSA.minHeadlines) warn(`Only ${okHeadlines} usable headline(s). Google needs at least ${RSA.minHeadlines}.`);
  if (okDescriptions < RSA.minDescriptions) warn(`Only ${okDescriptions} usable description(s). Google needs at least ${RSA.minDescriptions}.`);
  if (c.headlines.length > RSA.maxHeadlines) info(`${c.headlines.length} headlines: Google takes at most ${RSA.maxHeadlines}.`);
  if (c.descriptions.length > RSA.maxDescriptions) info(`${c.descriptions.length} descriptions: Google takes at most ${RSA.maxDescriptions}.`);
  if (c.headlines.some((h) => h.includes("!"))) info("Exclamation mark in a headline: Google's editorial rules usually reject this.");
  if (!c.keywords.length) warn("No keywords.");
  if (!c.final_url) info("No final URL yet. Set the landing page before upload.");

  const negs = new Set(c.negatives.map((n) => n.toLowerCase()));
  for (const k of c.keywords) if (negs.has(k.text.toLowerCase())) warn(`"${k.text}" is both a keyword and a negative keyword.`);

  // Reuse the claim checks; headline length is handled above with Google's limits.
  flags.push(...checkCopy({ hook: c.headlines.join("\n"), primary_text: c.descriptions.join("\n"), headline: "", description: "" }, forbidden));
  return flags;
}
