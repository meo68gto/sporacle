import type { Db } from "@/db/client";
import { ingestEnvelope, type Transport } from "./pipeline";
import type { Envelope } from "./envelope";

export async function ingestVia(db: Db, envelope: Envelope, transport: Transport): Promise<{ ingestRunId: string; status: string; stored: number }> {
  return ingestEnvelope(db, envelope, transport);
}

export function pullHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

export async function pullDeliveries(opts: {
  baseUrl: string;
  apiKey: string;
  feedKey: string;
  cursor?: string;
}): Promise<{ deliveries: unknown[]; requestHeaders: Record<string, string> }> {
  const headers = pullHeaders(opts.apiKey);
  if (Object.keys(headers).some((k) => k.toLowerCase().includes("tenant"))) {
    throw new Error("I13: tenant header is forbidden");
  }
  const url = new URL(`${opts.baseUrl.replace(/\/$/, "")}/feeds/${opts.feedKey}/deliveries`);
  if (opts.cursor) url.searchParams.set("since", opts.cursor);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`veluma pull failed: ${res.status}`);
  const body = (await res.json()) as { deliveries?: unknown[] };
  return { deliveries: body.deliveries ?? [], requestHeaders: headers };
}
