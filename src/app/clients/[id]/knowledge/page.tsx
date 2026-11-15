import { saveBrainAction } from "@/app/actions";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/ui";
import { BRAIN, getBrain, isFilled } from "@/lib/brain";
import { loadClient, type PageArgs } from "@/lib/page";

export default async function Knowledge(args: PageArgs) {
  const { client, sp } = await loadClient(args);
  const brain = getBrain(client.id);
  return (
    <div className="max-w-4xl">
      <Flash sp={sp} />
      <p className="muted mb-4">
        Every agent reads these documents before it writes anything. Enter only facts you can stand behind: the agents are told not to invent proof, prices or references.
        Do not paste personal data of customers.
      </p>
      {BRAIN.map((b) => (
        <form key={b.kind} id={b.kind} action={saveBrainAction} className="card">
          <input type="hidden" name="clientId" value={client.id} />
          <input type="hidden" name="kind" value={b.kind} />
          <div className="flex items-baseline justify-between gap-3">
            <h2>{b.title}</h2>
            <span className={`badge ${isFilled(b.kind, brain[b.kind]) ? "badge-good" : "badge-warn"}`}>{isFilled(b.kind, brain[b.kind]) ? "filled" : "empty"}</span>
          </div>
          <p className="small muted mb-2">{b.hint}</p>
          <textarea className="input" name="content" rows={12} defaultValue={brain[b.kind] || b.template} aria-label={b.title} />
          <div className="mt-2">
            <SubmitButton pendingText="Saving…">Save {b.title.toLowerCase()}</SubmitButton>
          </div>
        </form>
      ))}
    </div>
  );
}
