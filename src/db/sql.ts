export const DDL = `
CREATE TABLE IF NOT EXISTS source (
  id text PRIMARY KEY,
  report_code text,
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  grain text NOT NULL,
  date_basis text NOT NULL,
  status text NOT NULL,
  blocked_reason text,
  blocked_since date,
  notes text
);
CREATE TABLE IF NOT EXISTS ingest_run (
  id text PRIMARY KEY,
  source_id text NOT NULL,
  transport text NOT NULL,
  delivery_id text,
  feed_key text,
  payload_sha256 text,
  file_label text,
  origin_pulled_at timestamptz,
  delivered_at timestamptz,
  business_date_from date,
  business_date_to date,
  parser_version text NOT NULL DEFAULT 'v1',
  row_count integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  error text,
  supersedes_run_id text,
  created_at timestamptz NOT NULL
);
-- delivery_id is written only at terminal success (see src/lib/ingest/veluma-events.ts, B2):
-- the partial unique index therefore only ever guards fully-delivered batches.
CREATE UNIQUE INDEX IF NOT EXISTS ingest_run_delivery_id_uidx ON ingest_run (delivery_id) WHERE delivery_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS measure_fact (
  id text PRIMARY KEY,
  ingest_run_id text NOT NULL,
  source_id text NOT NULL,
  measure_key text NOT NULL,
  business_date date NOT NULL,
  dimension_type text NOT NULL,
  dimension_value text,
  value_numeric integer NOT NULL,
  unit text NOT NULL,
  is_total_row boolean NOT NULL DEFAULT false,
  retired boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS measure_fact_natural_uidx ON measure_fact (
  source_id, measure_key, business_date, dimension_type, coalesce(dimension_value, ''), ingest_run_id
);
CREATE TABLE IF NOT EXISTS technician_pseudonym (
  pseudonym text PRIMARY KEY,
  source_identifier_hash text NOT NULL,
  first_seen date NOT NULL,
  last_seen date NOT NULL
);
CREATE TABLE IF NOT EXISTS reconciliation_hypothesis (
  id text PRIMARY KEY,
  business_date date,
  measure_keys jsonb NOT NULL,
  description text NOT NULL,
  evidence text,
  proposed_by text NOT NULL,
  proposed_at timestamptz NOT NULL,
  status text NOT NULL,
  test_plan text NOT NULL,
  missing_data text NOT NULL
);
CREATE TABLE IF NOT EXISTS measure_definition (
  id text PRIMARY KEY,
  def_label text NOT NULL,
  sql_expression text NOT NULL,
  rationale text NOT NULL,
  signed_off_by text NOT NULL,
  signed_off_at timestamptz NOT NULL,
  supersedes_id text,
  hypothesis_id text
);
CREATE TABLE IF NOT EXISTS sufficiency_check (
  id text PRIMARY KEY,
  model_key text NOT NULL,
  check_name text NOT NULL,
  threshold integer NOT NULL,
  current_value integer NOT NULL,
  passing boolean NOT NULL,
  evaluated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS quarantine (
  id text PRIMARY KEY,
  ingest_run_id text,
  reason text NOT NULL,
  raw_payload jsonb NOT NULL,
  quarantined_at timestamptz NOT NULL,
  resolved_at timestamptz
);
CREATE TABLE IF NOT EXISTS audit_event (
  id text PRIMARY KEY,
  actor text NOT NULL,
  role text NOT NULL,
  action text NOT NULL,
  before_json jsonb,
  after_json jsonb,
  at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS feed_adapter (
  feed_key text PRIMARY KEY,
  status text NOT NULL,
  notes text,
  last_delivery_at timestamptz
);
CREATE TABLE IF NOT EXISTS collision_log (
  id text PRIMARY KEY,
  source_id text NOT NULL,
  measure_key text NOT NULL,
  business_date date NOT NULL,
  dimension_type text NOT NULL,
  dimension_value text,
  kept_run_id text NOT NULL,
  dropped_run_id text NOT NULL,
  logged_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS veluma_event (
  id text PRIMARY KEY,
  ingest_run_id text NOT NULL,
  event_type text NOT NULL,
  canonical_type text,
  idempotency_key text NOT NULL,
  source_ref text,
  schema_version text,
  property_ref text,
  lineage_connector text,
  lineage_run_id text,
  booking_ref text,
  service_code text,
  outlet_code text,
  start_at timestamptz,
  end_at timestamptz,
  business_date date,
  date_basis text NOT NULL,
  status text,
  party_size integer,
  value_cents integer,
  channel text,
  technician_ref text,
  received_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS veluma_event_idempotency_key_uidx ON veluma_event (idempotency_key);
`;

export const DROP_DDL = `
DROP TABLE IF EXISTS veluma_event;
DROP TABLE IF EXISTS collision_log;
DROP TABLE IF EXISTS feed_adapter;
DROP TABLE IF EXISTS audit_event;
DROP TABLE IF EXISTS quarantine;
DROP TABLE IF EXISTS sufficiency_check;
DROP TABLE IF EXISTS measure_definition;
DROP TABLE IF EXISTS reconciliation_hypothesis;
DROP TABLE IF EXISTS technician_pseudonym;
DROP TABLE IF EXISTS measure_fact;
DROP TABLE IF EXISTS ingest_run;
DROP TABLE IF EXISTS source;
`;
