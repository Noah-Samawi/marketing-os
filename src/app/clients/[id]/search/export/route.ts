import Papa from "papaparse";
import { getClient } from "@/lib/clients";
import { db } from "@/lib/db";
import { rowToContent, type AdGroupRow } from "@/lib/search";

/** Plain worksheet for copying into Google Ads. Not a Google Ads Editor import file. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const client = getClient(Number(id));
  if (!client) return new Response("Client not found", { status: 404 });
  const rows = db().prepare("SELECT * FROM search_adgroups WHERE client_id = ? AND status = 'approved' ORDER BY id").all(client.id) as AdGroupRow[];
  const out: { ad_group: string; type: string; text: string; match_type: string; characters: number | string }[] = [];
  for (const r of rows) {
    const c = rowToContent(r);
    const add = (type: string, text: string, match = "") => out.push({ ad_group: c.theme, type, text, match_type: match, characters: type === "headline" || type === "description" ? text.length : "" });
    for (const k of c.keywords) add("keyword", k.text, k.match);
    for (const n of c.negatives) add("negative keyword", n);
    for (const h of c.headlines) add("headline", h);
    for (const d of c.descriptions) add("description", d);
    if (c.path1) add("path 1", c.path1);
    if (c.path2) add("path 2", c.path2);
    if (c.final_url) add("final url", c.final_url);
  }
  // Neutralise cells a spreadsheet would run as a formula.
  const safe = out.map((r) => ({ ...r, text: /^[=+\-@\t\r]/.test(r.text) ? `'${r.text}` : r.text, ad_group: /^[=+\-@\t\r]/.test(r.ad_group) ? `'${r.ad_group}` : r.ad_group }));
  const csv = "﻿" + Papa.unparse(safe, { columns: ["ad_group", "type", "text", "match_type", "characters"] });
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${client.slug}-search-ads.csv"` },
  });
}
