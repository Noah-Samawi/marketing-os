/**
 * Automatic checks on generated ad copy. These are flags for the human reviewer,
 * not legal clearance: a draft without flags can still be unlawful or untrue.
 */
export type Flag = { level: "warn" | "info"; message: string };

const PATTERNS: { re: RegExp; message: string }[] = [
  { re: /\bgarant\w*|\bguarante\w*/i, message: "Guarantee claim: only allowed if it is true and you can prove it." },
  { re: /\b100\s?%/i, message: "\"100 %\" claim: needs proof." },
  { re: /\b(nr\.?\s?1|nummer\s?1|#\s?1|marktführer\w*|führend\w*|der beste|die beste|das beste|the best|leading)\b/i, message: "Superlative or market-leader claim: needs proof (misleading advertising risk)." },
  { re: /\b(kostenlos\w*|gratis|free)\b/i, message: "\"Free\" claim: must be free without hidden conditions." },
  { re: /\b(heil\w*|cure[sd]?)\b/i, message: "Health or cure claim: strictly regulated." },
  { re: /\b(nur noch heute|nur heute|letzte chance|last chance|only today)\b/i, message: "Urgency claim: must be real, no fake scarcity." },
];

export const LIMITS = { headline: 40, primaryText: 600 };

export function checkCopy(fields: { hook: string; primary_text: string; headline: string; description: string }, forbidden: string[]): Flag[] {
  const flags: Flag[] = [];
  const all = [fields.hook, fields.primary_text, fields.headline, fields.description].join("\n");

  for (const term of forbidden) {
    if (all.toLowerCase().includes(term.toLowerCase())) flags.push({ level: "warn", message: `Uses forbidden term from brand rules: "${term}".` });
  }
  for (const p of PATTERNS) if (p.re.test(all)) flags.push({ level: "warn", message: p.message });

  if (fields.headline.length > LIMITS.headline) flags.push({ level: "info", message: `Headline has ${fields.headline.length} characters; it may be cut off after about ${LIMITS.headline}.` });
  if (fields.primary_text.length > LIMITS.primaryText) flags.push({ level: "info", message: `Primary text is long (${fields.primary_text.length} characters).` });
  return flags;
}

export const CHECKLIST: { key: string; group: string; label: string; why: string }[] = [
  { key: "one_offer", group: "Strategy", label: "One offer, one audience, one channel decided", why: "Several offers at once make results impossible to read." },
  { key: "success_defined", group: "Strategy", label: "Success defined (e.g. qualified call booked) and target CPL set", why: "Without a target, the rules cannot judge an ad." },
  { key: "budget_cap", group: "Strategy", label: "Daily budget cap set in the ad account itself", why: "The cap in the ad platform is the real safety net, not this app." },
  { key: "landing_page", group: "Funnel", label: "Landing page matches the offer and has one clear action", why: "The ad only sells the click." },
  { key: "tracking_tested", group: "Funnel", label: "Conversion tracking tested with a real test lead", why: "Wrong tracking makes every report wrong." },
  { key: "consent", group: "Legal (DE/EU)", label: "Consent banner in place before pixel or tags fire", why: "Tracking tags generally need prior consent. Have this checked." },
  { key: "imprint", group: "Legal (DE/EU)", label: "Impressum and privacy policy on the landing page", why: "Required for commercial sites in Germany." },
  { key: "dpa", group: "Legal (DE/EU)", label: "Data processing agreement with the client (if you handle their lead data)", why: "Usually needed when you process personal data on the client's behalf. Have this checked." },
  { key: "ai_label", group: "Legal (DE/EU)", label: "Checked whether AI-generated images or avatars must be labelled", why: "Platform rules and EU transparency duties can apply." },
  { key: "access", group: "Access", label: "Access via Business Manager partner access, no shared passwords", why: "Clean access can be revoked and is traceable." },
  { key: "brain_filled", group: "Knowledge", label: "Offer, audience, customer voice and brand rules filled in", why: "Agents write from this, not from guesses." },
  { key: "competitors", group: "Knowledge", label: "3 to 5 competitors researched (Meta Ad Library)", why: "Good angles come from the market, not from the homepage." },
  { key: "manual_first", group: "Launch", label: "First 2 to 3 ads launched by hand", why: "You must know the platform to notice when an agent proposes nonsense." },
];
