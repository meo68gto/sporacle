import { createHmac, timingSafeEqual } from "node:crypto";
import type { SessionUser } from "./roles";
import { isRole } from "./roles";

import { SESSION_COOKIE } from "./cookie-name";

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function encodeSession(secret: string, user: SessionUser, ttlSec = 60 * 60 * 12): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = Buffer.from(JSON.stringify({ ...user, exp })).toString("base64url");
  return `${payload}.${sign(secret, payload)}`;
}

export function decodeSession(secret: string, token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (!safeEqual(sign(secret, payload), sig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      actor?: string;
      role?: string;
      exp?: number;
    };
    if (!parsed.actor || !parsed.role || !isRole(parsed.role)) return null;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return { actor: parsed.actor, role: parsed.role };
  } catch {
    return null;
  }
}

export { SESSION_COOKIE };
