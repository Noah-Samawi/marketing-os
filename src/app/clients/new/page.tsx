import Link from "next/link";
import { createClientAction } from "@/app/actions";
import { ClientForm } from "@/components/ClientForm";
import { Flash } from "@/components/Flash";

export default async function NewClient({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <div className="max-w-3xl">
      <Flash sp={await searchParams} />
      <p className="small">
        <Link href="/">← Clients</Link>
      </p>
      <h1 className="mb-4">New client</h1>
      <div className="card">
        <ClientForm action={createClientAction} submitLabel="Create client" />
      </div>
    </div>
  );
}
