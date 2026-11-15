import { db } from "./db";

export type BrainKind = "offer" | "audience" | "customer_voice" | "brand_rules" | "competitors";

export const BRAIN: { kind: BrainKind; title: string; hint: string; template: string }[] = [
  {
    kind: "offer",
    title: "Offer",
    hint: "What exactly is sold, to whom, at what price, and why now.",
    template: `## Angebot
Was genau wird verkauft?

## Ergebnis für den Kunden
Welches konkrete Ergebnis bekommt der Kunde?

## Preisrahmen
Preis oder Preisspanne, Vertragslaufzeit.

## Belege
Nur echte, belegbare Referenzen, Zahlen oder Fallbeispiele.

## Nächster Schritt
Was soll ein Interessent tun (Termin buchen, Formular, Anruf)?`,
  },
  {
    kind: "audience",
    title: "Audience",
    hint: "One target group. Who they are, what hurts, what they object.",
    template: `## Zielgruppe
Branche, Unternehmensgröße, Region, Rolle des Entscheiders.

## Größte Probleme
- 

## Typische Einwände
- 

## Auslöser
Wann sucht die Zielgruppe nach einer Lösung?`,
  },
  {
    kind: "customer_voice",
    title: "Customer voice",
    hint: "10 to 15 real questions, complaints or quotes from customers, in their own words.",
    template: `## Echte Fragen und Aussagen von Kunden
Wörtlich, ohne Namen oder andere personenbezogene Daten.
- `,
  },
  {
    kind: "brand_rules",
    title: "Brand rules",
    hint: "Tone, what may never be claimed, required legal notes. Forbidden words are checked automatically.",
    template: `## Tonalität
Du oder Sie? Sachlich, locker, fachlich?

## Verbotene Wörter
Ein Begriff pro Zeile. Entwürfe mit diesen Begriffen werden markiert.
- 

## Erlaubte Aussagen
Welche Zahlen und Versprechen sind belegt und dürfen verwendet werden?

## Pflichtangaben
Zum Beispiel Preisangaben, Hinweise, Kennzeichnungen.`,
  },
  {
    kind: "competitors",
    title: "Competitors",
    hint: "3 to 5 competitors: their offer, their ad angles (Meta Ad Library, Google search).",
    template: `## Wettbewerber
### Name
- Angebot:
- Anzeigen-Winkel:
- Was fällt auf:`,
  },
];

export function getBrain(clientId: number): Record<BrainKind, string> {
  const rows = db().prepare("SELECT kind, content FROM brain_docs WHERE client_id = ?").all(clientId) as { kind: BrainKind; content: string }[];
  const out = Object.fromEntries(BRAIN.map((b) => [b.kind, ""])) as Record<BrainKind, string>;
  for (const r of rows) if (r.kind in out) out[r.kind] = r.content;
  return out;
}

export function saveBrain(clientId: number, kind: BrainKind, content: string): void {
  db()
    .prepare(
      `INSERT INTO brain_docs (client_id, kind, content) VALUES (?, ?, ?)
       ON CONFLICT (client_id, kind) DO UPDATE SET content = excluded.content, updated_at = datetime('now')`,
    )
    .run(clientId, kind, content);
}

/** A doc counts as filled once it differs from the empty template and has real text. */
export function isFilled(kind: BrainKind, content: string): boolean {
  const tpl = BRAIN.find((b) => b.kind === kind)?.template ?? "";
  const c = content.trim();
  return c.length >= 40 && c !== tpl.trim();
}

/** Bullet items under a "Verbotene ..." / "Forbidden ..." heading in the brand rules. */
export function forbiddenTerms(brandRules: string): string[] {
  const terms: string[] = [];
  let inside = false;
  for (const line of brandRules.split("\n")) {
    if (/^#{1,6}\s/.test(line)) {
      inside = /verboten|forbidden/i.test(line);
      continue;
    }
    const m = inside ? line.match(/^\s*[-*]\s+(.+?)\s*$/) : null;
    if (m && m[1].length >= 2) terms.push(m[1]);
  }
  return terms;
}
