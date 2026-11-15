"use server";

import { redirect } from "next/navigation";
import { generateReport } from "@/lib/agents/analyst";
import { decideCreative, generateCreatives } from "@/lib/agents/creative";
import { decideAdGroup, generateAdGroups, updateAdGroup } from "@/lib/agents/search";
import { BRAIN, saveBrain, type BrainKind } from "@/lib/brain";
import { createClient, deleteClient, getClient, updateClient, type ClientInput } from "@/lib/clients";
import { CHECKLIST } from "@/lib/compliance";
import { db, logActivity } from "@/lib/db";
import { parseMetricsCsv } from "@/lib/importers/csv";
import { fetchMetaInsights } from "@/lib/importers/meta";
import { addDays } from "@/lib/kpi";
import { upsertMetrics } from "@/lib/metrics";
import { lines, parseKeyword, type Keyword } from "@/lib/search";
import { parseSearchTermsCsv, replaceSearchTerms } from "@/lib/searchTerms";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const numOrNull = (f: FormData, k: string) => {
  const v = str(f, k).replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const go = (path: string, kind: "ok" | "err" | "warn", msg: string): never => redirect(`${path}?${kind}=${encodeURIComponent(msg.slice(0, 400))}`);

function requireClient(f: FormData) {
  const client = getClient(Number(f.get("clientId")));
  if (!client) redirect("/?err=" + encodeURIComponent("Client not found."));
  return client!;
}

function clientInput(f: FormData): ClientInput {
  return {
    name: str(f, "name"),
    industry: str(f, "industry"),
    website: str(f, "website"),
    language: ["de", "en", "ar"].includes(str(f, "language")) ? str(f, "language") : "de",
    currency: /^[A-Z]{3}$/.test(str(f, "currency")) ? str(f, "currency") : "EUR",
    channel: ["meta", "google", "other"].includes(str(f, "channel")) ? str(f, "channel") : "meta",
    daily_budget: numOrNull(f, "daily_budget"),
    target_cpl: numOrNull(f, "target_cpl"),
    meta_ad_account_id: str(f, "meta_ad_account_id").replace(/[^\d]/g, ""),
  };
}

export async function createClientAction(f: FormData) {
  const input = clientInput(f);
  if (!input.name) go("/clients/new", "err", "Name is required.");
  const id = createClient(input);
  logActivity(id, "human", "client_created");
  go(`/clients/${id}/checklist`, "ok", "Client created. Start with the checklist and the knowledge base.");
}

export async function updateClientAction(f: FormData) {
  const client = requireClient(f);
  const input = clientInput(f);
  if (!input.name) go(`/clients/${client.id}/settings`, "err", "Name is required.");
  updateClient(client.id, input);
  go(`/clients/${client.id}/settings`, "ok", "Saved.");
}

export async function deleteClientAction(f: FormData) {
  const client = requireClient(f);
  deleteClient(client.id);
  go("/", "ok", `Client "${client.name}" and all its data were deleted.`);
}

export async function saveBrainAction(f: FormData) {
  const client = requireClient(f);
  const kind = str(f, "kind") as BrainKind;
  if (!BRAIN.some((b) => b.kind === kind)) go(`/clients/${client.id}/knowledge`, "err", "Unknown document.");
  saveBrain(client.id, kind, String(f.get("content") ?? ""));
  logActivity(client.id, "human", "knowledge_saved", kind);
  redirect(`/clients/${client.id}/knowledge?ok=${encodeURIComponent("Saved.")}#${kind}`);
}

export async function importCsvAction(f: FormData) {
  const client = requireClient(f);
  const path = `/clients/${client.id}/data`;
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) go(path, "err", "Choose a CSV file.");
  const platform = ["meta", "google", "other"].includes(str(f, "platform")) ? str(f, "platform") : "meta";
  const res = parseMetricsCsv(await (file as File).text(), platform);
  if (res.error) go(path, "err", res.error);
  if (!res.rows.length) go(path, "err", "The file has no rows with a readable date.");
  const n = upsertMetrics(client.id, res.rows);
  logActivity(client.id, "human", "csv_imported", `${n} rows (${platform})`);
  const cols = Object.entries(res.mapped).map(([k, v]) => `${k} ← "${v}"`).join(", ");
  const noLeads = !("leads" in res.mapped) ? " No leads column was found, so leads were imported as 0." : "";
  go(path, noLeads ? "warn" : "ok", `${n} rows imported, ${res.skipped} non-data lines skipped. Columns: ${cols}.${noLeads}`);
}

export async function syncMetaAction(f: FormData) {
  const client = requireClient(f);
  const path = `/clients/${client.id}/data`;
  if (!client.meta_ad_account_id) go(path, "err", "Set the Meta ad account ID in Settings first.");
  const days = Math.min(Math.max(Number(f.get("days")) || 14, 1), 90);
  const until = new Date().toISOString().slice(0, 10);
  let n = 0;
  try {
    const rows = await fetchMetaInsights(client.meta_ad_account_id, addDays(until, -(days - 1)), until);
    n = upsertMetrics(client.id, rows);
  } catch (e) {
    go(path, "err", e instanceof Error ? e.message : "Meta sync failed.");
  }
  logActivity(client.id, "system", "meta_synced", `${n} rows, last ${days} days`);
  go(path, "ok", `${n} rows synced from Meta for the last ${days} days.`);
}

export async function generateReportAction(f: FormData) {
  const client = requireClient(f);
  const path = `/clients/${client.id}/reports`;
  const res = await generateReport(client);
  if (!res) go(path, "err", "No data yet. Import metrics first.");
  if (res!.llmError) go(path, "warn", `Report created with rule-based text. The AI text failed: ${res!.llmError}`);
  go(path, "ok", res!.source === "llm" ? "Report created." : "Report created with rule-based text (no ANTHROPIC_API_KEY set).");
}

export async function generateCreativesAction(f: FormData) {
  const client = requireClient(f);
  const path = `/clients/${client.id}/creatives`;
  const count = Math.min(Math.max(Number(f.get("count")) || 5, 1), 10);
  let n = 0;
  try {
    n = (await generateCreatives(client, count, str(f, "brief"))).count;
  } catch (e) {
    go(path, "err", e instanceof Error ? e.message : "Generation failed.");
  }
  go(path, "ok", `${n} drafts created. Review each one before approving.`);
}

export async function decideCreativeAction(f: FormData) {
  const client = requireClient(f);
  const status = str(f, "status");
  if (status !== "approved" && status !== "rejected" && status !== "draft") go(`/clients/${client.id}/creatives`, "err", "Unknown status.");
  decideCreative(client.id, Number(f.get("creativeId")), status as "approved" | "rejected" | "draft", str(f, "note"));
  redirect(`/clients/${client.id}/creatives`);
}

export async function toggleChecklistAction(f: FormData) {
  const client = requireClient(f);
  const key = str(f, "key");
  if (!CHECKLIST.some((c) => c.key === key)) go(`/clients/${client.id}/checklist`, "err", "Unknown item.");
  const done = str(f, "done") === "1" ? 1 : 0;
  db()
    .prepare("INSERT INTO checklist (client_id, key, done) VALUES (?, ?, ?) ON CONFLICT (client_id, key) DO UPDATE SET done = excluded.done")
    .run(client.id, key, done);
  logActivity(client.id, "human", done ? "checklist_done" : "checklist_undone", key);
  redirect(`/clients/${client.id}/checklist`);
}

export async function generateAdGroupsAction(f: FormData) {
  const client = requireClient(f);
  const path = `/clients/${client.id}/search`;
  const count = Math.min(Math.max(Number(f.get("count")) || 2, 1), 4);
  let n = 0;
  try {
    n = (await generateAdGroups(client, count, str(f, "brief"))).count;
  } catch (e) {
    go(path, "err", e instanceof Error ? e.message : "Generation failed.");
  }
  go(path, "ok", `${n} ad group(s) proposed. Check lengths and keywords before approving.`);
}

export async function updateAdGroupAction(f: FormData) {
  const client = requireClient(f);
  const id = Number(f.get("adGroupId"));
  updateAdGroup(client.id, id, {
    theme: str(f, "theme"),
    keywords: lines(String(f.get("keywords") ?? "")).map(parseKeyword).filter((k): k is Keyword => k !== null),
    negatives: lines(String(f.get("negatives") ?? "")),
    headlines: lines(String(f.get("headlines") ?? "")),
    descriptions: lines(String(f.get("descriptions") ?? "")),
    path1: str(f, "path1"),
    path2: str(f, "path2"),
    final_url: str(f, "final_url"),
  });
  redirect(`/clients/${client.id}/search?ok=${encodeURIComponent("Saved.")}#ag-${id}`);
}

export async function decideAdGroupAction(f: FormData) {
  const client = requireClient(f);
  const status = str(f, "status");
  if (status !== "approved" && status !== "rejected" && status !== "draft") go(`/clients/${client.id}/search`, "err", "Unknown status.");
  decideAdGroup(client.id, Number(f.get("adGroupId")), status as "approved" | "rejected" | "draft", str(f, "note"));
  redirect(`/clients/${client.id}/search`);
}

export async function importSearchTermsAction(f: FormData) {
  const client = requireClient(f);
  const path = `/clients/${client.id}/search`;
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) go(path, "err", "Choose a CSV file.");
  const res = parseSearchTermsCsv(await (file as File).text());
  if (res.error) go(path, "err", res.error);
  if (!res.rows.length) go(path, "err", "The file has no search terms.");
  const n = replaceSearchTerms(client.id, res.rows);
  logActivity(client.id, "human", "search_terms_imported", `${n} terms`);
  const noConv = !("conversions" in res.mapped) ? " No conversions column was found, so every term counts as not converting." : "";
  redirect(`${path}?${noConv ? "warn" : "ok"}=${encodeURIComponent(`${n} search terms imported (replaces the previous report).${noConv}`)}#terms`);
}
