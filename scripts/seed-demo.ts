import "./_env";
import { saveBrain } from "../src/lib/brain";
import { createClient, deleteClient, getClientBySlug, getClient } from "../src/lib/clients";
import fs from "node:fs";
import { saveDrafts } from "../src/lib/agents/creative";
import { saveAdGroups } from "../src/lib/agents/search";
import { parseSearchTermsCsv, replaceSearchTerms } from "../src/lib/searchTerms";
import { addDays } from "../src/lib/kpi";
import { upsertMetrics } from "../src/lib/metrics";
import type { MetricRow } from "../src/lib/types";

/**
 * Creates one clearly labelled demo client with synthetic numbers, so every screen
 * can be tried before real data exists. Nothing here describes a real company.
 */
const NAME = "DEMO Elektro Musterbetrieb";
const existing = getClientBySlug("demo-elektro-musterbetrieb");
if (existing) deleteClient(existing.id);

const id = createClient(
  { name: NAME, industry: "Elektrohandwerk (fiktiv)", website: "https://example.com", language: "de", currency: "EUR", channel: "meta", daily_budget: 30, target_cpl: 40, meta_ad_account_id: "" },
  true,
);

// Small deterministic generator: the demo looks the same on every machine.
let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

// name, daily spend, CPM, CTR, lead rate per click, days active
const ADS: [string, string, string, number, number, number, number, number][] = [
  ["Wallbox Leads", "Hausbesitzer Rhein-Main", "Hook: Förderung verpasst?", 9, 14, 0.016, 0.07, 28],
  ["Wallbox Leads", "Hausbesitzer Rhein-Main", "Hook: Laden über Nacht", 8, 15, 0.011, 0.022, 28],
  ["Wallbox Leads", "Hausbesitzer Rhein-Main", "Motiv: Technik-Foto", 6, 13, 0.0035, 0.03, 28],
  ["Smart Home Beratung", "Neubau", "Hook: Alles per App", 12, 16, 0.012, 0.0, 28],
  ["Smart Home Beratung", "Neubau", "Video: Kundenrundgang", 4, 15, 0.014, 0.05, 2],
];

const end = addDays(new Date().toISOString().slice(0, 10), -1);
const rows: MetricRow[] = [];
for (const [campaign, adset, ad, spendDay, cpm, ctr, leadRate, days] of ADS) {
  for (let i = days - 1; i >= 0; i--) {
    const spend = +(spendDay * (0.8 + rand() * 0.4)).toFixed(2);
    const impressions = Math.round((spend / cpm) * 1000 * (0.9 + rand() * 0.2));
    const clicks = Math.round(impressions * ctr * (0.7 + rand() * 0.6));
    let leads = 0;
    for (let c = 0; c < clicks; c++) if (rand() < leadRate) leads++;
    rows.push({ date: addDays(end, -i), platform: "meta", campaign, adset, ad, spend, impressions, clicks, leads, revenue: 0 });
  }
}
upsertMetrics(id, rows);

saveBrain(id, "offer", `## Angebot
Fiktives Beispiel: Installation von Wallboxen für Einfamilienhäuser, inklusive Anmeldung beim Netzbetreiber.

## Ergebnis für den Kunden
Fertig installierte Wallbox, alles aus einer Hand.

## Preisrahmen
Festpreis nach Vor-Ort-Termin.

## Belege
(Demo: keine echten Referenzen. Hier nur belegbare Angaben eintragen.)

## Nächster Schritt
Kostenfreien Vor-Ort-Termin über das Formular anfragen.`);
saveBrain(id, "audience", `## Zielgruppe
Hausbesitzer im Rhein-Main-Gebiet mit E-Auto oder Bestellung eines E-Autos.

## Größte Probleme
- Unklar, ob der Hausanschluss ausreicht
- Unsicherheit bei Anmeldung und Förderung
- Handwerker sind schwer erreichbar

## Typische Einwände
- "Das macht mir der Autohändler mit"
- "Zu teuer"

## Auslöser
Bestellung oder Lieferung des E-Autos.`);
saveBrain(id, "customer_voice", `## Echte Fragen und Aussagen von Kunden
(Demo-Beispiele, erfunden)
- "Reicht mein Hausanschluss überhaupt?"
- "Wie lange dauert das von der Anfrage bis zur Installation?"
- "Muss ich das beim Netzbetreiber selbst anmelden?"`);
saveBrain(id, "brand_rules", `## Tonalität
Sie. Sachlich, freundlich, ohne Fachchinesisch.

## Verbotene Wörter
Ein Begriff pro Zeile. Entwürfe mit diesen Begriffen werden markiert.
- billig
- Schnäppchen

## Erlaubte Aussagen
Festpreis nach Vor-Ort-Termin. Anmeldung beim Netzbetreiber inklusive.

## Pflichtangaben
Keine Aussagen zu Förderhöhen ohne aktuelle Quelle.`);

const client = getClient(id)!;
saveDrafts(
  client,
  [
    { angle: "Einwand: Hausanschluss", hook: "Reicht Ihr Hausanschluss für eine Wallbox?", primary_text: "Viele Hausbesitzer wissen es nicht. Wir prüfen das bei einem Vor-Ort-Termin und nennen Ihnen danach einen Festpreis. Die Anmeldung beim Netzbetreiber übernehmen wir.", headline: "Wallbox: Anschluss prüfen lassen", description: "Vor-Ort-Termin anfragen", cta: "Termin anfragen", visual_concept: "Foto eines Hausanschlusskastens mit Fragezeichen-Grafik, daneben eine montierte Wallbox.", format: "static" },
    { angle: "Ergebnis: alles aus einer Hand", hook: "Wallbox bestellt, und wer meldet sie an?", primary_text: "Wir installieren Ihre Wallbox und übernehmen die Anmeldung beim Netzbetreiber. Sie bekommen einen Festpreis nach dem Vor-Ort-Termin.", headline: "Installation und Anmeldung", description: "Festpreis nach Vor-Ort-Termin", cta: "Mehr erfahren", visual_concept: "Kurzes Hochformat-Video: Monteur schließt Wallbox an, Einblendung der drei Schritte.", format: "video" },
    { angle: "Demo: absichtlich fehlerhaft", hook: "Die beste Wallbox-Installation, garantiert billig!", primary_text: "Nur heute: 100 % zufriedene Kunden. Dieser Entwurf zeigt, wie die automatische Prüfung riskante Aussagen markiert.", headline: "Garantiert die Nr. 1 im Rhein-Main-Gebiet", description: "Demo-Entwurf", cta: "Jetzt sichern", visual_concept: "Kein Motiv. Beispiel für markierte Aussagen.", format: "static" },
  ],
  "demo",
);

saveAdGroups(
  client,
  [
    {
      theme: "Wallbox Installation",
      keywords: [
        { text: "wallbox installation", match: "phrase" },
        { text: "wallbox installieren lassen", match: "phrase" },
        { text: "wallbox elektriker", match: "exact" },
        { text: "wallbox montage kosten", match: "phrase" },
      ],
      negatives: ["selber", "anleitung", "gebraucht", "ausbildung", "jobs"],
      headlines: [
        "Wallbox Installation",
        "Wallbox installieren lassen",
        "Festpreis nach Vor-Ort-Termin",
        "Anmeldung beim Netzbetreiber",
        "Vor-Ort-Termin anfragen",
        "Wallbox Installation im Rhein-Main-Gebiet", // too long on purpose: shows the length check
      ],
      descriptions: [
        "Wir installieren Ihre Wallbox und übernehmen die Anmeldung beim Netzbetreiber.",
        "Wir prüfen Ihren Hausanschluss vor Ort und nennen Ihnen danach einen Festpreis.",
      ],
      path1: "wallbox",
      path2: "installation",
      final_url: "https://example.com/wallbox",
    },
  ],
  "demo",
);
replaceSearchTerms(id, parseSearchTermsCsv(fs.readFileSync("samples/google-search-terms-example.csv", "utf8")).rows);

console.log(`Demo client created (id ${id}) with ${rows.length} daily rows up to ${end}.`);
