import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import path from "node:path";
import { mkdirSync } from "node:fs";
import * as schema from "./schema";
import { DDL } from "./sql";

export type Db = PgliteDatabase<typeof schema>;

const clients = new Map<string, { pglite: PGlite; db: Db }>();

export async function openDb(dataDir: string): Promise<Db> {
  const existing = clients.get(dataDir);
  if (existing) return existing.db;
  mkdirSync(dataDir, { recursive: true });
  const pglite = new PGlite(path.join(dataDir, "pg"));
  await pglite.waitReady;
  await pglite.exec(DDL);
  const db = drizzle(pglite, { schema });
  clients.set(dataDir, { pglite, db });
  return db;
}

export async function openMemoryDb(): Promise<{ db: Db; pglite: PGlite }> {
  const pglite = new PGlite();
  await pglite.waitReady;
  await pglite.exec(DDL);
  const db = drizzle(pglite, { schema });
  return { db, pglite };
}

export async function resetMemory(pglite: PGlite): Promise<void> {
  await pglite.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pglite.exec(DDL);
}
