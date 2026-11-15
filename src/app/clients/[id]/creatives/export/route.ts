import Papa from "papaparse";
import { getClient } from "@/lib/clients";
import { db } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const client = getClient(Number(id));
  if (!client) return new Response("Client not found", { status: 404 });
  const rows = db()
    .prepare(
      `SELECT id, angle, format, hook, primary_text, headline, description, cta, visual_concept, note, decided_at
       FROM creatives WHERE client_id = ? AND status = 'approved' ORDER BY id`,
    )
    .all(client.id) as Record<string, unknown>[];
  // Neutralise cells a spreadsheet would run as a formula.
  const safe = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v])));
  const csv = "﻿" + Papa.unparse(safe, { columns: ["id", "angle", "format", "hook", "primary_text", "headline", "description", "cta", "visual_concept", "note", "decided_at"] });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${client.slug}-approved-ads.csv"`,
    },
  });
}
