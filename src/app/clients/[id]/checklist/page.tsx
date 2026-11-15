import { toggleChecklistAction } from "@/app/actions";
import { Flash } from "@/components/Flash";
import { CHECKLIST } from "@/lib/compliance";
import { db } from "@/lib/db";
import { loadClient, type PageArgs } from "@/lib/page";

export default async function Checklist(args: PageArgs) {
  const { client, sp } = await loadClient(args);
  const rows = db().prepare("SELECT key FROM checklist WHERE client_id = ? AND done = 1").all(client.id) as { key: string }[];
  const done = new Set(rows.map((r) => r.key));
  const groups = [...new Set(CHECKLIST.map((c) => c.group))];
  return (
    <div className="max-w-3xl">
      <Flash sp={sp} />
      <p className="muted mb-1">
        Work through this before any ad budget is spent. <strong className="num">{done.size} of {CHECKLIST.length}</strong> done.
      </p>
      <p className="small muted mb-4">The legal items are reminders, not legal advice. Have them checked for the specific client.</p>
      {groups.map((g) => (
        <div key={g} className="card">
          <h2>{g}</h2>
          <ul className="mt-2">
            {CHECKLIST.filter((c) => c.group === g).map((c) => {
              const isDone = done.has(c.key);
              return (
                <li key={c.key} className="py-2 flex gap-3 items-start" style={{ borderTop: "1px solid var(--line)" }}>
                  <form action={toggleChecklistAction}>
                    <input type="hidden" name="clientId" value={client.id} />
                    <input type="hidden" name="key" value={c.key} />
                    <input type="hidden" name="done" value={isDone ? "0" : "1"} />
                    <button className="btn" style={{ minWidth: 100, justifyContent: "center", ...(isDone ? { background: "var(--good-soft)", borderColor: "#bcdcc6", color: "var(--good)" } : {}) }} aria-label={`${isDone ? "Mark as open" : "Mark as done"}: ${c.label}`}>
                      {isDone ? "Done ✓" : "Mark done"}
                    </button>
                  </form>
                  <div>
                    <div className="font-semibold" style={isDone ? { color: "var(--muted)" } : undefined}>{c.label}</div>
                    <div className="small muted">{c.why}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
