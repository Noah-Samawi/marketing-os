import { decideCreativeAction, generateCreativesAction } from "@/app/actions";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/ui";
import { creativeBlocker } from "@/lib/agents/creative";
import type { Flag } from "@/lib/compliance";
import { db } from "@/lib/db";
import { loadClient, type PageArgs } from "@/lib/page";
import type { Creative } from "@/lib/types";

function Card({ c }: { c: Creative }) {
  const flags = JSON.parse(c.flags_json) as Flag[];
  return (
    <div className="card" dir="auto">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="badge badge-accent">{c.angle || "no angle"}</span>
        <span className="badge">{c.format}</span>
        {c.source === "demo" && <span className="badge badge-warn">demo example</span>}
        <span className="small muted num">
          #{c.id} · {c.created_at} UTC
        </span>
      </div>
      <p className="text-lg font-semibold mt-2">{c.hook}</p>
      <p className="mt-1" style={{ whiteSpace: "pre-wrap" }}>{c.primary_text}</p>
      <dl className="grid gap-x-4 gap-y-1 mt-3 small" style={{ gridTemplateColumns: "auto 1fr" }}>
        <dt className="muted">Headline</dt>
        <dd>{c.headline}</dd>
        <dt className="muted">Description</dt>
        <dd>{c.description}</dd>
        <dt className="muted">Button</dt>
        <dd>{c.cta}</dd>
        <dt className="muted">Visual</dt>
        <dd>{c.visual_concept}</dd>
      </dl>
      {flags.length > 0 && (
        <ul className="mt-3 space-y-1">
          {flags.map((f, i) => (
            <li key={i} className={`notice ${f.level === "warn" ? "notice-warn" : ""}`} style={f.level === "info" ? { borderColor: "var(--line)" } : undefined}>
              {f.message}
            </li>
          ))}
        </ul>
      )}
      <form action={decideCreativeAction} className="mt-3 flex gap-2 items-end flex-wrap" dir="ltr">
        <input type="hidden" name="clientId" value={c.client_id} />
        <input type="hidden" name="creativeId" value={c.id} />
        <label className="field grow" style={{ minWidth: 220 }}>
          <span>Note (on rejection: why, so the next batch avoids it)</span>
          <input className="input" name="note" defaultValue={c.note} />
        </label>
        {c.status !== "approved" && (
          <button className="btn btn-primary" name="status" value="approved">
            Approve
          </button>
        )}
        {c.status !== "rejected" && (
          <button className="btn btn-danger" name="status" value="rejected">
            Reject
          </button>
        )}
        {c.status !== "draft" && (
          <button className="btn" name="status" value="draft">
            Back to drafts
          </button>
        )}
      </form>
    </div>
  );
}

export default async function Creatives(args: PageArgs) {
  const { client, sp } = await loadClient(args);
  const all = db().prepare("SELECT * FROM creatives WHERE client_id = ? ORDER BY id DESC LIMIT 200").all(client.id) as Creative[];
  const by = (s: string) => all.filter((c) => c.status === s);
  const blocker = creativeBlocker(client.id);
  const sections: [string, string, Creative[]][] = [
    ["Waiting for your decision", "draft", by("draft")],
    ["Approved", "approved", by("approved")],
    ["Rejected", "rejected", by("rejected")],
  ];

  return (
    <div className="max-w-4xl">
      <Flash sp={sp} />
      <form action={generateCreativesAction} className="card">
        <input type="hidden" name="clientId" value={client.id} />
        <h2>Generate ad drafts</h2>
        <p className="small muted mt-1">
          The agent writes from the knowledge base, recent results and your earlier approvals and rejections. Drafts are never published from here.
        </p>
        {blocker ? (
          <p className="notice notice-warn mt-3">{blocker}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[110px_1fr_auto] items-end mt-3">
            <label className="field">
              <span>How many</span>
              <input className="input" type="number" name="count" min={1} max={10} defaultValue={5} />
            </label>
            <label className="field">
              <span>Extra brief (optional)</span>
              <input className="input" name="brief" placeholder="e.g. focus on the objection 'too expensive'" />
            </label>
            <SubmitButton pendingText="Writing drafts…">Generate</SubmitButton>
          </div>
        )}
      </form>

      {all.length === 0 && <p className="muted mt-4">No drafts yet.</p>}

      {sections.map(([title, key, list]) =>
        list.length === 0 ? null : (
          <section key={key} className="mt-6">
            <div className="flex items-baseline justify-between mb-2">
              <h2>
                {title} <span className="muted font-normal">({list.length})</span>
              </h2>
              {key === "approved" && (
                <a className="btn" href={`/clients/${client.id}/creatives/export`}>
                  Export approved as CSV
                </a>
              )}
            </div>
            {key === "approved" && (
              <p className="small muted mb-2">
                Approval here is your editorial decision. Automatic flags are hints, not legal clearance. Upload approved ads to the ad account yourself.
              </p>
            )}
            {list.map((c) => (
              <Card key={c.id} c={c} />
            ))}
          </section>
        ),
      )}
    </div>
  );
}
