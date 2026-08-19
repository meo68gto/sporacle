import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function dataDir() {
  return process.env.SPORACLE_DATA_DIR || path.join(process.cwd(), "data");
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

export async function loadState() {
  const dir = dataDir();
  await mkdir(dir, { recursive: true });
  return {
    dir,
    events: await readJson(path.join(dir, "events.json"), []),
    guests: await readJson(path.join(dir, "guests.json"), []),
    bookings: await readJson(path.join(dir, "bookings.json"), []),
  };
}

export async function saveState(state) {
  const dir = state.dir || dataDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "events.json"), JSON.stringify(state.events, null, 2));
  await writeFile(path.join(dir, "guests.json"), JSON.stringify(state.guests, null, 2));
  await writeFile(path.join(dir, "bookings.json"), JSON.stringify(state.bookings, null, 2));
}
