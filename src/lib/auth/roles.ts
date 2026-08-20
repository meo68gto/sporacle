export const ROLES = ["viewer", "analyst", "admin"] as const;
export type Role = (typeof ROLES)[number];

export type SessionUser = {
  actor: string;
  role: Role;
};

const RANK: Record<Role, number> = { viewer: 1, analyst: 2, admin: 3 };

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function atLeast(user: SessionUser, role: Role): boolean {
  return RANK[user.role] >= RANK[role];
}

export type Action =
  | "read"
  | "add_hypothesis"
  | "promote_hypothesis"
  | "ingest"
  | "unblock_source"
  | "change_config"
  | "view_audit";

export function can(user: SessionUser, action: Action): boolean {
  switch (action) {
    case "read":
      return true;
    case "add_hypothesis":
      return atLeast(user, "analyst");
    case "ingest":
    case "promote_hypothesis":
    case "unblock_source":
    case "change_config":
    case "view_audit":
      return user.role === "admin";
  }
}

export const ROUTE_ACTIONS: Record<string, Action> = {
  "/": "read",
  "/variance": "read",
  "/hypotheses": "read",
  "/health": "read",
  "/demand": "read",
  "/status": "read",
  "/booking-source": "read",
  "/occupancy": "read",
  "/turnaway": "read",
  "/labor": "read",
  "/coverage": "read",
  "/forward-book": "read",
  "/feeds": "read",
  "/veluma": "read",
  "/gates": "read",
  "/pricing": "read",
  "/ingest": "ingest",
  "/audit": "view_audit",
};
