import { getDb } from "@/lib/runtime";

const db = await getDb();
console.log("seeded", db);
