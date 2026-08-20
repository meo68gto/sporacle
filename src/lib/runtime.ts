import "server-only";
import { openDb, type Db } from "@/db/client";
import { seedSources, EXTRA_ADAPTERS } from "@/db/sources";
import { feedAdapter } from "@/db/schema";
import { seedHypotheses } from "@/lib/reconciliation/hypotheses";
import { GOLDEN_DAY, goldenD9, goldenD10, rangedD1Window } from "@/lib/ingest/fixtures/golden";
import { ingestEnvelope } from "@/lib/ingest/pipeline";
import { serverEnv } from "@/lib/env";
import { measureFact } from "@/db/schema";

let booted = false;

export async function getDb(): Promise<Db> {
  const env = serverEnv();
  const db = await openDb(env.SPORACLE_DATA_DIR);
  if (!booted) {
    await seedSources(db);
    await seedHypotheses(db);
    for (const a of EXTRA_ADAPTERS) {
      await db.insert(feedAdapter).values({ feedKey: a.feedKey, status: a.status, notes: a.notes }).onConflictDoNothing();
    }
    const facts = await db.select().from(measureFact);
    if (facts.length === 0) {
      for (const envl of GOLDEN_DAY) await ingestEnvelope(db, envl, "file_drop", `${envl.feed_key}.json`);
      for (const envl of rangedD1Window()) await ingestEnvelope(db, envl, "file_drop");
      await ingestEnvelope(db, goldenD9, "file_drop");
      await ingestEnvelope(db, goldenD10, "file_drop");
    }
    booted = true;
  }
  return db;
}

export function resetBoot(): void {
  booted = false;
}
