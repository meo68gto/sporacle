import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server.mjs";
import { signVelumaBody } from "../lib/velumaHmac.mjs";

const SECRET = "sporacle-test-hmac";

function signed(body) {
  const raw = Buffer.from(JSON.stringify(body));
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    raw,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(raw.length),
      "x-veluma-timestamp": timestamp,
      "x-veluma-signature": signVelumaBody(SECRET, timestamp, raw),
    },
  };
}

async function withServer(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sporacle-"));
  process.env.VELUMA_WEBHOOK_SECRET = SECRET;
  process.env.SPORACLE_DATA_DIR = dir;
  const server = createApp();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.VELUMA_WEBHOOK_SECRET;
    delete process.env.SPORACLE_DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  }
}

test("unsigned ingest is rejected", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/integrations/veluma/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: [] }),
    });
    assert.equal(res.status, 401);
  });
});

test("signed profile upsert is stored", async () => {
  await withServer(async (base) => {
    const body = {
      source: "veluma",
      contractVersion: "v0",
      records: [
        {
          eventType: "profile.upsert",
          profile: { fullName: "Ada Lovelace", email: "ada@sporacle.test", loyaltyId: "LOY-1" },
        },
      ],
    };
    const { raw, headers } = signed(body);
    const res = await fetch(`${base}/api/integrations/veluma/events`, {
      method: "POST",
      headers,
      body: raw,
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.stored, 1);
    assert.equal(json.applied[0].applied, "profile_added");
  });
});

test("spa booking is stored as a booking", async () => {
  await withServer(async (base) => {
    const body = {
      source: "veluma",
      records: [
        {
          eventType: "spa.booking.created",
          payload: { venue: "Wellness", nameOnBooking: "Ada", startsAt: "2026-08-20T10:00:00Z" },
        },
      ],
    };
    const { raw, headers } = signed(body);
    const res = await fetch(`${base}/api/integrations/veluma/events`, {
      method: "POST",
      headers,
      body: raw,
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.applied[0].applied, "booking");
  });
});
