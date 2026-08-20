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
  const res = NextResponse.redirect(new URL("/variance", req.url), 303);
  res.cookies.set(SESSION_COOKIE, encodeSession(env.AUTH_SECRET, user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
