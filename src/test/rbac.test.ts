import { describe, expect, it } from "vitest";
import { can, ROUTE_ACTIONS, type Action, type Role } from "@/lib/auth/roles";
import { lookupActor } from "@/lib/auth/allowlist";

const matrix: Record<Role, Record<Action, boolean>> = {
  viewer: {
    read: true,
    add_hypothesis: false,
    promote_hypothesis: false,
    ingest: false,
    unblock_source: false,
    change_config: false,
    view_audit: false,
  },
  analyst: {
    read: true,
    add_hypothesis: true,
    promote_hypothesis: false,
    ingest: false,
    unblock_source: false,
    change_config: false,
    view_audit: false,
  },
  admin: {
    read: true,
    add_hypothesis: true,
    promote_hypothesis: true,
    ingest: true,
    unblock_source: true,
    change_config: true,
    view_audit: true,
  },
};

describe("RBAC matrix", () => {
  for (const role of Object.keys(matrix) as Role[]) {
    for (const action of Object.keys(matrix[role]) as Action[]) {
      it(`${role} ${action} => ${matrix[role][action]}`, () => {
        expect(can({ actor: "x", role }, action)).toBe(matrix[role][action]);
      });
    }
  }

  it("off-allowlist email is rejected", () => {
    expect(lookupActor("admin@sporacle.test:admin", "stranger@x.test")).toBeNull();
    expect(lookupActor("admin@sporacle.test:admin", "admin@sporacle.test")?.role).toBe("admin");
  });

  it("every app route is classified", () => {
    expect(Object.keys(ROUTE_ACTIONS).length).toBeGreaterThan(10);
  });
});
