import { isRole, type Role, type SessionUser } from "./roles";

export function parseAllowlist(raw: string): Map<string, Role> {
  const map = new Map<string, Role>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [actor, role] = trimmed.split(":") as [string, string | undefined];
    if (!actor || !role || !isRole(role)) continue;
    map.set(actor.toLowerCase(), role);
  }
  return map;
}

export function lookupActor(allowlist: string, actor: string): SessionUser | null {
  const role = parseAllowlist(allowlist).get(actor.trim().toLowerCase());
  if (!role) return null;
  return { actor: actor.trim().toLowerCase(), role };
}
