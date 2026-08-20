import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const TIMESTAMP_SKEW_SECONDS = 5 * 60;

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/** Veluma Workforce contract: timestamp + "." + sha256(rawBody). */
export function signVelumaBody(secret: string, timestamp: string, body: Buffer | string): string {
  const digest = createHash("sha256").update(body).digest("hex");
  return createHmac("sha256", secret).update(`${timestamp}.${digest}`).digest("hex");
}

export function verifyVelumaHmac(
  headers: Record<string, string | string[] | undefined>,
  rawBody: Buffer,
  secret: string,
): { ok: true } | { ok: false; reason: string } {
  const timestamp = header(headers, "x-veluma-timestamp");
  const signature = header(headers, "x-veluma-signature");
  if (!timestamp || !signature) return { ok: false, reason: "missing_headers" };
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "bad_timestamp" };
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - tsNum) > TIMESTAMP_SKEW_SECONDS) {
    return { ok: false, reason: "timestamp_skew" };
  }
  const expected = signVelumaBody(secret, timestamp, rawBody);
  if (!safeEqual(expected, signature)) return { ok: false, reason: "bad_signature" };
  return { ok: true };
}

function header(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const raw = headers[key] ?? headers[key.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
}
