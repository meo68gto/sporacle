import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decodeSession, SESSION_COOKIE } from "./session";
import { serverEnv } from "@/lib/env";
import type { SessionUser } from "./roles";

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return decodeSession(serverEnv().AUTH_SECRET, jar.get(SESSION_COOKIE)?.value);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
