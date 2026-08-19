import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyRecord } from "./lib/apply.mjs";
import { loadState, saveState } from "./lib/store.mjs";
import { verifyVelumaHmac } from "./lib/velumaHmac.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);

function json(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(raw);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleIngest(req, res) {
  const secret = (process.env.VELUMA_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    json(res, 401, { error: "VELUMA_WEBHOOK_SECRET is not configured" });
    return;
  }
  const raw = await readBody(req);
  const auth = verifyVelumaHmac(req.headers, raw, secret);
  if (!auth.ok) {
    json(res, 401, { error: "invalid signature", reason: auth.reason });
    return;
  }
  let body = {};
  try {
    body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
  } catch {
    json(res, 400, { error: "invalid json" });
    return;
  }
  const records = Array.isArray(body.records)
    ? body.records
    : body.eventType
      ? [{ eventType: body.eventType, payload: body.payload, profile: body.profile }]
      : [];
  const state = await loadState();
  const source = String(body.source || "veluma");
  const applied = [];
  for (const record of records) {
    applied.push(applyRecord(state, record, source));
  }
  await saveState(state);
  json(res, 200, {
    id: applied[0]?.id || "ok",
    stored: applied.length,
    applied,
  });
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

async function handleStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const file = path.normalize(path.join(root, urlPath.replace(/^\/+/, "")));
  if (!file.startsWith(root)) {
    json(res, 403, { error: "forbidden" });
    return;
  }
  try {
    const buf = await readFile(file);
    const ext = path.extname(file);
    res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream" });
    res.end(buf);
  } catch {
    json(res, 404, { error: "not found" });
  }
}

export function createApp() {
  return createServer(async (req, res) => {
    try {
      if (req.method === "GET" && (req.url || "").startsWith("/healthz")) {
        json(res, 200, { status: "ok" });
        return;
      }
      if (req.method === "POST" && (req.url || "").startsWith("/api/integrations/veluma/events")) {
        await handleIngest(req, res);
        return;
      }
      if (req.method === "GET") {
        await handleStatic(req, res);
        return;
      }
      json(res, 405, { error: "method not allowed" });
    } catch (err) {
      json(res, 500, { error: "internal", detail: String(err) });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const server = createApp();
  server.listen(PORT, () => {
    console.log(`sporacle http://localhost:${PORT}`);
  });
}
