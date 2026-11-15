import fs from "node:fs";
import path from "node:path";
// Node's built-in SQLite: no native module to compile on install.
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  industry TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'de',
  currency TEXT NOT NULL DEFAULT 'EUR',
  channel TEXT NOT NULL DEFAULT 'meta',
  goal_type TEXT NOT NULL DEFAULT 'lead',
  daily_budget REAL,
  target_cpl REAL,
  meta_ad_account_id TEXT NOT NULL DEFAULT '',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brain_docs (
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (client_id, kind)
);

-- One row per ad per day. The unique key makes every import idempotent:
-- re-importing the same export updates rows instead of duplicating them.
CREATE TABLE IF NOT EXISTS metrics_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  platform TEXT NOT NULL,
  campaign TEXT NOT NULL DEFAULT '',
  adset TEXT NOT NULL DEFAULT '',
  ad TEXT NOT NULL DEFAULT '',
  spend REAL NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  leads REAL NOT NULL DEFAULT 0,
  revenue REAL NOT NULL DEFAULT 0,
  UNIQUE (client_id, date, platform, campaign, adset, ad)
);
CREATE INDEX IF NOT EXISTS idx_metrics_client_date ON metrics_daily (client_id, date);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  kpis_json TEXT NOT NULL,
  recommendations_json TEXT NOT NULL,
  narrative TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS creatives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL,
  angle TEXT NOT NULL DEFAULT '',
  hook TEXT NOT NULL DEFAULT '',
  primary_text TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  cta TEXT NOT NULL DEFAULT '',
  visual_concept TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'static',
  status TEXT NOT NULL DEFAULT 'draft',
  flags_json TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'llm',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);

-- Google Search: one row is a proposed ad group (keywords + responsive search ad).
CREATE TABLE IF NOT EXISTS search_adgroups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT '',
  keywords_json TEXT NOT NULL DEFAULT '[]',
  negatives_json TEXT NOT NULL DEFAULT '[]',
  headlines_json TEXT NOT NULL DEFAULT '[]',
  descriptions_json TEXT NOT NULL DEFAULT '[]',
  path1 TEXT NOT NULL DEFAULT '',
  path2 TEXT NOT NULL DEFAULT '',
  final_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'llm',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);

-- Latest imported search terms report. A new import replaces the previous one.
CREATE TABLE IF NOT EXISTS search_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  campaign TEXT NOT NULL DEFAULT '',
  adgroup TEXT NOT NULL DEFAULT '',
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  conversions REAL NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_search_terms_client ON search_terms (client_id);

CREATE TABLE IF NOT EXISTS checklist (
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, key)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
`;

let instance: DatabaseSync | null = null;

export function dbPath(): string {
  return process.env.DB_PATH || path.join(process.cwd(), "data", "marketing.db");
}

export function db(): DatabaseSync {
  if (instance) return instance;
  const file = dbPath();
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new DatabaseSync(file);
  conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  conn.exec(SCHEMA);
  instance = conn;
  return conn;
}

/** Test helper: drop the cached connection so a new DB_PATH takes effect. */
export function resetDb(): void {
  instance?.close();
  instance = null;
}

/** Runs fn inside one transaction: either every write lands or none does. */
export function transaction<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}

export function logActivity(clientId: number, actor: "human" | "agent" | "system", action: string, detail = ""): void {
  db().prepare("INSERT INTO activity_log (client_id, actor, action, detail) VALUES (?, ?, ?, ?)").run(clientId, actor, action, detail);
}
