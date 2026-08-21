import { NextResponse } from "next/server";
import { lookupActor } from "@/lib/auth/allowlist";
import { encodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "");
  const env = serverEnv();
  const user = lookupActor(env.AUTH_ALLOWLIST, email);
  if (!user) {
    return NextResponse.redirect(new URL("/login?error=forbidden", req.url), 303);
  }
  // Today is the landing screen (design spec §5) — keep in sync with the
  // root redirect in src/app/page.tsx and the e2e login assertion.
  const res = NextResponse.redirect(new URL("/today", req.url), 303);
  res.cookies.set(SESSION_COOKIE, encodeSession(env.AUTH_SECRET, user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
