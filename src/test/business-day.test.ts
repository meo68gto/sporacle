import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openMemoryDb } from "@/db/client";
import { seedSources } from "@/db/sources";
import { ingestEnvelope } from "@/lib/ingest/pipeline";
import { GOLDEN_DAY, rangedD1Window } from "@/lib/ingest/fixtures/golden";
import { activeFacts } from "@/lib/queries/facts";
import { latestDeliveredDay, shiftBusinessDate } from "@/lib/business-day";

describe("derived business day (I5 — never hardcoded)", () => {
  it("returns null when nothing was delivered — callers render the no-delivery state, not a fallback date", () => {
    expect(latestDeliveredDay([])).toBeNull();
  });

  it("derives the latest delivered day per source measure from real ingests", async () => {
    const { db } = await openMemoryDb();
    await seedSources(db);
    for (const env of GOLDEN_DAY) await ingestEnvelope(db, env, "file_drop");
    for (const env of rangedD1Window()) await ingestEnvelope(db, env, "file_drop");
    const all = await activeFacts(db);

    // D1 (Today / demand / labor derivation): latest total-row day includes
    // the ranged window, which reaches 2026-08-20.
    expect(
      latestDeliveredDay(all, { measureKeys: ["appt_count_by_hour"], totalRowsOnly: true }),
    ).toBe("2026-08-20");

    // D3/D4/D5/D6 screens: golden day only.
    expect(
      latestDeliveredDay(all, { measureKeys: ["appt_count_by_status", "appt_value_by_status"] }),
    ).toBe("2026-08-19");
    expect(
      latestDeliveredDay(all, {
        measureKeys: ["service_value_by_facility", "service_count_by_facility", "facility_fill_pct"],
      }),
    ).toBe("2026-08-19");
    expect(
      latestDeliveredDay(all, { measureKeys: ["booking_value_by_source", "booking_count_by_source"] }),
    ).toBe("2026-08-19");
    expect(latestDeliveredDay(all, { measureKeys: ["turnaway_count", "turnaway_value"] })).toBe(
      "2026-08-19",
    );

    // A measure no report ever delivered stays null (I5) — never a default.
    expect(latestDeliveredDay(all, { measureKeys: ["no_such_measure"] })).toBeNull();
  });

  it("shifts business dates by pure calendar arithmetic (Phoenix has no DST)", () => {
    expect(shiftBusinessDate("2026-08-20", -13)).toBe("2026-08-07");
    expect(shiftBusinessDate("2026-08-20", -6)).toBe("2026-08-14");
    expect(shiftBusinessDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftBusinessDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("nothing in src/app hardcodes a business day (I5)", () => {
    // Every source file under src/app — pages, layouts, server actions, route
    // handlers. A hardcoded day anywhere in the app layer defeats the shared
    // derivation, so the guard greps them all, not just page.tsx.
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const ent of readdirSync(dir)) {
        const full = path.join(dir, ent);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (full.endsWith(".tsx") || full.endsWith(".ts")) out.push(full);
      }
      return out;
    };
    const hits: string[] = [];
    for (const f of walk(path.join(process.cwd(), "src/app"))) {
      const text = readFileSync(f, "utf8");
      if (/const DAY\s*=|"2026-08-19"/.test(text)) hits.push(f);
    }
    expect(hits).toEqual([]);
  });
});
