import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { handleVelumaEventsRequest, MAX_BODY_BYTES } from "@/lib/ingest/veluma-events";
import { getDb } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Veluma's default delivery path for target_kind=sporacle (hospitality.v1).
 * Auth is the HMAC signature over the raw body (I13: the secret is the
 * credential; identity headers are ignored). Fail-closed 401 when
 * VELUMA_WEBHOOK_SECRET is unset. Guest-profile events are acked as skipped
 * and never parsed, stored, or logged (I1). The expected property id is pinned
 * in server env (VELUMA_PROPERTY_ID), never taken from the request (I13).
 */
export async function POST(req: Request) {
  const env = serverEnv();

  // I2 size cap — reject via Content-Length before buffering when the client
  // declares its size; the handler re-checks the actual buffer as a backstop.
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "body_too_large", maxBytes: MAX_BODY_BYTES }, { status: 413 });
  }

  const raw = Buffer.from(await req.arrayBuffer());
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  try {
    const db = await getDb();
    const result = await handleVelumaEventsRequest(db, raw, headers, env.VELUMA_WEBHOOK_SECRET, {
      expectedPropertyId: env.VELUMA_PROPERTY_ID,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    // B2 — never a raw/unstructured 500: the handler already maps duplicates to
    // 409 and rolled-back storage errors to a structured 500; this is the last
    // resort for an unexpected failure (e.g. the DB never opened). The
    // transaction wrapper guarantees Veluma's retry is safe and exact.
    return NextResponse.json({ error: "internal_error", retryable: true }, { status: 500 });
  }
}
