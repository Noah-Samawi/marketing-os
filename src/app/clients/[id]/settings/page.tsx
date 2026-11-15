import { deleteClientAction, updateClientAction } from "@/app/actions";
import { ClientForm } from "@/components/ClientForm";
import { Flash } from "@/components/Flash";
import { ConfirmButton } from "@/components/ui";
import { loadClient, type PageArgs } from "@/lib/page";

export default async function Settings(args: PageArgs) {
  const { client, sp } = await loadClient(args);
  return (
    <div className="max-w-3xl">
      <Flash sp={sp} />
      <div className="card">
        <ClientForm action={updateClientAction} client={client} submitLabel="Save" />
      </div>
      <form action={deleteClientAction} className="card">
        <input type="hidden" name="clientId" value={client.id} />
        <h2>Delete client</h2>
        <p className="small muted mt-1 mb-3">Removes the client with all metrics, reports, drafts and knowledge documents. This cannot be undone.</p>
        <ConfirmButton message={`Delete "${client.name}" and all its data? This cannot be undone.`}>Delete client</ConfirmButton>
      </form>
    </div>
  );
}
