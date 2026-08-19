import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const TIMESTAMP_SKEW_SECONDS = 5 * 60;

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function signVelumaBody(secret, timestamp, body) {
  const digest = createHash("sha256").update(body).digest("hex");
  return createHmac("sha256", secret).update(`${timestamp}.${digest}`).digest("hex");
}

export function verifyVelumaHmac(headers, rawBody, secret) {
  const timestamp = headers["x-veluma-timestamp"];
  const signature = headers["x-veluma-signature"];
  if (!timestamp || !signature) return { ok: false, reason: "missing_headers" };
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "bad_timestamp" };
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - tsNum) > TIMESTAMP_SKEW_SECONDS) {
    return { ok: false, reason: "timestamp_skew" };
  }
  const expected = signVelumaBody(secret, String(timestamp), rawBody);
  if (!safeEqual(expected, signature)) return { ok: false, reason: "bad_signature" };
  return { ok: true };
}
