import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { openMemoryDb } from "@/db/client";
import { auditEvent, ingestRun, velumaEvent } from "@/db/schema";
import { signVelumaBody } from "@/lib/ingest/hmac";
import {
  classifyEventType,
  handleVelumaEventsRequest,
  processVelumaEventsBatch,
  parseContractMajor,
  MAX_BODY_BYTES,
  MAX_RECORDS_PER_BATCH,
  VELUMA_PII_FIELD_NAMES,
  VELUMA_EVENTS_SOURCE_ID,
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

/**
 * B1 — round-trip against Veluma's REAL wire shape. These fixtures mirror
 * `build_guest_platform_payload` + `_event_type` in
 * /home/user/veluma/apps/api/app/services/delivery/guest_platform.py and the
 * envelope in contract.py: canonical_type "customer" -> eventType
 * "profile.upsert" (plus a `profile` object); every other canonical type X ->
 * eventType "X.updated". The names "spa.booking.created" /
 * "outlet.reservation.upsert" are reserved allowlist labels Veluma cannot emit
 * today — both spellings must classify to the same stored kind.
 */
const WIRE_TENANT = "00000000-0000-0000-0000-000000000001";

function wireEnvelope(canonicalType: string, key: string, payload: Record<string, unknown>, sourceRef: string) {
  // Full HospitalityCanonicalEnvelope shape, duplicated payload included.
  return {
    tenant_id: WIRE_TENANT,
    property_id: "FSP",
    entity_id: null,
    canonical_type: canonicalType,
    schema_version: "hospitality.v1",
    idempotency_key: key,
    source_lineage: { connector: "book4time", run_id: "wire-run-1", source_ref: sourceRef },
    payload,
  };
}

function wireRecord(canonicalType: string, key: string, payload: Record<string, unknown>, sourceRef: string) {
  // Mirrors guest_platform._event_type exactly.
  const eventType = canonicalType === "customer" ? "profile.upsert" : `${canonicalType}.updated`;
  const record: Record<string, unknown> = {
    eventType,
    canonical_type: canonicalType,
    idempotency_key: key,
    source_ref: sourceRef,
    payload,
    envelope: wireEnvelope(canonicalType, key, payload, sourceRef),
  };
  if (eventType === "profile.upsert") {
    // Mirrors guest_platform._profile_fields (fake, PII-free markers only).
    record.profile = {
      externalId: "ZZFAKE-CUST-001",
      fullName: `${PII_MARKER} GUEST DO NOT STORE`,
      firstName: PII_MARKER,
      lastName: "GUEST",
      email: "zzfake@example.invalid",
      phone: "ZZFAKE-000-0000",
      loyaltyId: "ZZFAKE-LOYAL-001",
      vipTier: "vip",
      country: "ZZ",
      language: "zz",
    };
  }
  return record;
}

function wireBatch(records: unknown[], skippedByPolicy = 0) {
  // Mirrors the top-level payload of build_guest_platform_payload.
  return {
    source: "veluma",
    contractVersion: "hospitality.v1",
    tenant_id: WIRE_TENANT,
    target_slug: "sporacle",
    property_id: "FSP",
    organization_id: null,
    entity_id: null,
    target_kind: "sporacle",
    records,
    records_skipped_by_policy: skippedByPolicy,
  };
}

describe("veluma events — B1: event-type contract matches Veluma's mapper", () => {
  it("classifies both wire spellings of each family to one stored kind", () => {
    expect(classifyEventType("spa_booking.updated", "spa_booking")).toBe("spa_booking");
    expect(classifyEventType("spa.booking.created", "spa_booking")).toBe("spa_booking");
    expect(classifyEventType("outlet_reservation.updated", "outlet_reservation")).toBe("outlet_reservation");
    expect(classifyEventType("outlet.reservation.upsert", "outlet_reservation")).toBe("outlet_reservation");
    // I1: anything customer-canonical is a profile, whatever its eventType claims.
    expect(classifyEventType("profile.upsert", "customer")).toBe("profile");
    expect(classifyEventType("spa_booking.updated", "customer")).toBe("profile");
    // Everything else Veluma can emit ({canonical}.updated) is unknown -> skipped.
    expect(classifyEventType("finance.updated", "finance")).toBe("unknown");
    expect(classifyEventType("labor.updated", "labor")).toBe("unknown");
  });

  it("round-trips a batch shaped exactly like build_guest_platform_payload output", async () => {
    const { db, pglite } = await freshDb();
    const body = JSON.stringify(
      wireBatch([
        wireRecord(
          "customer",
          "wire-idem-profile-1",
          {
            canonical_type: "customer",
            customer_id: "ZZFAKE-CUST-001",
            name: `${PII_MARKER} GUEST DO NOT STORE`,
            email: "zzfake@example.invalid",
            phone: "ZZFAKE-000-0000",
            market_segment: "vip",
          },
          "opera:profile:wire-1",
        ),
        wireRecord(
          "spa_booking",
          "wire-idem-spa-1",
          {
            canonical_type: "spa_booking",
            booking_id: "bkg-wire-0001",
            service_code: "SVC-FACIAL-80",
            start_at: "2026-08-21T18:00:00Z",
            end_at: "2026-08-21T19:20:00Z",
            business_date: "2026-08-21",
            status: "booked",
            party_size: 1,
            value_cents: 27500,
            channel: "FRONT_DESK",
            technician_ref: "tech_018",
          },
          "b4t:booking:wire-1",
        ),
        wireRecord(
          "outlet_reservation",
          "wire-idem-outlet-1",
          {
            canonical_type: "outlet_reservation",
            reservation_id: "rsv-wire-0001",
            outlet_code: "OUTLET-CABANA",
            business_date: "2026-08-22",
            status: "confirmed",
            covers: 3,
            value_cents: 9000,
          },
          "pms:outlet:wire-1",
        ),
        // A canonical family Veluma can emit but Sporacle does not store:
        wireRecord("finance", "wire-idem-fin-1", { canonical_type: "finance", anything: "x" }, "b4t:fin:wire-1"),
      ]),
    );
    const res = await handleVelumaEventsRequest(db, Buffer.from(body), signedHeaders(body, "batch-wire-1"), SECRET);
    expect(res.status).toBe(200);
    const ack = res.body.ack as { applied: number; merged: number; skipped: number };
    expect(ack).toEqual({ applied: 2, merged: 0, skipped: 2 }); // profile + finance declined

    const events = await db.select().from(velumaEvent);
    expect(events).toHaveLength(2);
    const spa = events.find((e) => e.idempotencyKey === "wire-idem-spa-1");
    expect(spa?.eventType).toBe("spa_booking.updated"); // wire name kept verbatim (I12)
    expect(spa?.bookingRef).toBe("bkg-wire-0001");
    expect(spa?.dateBasis).toBe("booking_date"); // I6, fixed per kind
    expect(spa?.technicianRef).toBe("tech_018");
    const outlet = events.find((e) => e.idempotencyKey === "wire-idem-outlet-1");
    expect(outlet?.eventType).toBe("outlet_reservation.updated");
    expect(outlet?.bookingRef).toBe("rsv-wire-0001");
    expect(outlet?.dateBasis).toBe("service_date");
    expect(outlet?.partySize).toBe(3);

    // Nothing guest-identifying may land anywhere (I1).
    const dump = await dumpAllTables(pglite);
    expect(dump).not.toContain(PII_MARKER);
    expect(dump).not.toContain("zzfake@example.invalid");
    expect(dump).not.toContain("ZZFAKE-CUST-001");
  });

  it("the placeholder names Veluma can never emit are still accepted (compat)", async () => {
    const { db } = await freshDb();
    const result = await processVelumaEventsBatch(
      db,
      batchOf([fakeBookingRecord("compat-idem-1"), fakeReservationRecord("compat-idem-2")]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ack.applied).toBe(2);
    const kinds = (await db.select().from(velumaEvent)).map((e) => classifyEventType(e.eventType, e.canonicalType));
    expect(kinds.sort()).toEqual(["outlet_reservation", "spa_booking"]);
  });
});

describe("veluma events — I1: two-stage parse, profile payload never parsed", () => {
  it("skips a profile record without EVER accessing its payload/profile/envelope", async () => {
    const { db } = await freshDb();
    const trap = (name: string) => {
      throw new Error(`I1 violation: ${name} of a profile record was accessed`);
    };
    const rec: Record<string, unknown> = {
      eventType: "profile.upsert",
      canonical_type: "customer",
      idempotency_key: "idem-trap-1",
    };
    // Throwing getters: any structural parse (even a tolerant one) would blow up.
    Object.defineProperty(rec, "payload", { enumerable: true, get: () => trap("payload") });
    Object.defineProperty(rec, "profile", { enumerable: true, get: () => trap("profile") });
    Object.defineProperty(rec, "envelope", { enumerable: true, get: () => trap("envelope") });
    const result = await processVelumaEventsBatch(db, batchOf([rec]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ack).toEqual({ applied: 0, merged: 0, skipped: 1 });
      expect(result.skippedReasons.profile_never_parsed).toBe(1);
    }
    expect(await db.select().from(velumaEvent)).toHaveLength(0);
  });

  it("skips a customer-canonical record even under a booking eventType, unparsed", async () => {
    const { db } = await freshDb();
    const rec: Record<string, unknown> = {
      eventType: "spa_booking.updated", // lying label; canonical family wins
      canonical_type: "customer",
      idempotency_key: "idem-trap-2",
    };
    Object.defineProperty(rec, "payload", {
      enumerable: true,
      get: () => {
        throw new Error("I1 violation: customer-canonical payload was accessed");
      },
    });
    const result = await processVelumaEventsBatch(db, batchOf([rec]));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.skippedReasons.profile_never_parsed).toBe(1);
    expect(await db.select().from(velumaEvent)).toHaveLength(0);
  });

  it("skips an unknown eventType without parsing its payload (unknown_event_type)", async () => {
    const { db } = await freshDb();
    const rec: Record<string, unknown> = {
      eventType: "labor.updated",
      canonical_type: "labor",
      idempotency_key: "idem-trap-3",
    };
    Object.defineProperty(rec, "payload", {
      enumerable: true,
      get: () => {
        throw new Error("payload of an unknown event was accessed");
      },
    });
    const result = await processVelumaEventsBatch(db, batchOf([rec]));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.skippedReasons.unknown_event_type).toBe(1);
    expect(await db.select().from(velumaEvent)).toHaveLength(0);
  });
});

describe("veluma events — I1: persisted VALUES are hardened, not just column names", () => {
  it("a real-name technician_ref never persists (pseudonym pattern only, I11)", async () => {
    const { db, pglite } = await freshDb();
    const result = await processVelumaEventsBatch(
      db,
      batchOf([fakeBookingRecord("idem-tech-name-1", { technician_ref: `${PII_MARKER} Jane Doe` })]),
    );
    expect(result.ok).toBe(true);
    const row = (await db.select().from(velumaEvent))[0];
    expect(row).toBeDefined();
    expect(row?.technicianRef).toBeNull(); // rejected to null, row still stored
    expect(await dumpAllTables(pglite)).not.toContain("Jane Doe");
  });

  it("an email-shaped source_ref never persists (opaque-token rule)", async () => {
    const { db, pglite } = await freshDb();
    const rec = fakeBookingRecord("idem-email-ref-1");
    rec.source_ref = "zzfake.guest@example.invalid";
    const result = await processVelumaEventsBatch(db, batchOf([rec]));
    expect(result.ok).toBe(true);
    const row = (await db.select().from(velumaEvent))[0];
    expect(row?.sourceRef).toBeNull();
    expect(await dumpAllTables(pglite)).not.toContain("zzfake.guest@example.invalid");
  });

  it("a phone-shaped ref and an overlong ref reject to null", async () => {
    const { db, pglite } = await freshDb();
    const result = await processVelumaEventsBatch(
      db,
      batchOf([
        fakeBookingRecord("idem-phone-ref-1", { channel: "+1 (480) 555-0100" }),
        fakeBookingRecord("idem-long-ref-1", { service_code: "Z".repeat(500) }),
      ]),
    );
    expect(result.ok).toBe(true);
    const rows = await db.select().from(velumaEvent);
    expect(rows.find((r) => r.idempotencyKey === "idem-phone-ref-1")?.channel).toBeNull();
    expect(rows.find((r) => r.idempotencyKey === "idem-long-ref-1")?.serviceCode).toBeNull();
    expect(await dumpAllTables(pglite)).not.toContain("555-0100");
  });

  it("an email-shaped booking id fails the primary-id gate -> malformed_record", async () => {
    const { db, pglite } = await freshDb();
    const result = await processVelumaEventsBatch(
      db,
      batchOf([fakeBookingRecord("idem-email-id-1", { booking_id: "zzfake@example.invalid" })]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ack).toEqual({ applied: 0, merged: 0, skipped: 1 });
      expect(result.skippedReasons.malformed_record).toBe(1);
    }
    expect(await db.select().from(velumaEvent)).toHaveLength(0);
    expect(await dumpAllTables(pglite)).not.toContain("zzfake@example.invalid");
  });
});

describe("veluma events — I4: no null husks", () => {
  it("a garbage payload is skipped as malformed_record, nothing inserted, counts exact", async () => {
    const { db } = await freshDb();
    const result = await processVelumaEventsBatch(
      db,
      batchOf([
        {
          eventType: "spa_booking.updated",
          canonical_type: "spa_booking",
          idempotency_key: "idem-garbage-1",
          payload: "not-an-object-at-all",
        },
        {
          eventType: "spa_booking.updated",
          canonical_type: "spa_booking",
          idempotency_key: "idem-garbage-2",
          payload: { status: "booked" }, // object, but no primary business id
        },
        fakeBookingRecord("idem-good-after-garbage-1"),
      ]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ack).toEqual({ applied: 1, merged: 0, skipped: 2 });
      expect(result.skippedReasons.malformed_record).toBe(2);
    }
    const rows = await db.select().from(velumaEvent);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.idempotencyKey).toBe("idem-good-after-garbage-1");
    expect(rows[0]?.bookingRef).toBe("bkg-fixture-0001"); // never an all-null row
  });
});

describe("veluma events — I2: caps and property pin", () => {
  it(
    "rejects an over-cap batch with 413 (never a silent 200 ack): a too-large batch " +
      "cannot succeed by retrying, and a 200 all-skipped ack would mark every record " +
      "delivered-and-dropped in Veluma (silent data loss). 413 makes Veluma retry then " +
      "dead-letter with the reason preserved, keeping the records replayable.",
    async () => {
      const { db } = await freshDb();
      const records = Array.from({ length: MAX_RECORDS_PER_BATCH + 1 }, (_, i) =>
        fakeBookingRecord(`idem-cap-${i}`),
      );
      const result = await processVelumaEventsBatch(db, batchOf(records), { batchKey: "batch-cap-1" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(413);
      expect(await db.select().from(velumaEvent)).toHaveLength(0);
      expect(await db.select().from(ingestRun)).toHaveLength(0); // nothing half-written
    },
  );

  it("rejects an oversized body with 413 before any signature work", async () => {
    const { db } = await freshDb();
    const big = Buffer.alloc(MAX_BODY_BYTES + 1, 0x61);
    // Deliberately unsigned: the size gate must fire before HMAC verification.
    const res = await handleVelumaEventsRequest(db, big, {}, SECRET);
    expect(res.status).toBe(413);
    expect(res.body.error).toBe("body_too_large");
  });

  it("skips and audits a record whose envelope property_id disagrees with the pin", async () => {
    const { db, pglite } = await freshDb();
    const good = fakeBookingRecord("idem-prop-good-1");
    const bad = fakeBookingRecord("idem-prop-bad-1");
    (bad.envelope as Record<string, unknown>).property_id = "ZZOTHER";
    const body = JSON.stringify(batchOf([good, bad]));
    const res = await handleVelumaEventsRequest(db, Buffer.from(body), signedHeaders(body, "batch-prop-1"), SECRET);
    expect(res.status).toBe(200); // policy skip, never a 4xx (Veluma would dead-letter)
    const ack = res.body.ack as { applied: number; skipped: number };
    expect(ack.applied).toBe(1);
    expect(ack.skipped).toBe(1);
    const rows = await db.select().from(velumaEvent);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.idempotencyKey).toBe("idem-prop-good-1");
    // Audited: the pin violation is recorded in the audit trail (counts only).
    const audits = await db.select().from(auditEvent);
    const dump = JSON.stringify(audits.map((a) => a.afterJson));
    expect(dump).toContain("property_mismatch");
    expect(dump).toContain("propertyPinViolations");
    expect(await dumpAllTables(pglite)).not.toContain(PII_MARKER);
  });

  it("skips every record when the batch-level property_id disagrees with the pin", async () => {
    const { db } = await freshDb();
    const batch = { ...batchOf([fakeBookingRecord("idem-prop-batch-1")]), property_id: "ZZOTHER" };
    const result = await processVelumaEventsBatch(db, batch, { expectedPropertyId: "FSP" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ack).toEqual({ applied: 0, merged: 0, skipped: 1 });
      expect(result.skippedReasons.property_mismatch).toBe(1);
    }
    expect(await db.select().from(velumaEvent)).toHaveLength(0);
  });
});

describe("veluma events — B2: retry poisoning", () => {
  it("recovers a batch whose earlier attempt crashed mid-processing", async () => {
    const { db } = await freshDb();
    const now = new Date();
    // Seed the poisoned state the pre-fix code could leave behind: an ingest_run
    // stuck at "received" OCCUPYING the delivery key, with the first record's
    // veluma_event row already stored by the crashed attempt.
    await db.insert(ingestRun).values({
      id: "run_stuck_1",
      sourceId: VELUMA_EVENTS_SOURCE_ID,
      transport: VELUMA_EVENTS_TRANSPORT,
      deliveryId: "batch-poison-1",
      feedKey: "veluma_events",
      status: "received",
      createdAt: now,
    });
    await db.insert(velumaEvent).values({
      id: "vev_stuck_1",
      ingestRunId: "run_stuck_1",
      eventType: "spa.booking.created",
      idempotencyKey: "idem-poison-A",
      bookingRef: "bkg-fixture-0001",
      dateBasis: "booking_date",
      receivedAt: now,
    });

    // Veluma retries the SAME batch with the SAME X-Veluma-Idempotency-Key.
    const body = JSON.stringify(
      batchOf([fakeBookingRecord("idem-poison-A"), fakeBookingRecord("idem-poison-B")]),
    );
    const res = await handleVelumaEventsRequest(
      db,
      Buffer.from(body),
      signedHeaders(body, "batch-poison-1"),
      SECRET,
    );
    // Never a raw 500 for a well-signed, well-formed retry.
    expect(res.status).toBe(200);
    const ack = res.body.ack as { applied: number; merged: number; skipped: number };
    expect(ack.applied).toBe(1); // only the remaining record
    expect(ack.skipped).toBe(1); // the already-stored record, deduped

    // Every record applied exactly once.
    const events = await db.select().from(velumaEvent);
    expect(events.filter((e) => e.idempotencyKey === "idem-poison-A")).toHaveLength(1);
    expect(events.filter((e) => e.idempotencyKey === "idem-poison-B")).toHaveLength(1);

    // The delivery key now belongs to a run flipped to success; the stuck run
    // was superseded and no longer occupies the key.
    const runs = await db.select().from(ingestRun);
    const successRun = runs.find((r) => r.deliveryId === "batch-poison-1");
    expect(successRun?.status).toBe("success");
    expect(successRun?.rowCount).toBe(1);
    const stuck = runs.find((r) => r.id === "run_stuck_1");
    expect(stuck?.status).toBe("failed");
    expect(stuck?.deliveryId).toBeNull();

    // A further redelivery is now a clean noop.
    const again = await handleVelumaEventsRequest(
      db,
      Buffer.from(body),
      signedHeaders(body, "batch-poison-1"),
      SECRET,
    );
    expect(again.status).toBe(200);
    expect(again.body.ack).toEqual({ applied: 0, merged: 0, skipped: 2 });
    expect(await db.select().from(velumaEvent)).toHaveLength(2);
  });

  it("a unique-violation lost to a concurrent delivery returns the 409 duplicate ack shape, never 500", async () => {
    const { db } = await freshDb();
    // The concurrent winner: a success run already holds the delivery key.
    await db.insert(ingestRun).values({
      id: "run_winner_1",
      sourceId: VELUMA_EVENTS_SOURCE_ID,
      transport: VELUMA_EVENTS_TRANSPORT,
      deliveryId: "batch-conc-1",
      feedKey: "veluma_events",
      rowCount: 1,
      status: "success",
      createdAt: new Date(),
    });
    // Simulate this request losing the commit race: its transaction dies on the
    // partial unique index over ingest_run.delivery_id (success-stamp collision).
    const losingDb = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === "transaction") {
          return async () => {
            throw new Error('duplicate key value violates unique constraint "ingest_run_delivery_id_uidx"');
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as typeof db;
    const body = JSON.stringify(batchOf([fakeBookingRecord("idem-conc-1")]));
    const res = await handleVelumaEventsRequest(
      losingDb,
      Buffer.from(body),
      signedHeaders(body, "batch-conc-1"),
      SECRET,
    );
    // 409 is duplicate-success to Veluma (terminal, entries delivered) — the
    // ack shape it parses, never a 500 that would burn retries on a duplicate.
    expect(res.status).toBe(409);
    expect(res.body.id).toBe("run_winner_1"); // the winner's run id as target_ref
    expect(res.body.ack).toEqual({ applied: 0, merged: 0, skipped: 1 });
  });

  it("delivery_id is only ever occupied by a success run", async () => {
    const { db } = await freshDb();
    const body = JSON.stringify(batchOf([fakeBookingRecord("idem-occupy-1")]));
    await handleVelumaEventsRequest(db, Buffer.from(body), signedHeaders(body, "batch-occupy-1"), SECRET);
    const runs = await db.select().from(ingestRun);
    for (const r of runs) {
      if (r.deliveryId !== null) expect(r.status).toBe("success");
    }
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
