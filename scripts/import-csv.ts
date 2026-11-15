import "./_env";
import fs from "node:fs";
import { getClientBySlug, listClients } from "../src/lib/clients";
import { parseMetricsCsv } from "../src/lib/importers/csv";
import { upsertMetrics } from "../src/lib/metrics";

const [slug, file, platform = "meta"] = process.argv.slice(2);
const client = slug ? getClientBySlug(slug) : null;
if (!client || !file) {
  console.error(`Usage: npm run import -- <client-slug> <file.csv> [meta|google|other]\nClients: ${listClients().map((c) => c.slug).join(", ") || "(none)"}`);
  process.exit(1);
}
const res = parseMetricsCsv(fs.readFileSync(file, "utf8"), platform);
if (res.error) {
  console.error(res.error);
  process.exit(1);
}
const n = upsertMetrics(client.id, res.rows);
console.log(`${n} rows written, ${res.skipped} non-data lines skipped. Columns used: ${JSON.stringify(res.mapped)}`);
