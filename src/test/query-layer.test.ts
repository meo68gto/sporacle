import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DROP_DDL, DDL } from "@/db/sql";
import { openMemoryDb } from "@/db/client";
import { seedSources, SOURCE_SEED } from "@/db/sources";
import { source } from "@/db/schema";

describe("I11 query layer", () => {
  it("analytics queries do not import technician_pseudonym", () => {
    const text = readFileSync(path.join(process.cwd(), "src/lib/queries/facts.ts"), "utf8");
    expect(text).not.toMatch(/technicianPseudonym|technician_pseudonym/);
  });
});

describe("P1 schema seed", () => {
  it("seeds 10 sources and D7 blocked", async () => {
    const { db, pglite } = await openMemoryDb();
    await seedSources(db);
    const rows = await db.select().from(source);
    expect(rows).toHaveLength(10);
    expect(SOURCE_SEED).toHaveLength(10);
    const d7 = rows.find((r) => r.key === "D7");
    expect(d7?.status).toBe("blocked");
    expect(d7?.blockedReason).toBe("NullReferenceException");
    expect(d7?.blockedSince).toBe("2026-08-20");
    await pglite.exec(DROP_DDL);
    await pglite.exec(DDL);
    await seedSources(db);
    expect((await db.select().from(source)).length).toBe(10);
  });
});
