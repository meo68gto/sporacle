import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { appTables } from "@/db/schema";
import { getTableColumns } from "drizzle-orm";
import { FORBIDDEN_MEASURE_IDS, MEASURE_KEYS } from "@/lib/measures/registry";

export const FORBIDDEN_COLUMNS = [
  "name",
  "first_name",
  "last_name",
  "guest",
  "email",
  "phone",
  "address",
  "card",
  "pan",
  "cvv",
  "account_number",
  "dob",
  "guest_email",
  "revenue",
  "totalSales",
  "amount",
  "total_sales",
  "total_amount",
  "tenant_id",
] as const;

export function schemaColumnNames(): string[] {
  const names: string[] = [];
  for (const table of Object.values(appTables)) {
    names.push(...Object.keys(getTableColumns(table)));
  }
  return names;
}

export function forbiddenColumnHits(columns = schemaColumnNames()): string[] {
  return columns.filter((c) => (FORBIDDEN_COLUMNS as readonly string[]).includes(c));
}

export function scanSourceForForbidden(root: string): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const ent of readdirSync(dir)) {
      const full = path.join(dir, ent);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!full.endsWith(".ts") && !full.endsWith(".tsx")) continue;
      const text = readFileSync(full, "utf8");
      if (/\btenant_id\b/.test(text) && !full.endsWith("invariants.ts") && !full.includes(".test.")) {
        hits.push(`${full}: tenant_id`);
      }
    }
  };
  walk(root);
  return hits;
}

export function revenueMeasureHits(): string[] {
  return MEASURE_KEYS.filter((k) => (FORBIDDEN_MEASURE_IDS as readonly string[]).includes(k));
}

export function wouldFailGuestEmail(snippet: string): boolean {
  return /guest_email/.test(snippet);
}
