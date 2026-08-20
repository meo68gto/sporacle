import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { appTables } from "@/db/schema";
import {
  forbiddenColumnHits,
  revenueMeasureHits,
  scanSourceForForbidden,
  wouldFailGuestEmail,
} from "@/lib/invariants";
import { MEASURE_KEYS } from "@/lib/measures/registry";
import { phoenixOffsetHours } from "@/lib/date";
import { fromCents, toDisplay } from "@/lib/money";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DDL } from "@/db/sql";

describe("I1/I2 schema invariants", () => {
  it("has no forbidden columns", () => {
    expect(forbiddenColumnHits()).toEqual([]);
  });

  it("fails a guest_email column if added", () => {
    expect(wouldFailGuestEmail("guestEmail: text('guest_email')")).toBe(true);
    const columns = Object.keys(getTableColumns(appTables.source));
    expect(columns).not.toContain("guestEmail");
  });

  it("registry has no revenue measure", () => {
    expect(revenueMeasureHits()).toEqual([]);
    expect(MEASURE_KEYS).not.toContain("revenue");
  });

  it("numeric columns are integers", () => {
    expect(DDL).not.toMatch(/\b(float|double|real)\b/i);
    expect(DDL).toMatch(/integer/);
  });

  it("src has no tenant_id", () => {
    const root = path.join(process.cwd(), "src");
    expect(scanSourceForForbidden(root)).toEqual([]);
  });
});

describe("I13 env is server-only", () => {
  it("env module imports server-only", () => {
    const text = readFileSync(path.join(process.cwd(), "src/lib/env.ts"), "utf8");
    expect(text).toContain('import "server-only"');
    expect(text).toContain("VELUMA_API_KEY");
  });
});

describe("Phoenix has no DST", () => {
  it("January and July offsets are both 7 hours", () => {
    const jan = phoenixOffsetHours(new Date("2026-01-15T12:00:00Z"));
    const jul = phoenixOffsetHours(new Date("2026-07-15T12:00:00Z"));
    expect(jan).toBe(7);
    expect(jul).toBe(7);
  });
});

describe("Money", () => {
  it("rejects floats", () => {
    expect(() => fromCents(10.5)).toThrow();
  });
  it("formats cents", () => {
    expect(toDisplay(fromCents(1_022_600))).toBe("$10,226.00");
    expect(toDisplay(fromCents(1_580_195))).toBe("$15,801.95");
  });
});
