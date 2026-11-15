import { db } from "./db";
import type { Client } from "./types";

export function listClients(): Client[] {
  return db().prepare("SELECT * FROM clients ORDER BY is_demo, name").all() as Client[];
}

export function getClient(id: number): Client | null {
  return (db().prepare("SELECT * FROM clients WHERE id = ?").get(id) as Client | undefined) ?? null;
}

export function getClientBySlug(slug: string): Client | null {
  return (db().prepare("SELECT * FROM clients WHERE slug = ?").get(slug) as Client | undefined) ?? null;
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "client";
}

export type ClientInput = {
  name: string;
  industry: string;
  website: string;
  language: string;
  currency: string;
  channel: string;
  daily_budget: number | null;
  target_cpl: number | null;
  meta_ad_account_id: string;
};

export function createClient(input: ClientInput, isDemo = false): number {
  let slug = slugify(input.name);
  for (let i = 2; getClientBySlug(slug); i++) slug = `${slugify(input.name)}-${i}`;
  const res = db()
    .prepare(
      `INSERT INTO clients (name, slug, industry, website, language, currency, channel, daily_budget, target_cpl, meta_ad_account_id, is_demo)
       VALUES (@name, @slug, @industry, @website, @language, @currency, @channel, @daily_budget, @target_cpl, @meta_ad_account_id, @is_demo)`,
    )
    .run({ ...input, slug, is_demo: isDemo ? 1 : 0 });
  return Number(res.lastInsertRowid);
}

export function updateClient(id: number, input: ClientInput): void {
  db()
    .prepare(
      `UPDATE clients SET name=@name, industry=@industry, website=@website, language=@language, currency=@currency,
       channel=@channel, daily_budget=@daily_budget, target_cpl=@target_cpl, meta_ad_account_id=@meta_ad_account_id WHERE id=@id`,
    )
    .run({ ...input, id });
}

export function deleteClient(id: number): void {
  db().prepare("DELETE FROM clients WHERE id = ?").run(id);
}
