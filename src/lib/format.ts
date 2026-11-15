const locale = (lang: string) => (lang === "de" ? "de-DE" : lang === "ar" ? "ar" : "en-US");

export function money(v: number | null, currency = "EUR", lang = "de"): string {
  if (v === null) return "–";
  return new Intl.NumberFormat(locale(lang), { style: "currency", currency, maximumFractionDigits: 2 }).format(v);
}

export function int(v: number | null, lang = "de"): string {
  if (v === null) return "–";
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 0 }).format(v);
}

export function num(v: number | null, lang = "de", digits = 1): string {
  if (v === null) return "–";
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits }).format(v);
}

export function pct(v: number | null, lang = "de", digits = 2): string {
  if (v === null) return "–";
  return new Intl.NumberFormat(locale(lang), { style: "percent", maximumFractionDigits: digits }).format(v);
}

export function signedPct(v: number | null, lang = "de"): string {
  if (v === null) return "";
  const s = new Intl.NumberFormat(locale(lang), { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" }).format(v);
  return s;
}
