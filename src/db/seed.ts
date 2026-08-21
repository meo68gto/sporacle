// CLI entry: boots the on-disk PGlite database and runs the same seed path the
// app uses (sources, hypotheses, golden fixture envelopes). Run via
// `pnpm seed` (which sets --conditions=react-server so the `server-only`
// markers in the import chain resolve to their empty module).
import { getDb } from "@/lib/runtime";
import { closeAllDbs } from "@/db/client";
import { measureFact, ingestRun, source } from "@/db/schema";

const db = await getDb();
const facts = await db.select({ id: measureFact.id }).from(measureFact);
const runs = await db.select({ id: ingestRun.id }).from(ingestRun);
const sources = await db.select({ key: source.key }).from(source);
console.log(
  `seeded: ${sources.length} sources, ${runs.length} ingest runs, ${facts.length} measure facts`,
);
await closeAllDbs();
// PGlite's worker keeps the event loop alive even after close on some
// platforms; the seed is fully flushed at this point, so exit explicitly.
process.exit(0);
