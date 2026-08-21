import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { handleVelumaEventsRequest } from "@/lib/ingest/veluma-events";
import { getDb } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Veluma's default delivery path for target_kind=sporacle (hospitality.v1).
 * Auth is the HMAC signature over the raw body (I13: the secret is the
 * credential; identity headers are ignored). Fail-closed 401 when
 * VELUMA_WEBHOOK_SECRET is unset. profile.upsert is acked as skipped and
 * never stored or logged (I1).
 */
export async function POST(req: Request) {
  const env = serverEnv();
  const raw = Buffer.from(await req.arrayBuffer());
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  const db = await getDb();
  const result = await handleVelumaEventsRequest(db, raw, headers, env.VELUMA_WEBHOOK_SECRET);
  return NextResponse.json(result.body, { status: result.status });
}
