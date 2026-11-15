import { notFound } from "next/navigation";
import { getClient } from "./clients";
import type { Client } from "./types";

export type PageArgs = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function loadClient(args: PageArgs): Promise<{ client: Client; sp: Record<string, string | string[] | undefined> }> {
  const [{ id }, sp] = await Promise.all([args.params, args.searchParams]);
  const client = getClient(Number(id));
  if (!client) notFound();
  return { client, sp };
}
