import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { openMemoryDb } from "@/db/client";
import { ingestRun, velumaEvent } from "@/db/schema";
import { signVelumaBody } from "@/lib/ingest/hmac";
import {
  handleVelumaEventsRequest,
  processVelumaEventsBatch,
  parseContractMajor,
  VELUMA_PII_FIELD_NAMES,
  VELUMA_EVENTS_TRANSPORT,
} from "@/lib/ingest/veluma-events";

/**
 * Fixtures rule: NO realistic guest data. Every guest-ish value below is an
 * obviously fake marker ("ZZFAKE…") whose absence from the database is asserted.
 */
const SECRET = "test-webhook-secret";
const PII_MARKER = "ZZFAKE";

function fakeProfileRecord(key: string) {
  return {
    eventType: "profile.upsert",
    canonical_type: "customer",
    idempotency_key: key,
    source_ref: "opera:profile:fixture-1",
    payload: {
      canonical_type: "customer",
      customer_id: "ZZFAKE-CUST-000",
      name: "ZZFAKE GUEST DO NOT STORE",
      email: "zzfake@example.invalid",
      phone: "ZZFAKE-000-0000",
    },
    profile: {
      externalId: "ZZFAKE-CUST-000",
      fullName: "ZZFAKE GUEST DO NOT STORE",
      email: "zzfake@example.invalid",
      phone: "ZZFAKE-000-0000",
      loyaltyId: "ZZFAKE-LOYAL-000",
    },
    envelope: {
      schema_version: "hospitality.v1",
      property_id: "FSP",
      canonical_type: "customer",
      idempotency_key: key,
      source_lineage: { connector: "opera", run_id: "runfix-1", source_ref: "opera:profile:fixture-1" },
      payload: { customer_id: "ZZFAKE-CUST-000", email: "zzfake@example.invalid" },
    },
  };
}

function fakeBookingRecord(key: string, extraPayload: Record<string, unknown> = {}) {
  return {
    eventType: "spa.booking.created",
    canonical_type: "spa_booking",
    idempotency_key: key,
    source_ref: "b4t:booking:fixture-1",
    payload: {
      booking_id: "bkg-fixture-0001",
      service_code: "SVC-MASSAGE-50",
      start_at: "2026-08-21T17:00:00Z",
      end_at: "2026-08-21T17:50:00Z",
      business_date: "2026-08-21",
      status: "booked",
      party_size: 1,
      value_cents: 14900,
      channel: "ONLINE",
      technician_ref: "tech_017",
      // PII-shaped fields that MUST be stripped by the keep-allowlist:
      guestName: `${PII_MARKER} GUEST DO NOT STORE`,
      email: "zzfake@example.invalid",
      phone: "ZZFAKE-000-0000",
      customer_id: "ZZFAKE-CUST-000",
      room_number: "ZZFAKE-9999",
      notes: `${PII_MARKER} free text that must never persist`,
      ...extraPayload,
    },
    envelope: {
      schema_version: "hospitality.v1",
      property_id: "FSP",
      idempotency_key: key,
      source_lineage: { connector: "book4time", run_id: "runfix-2", source_ref: "b4t:booking:fixture-1" },
    },
  };
}

function fakeReservationRecord(key: string) {
  return {
    eventType: "outlet.reservation.upsert",
    canonical_type: "outlet_reservation",
    idempotency_key: key,
    source_ref: "pms:outlet:fixture-1",
    payload: {
      reservation_id: "rsv-fixture-0001",
      outlet_code: "OUTLET-POOL",
      business_date: "2026-08-22",
      status: "confirmed",
      covers: 2,
      value_cents: 5000,
      email: "zzfake@example.invalid",
      fullName: `${PII_MARKER} GUEST`,
    },
    envelope: {
      schema_version: "hospitality.v1",
      property_id: "FSP",
      source_lineage: { connector: "pms", run_id: "runfix-3" },
    },
  };
}

function batchOf(records: unknown[], contractVersion = "hospitality.v1") {
  return {
    source: "veluma",
    contractVersion,
    target_slug: "sporacle",
    property_id: "FSP",
    target_kind: "sporacle",
    records,
    records_skipped_by_policy: 0,
  };
}

function signedHeaders(body: string, batchKey?: string, tsOverride?: string) {
  const ts = tsOverride ?? String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-veluma-timestamp": ts,
    "x-veluma-signature": signVelumaBody(SECRET, ts, body),
    "x-veluma-target-slug": "sporacle",
    "x-veluma-fin-source": "veluma",
    "x-veluma-property-id": "FSP",
  };
  if (batchKey) headers["x-veluma-idempotency-key"] = batchKey;
  return headers;
}

async function freshDb() {
  return openMemoryDb();
}

const ALL_TABLES = [
  "source",
  "ingest_run",
  "measure_fact",
  "technician_pseudonym",
  "reconciliation_hypothesis",
  "measure_definition",
  "sufficiency_check",
  "quarantine",
  "audit_event",
  "feed_adapter",
  "collision_log",
  "veluma_event",
];

async function dumpAllTables(pglite: Awaited<ReturnType<typeof openMemoryDb>>["pglite"]): Promise<string> {
  const parts: string[] = [];
  for (const table of ALL_TABLES) {
    const res = await pglite.query(`SELECT * FROM ${table}`);
    parts.push(JSON.stringify(res.rows));
  }
  return parts.join("\n");
}

describe("veluma events — signature verification (fail-closed, I13)", () => {
  it("401 when VELUMA_WEBHOOK_SECRET is unset (fail-closed)", async () => {
    const { db } = await freshDb();
    const body = JSON.stringify(batchOf([fakeBookingRecord("idem-nosecret-1")]));
    const res = await handleVelumaEventsRequest(db, Buffer.from(body), signedHeaders(body), undefined);
    expect(res.status).toBe(401);
    const empty = await handleVelumaEventsRequest(db, Buffer.from(body), signedHeaders(body), "   ");
    expect(empty.status).toBe(401);
    expect(await db.select().from(velumaEvent)).toHaveLength(0);
  });

  it("401 on invalid signature", async () => {
    const { db } = await freshDb();
    const body = JSON.stringify(batchOf([fakeBookingRecord("idem-badsig-1")]));
    const headers = signedHeaders(body);
    headers["x-veluma-signature"] = "deadbeef".repeat(8);
    const res = await handleVelumaEventsRequest(db, Buffer.from(body), headers, SECRET);
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe("bad_signature");
    expect(await db.select().from(velumaEvent)).toHaveLength(0);
  });

  it("401 on timestamp skew and on missing headers", async () => {
    const { db } = await freshDb();
    const body = JSON.stringify(batchOf([]));
    const stale = String(Math.floor(Date.now() / 1000) - 3600);
    const res = await handleVelumaEventsRequest(db, Buffer.from(body), signedHeaders(body, undefined, stale), SECRET);
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe("timestamp_skew");
    const noHeaders = await handleVelumaEventsRequest(db, Buffer.from(body), {}, SECRET);
    expect(noHeaders.status).toBe(401);
    expect(noHeaders.body.reason).toBe("missing_headers");
  });

  it("200 on a valid signature over the exact raw body", async () => {
    const { db } = await freshDb();
    const body = JSON.stringify(batchOf([fakeBookingRecord("idem-goodsig-1")]));
    const res = await handleVelumaEventsRequest(db, Buffer.from(body), signedHeaders(body, "batch-goodsig-1"), SECRET);
    expect(res.status).toBe(200);
  });
});

describe("veluma events — batch validation", () => {
  it("400 on undecodable json", async () => {
    const { db } = await freshDb();
    const body = "{not json";
    const res = await handleVelumaEventsRequest(db, Buffer.from(body), signedHeaders(body), SECRET);
    expect(res.status).toBe(400);
  });

  it("400 on unsupported contractVersion major (mirrors parse_contract_major)", async () => {
    const { db } = await freshDb();
    const body = JSON.stringify(batchOf([fakeBookingRecord("idem-v2-1")], "hospitality.v2"));
    const res = await handleVelumaEventsRequest(db, Buffer.from(body), signedHeaders(body), SECRET);
    expect(res.status).toBe(400);
    expect(await db.select().from(velumaEvent)).toHaveLength(0);
    expect(parseContractMajor("hospitality.v1")).toBe(1);
    expect(parseContractMajor("hospitality.v2")).toBe(2);
    expect(parseContractMajor("garbage")).toBeNull();
  });

  it("400 on an envelope missing contractVersion", async () => {
    const { db } = await freshDb();
    const result = await processVelumaEventsBatch(db, { records: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});

describe("veluma events — I1: profile.upsert is never stored", () => {
  it("acks profile.upsert as skipped and persists no PII in ANY table", async () => {
    const { db, pglite } = await freshDb();
    const body = JSON.stringify(
      batchOf([fakeProfileRecord("idem-profile-1"), fakeBookingRecord("idem-bkg-1")]),
    );
    const res = await handleVelumaEventsRequest(db, Buffer.from(body), signedHeaders(body, "batch-pii-1"), SECRET);
    expect(res.status).toBe(200);
    const ack = res.body.ack as { applied: number; merged: number; skipped: number };
    expect(ack.applied).toBe(1);
    expect(ack.skipped).toBe(1);

    const events = await db.select().from(velumaEvent);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("spa.booking.created");

    // Nothing guest-identifying may land anywhere — scan every table.
    const dump = await dumpAllTables(pglite);
    expect(dump).not.toContain(PII_MARKER);
    expect(dump).not.toContain("zzfake@example.invalid");
    expect(dump).not.toContain("profile.upsert-payload");
    expect(dump.toLowerCase()).not.toContain("do not store");
  });

  it("the veluma_event table itself has no PII-named columns (I1 grep)", async () => {
    const columns = Object.keys(getTableColumns(velumaEvent));
    const lower = new Set(VELUMA_PII_FIELD_NAMES.map((n) => n.toLowerCase()));
    expect(columns.filter((c) => lower.has(c.toLowerCase()))).toEqual([]);
  });
});

describe("veluma events — booking/reservation persisted PII-free", () => {
  it("stores spa.booking.created with operational fields, booking_date basis, and provenance (I4, I6)", async () => {
    const { db } = await freshDb();
    const body = JSON.stringify(batchOf([fakeBookingRecord("idem-bkg-2")]));
    const res = await handleVelumaEventsRequest(db, Buffer.from(body), signedHeaders(body, "batch-bkg-2"), SECRET);
    expect(res.status).toBe(200);
    const runId = res.body.id as string;
    const row = (await db.select().from(velumaEvent))[0];
    expect(row).toBeDefined();
    expect(row?.ingestRunId).toBe(runId); // I4 provenance link
    expect(row?.dateBasis).toBe("booking_date"); // I6
    expect(row?.bookingRef).toBe("bkg-fixture-0001");
    expect(row?.serviceCode).toBe("SVC-MASSAGE-50");
    expect(row?.businessDate).toBe("2026-08-21");
    expect(row?.status).toBe("booked");
    expect(row?.partySize).toBe(1);
    expect(row?.valueCents).toBe(14900); // integer cents (Money)
    expect(row?.channel).toBe("ONLINE");
    expect(row?.technicianRef).toBe("tech_017"); // pseudonymous only (I11)
    expect(row?.receivedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(row)).not.toContain(PII_MARKER);
    expect(JSON.stringify(row)).not.toContain("zzfake@example.invalid");

    const run = (await db.select().from(ingestRun).where(eq(ingestRun.id, runId)))[0];
    expect(run?.transport).toBe(VELUMA_EVENTS_TRANSPORT);
    expect(run?.status).toBe("success");
    expect(run?.rowCount).toBe(1);
  });

  it("stores outlet.reservation.upsert with service_date basis (I6)", async () => {
    const { db } = await freshDb();
    const result = await processVelumaEventsBatch(db, batchOf([fakeReservationRecord("idem-rsv-1")]));
    expect(result.ok).toBe(true);
    const row = (await db.select().from(velumaEvent))[0];
    expect(row?.eventType).toBe("outlet.reservation.upsert");
    expect(row?.dateBasis).toBe("service_date");
    expect(row?.outletCode).toBe("OUTLET-POOL");
    expect(row?.partySize).toBe(2);
    expect(row?.valueCents).toBe(5000);
    expect(JSON.stringify(row)).not.toContain(PII_MARKER);
  });

  it("degrades a non-integer cents value to null, never a rounded number (Money, I5)", async () => {
    const { db } = await freshDb();
    const result = await processVelumaEventsBatch(
      db,
      batchOf([fakeBookingRecord("idem-float-1", { value_cents: 149.5 })]),
    );
    expect(result.ok).toBe(true);
    const row = (await db.select().from(velumaEvent))[0];
    expect(row?.valueCents).toBeNull();
  });

  it("skips unknown event types without storing them", async () => {
    const { db } = await freshDb();
    const result = await processVelumaEventsBatch(
      db,
      batchOf([
        {
          eventType: "finance.updated",
          idempotency_key: "idem-unknown-1",
          payload: { anything: "x" },
        },
      ]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ack).toEqual({ applied: 0, merged: 0, skipped: 1 });
    }
    expect(await db.select().from(velumaEvent)).toHaveLength(0);
  });
});

describe("veluma events — idempotent redelivery", () => {
  it("redelivered batch (same X-Veluma-Idempotency-Key) is a noop acked as skipped", async () => {
    const { db } = await freshDb();
    const body = JSON.stringify(batchOf([fakeBookingRecord("idem-redeliver-1")]));
    const first = await handleVelumaEventsRequest(db, Buffer.from(body), signedHeaders(body, "batch-rd-1"), SECRET);
    expect(first.status).toBe(200);
    expect((first.body.ack as { applied: number }).applied).toBe(1);

    const second = await handleVelumaEventsRequest(db, Buffer.from(body), signedHeaders(body, "batch-rd-1"), SECRET);
    expect(second.status).toBe(200);
    const ack = second.body.ack as { applied: number; merged: number; skipped: number };
    expect(ack).toEqual({ applied: 0, merged: 0, skipped: 1 });

    expect(await db.select().from(velumaEvent)).toHaveLength(1);
    const runs = await db.select().from(ingestRun);
    expect(runs.some((r) => r.status === "noop")).toBe(true);
  });

  it("record-level dedupe on idempotency_key across different batches", async () => {
    const { db } = await freshDb();
    const r1 = await processVelumaEventsBatch(db, batchOf([fakeBookingRecord("idem-dup-1")]), {
      batchKey: "batch-dup-a",
    });
    expect(r1.ok && r1.ack.applied).toBe(1);
    const r2 = await processVelumaEventsBatch(
      db,
      batchOf([fakeBookingRecord("idem-dup-1"), fakeBookingRecord("idem-dup-2")]),
      { batchKey: "batch-dup-b" },
    );
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.ack.applied).toBe(1);
      expect(r2.ack.skipped).toBe(1);
    }
    expect(await db.select().from(velumaEvent)).toHaveLength(2);
  });
});

describe("veluma events — ack shape Veluma parses", () => {
  it("returns {id, ack:{applied,merged,skipped}} on 200", async () => {
    const { db } = await freshDb();
    const body = JSON.stringify(
      batchOf([fakeProfileRecord("idem-ack-p1"), fakeBookingRecord("idem-ack-b1"), fakeReservationRecord("idem-ack-r1")]),
    );
    const res = await handleVelumaEventsRequest(db, Buffer.from(body), signedHeaders(body, "batch-ack-1"), SECRET);
    expect(res.status).toBe(200);
    expect(typeof res.body.id).toBe("string"); // target_ref for Veluma lineage
    const ack = res.body.ack as Record<string, number>;
    expect(Object.keys(ack).sort()).toEqual(["applied", "merged", "skipped"]);
    expect(ack.applied).toBe(2);
    expect(ack.merged).toBe(0);
    expect(ack.skipped).toBe(1); // the profile.upsert, declined by design (I1)
  });
});
