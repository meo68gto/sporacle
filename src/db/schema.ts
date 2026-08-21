import {
  pgTable,
  text,
  integer,
  boolean,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** App schema. I1: no guest PII columns. I2: no revenue/amount columns. */

export const source = pgTable("source", {
  id: text("id").primaryKey(),
  reportCode: text("report_code"),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  grain: text("grain").notNull(),
  dateBasis: text("date_basis").notNull(),
  status: text("status").notNull(),
  blockedReason: text("blocked_reason"),
  blockedSince: date("blocked_since"),
  notes: text("notes"),
});

export const ingestRun = pgTable(
  "ingest_run",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    transport: text("transport").notNull(),
    deliveryId: text("delivery_id"),
    feedKey: text("feed_key"),
    payloadSha256: text("payload_sha256"),
    fileLabel: text("file_label"),
    originPulledAt: timestamp("origin_pulled_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    businessDateFrom: date("business_date_from"),
    businessDateTo: date("business_date_to"),
    parserVersion: text("parser_version").notNull().default("v1"),
    rowCount: integer("row_count").notNull().default(0),
    status: text("status").notNull(),
    error: text("error"),
    supersedesRunId: text("supersedes_run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("ingest_run_delivery_id_uidx").on(t.deliveryId)],
);

export const measureFact = pgTable(
  "measure_fact",
  {
    id: text("id").primaryKey(),
    ingestRunId: text("ingest_run_id").notNull(),
    sourceId: text("source_id").notNull(),
    measureKey: text("measure_key").notNull(),
    businessDate: date("business_date").notNull(),
    dimensionType: text("dimension_type").notNull(),
    dimensionValue: text("dimension_value"),
    valueNumeric: integer("value_numeric").notNull(),
    unit: text("unit").notNull(),
    isTotalRow: boolean("is_total_row").notNull().default(false),
    retired: boolean("retired").notNull().default(false),
  },
  (t) => [
    uniqueIndex("measure_fact_natural_uidx").on(
      t.sourceId,
      t.measureKey,
      t.businessDate,
      t.dimensionType,
      t.dimensionValue,
      t.ingestRunId,
    ),
  ],
);

export const technicianPseudonym = pgTable("technician_pseudonym", {
  pseudonym: text("pseudonym").primaryKey(),
  sourceIdentifierHash: text("source_identifier_hash").notNull(),
  firstSeen: date("first_seen").notNull(),
  lastSeen: date("last_seen").notNull(),
});

export const reconciliationHypothesis = pgTable("reconciliation_hypothesis", {
  id: text("id").primaryKey(),
  businessDate: date("business_date"),
  measureKeys: jsonb("measure_keys").$type<string[]>().notNull(),
  description: text("description").notNull(),
  evidence: text("evidence"),
  proposedBy: text("proposed_by").notNull(),
  proposedAt: timestamp("proposed_at", { withTimezone: true }).notNull(),
  status: text("status").notNull(),
  testPlan: text("test_plan").notNull(),
  missingData: text("missing_data").notNull(),
});

export const measureDefinition = pgTable("measure_definition", {
  id: text("id").primaryKey(),
  defLabel: text("def_label").notNull(),
  sqlExpression: text("sql_expression").notNull(),
  rationale: text("rationale").notNull(),
  signedOffBy: text("signed_off_by").notNull(),
  signedOffAt: timestamp("signed_off_at", { withTimezone: true }).notNull(),
  supersedesId: text("supersedes_id"),
  hypothesisId: text("hypothesis_id"),
});

export const sufficiencyCheck = pgTable("sufficiency_check", {
  id: text("id").primaryKey(),
  modelKey: text("model_key").notNull(),
  checkName: text("check_name").notNull(),
  threshold: integer("threshold").notNull(),
  currentValue: integer("current_value").notNull(),
  passing: boolean("passing").notNull(),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull(),
});

export const quarantine = pgTable("quarantine", {
  id: text("id").primaryKey(),
  ingestRunId: text("ingest_run_id"),
  reason: text("reason").notNull(),
  rawPayload: jsonb("raw_payload").notNull(),
  quarantinedAt: timestamp("quarantined_at", { withTimezone: true }).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const auditEvent = pgTable("audit_event", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  role: text("role").notNull(),
  action: text("action").notNull(),
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  at: timestamp("at", { withTimezone: true }).notNull(),
});

export const feedAdapter = pgTable("feed_adapter", {
  feedKey: text("feed_key").primaryKey(),
  status: text("status").notNull(),
  notes: text("notes"),
  lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
});

export const collisionLog = pgTable("collision_log", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  measureKey: text("measure_key").notNull(),
  businessDate: date("business_date").notNull(),
  dimensionType: text("dimension_type").notNull(),
  dimensionValue: text("dimension_value"),
  keptRunId: text("kept_run_id").notNull(),
  droppedRunId: text("dropped_run_id").notNull(),
  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull(),
});

/**
 * Live Veluma event deliveries (spa.booking.created / outlet.reservation.upsert).
 * I1: operational fields only — the keep-allowlist in src/lib/ingest/veluma-events.ts
 * is the sole write path; no raw payload jsonb column on purpose so unknown (possibly
 * guest-identifying) fields can never land here. profile.upsert is never written.
 * I4: ingest_run_id + received_at give every row provenance.
 * I6: date_basis is explicit per event type.
 * Append-only event log — I3: events are claims from the feed, never merged in place.
 */
export const velumaEvent = pgTable(
  "veluma_event",
  {
    id: text("id").primaryKey(),
    ingestRunId: text("ingest_run_id").notNull(),
    eventType: text("event_type").notNull(),
    canonicalType: text("canonical_type"),
    idempotencyKey: text("idempotency_key").notNull(),
    sourceRef: text("source_ref"),
    schemaVersion: text("schema_version"),
    propertyRef: text("property_ref"),
    lineageConnector: text("lineage_connector"),
    lineageRunId: text("lineage_run_id"),
    bookingRef: text("booking_ref"),
    serviceCode: text("service_code"),
    outletCode: text("outlet_code"),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    businessDate: date("business_date"),
    dateBasis: text("date_basis").notNull(),
    status: text("status"),
    partySize: integer("party_size"),
    valueCents: integer("value_cents"),
    channel: text("channel"),
    technicianRef: text("technician_ref"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("veluma_event_idempotency_key_uidx").on(t.idempotencyKey)],
);

export const appTables = {
  source,
  ingestRun,
  measureFact,
  technicianPseudonym,
  reconciliationHypothesis,
  measureDefinition,
  sufficiencyCheck,
  quarantine,
  auditEvent,
  feedAdapter,
  collisionLog,
  velumaEvent,
};
