import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { verifyVelumaHmac } from "@/lib/ingest/hmac";
import { ingestEnvelope } from "@/lib/ingest/pipeline";
import { getDb } from "@/lib/runtime";

export async function POST(req: Request) {
  const env = serverEnv();
  const secret = env.VELUMA_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "VELUMA_WEBHOOK_SECRET is not configured" }, { status: 401 });
  }
  const raw = Buffer.from(await req.arrayBuffer());
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  const auth = verifyVelumaHmac(headers, raw, secret);
  if (!auth.ok) {
    return NextResponse.json({ error: "invalid signature", reason: auth.reason }, { status: 401 });
  }
  let body: unknown = {};
  try {
    body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const db = await getDb();
  const result = await ingestEnvelope(db, body, "veluma_push");
  return NextResponse.json(result);
}
