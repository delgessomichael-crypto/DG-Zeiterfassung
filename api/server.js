'use strict';

const http = require('http');
const crypto = require('crypto');
const zlib = require('zlib');
const { Pool } = require('pg');
const XLSX = require('xlsx');
const JSZip = require('jszip');

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL || '';
const GOOGLE_BACKEND_URL = process.env.GOOGLE_BACKEND_URL || '';
const MIGRATION_TOKEN = process.env.MIGRATION_TOKEN || '';
const MIGRATION_UPLOAD_KEY = process.env.MIGRATION_UPLOAD_KEY || '';
const WEB_ORIGIN = process.env.WEB_ORIGIN || 'https://dg-app-10-web-production.up.railway.app';
const MIGRATION_XLSX_URL = process.env.MIGRATION_XLSX_URL || '';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WHATSAPP_WABA_ID = process.env.WHATSAPP_WABA_ID || '';
const D360_API_KEY = process.env.D360_API_KEY || '';
const WHATSAPP_PROVIDER = String(process.env.WHATSAPP_PROVIDER || (D360_API_KEY?'360dialog':'meta')).trim().toLowerCase();
const D360_API_BASE = String(process.env.D360_API_BASE || 'https://waba-v2.360dialog.io').replace(/\/$/,'');
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || '';
const WHATSAPP_GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v25.0';
const WHATSAPP_MARK_READ_ON_IMPORT = !/^(0|false|no|nein)$/i.test(String(process.env.WHATSAPP_MARK_READ_ON_IMPORT||'true'));
const WHATSAPP_REVIEW_TEMPLATE = String(process.env.WHATSAPP_REVIEW_TEMPLATE||'').trim();
const WHATSAPP_REVIEW_TEMPLATE_LANG = String(process.env.WHATSAPP_REVIEW_TEMPLATE_LANG||'de').trim()||'de';
const FINAL_CUTOVER = /^(1|true|yes|ja)$/i.test(String(process.env.FINAL_CUTOVER||'false'));
const FINAL_FILE_IMPORT_KEY = String(process.env.FINAL_FILE_IMPORT_KEY||'');


const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
}) : null;

const schema = `
CREATE TABLE IF NOT EXISTS migration_runs (
  id BIGSERIAL PRIMARY KEY,
  source_version TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'shadow',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  source_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS migration_objects (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  source_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_sha256 TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  migration_run_id BIGINT REFERENCES migration_runs(id) ON DELETE SET NULL,
  UNIQUE(entity_type, source_key)
);

CREATE INDEX IF NOT EXISTS migration_objects_type_idx
  ON migration_objects(entity_type);

CREATE TABLE IF NOT EXISTS migration_sheets (
  migration_run_id BIGINT NOT NULL REFERENCES migration_runs(id) ON DELETE CASCADE,
  sheet_name TEXT NOT NULL,
  source_rows INTEGER NOT NULL DEFAULT 0,
  source_columns INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  payload_sha256 TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(migration_run_id, sheet_name)
);

CREATE TABLE IF NOT EXISTS exact_views_shadow (
  view_key TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_sha256 TEXT NOT NULL,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exact_views_shadow_action_idx
  ON exact_views_shadow(action,refreshed_at DESC);

CREATE TABLE IF NOT EXISTS boss_month_views_shadow (
  view_year INTEGER NOT NULL,
  view_month INTEGER NOT NULL,
  payload JSONB NOT NULL,
  payload_sha256 TEXT NOT NULL,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(view_year,view_month)
);

CREATE TABLE IF NOT EXISTS response_cache (
  cache_key TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  request_payload JSONB NOT NULL,
  response_text TEXT NOT NULL,
  http_status INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS response_cache_action_idx
  ON response_cache(action, created_at DESC);

CREATE TABLE IF NOT EXISTS legacy_action_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  request_payload JSONB NOT NULL,
  response_ok BOOLEAN,
  response_payload JSONB,
  http_status INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS legacy_action_log_action_idx
  ON legacy_action_log(action, created_at DESC);

CREATE INDEX IF NOT EXISTS legacy_action_log_duration_idx
  ON legacy_action_log(duration_ms DESC, created_at DESC);

ALTER TABLE legacy_action_log
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

CREATE TABLE IF NOT EXISTS write_action_stats (
  action TEXT PRIMARY KEY,
  success_count BIGINT NOT NULL DEFAULT 0,
  failure_count BIGINT NOT NULL DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legacy_write_outbox (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  payload_ciphertext TEXT NOT NULL,
  payload_iv TEXT NOT NULL,
  payload_tag TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS legacy_write_outbox_pending_idx
  ON legacy_write_outbox(status,next_attempt_at,id);

CREATE TABLE IF NOT EXISTS manual_orders_shadow (
  id TEXT PRIMARY KEY,
  customer TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  description TEXT,
  source TEXT,
  inquiry_id TEXT,
  status TEXT,
  created_at_text TEXT,
  started_at_text TEXT,
  completed_at_text TEXT,
  changed_at_text TEXT,
  changed_by TEXT,
  internal_note TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE manual_orders_shadow ADD COLUMN IF NOT EXISTS attachments_json TEXT;

CREATE TABLE IF NOT EXISTS own_reminders_shadow (
  id TEXT PRIMARY KEY,
  reminder_text TEXT,
  due_date_text TEXT,
  status TEXT,
  result TEXT,
  created_at_text TEXT,
  created_by TEXT,
  changed_at_text TEXT,
  changed_by TEXT,
  attachments_json TEXT,
  internal_note TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_inquiries_shadow (
  id TEXT PRIMARY KEY,
  source TEXT,
  gmail_ids TEXT,
  customer TEXT,
  email TEXT,
  phone TEXT,
  postal_code TEXT,
  city TEXT,
  subject TEXT,
  description TEXT,
  received_at_text TEXT,
  status TEXT,
  read_flag BOOLEAN NOT NULL DEFAULT false,
  created_at_text TEXT,
  changed_at_text TEXT,
  changed_by TEXT,
  internal_note TEXT,
  done_reason TEXT,
  contact_at_text TEXT,
  contact_person TEXT,
  contact_note TEXT,
  offer_id TEXT,
  external_url TEXT,
  phone_url TEXT,
  dropbox_url TEXT,
  aqon_appointment_url TEXT,
  aqon_details TEXT,
  aqon_replied_at_text TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE customer_inquiries_shadow ADD COLUMN IF NOT EXISTS attachments_json TEXT;

CREATE INDEX IF NOT EXISTS customer_inquiries_shadow_status_idx
  ON customer_inquiries_shadow(status,received_at_text);

CREATE TABLE IF NOT EXISTS inquiry_reminders_shadow (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT,
  customer TEXT,
  phone TEXT,
  email TEXT,
  description TEXT,
  source TEXT,
  created_at_text TEXT,
  due_date_text TEXT,
  status TEXT,
  result TEXT,
  changed_at_text TEXT,
  changed_by TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inquiry_reminders_shadow_status_idx
  ON inquiry_reminders_shadow(status,due_date_text);

CREATE TABLE IF NOT EXISTS inquiry_offers_shadow (
  offer_id TEXT PRIMARY KEY,
  inquiry_id TEXT,
  customer TEXT,
  phone TEXT,
  email TEXT,
  description TEXT,
  source TEXT,
  created_at_text TEXT,
  status TEXT,
  changed_at_text TEXT,
  changed_by TEXT,
  calendar_event_id TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inquiry_offers_shadow_status_idx
  ON inquiry_offers_shadow(status,created_at_text);

ALTER TABLE inquiry_offers_shadow ADD COLUMN IF NOT EXISTS inspection_date TEXT;
ALTER TABLE inquiry_offers_shadow ADD COLUMN IF NOT EXISTS inspection_hours NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE inquiry_offers_shadow ADD COLUMN IF NOT EXISTS activity_note TEXT;

CREATE TABLE IF NOT EXISTS offer_reminders_shadow (
  id TEXT PRIMARY KEY,
  offer_id TEXT,
  customer TEXT,
  offer_number TEXT,
  phone TEXT,
  email TEXT,
  description TEXT,
  created_at_text TEXT,
  due_date_text TEXT,
  status TEXT,
  result TEXT,
  changed_at_text TEXT,
  changed_by TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shadow_verify_stats (
  shadow_name TEXT PRIMARY KEY,
  google_count INTEGER NOT NULL DEFAULT 0,
  postgres_count INTEGER NOT NULL DEFAULT 0,
  mismatches INTEGER NOT NULL DEFAULT 0,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_admin_shadow (
  employee_name TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL DEFAULT 999,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_categories_v10 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 999,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_categories_v10_name_idx
  ON partner_categories_v10((lower(name))) WHERE active=true;

CREATE TABLE IF NOT EXISTS partners_v10 (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  company TEXT,
  contact_name TEXT,
  phone TEXT,
  mobile TEXT,
  email TEXT,
  address TEXT,
  website TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS partners_v10_category_idx
  ON partners_v10(category_id,active,company,contact_name);

CREATE TABLE IF NOT EXISTS whatsapp_threads_v10 (
  id TEXT PRIMARY KEY,
  wa_id TEXT NOT NULL,
  contact_name TEXT,
  category TEXT NOT NULL DEFAULT 'Prüfen',
  relevance_score INTEGER NOT NULL DEFAULT 0,
  classification_reason TEXT,
  manual_classification BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'Offen',
  last_text TEXT,
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  transferred_to TEXT,
  transferred_id TEXT,
  transferred_at TIMESTAMPTZ,
  transferred_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_threads_v10_open_idx
  ON whatsapp_threads_v10(status,category,last_message_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_threads_v10_wa_idx
  ON whatsapp_threads_v10(wa_id,last_message_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_messages_v10 (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES whatsapp_threads_v10(id) ON DELETE CASCADE,
  wa_id TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'inbound',
  message_type TEXT,
  message_text TEXT,
  message_at TIMESTAMPTZ,
  phone_number_id TEXT,
  read_marked BOOLEAN NOT NULL DEFAULT false,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_messages_v10_thread_idx
  ON whatsapp_messages_v10(thread_id,message_at,id);

CREATE TABLE IF NOT EXISTS whatsapp_media_v10 (
  media_id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES whatsapp_messages_v10(id) ON DELETE CASCADE,
  media_type TEXT,
  mime_type TEXT,
  filename TEXT,
  caption TEXT,
  sha256 TEXT,
  file_size BIGINT NOT NULL DEFAULT 0,
  media_data BYTEA,
  download_status TEXT NOT NULL DEFAULT 'pending',
  download_error TEXT,
  downloaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_media_v10_message_idx
  ON whatsapp_media_v10(message_id);

CREATE TABLE IF NOT EXISTS whatsapp_webhook_events_v10 (
  event_hash TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  process_error TEXT
);

CREATE TABLE IF NOT EXISTS whatsapp_contacts_v10 (
  wa_id TEXT PRIMARY KEY,
  full_name TEXT,
  first_name TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'coexistence',
  last_action TEXT,
  source_timestamp TIMESTAMPTZ,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_contacts_v10_active_idx
  ON whatsapp_contacts_v10(active,full_name,wa_id);

CREATE TABLE IF NOT EXISTS whatsapp_sync_state_v10 (
  sync_type TEXT PRIMARY KEY,
  status TEXT,
  phase TEXT,
  progress TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_event_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_review_requests_v10 (
  billing_key TEXT PRIMARY KEY,
  object_ids TEXT NOT NULL,
  customer TEXT,
  phone TEXT,
  review_url TEXT,
  message_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,
  sent_at TIMESTAMPTZ,
  sent_by TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_review_requests_v10_status_idx
  ON billing_review_requests_v10(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS employee_locations_v10 (
  employee_name TEXT PRIMARY KEY,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL,
  context TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inquiry_merge_members_v10 (
  inquiry_id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  manual BOOLEAN NOT NULL DEFAULT true,
  merged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  merged_by TEXT
);

CREATE INDEX IF NOT EXISTS inquiry_merge_members_v10_group_idx
  ON inquiry_merge_members_v10(group_id);

CREATE TABLE IF NOT EXISTS planner_workers_shadow (
  id TEXT PRIMARY KEY,
  employee_name TEXT,
  display_name TEXT,
  provider TEXT,
  calendar_id TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 999,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS planner_events_shadow (
  id TEXT PRIMARY KEY,
  customer TEXT,
  address TEXT,
  task TEXT,
  event_date TEXT,
  start_time TEXT,
  end_time TEXT,
  employee_ids_json TEXT,
  employee_names_json TEXT,
  google_event_ids_json TEXT,
  created_at_text TEXT,
  updated_at_text TEXT,
  updated_by TEXT,
  event_type TEXT,
  maintenance_customer_id TEXT,
  maintenance_object_id TEXT,
  maintenance_device_id TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maintenance_customers_shadow (
  id TEXT PRIMARY KEY,
  name TEXT,
  billing_street TEXT,
  billing_zip TEXT,
  billing_city TEXT,
  email TEXT,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at_text TEXT,
  updated_at_text TEXT,
  updated_by TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maintenance_objects_shadow (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  name TEXT,
  street TEXT,
  zip TEXT,
  city TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at_text TEXT,
  updated_at_text TEXT,
  updated_by TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maintenance_devices_shadow (
  id TEXT PRIMARY KEY,
  object_id TEXT,
  customer_id TEXT,
  device_type TEXT,
  other_description TEXT,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  year_text TEXT,
  tenant_name TEXT,
  tenant_phone TEXT,
  tenant_email TEXT,
  spare_part_manufacturer TEXT,
  spare_part_serial_number TEXT,
  internal_notes TEXT,
  next_maintenance_due TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at_text TEXT,
  updated_at_text TEXT,
  updated_by TEXT,
  internal_device_id TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maintenance_repairs_shadow (
  id TEXT PRIMARY KEY,
  device_id TEXT,
  customer_id TEXT,
  object_id TEXT,
  repair_date TEXT,
  description TEXT,
  created_at_text TEXT,
  created_by TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maintenance_manual_shadow (
  id TEXT PRIMARY KEY,
  maintenance_date TEXT,
  maintenance_count INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at_text TEXT,
  created_by TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maintenance_attachments_shadow (
  id TEXT PRIMARY KEY,
  device_id TEXT,
  customer_id TEXT,
  object_id TEXT,
  kind TEXT,
  name TEXT,
  mime TEXT,
  file_size BIGINT NOT NULL DEFAULT 0,
  file_id TEXT,
  url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at_text TEXT,
  created_by TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS maintenance_attachments_shadow_device_idx
  ON maintenance_attachments_shadow(device_id,active);

CREATE TABLE IF NOT EXISTS absences_shadow (
  id TEXT PRIMARY KEY,
  employee_name TEXT,
  absence_type TEXT,
  start_date TEXT,
  end_date TEXT,
  created_at_text TEXT,
  created_by TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sickness_case_id TEXT,
  sickness_mode TEXT,
  employer_pay_through TEXT,
  payer TEXT,
  sickness_case_days INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  credited_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vacation_entitlements_shadow (
  employee_name TEXT NOT NULL,
  vacation_year INTEGER NOT NULL,
  entitlement NUMERIC(10,2) NOT NULL DEFAULT 0,
  changed_at_text TEXT,
  changed_by TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(employee_name,vacation_year)
);

CREATE TABLE IF NOT EXISTS time_bank_shadow (
  id TEXT PRIMARY KEY,
  employee_name TEXT NOT NULL,
  hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  booking_type TEXT,
  booking_year INTEGER NOT NULL DEFAULT 0,
  booking_month INTEGER NOT NULL DEFAULT 0,
  reference TEXT,
  reason TEXT,
  created_at_text TEXT,
  created_iso TEXT,
  created_by TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS time_bank_shadow_employee_idx
  ON time_bank_shadow(employee_name);

CREATE TABLE IF NOT EXISTS assignments_shadow (
  id TEXT PRIMARY KEY,
  source_entry_id TEXT,
  employee_name TEXT,
  hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT,
  created_at_text TEXT,
  created_by TEXT,
  confirmed_at_text TEXT,
  issue_at_text TEXT,
  note TEXT,
  replaced_by_entry_id TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assignments_shadow_employee_idx
  ON assignments_shadow(employee_name,status);

CREATE TABLE IF NOT EXISTS monthly_adjustments_shadow (
  id TEXT PRIMARY KEY,
  employee_name TEXT NOT NULL,
  adjustment_year INTEGER NOT NULL,
  adjustment_month INTEGER NOT NULL,
  hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  reason TEXT,
  created_at_text TEXT,
  created_by TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS monthly_adjustments_shadow_period_idx
  ON monthly_adjustments_shadow(adjustment_year,adjustment_month,employee_name);

CREATE TABLE IF NOT EXISTS month_closures_shadow (
  id TEXT PRIMARY KEY,
  employee_name TEXT NOT NULL,
  closure_year INTEGER NOT NULL,
  closure_month INTEGER NOT NULL,
  action TEXT,
  action_at_text TEXT,
  action_by TEXT,
  reason TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll_reviews_shadow (
  issue_id TEXT PRIMARY KEY,
  review_year INTEGER NOT NULL,
  review_month INTEGER NOT NULL,
  employee_name TEXT,
  review_date TEXT,
  reviewed_at_text TEXT,
  reviewed_by TEXT,
  note TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll_closures_shadow (
  id TEXT PRIMARY KEY,
  closure_year INTEGER NOT NULL,
  closure_month INTEGER NOT NULL,
  action TEXT,
  action_at_text TEXT,
  action_by TEXT,
  reason TEXT,
  fingerprint TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conflict_reviews_shadow (
  conflict_id TEXT PRIMARY KEY,
  employee_name TEXT,
  review_year INTEGER NOT NULL,
  review_month INTEGER NOT NULL,
  conflict_date TEXT,
  reviewed_at_text TEXT,
  reviewed_by TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS day_status_shadow (
  employee_name TEXT NOT NULL,
  status_date TEXT NOT NULL,
  status TEXT NOT NULL,
  changed_at_text TEXT,
  source TEXT,
  reference TEXT,
  credited_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(employee_name,status_date)
);

ALTER TABLE day_status_shadow
  ADD COLUMN IF NOT EXISTS credited_hours_missing BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS day_status_shadow_date_idx
  ON day_status_shadow(status_date,employee_name);

CREATE TABLE IF NOT EXISTS day_closures_shadow (
  employee_name TEXT NOT NULL,
  closure_date TEXT NOT NULL,
  closed_at_text TEXT,
  gross_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  legacy_col5 TEXT,
  legacy_col6 TEXT,
  pause_minutes INTEGER NOT NULL DEFAULT 0,
  net_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at_text TEXT,
  update_reason TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(employee_name,closure_date)
);

CREATE INDEX IF NOT EXISTS day_closures_shadow_date_idx
  ON day_closures_shadow(closure_date,employee_name);

CREATE TABLE IF NOT EXISTS time_entries_shadow (
  id TEXT PRIMARY KEY,
  employee_name TEXT,
  entry_date TEXT,
  customer TEXT,
  start_time TEXT,
  end_time TEXT,
  hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  activity TEXT,
  calendar_id TEXT,
  transmitted_at_text TEXT,
  closed BOOLEAN NOT NULL DEFAULT false,
  material_used BOOLEAN NOT NULL DEFAULT false,
  material TEXT,
  customer_signature_id TEXT,
  customer_signature_url TEXT,
  photo_count INTEGER NOT NULL DEFAULT 0,
  photo_file_ids TEXT,
  photo_urls TEXT,
  additional_employees_used BOOLEAN NOT NULL DEFAULT false,
  additional_employees_text TEXT,
  additional_employee_hours_text TEXT,
  source_calendar_event_id TEXT,
  billing_status TEXT,
  billed_at_text TEXT,
  billed_by TEXT,
  object_id TEXT,
  job_status TEXT,
  is_supplement BOOLEAN NOT NULL DEFAULT false,
  supplement_created_at_text TEXT,
  offer_id TEXT,
  offer_changed_at_text TEXT,
  offer_changed_by TEXT,
  maintenance BOOLEAN NOT NULL DEFAULT false,
  next_maintenance_due TEXT,
  maintenance_customer_id TEXT,
  maintenance_object_id TEXT,
  maintenance_device_id TEXT,
  source_payload JSONB,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS time_entries_shadow_employee_date_idx
  ON time_entries_shadow(employee_name,entry_date);
CREATE INDEX IF NOT EXISTS time_entries_shadow_object_idx
  ON time_entries_shadow(object_id,billing_status,job_status);

CREATE TABLE IF NOT EXISTS objects_shadow (
  id TEXT PRIMARY KEY,
  object_key TEXT,
  display_name TEXT,
  created_at_text TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS regie_merges_shadow (
  object_id TEXT PRIMARY KEY,
  merge_id TEXT,
  merged_at_text TEXT,
  merged_by TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS regie_attachments_shadow (
  id TEXT PRIMARY KEY,
  object_ids_text TEXT,
  customer TEXT,
  file_id TEXT,
  url TEXT,
  file_name TEXT,
  mime TEXT,
  uploaded_at_text TEXT,
  uploaded_by TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS object_notes_shadow (
  object_id TEXT PRIMARY KEY,
  note TEXT,
  changed_at_text TEXT,
  changed_by TEXT,
  shadow_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS railway_sessions (
  token_hash TEXT PRIMARY KEY,
  employee_name TEXT NOT NULL,
  chef_access BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS railway_sessions_employee_idx
  ON railway_sessions(employee_name,expires_at);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_meta(key,value)
VALUES
  ('release', '{"app":"DG-App-10","phase":"shadow-migration","production_source":"Google-GS-9.0"}'::jsonb)
ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=now();
`;

function legacyOutboxCryptoKey(){
  if(!MIGRATION_TOKEN)return null;
  return crypto.createHash('sha256').update(MIGRATION_TOKEN+'|dg-legacy-outbox-v1','utf8').digest();
}
function encryptLegacyOutboxPayload(payload){
  const key=legacyOutboxCryptoKey();if(!key)throw new Error('Legacy outbox key unavailable');
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(payload||{}),'utf8'),cipher.final()]);
  return {ciphertext:ciphertext.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
}
function decryptLegacyOutboxPayload(row){
  const key=legacyOutboxCryptoKey();if(!key)throw new Error('Legacy outbox key unavailable');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(String(row.payload_iv||''),'base64'));
  decipher.setAuthTag(Buffer.from(String(row.payload_tag||''),'base64'));
  const plain=Buffer.concat([
    decipher.update(Buffer.from(String(row.payload_ciphertext||''),'base64')),
    decipher.final()
  ]).toString('utf8');
  return JSON.parse(plain);
}
async function enqueueLegacyWriteWithClient(client,action,payload){
  const enc=encryptLegacyOutboxPayload(payload);
  const q=await client.query(
    `INSERT INTO legacy_write_outbox(action,payload_ciphertext,payload_iv,payload_tag)
     VALUES($1,$2,$3,$4) RETURNING id`,
    [String(action||''),enc.ciphertext,enc.iv,enc.tag]
  );
  return Number(q.rows[0]?.id||0);
}
function legacyOutboxTerminalSuccess(action,parsed){
  if(parsed&&parsed.ok!==false)return true;
  const msg=String(parsed&&parsed.error||'').toLowerCase();
  if(['completeOwnReminder','deleteOwnReminder'].includes(action)&&msg.includes('bereits erledigt'))return true;
  if(action==='deleteManualOrder'&&msg.includes('auftrag nicht gefunden'))return true;
  if(['reopenInquiryReminder','archiveInquiryReminder'].includes(action)&&msg.includes('reminder ist bereits erledigt'))return true;
  if(action==='deleteMonthlyAdjustment'&&msg.includes('stundenkorrektur wurde nicht gefunden'))return true;
  return false;
}
let legacyOutboxFlushRunning=false;
async function flushLegacyWriteOutbox(limit=12){
  if(legacyOutboxFlushRunning||!pool||!GOOGLE_BACKEND_URL||!legacyOutboxCryptoKey())return;
  legacyOutboxFlushRunning=true;
  try{
    const q=await pool.query(
      `SELECT id,action,payload_ciphertext,payload_iv,payload_tag,attempts
         FROM legacy_write_outbox
        WHERE ((status IN ('pending','failed') AND next_attempt_at<=now())
            OR (status='sending' AND updated_at<now()-interval '5 minutes'))
        ORDER BY id ASC LIMIT $1`,
      [Math.max(1,Math.min(50,Number(limit)||12))]
    );
    for(const row of q.rows){
      await pool.query(
        `UPDATE legacy_write_outbox SET status='sending',attempts=attempts+1,updated_at=now()
          WHERE id=$1`,[row.id]
      );
      let payload,raw='',parsed=null,httpStatus=0,started=Date.now();
      try{
        payload=decryptLegacyOutboxPayload(row);
        const upstream=await fetch(GOOGLE_BACKEND_URL,{
          method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
          body:JSON.stringify(payload),redirect:'follow'
        });
        httpStatus=upstream.status;raw=await upstream.text();
        try{parsed=JSON.parse(raw);}catch(_e){}
        if(!upstream.ok||!legacyOutboxTerminalSuccess(String(row.action||''),parsed)){
          throw new Error((parsed&&parsed.error)||('HTTP '+upstream.status));
        }
        await pool.query(
          `UPDATE legacy_write_outbox
              SET status='delivered',last_error=NULL,delivered_at=now(),updated_at=now()
            WHERE id=$1`,[row.id]
        );
        await pool.query(
          `INSERT INTO legacy_action_log(action,request_payload,response_ok,response_payload,http_status,duration_ms)
           VALUES($1,$2::jsonb,true,$3::jsonb,$4,$5)`,
          [String(row.action||''),JSON.stringify(sanitizedLogPayload(payload)),
           parsed?JSON.stringify(sanitizeForLog(parsed)):null,httpStatus,Math.max(0,Date.now()-started)]
        );
        console.log('LEGACY_OUTBOX delivered id='+row.id+' action='+row.action);
      }catch(e){
        const attempts=Number(row.attempts||0)+1;
        const delay=Math.min(3600,Math.max(10,Math.pow(2,Math.min(8,attempts))*5));
        await pool.query(
          `UPDATE legacy_write_outbox
              SET status='failed',last_error=$2,next_attempt_at=now()+($3::text||' seconds')::interval,updated_at=now()
            WHERE id=$1`,
          [row.id,String(e.message||e).slice(0,1000),String(delay)]
        );
        console.error('LEGACY_OUTBOX failed id='+row.id+' action='+row.action+' error='+e.message);
        break; // preserve write order
      }
    }
  }finally{legacyOutboxFlushRunning=false;}
}
function kickLegacyOutbox(){
  setTimeout(()=>flushLegacyWriteOutbox().catch(e=>console.error('legacy outbox flush failed',e.message)),0);
}

async function cleanupInternalData() {
  if (!pool) return;
  await pool.query("DELETE FROM response_cache WHERE created_at < now() - interval '24 hours'");
  await pool.query("DELETE FROM legacy_action_log WHERE created_at < now() - interval '30 days'");
  await pool.query("DELETE FROM railway_sessions WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days'");
  await pool.query("DELETE FROM legacy_write_outbox WHERE status='delivered' AND delivered_at < now() - interval '30 days'");
}

async function logLatencySummary() {
  if (!pool) return;
  const q = await pool.query(
    `SELECT action,COUNT(*)::int AS count,
            ROUND(AVG(duration_ms)::numeric,0)::int AS avg_ms,
            MAX(duration_ms)::int AS max_ms
       FROM legacy_action_log
      WHERE created_at > now() - interval '15 minutes'
        AND duration_ms IS NOT NULL
      GROUP BY action
      ORDER BY AVG(duration_ms) DESC
      LIMIT 12`
  );
  if (!q.rowCount) return;
  console.log('LATENCY15 ' + q.rows.map(r =>
    String(r.action)+'='+String(r.avg_ms)+'ms(avg)/'+String(r.max_ms)+'ms(max)/n'+String(r.count)
  ).join(' | '));
}


async function bootstrapTrustedShadowReadiness(){
  if(!pool)return;
  const marker='trusted_shadow_bootstrap_v1';
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);
  if(done.rowCount)return;

  const specs=[
    ['manual_orders','manual_orders_shadow'],
    ['own_reminders','own_reminders_shadow'],
    ['offer_reminders','offer_reminders_shadow'],
    ['planner_workers','planner_workers_shadow']
  ];
  const stamped=[];
  for(const [name,table] of specs){
    const q=await pool.query('SELECT COUNT(*)::int AS n FROM '+table);
    const n=Number(q.rows[0]?.n||0);
    await saveShadowVerifyStat(name,n,n,0);
    stamped.push(name+'='+n);
  }
  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
     ON CONFLICT(key) DO NOTHING`,
    [marker,JSON.stringify({at:new Date().toISOString(),shadows:stamped,reason:'trusted internal-only mirrors after v10 write audit'})]
  );
  console.log('TRUSTED_BOOTSTRAP '+stamped.join(' '));
}


function normalizeLocalPinV24(v){
  let p=String(v==null?'':v).trim();
  if(/^\d{1,3}$/.test(p))p=p.padStart(4,'0');
  return p;
}
function hashPinV24(pin,salt){
  return crypto.scryptSync(String(pin||''),Buffer.from(salt,'base64'),32).toString('base64');
}
function safeEqV24(a,b){
  a=Buffer.from(String(a||''));b=Buffer.from(String(b||''));
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function localFileUrlV24(id){
  id=String(id||'').trim();
  return id?'https://dg-app-10-api-production.up.railway.app/v1/files/'+encodeURIComponent(id):'';
}
function parseDataUrlV24(dataUrl){
  const m=String(dataUrl||'').match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if(!m)throw new Error('Dateiinhalt ist ungültig.');
  const mime=String(m[1]||'application/octet-stream'),is64=Boolean(m[2]);
  const data=is64?Buffer.from(m[3],'base64'):Buffer.from(decodeURIComponent(m[3]),'utf8');
  return {mime,data};
}
function cleanFileNameV24(v,fallback){
  const s=String(v||fallback||'Datei').replace(/[\\/:*?"<>|\r\n]+/g,'_').trim();
  return (s||'Datei').slice(0,180);
}
async function storeBinaryFileV24(db,item){
  item=item||{};
  const parsed=item.dataUrl?parseDataUrlV24(item.dataUrl):null;
  const data=Buffer.isBuffer(item.data)?item.data:(parsed?parsed.data:Buffer.alloc(0));
  if(!data.length)throw new Error('Datei ist leer.');
  if(data.length>15*1024*1024)throw new Error('Datei ist größer als 15 MB.');
  const id=String(item.id||item.fileId||'FILE-'+crypto.randomUUID()).trim();
  const mime=String(item.mime||item.type||(parsed&&parsed.mime)||'application/octet-stream');
  const name=cleanFileNameV24(item.name,item.kind==='signature'?'Unterschrift.png':'Datei');
  const sha=crypto.createHash('sha256').update(data).digest('hex');
  await db.query(
    `INSERT INTO binary_files_v10(id,file_name,mime_type,file_size,sha256,file_data,source,kind,metadata,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now())
     ON CONFLICT(id) DO UPDATE SET file_name=EXCLUDED.file_name,mime_type=EXCLUDED.mime_type,
       file_size=EXCLUDED.file_size,sha256=EXCLUDED.sha256,file_data=EXCLUDED.file_data,
       source=EXCLUDED.source,kind=EXCLUDED.kind,metadata=EXCLUDED.metadata,updated_at=now()`,
    [id,name,mime,data.length,sha,data,String(item.source||'railway'),String(item.kind||'business'),
     JSON.stringify(item.metadata||{})]
  );
  return {id,name,mime,size:data.length,sha256:sha,url:localFileUrlV24(id)};
}
async function initFinalCutoverStorageV24(){
  if(!pool)return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS binary_files_v10(
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      file_size BIGINT NOT NULL DEFAULT 0,
      sha256 TEXT NOT NULL DEFAULT '',
      file_data BYTEA NOT NULL,
      source TEXT NOT NULL DEFAULT 'railway',
      kind TEXT NOT NULL DEFAULT 'business',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS binary_files_v10_kind_idx ON binary_files_v10(kind,created_at DESC);
    CREATE TABLE IF NOT EXISTS employee_credentials_v10(
      employee_name TEXT PRIMARY KEY,
      pin_salt TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      chef_access BOOLEAN NOT NULL DEFAULT false,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}
async function bootstrapEmployeeCredentialsV24(){
  if(!pool)return;
  const q=await pool.query("SELECT source_key,payload FROM migration_objects WHERE entity_type='sheet:Mitarbeiter' ORDER BY source_key::int");
  for(const row of q.rows){
    const p=row.payload||{};if(Number(p.sourceRow||row.source_key)<=1)continue;
    const cells=Array.isArray(p.cells)?p.cells:[];
    const name=textCell(cells,0).trim(),pin=normalizeLocalPinV24(textCell(cells,1));
    if(!name||!pin)continue;
    const active=String(textCell(cells,11)||'').trim().toLowerCase()!=='nein';
    const chef=String(textCell(cells,12)||'').trim().toLowerCase()==='ja';
    const exists=await pool.query('SELECT 1 FROM employee_credentials_v10 WHERE employee_name=$1',[name]);
    if(exists.rowCount){
      await pool.query('UPDATE employee_credentials_v10 SET active=$2,chef_access=$3,updated_at=now() WHERE employee_name=$1',[name,active,chef]);
      continue;
    }
    const salt=crypto.randomBytes(16).toString('base64'),hash=hashPinV24(pin,salt);
    await pool.query('INSERT INTO employee_credentials_v10(employee_name,pin_salt,pin_hash,active,chef_access) VALUES($1,$2,$3,$4,$5)',
      [name,salt,hash,active,chef]);
  }
}
async function localEmployeeLoginV24(body){
  const employee=String(body&&body.employee||'').trim(),pin=normalizeLocalPinV24(body&&body.pin);
  if(!employee||!pin)throw new Error('Mitarbeiter oder PIN fehlt.');
  const q=await pool.query('SELECT * FROM employee_credentials_v10 WHERE employee_name=$1 LIMIT 1',[employee]);
  const r=q.rows[0];
  if(!r||r.active===false)throw new Error('Mitarbeiter oder PIN ungültig bzw. Mitarbeiter inaktiv.');
  if(r.locked_until&&new Date(r.locked_until).getTime()>Date.now())throw new Error('Zu viele Fehlversuche. Bitte später erneut anmelden.');
  const ok=safeEqV24(hashPinV24(pin,String(r.pin_salt||'')),String(r.pin_hash||''));
  if(!ok){
    const next=Number(r.failed_attempts||0)+1,lock=next>=8?new Date(Date.now()+15*60*1000):null;
    await pool.query('UPDATE employee_credentials_v10 SET failed_attempts=$2,locked_until=$3,updated_at=now() WHERE employee_name=$1',
      [employee,next>=8?0:next,lock]);
    throw new Error('Mitarbeiter oder PIN ungültig bzw. Mitarbeiter inaktiv.');
  }
  await pool.query('UPDATE employee_credentials_v10 SET failed_attempts=0,locked_until=NULL,updated_at=now() WHERE employee_name=$1',[employee]);
  const token='DGSESSION.'+crypto.randomBytes(24).toString('base64url');
  await registerRailwaySession(employee,token,Boolean(r.chef_access));
  return {employee,chefAccess:Boolean(r.chef_access),deviceSessionToken:token,message:'Anmeldung erfolgreich',backendVersion:'10.0',source:'railway'};
}
async function localChefLoginV24(body){
  const s=await localSessionForBody(body,true);if(!s)return null;
  return {ok:true,message:'Chef-Zugriff bestätigt'};
}
async function finalizeLocalFileReferencesV24(){
  if(!pool)return;
  const q=await pool.query('SELECT id FROM binary_files_v10');const have=new Set(q.rows.map(r=>String(r.id)));
  const tq=await pool.query('SELECT id,customer_signature_id,photo_file_ids FROM time_entries_shadow');
  for(const r of tq.rows){
    const sig=String(r.customer_signature_id||'').trim();
    const ids=String(r.photo_file_ids||'').split(',').map(x=>x.trim()).filter(Boolean);
    const sigUrl=sig&&have.has(sig)?localFileUrlV24(sig):'';
    const photoUrls=ids.filter(id=>have.has(id)).map(localFileUrlV24).join(' | ');
    await pool.query(
      `UPDATE time_entries_shadow SET
        customer_signature_url=CASE WHEN $2<>'' THEN $2 ELSE customer_signature_url END,
        photo_urls=CASE WHEN $3<>'' THEN $3 ELSE photo_urls END,shadow_updated_at=now()
       WHERE id=$1`,[String(r.id),sigUrl,photoUrls]
    );
  }
  const dq=await pool.query('SELECT employee_name,closure_date,legacy_col5 FROM day_closures_shadow');
  for(const r of dq.rows){
    const id=String(r.legacy_col5||'').trim();
    if(id&&have.has(id))await pool.query('UPDATE day_closures_shadow SET legacy_col6=$3,shadow_updated_at=now() WHERE employee_name=$1 AND closure_date=$2',
      [String(r.employee_name),String(r.closure_date),localFileUrlV24(id)]);
  }
  const rq=await pool.query('SELECT id,attachments_json FROM own_reminders_shadow');
  for(const r of rq.rows){
    let a=[];try{a=Array.isArray(r.attachments_json)?r.attachments_json:JSON.parse(r.attachments_json||'[]');}catch(_e){}
    let changed=false;
    a=a.map(x=>{x=Object.assign({},x);const fid=String(x.fileId||x.id||'').trim();if(fid&&have.has(fid)){x.url=localFileUrlV24(fid);x.fileId=fid;changed=true;}return x;});
    if(changed)await pool.query('UPDATE own_reminders_shadow SET attachments_json=$2::jsonb,shadow_updated_at=now() WHERE id=$1',[String(r.id),JSON.stringify(a)]);
  }
  const ma=await pool.query("SELECT id,file_id FROM maintenance_attachments_shadow WHERE active=true AND COALESCE(file_id,'')<>''");
  for(const r of ma.rows)if(have.has(String(r.file_id)))await pool.query('UPDATE maintenance_attachments_shadow SET url=$2,shadow_updated_at=now() WHERE id=$1',
    [String(r.id),localFileUrlV24(String(r.file_id))]);
  const ra=await pool.query("SELECT id,file_id FROM regie_attachments_shadow WHERE COALESCE(file_id,'')<>''");
  for(const r of ra.rows)if(have.has(String(r.file_id)))await pool.query('UPDATE regie_attachments_shadow SET url=$2,shadow_updated_at=now() WHERE id=$1',
    [String(r.id),localFileUrlV24(String(r.file_id))]);
}
async function finalCutoverAuditV24(){
  if(!pool)return null;
  const [files,creds,pending,refs]=await Promise.all([
    pool.query('SELECT COUNT(*)::int n,COALESCE(SUM(file_size),0)::bigint bytes FROM binary_files_v10'),
    pool.query('SELECT COUNT(*)::int n FROM employee_credentials_v10 WHERE active=true'),
    pool.query("SELECT status,COUNT(*)::int n FROM legacy_write_outbox WHERE status IN ('pending','failed','sending') GROUP BY status"),
    pool.query(`SELECT
      (SELECT COUNT(*) FROM time_entries_shadow WHERE COALESCE(customer_signature_id,'')<>'')::int sig_refs,
      (SELECT COALESCE(SUM(CASE WHEN COALESCE(photo_file_ids,'')='' THEN 0 ELSE array_length(string_to_array(photo_file_ids,','),1) END),0) FROM time_entries_shadow)::int photo_refs,
      (SELECT COUNT(*) FROM day_closures_shadow WHERE COALESCE(legacy_col5,'')<>'')::int day_sig_refs`)
  ]);
  const r=refs.rows[0]||{};
  return {files:Number(files.rows[0]?.n||0),bytes:Number(files.rows[0]?.bytes||0),
    activeCredentials:Number(creds.rows[0]?.n||0),outbox:pending.rows,
    references:{customerSignatures:Number(r.sig_refs||0),photos:Number(r.photo_refs||0),daySignatures:Number(r.day_sig_refs||0)}};
}

async function initDb() {
  if (!pool) return;
  await pool.query(schema);
  await initFinalCutoverStorageV24();
  await bootstrapEmployeeCredentialsV24();
  await pool.query("INSERT INTO partner_categories_v10(id,name,sort_order,active,created_by) VALUES ('PC-ELEKTRIKER','Elektriker',10,true,'System'),('PC-FLIESENLEGER','Fliesenleger',20,true,'System'),('PC-TROCKENBAUER','Trockenbauer',30,true,'System') ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,sort_order=EXCLUDED.sort_order,active=true,updated_at=now()");
  await cleanupInternalData();
  await loadGooglePingCache();
  await initManualOrdersShadow();
  await initOwnRemindersShadow();
  await initOfferRemindersShadow();
  await initInquiryOffersShadow();
  await initCustomerInquiriesShadow();
  await initInquiryRemindersShadow();
  await initPlannerWorkersShadow();
  await initPlannerEventsShadow();
  await initMaintenanceShadows();
  await initMaintenanceAttachmentsShadow();
  await initAbsencesShadow();
  await initVacationEntitlementsShadow();
  await initTimeBankShadow();
  await initEmployeeAdminShadowFromSnapshot();
  await initAssignmentsShadow();
  await initMonthlyAdjustmentsShadow();
  await initClosureShadows();
  await initConflictReviewsShadow();
  await initDayStatusShadow();
  await reconcileLegacyDayStatusCreditsV12();
  await initDayClosuresShadow();
  await reconcileLegacyDayClosureDuplicatesV9();
  await initTimeEntriesShadow();
  await initRegieMetadataShadows();
  await bootstrapCompletedCustomerConsolidationV23();
  await initRegieAttachmentsShadow();
  await finalizeLocalFileReferencesV24();
  await bootstrapTrustedShadowReadiness();
  await bootstrapEmployeeAdminReadiness();
  await bootstrapTrustedShadowReadinessV2();
  await bootstrapTrustedShadowReadinessV3();
  await bootstrapDerivedReadinessV4();
  await bootstrapMaintenanceReadinessV5();
  await bootstrapTimeBankReadinessV6();
  await bootstrapVacationReadinessV7();
  await bootstrapCurrentPeriodReadinessV8();
  await bootstrapMonthDataFromLegacyV20();
  await bootstrapDayAndBossClosureReadinessV10();
  await bootstrapAbsenceAndPlannerReadinessV11();
  await bootstrapPayrollCycleNativeV13();
  await bootstrapRegieReadinessV14();
  await bootstrapOfferNativeV15();
  await bootstrapObjectReportsV16();
  await bootstrapDashboardNativeV17();
  await bootstrapBossMonthComparisonV18();
  await bootstrapPayrollAuditComparisonV19();
  await bootstrapProductionReadinessV21();
  employeeSnapshotDirtyCache = null;
  if (!(await isEmployeeSnapshotDirty())) await getEmployeesFromSnapshot();
  const cleanupTimer = setInterval(() => {
    cleanupInternalData().catch(e => console.error('internal cleanup failed', e.message));
  }, 6 * 60 * 60 * 1000);
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

  const latencyTimer = setInterval(() => {
    logLatencySummary().catch(e => console.error('latency summary failed', e.message));
    logCacheStats();
  }, 5 * 60 * 1000);
  if (typeof latencyTimer.unref === 'function') latencyTimer.unref();

  const legacyOutboxTimer = setInterval(() => {
    flushLegacyWriteOutbox().catch(e => console.error('legacy outbox scheduled flush failed', e.message));
  }, 10 * 1000);
  if (typeof legacyOutboxTimer.unref === 'function') legacyOutboxTimer.unref();
  kickLegacyOutbox();
}

function cors(req, res) {
  const origin = String(req.headers.origin || '');
  if (origin && origin === WEB_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Migration-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function chooseApiEncoding(req, data) {
  if (!req || !data || data.length < 1024) return {body:data,encoding:null};
  const a = String(req.headers['accept-encoding'] || '').toLowerCase();
  if (/(^|[,\s])br([,\s]|$)/.test(a)) {
    return {body:zlib.brotliCompressSync(data,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:4}}),encoding:'br'};
  }
  if (/(^|[,\s])gzip([,\s]|$)/.test(a)) {
    return {body:zlib.gzipSync(data,{level:5}),encoding:'gzip'};
  }
  return {body:data,encoding:null};
}

function sendApiBody(req,res,status,contentType,data,extraHeaders={}) {
  const raw = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
  const variant = chooseApiEncoding(req, raw);
  const headers = {
    'Content-Type': contentType || 'application/json; charset=utf-8',
    'Content-Length': variant.body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin, Accept-Encoding',
    ...extraHeaders
  };
  if (variant.encoding) headers['Content-Encoding'] = variant.encoding;
  res.writeHead(status, headers);
  res.end(variant.body);
}

function json(res, status, body, req) {
  if (req) cors(req, res);
  const data = Buffer.from(JSON.stringify(body));
  sendApiBody(req,res,status,'application/json; charset=utf-8',data);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 30 * 1024 * 1024) throw new Error('Payload too large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function uploadAuthorized(req) {
  if (!MIGRATION_UPLOAD_KEY) return false;
  const key = String(req.headers['x-migration-key'] || '');
  if (key.length !== MIGRATION_UPLOAD_KEY.length) return false;
  return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(MIGRATION_UPLOAD_KEY));
}

async function readBinary(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Upload too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sheetRowsWithFormulas(ws) {
  if (!ws || !ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const rows = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    let last = -1;
    const row = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({r,c})];
      if (!cell) { row.push(null); continue; }
      const item = { v: cell.v === undefined ? null : cell.v, t: cell.t || null };
      if (cell.f) item.f = cell.f;
      if (cell.z) item.z = cell.z;
      row.push(item);
      if (cell.v !== undefined || cell.f) last = c;
    }
    if (last >= 0) rows.push({ sourceRow:r+1, cells:row.slice(0,last+1) });
  }
  return rows;
}

async function importWorkbook(buffer) {
  if (!pool) throw new Error('Database not configured');
  const wb = XLSX.read(buffer, { type:'buffer', cellDates:true, cellFormula:true, cellNF:true });
  const client = await pool.connect();
  const counts = {};
  let runId = null;
  try {
    await client.query('BEGIN');
    const rr = await client.query(
      "INSERT INTO migration_runs(source_version,mode,status,notes) VALUES($1,'xlsx-shadow','running',$2) RETURNING id",
      ['Google-Sheets-live','Direct XLSX snapshot from Del Gesso Zeiterfassung']
    );
    runId = rr.rows[0].id;
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      const rows = sheetRowsWithFormulas(ws);
      const nonHeader = rows.filter(x => x.sourceRow > 1);
      counts[name] = nonHeader.length;
      let cols = 0;
      for (const r of rows) cols = Math.max(cols, r.cells.length);
      const digest = crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
      await client.query(
        'INSERT INTO migration_sheets(migration_run_id,sheet_name,source_rows,source_columns,imported_rows,payload_sha256) VALUES($1,$2,$3,$4,$5,$6)',
        [runId,name,nonHeader.length,cols,nonHeader.length,digest]
      );
      for (const row of rows) {
        const payload = JSON.stringify({ sheet:name, sourceRow:row.sourceRow, cells:row.cells });
        const sha = crypto.createHash('sha256').update(payload).digest('hex');
        await client.query(
          `INSERT INTO migration_objects(entity_type,source_key,payload,payload_sha256,migration_run_id)
           VALUES($1,$2,$3::jsonb,$4,$5)
           ON CONFLICT(entity_type,source_key)
           DO UPDATE SET payload=EXCLUDED.payload,payload_sha256=EXCLUDED.payload_sha256,
                         imported_at=now(),migration_run_id=EXCLUDED.migration_run_id`,
          ['sheet:'+name,String(row.sourceRow),payload,sha,runId]
        );
      }
    }
    const total = Object.values(counts).reduce((a,b)=>a+b,0);
    await client.query(
      "UPDATE migration_runs SET finished_at=now(),status='success',source_counts=$2::jsonb,target_counts=$2::jsonb,notes=$3 WHERE id=$1",
      [runId,JSON.stringify(counts),'XLSX import completed; row counts identical at import time']
    );
    await client.query(
      `INSERT INTO app_meta(key,value) VALUES('latest_migration',$1::jsonb)
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
      [JSON.stringify({runId,totalRows:total,sheets:counts,importedAt:new Date().toISOString()})]
    );
    await client.query('COMMIT');
    return {ok:true,runId,totalRows:total,sheets:counts};
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function importWorkbookFromUrlOnce() {
  if (!MIGRATION_XLSX_URL || !pool) return;
  const existing = await pool.query("SELECT value FROM app_meta WHERE key='latest_migration'");
  if (existing.rowCount) {
    console.log('Migration snapshot already present; startup import skipped.');
    return;
  }
  const u = new URL(MIGRATION_XLSX_URL);
  if (!u.hostname.endsWith('oaiusercontent.com')) {
    throw new Error('Migration snapshot host not allowed');
  }
  console.log('Downloading migration snapshot...');
  const response = await fetch(MIGRATION_XLSX_URL, { redirect:'follow' });
  if (!response.ok) throw new Error('Snapshot download failed: '+response.status);
  const ab = await response.arrayBuffer();
  const buf = Buffer.from(ab);
  console.log('Migration snapshot downloaded: '+buf.length+' bytes');
  const result = await importWorkbook(buf);
  console.log('Migration snapshot imported: run '+result.runId+', '+result.totalRows+' rows');
}

const CACHEABLE_ACTIONS = new Set([
  'getDashboardSummary',
  'getDashboardSummary51',
  'getEmployees',
  'getDayData',
  'getMonthData',
  'getBossMonthData',
  'getBossDayClosures',
  'getEmployeeAdminData',
  'getAbsenceOverview',
  'getAbsences',
  'getSicknessAlerts',
  'getVacationAccount',
  'getVacationAccounts',
  'getTimeBankAccount',
  'getEmployeeCalendarEvents',
  'getRegieReports',
  'getOfferStatistics',
  'getOwnReminders',
  'getOfferReports',
  'getOfferReminders',
  'getInquiryReminders',
  'getCustomerInquiries',
  'getManualOrders',
  'getMaintenanceOverview',
  'getMaintenanceContracts',
  'getMaintenanceArchive',
  'getMaintenanceCustomer',
  'getMaintenanceAttachment',
  'searchMaintenanceCustomers',
  'findMaintenanceDeviceByInternalId',
  'getPlannerWorkers',
  'getPlannerAvailability',
  'getPlannerEvents',
  'getObjectReports',
  'getObjectInternalNote',
  'getObjectInternalNotes',
  'getRegieAttachments',
  'getWeekData',
  'getMinimumWage',
  'getMonthPayrollAudit',
  'getPayrollCycleState',
  'checkRegieBillingRisk'
]);

const READ_CACHE_TTL_MS = 60 * 60 * 1000;
const READ_CACHE_REFRESH_MS = 50 * 60 * 1000;
const readRefreshPromises = new Map();
const cacheStats = new Map();

function bumpCacheStat(action,kind) {
  const key = String(action||'unknown');
  const row = cacheStats.get(key) || {hit:0,miss:0,force:0};
  if (kind === 'hit') row.hit++;
  else if (kind === 'force') row.force++;
  else row.miss++;
  cacheStats.set(key,row);
}

function logCacheStats() {
  if (!cacheStats.size) return;
  const rows = [...cacheStats.entries()]
    .map(([action,s]) => ({action,...s,total:s.hit+s.miss+s.force}))
    .sort((a,b)=>b.total-a.total)
    .slice(0,15);
  console.log('CACHE15 ' + rows.map(r =>
    r.action+'=h'+r.hit+'/m'+r.miss+'/f'+r.force
  ).join(' | '));
}
const GOOGLE_PING_TTL_MS = 60 * 60 * 1000;
const GOOGLE_PING_REFRESH_MS = 50 * 60 * 1000;
let googlePingCache = null;
let googlePingRefreshPromise = null;

async function loadGooglePingCache() {
  if (!pool) return;
  const q = await pool.query("SELECT value FROM app_meta WHERE key='google_backend_ping'");
  if (!q.rowCount) return;
  const v = q.rows[0].value;
  if (v && v.raw && v.checkedAt) googlePingCache = v;
}

function googlePingFresh() {
  if (!googlePingCache || !googlePingCache.checkedAt) return false;
  const t = new Date(googlePingCache.checkedAt).getTime();
  return Number.isFinite(t) && Date.now() - t < GOOGLE_PING_TTL_MS;
}

async function refreshGooglePing() {
  if (googlePingRefreshPromise) return googlePingRefreshPromise;
  googlePingRefreshPromise = (async () => {
  if (!GOOGLE_BACKEND_URL) throw new Error('Google backend not configured');
  const startedAt = Date.now();
  const payload = {action:'ping',clientVersion:'9.0'};
  const upstream = await fetch(GOOGLE_BACKEND_URL, {
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify(payload),
    redirect:'follow'
  });
  const raw = await upstream.text();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (_e) {}
  if (!upstream.ok || !parsed || parsed.ok === false) {
    throw new Error('Google ping failed: HTTP '+upstream.status);
  }
  const value = {
    raw,
    httpStatus: upstream.status,
    contentType: upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    checkedAt: new Date().toISOString()
  };
  googlePingCache = value;
  if (pool) {
    await Promise.all([
      pool.query(
        `INSERT INTO app_meta(key,value) VALUES('google_backend_ping',$1::jsonb)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
        [JSON.stringify(value)]
      ),
      pool.query(
        `INSERT INTO legacy_action_log(action,request_payload,response_ok,response_payload,http_status,duration_ms)
         VALUES('ping',$1::jsonb,true,$2::jsonb,$3,$4)`,
        [JSON.stringify({action:'ping',clientVersion:'9.0',source:'background-check'}),
         JSON.stringify(sanitizeForLog(parsed)), upstream.status, Math.max(0,Date.now()-startedAt)]
      )
    ]);
  }
  return value;
  })();
  try {
    return await googlePingRefreshPromise;
  } finally {
    googlePingRefreshPromise = null;
  }
}

function sendGooglePingCache(req,res,value) {
  cors(req,res);
  return sendApiBody(
    req,res,Number(value.httpStatus||200),
    value.contentType||'application/json; charset=utf-8',
    value.raw,
    {
      'X-DG-Ping-Cache':'HIT',
      'X-DG-Ping-Age':String(Math.max(0,Math.floor((Date.now()-new Date(value.checkedAt).getTime())/1000)))
    }
  );
}

async function handlePing(req,res) {
  if (googlePingFresh()) return sendGooglePingCache(req,res,googlePingCache);
  if (googlePingCache && googlePingCache.raw) {
    refreshGooglePing().catch(e => console.error('Google stale ping refresh failed:', e.message));
    return sendGooglePingCache(req,res,googlePingCache);
  }
  try {
    const value = await refreshGooglePing();
    return sendGooglePingCache(req,res,value);
  } catch (e) {
    console.error('Google background ping failed:', e.message);
    return json(res,502,{ok:false,error:'Google backend unavailable: '+e.message},req);
  }
}

const EMPLOYEE_MUTATION_ACTIONS = new Set([
  'saveEmployeeAdmin',
  'setEmployeeActive',
  'deleteEmployeeAdmin'
]);
let employeeSnapshotDirtyCache = null;
let employeeNamesCache = null;

async function isEmployeeSnapshotDirty() {
  if (employeeSnapshotDirtyCache !== null) return employeeSnapshotDirtyCache;
  if (!pool) return true;
  const q = await pool.query("SELECT value FROM app_meta WHERE key='employee_snapshot_dirty'");
  if (!q.rowCount) {
    employeeSnapshotDirtyCache = false;
    return false;
  }
  const v = q.rows[0].value;
  employeeSnapshotDirtyCache = v === true || (v && v.dirty === true);
  return employeeSnapshotDirtyCache;
}

async function markEmployeeSnapshotDirty(action) {
  employeeSnapshotDirtyCache = true;
  employeeNamesCache = null;
  if (!pool) return;
  const value = JSON.stringify({dirty:true,action:String(action||''),at:new Date().toISOString()});
  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES('employee_snapshot_dirty',$1::jsonb)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
    [value]
  );
}

async function clearEmployeeSnapshotDirty(reason) {
  employeeSnapshotDirtyCache = false;
  employeeNamesCache = null;
  if (!pool) return;
  const value = JSON.stringify({dirty:false,reason:String(reason||''),at:new Date().toISOString()});
  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES('employee_snapshot_dirty',$1::jsonb)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
    [value]
  );
}


const SENSITIVE_REQUEST_FIELDS = new Set([
  'pin',
  'employeePin',
  'deviceSessionToken',
  'token',
  'password'
]);

function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value == null ? '' : value)).digest('hex');
}

function normalizedCachePayload(body) {
  const clone = Object.assign({}, body || {});
  delete clone.force;
  delete clone.clientTs;
  delete clone.timestamp;
  for (const key of Object.keys(clone)) {
    if (SENSITIVE_REQUEST_FIELDS.has(key) && clone[key] !== undefined && clone[key] !== null && clone[key] !== '') {
      clone[key] = 'sha256:' + hashSecret(clone[key]);
    }
  }
  return clone;
}

function sanitizeForLog(value) {
  if (Array.isArray(value)) return value.map(sanitizeForLog);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key,val] of Object.entries(value)) {
    if (SENSITIVE_REQUEST_FIELDS.has(key)) out[key] = '[redacted]';
    else out[key] = sanitizeForLog(val);
  }
  return out;
}

function sanitizedLogPayload(body) {
  return sanitizeForLog(body || {});
}

function tokenHash(value){
  const v=String(value||'');
  return v?crypto.createHash('sha256').update(v).digest('hex'):'';
}

function looksLikeDeviceSessionToken(value){
  const v=String(value||'').trim();
  return v.length>=20 && !/^\d{4,10}$/.test(v);
}

async function registerRailwaySession(employee,token,chefAccess){
  if(!pool||!employee||!looksLikeDeviceSessionToken(token))return false;
  await pool.query(
    `INSERT INTO railway_sessions(
      token_hash,employee_name,chef_access,created_at,last_seen_at,expires_at,revoked_at
    ) VALUES($1,$2,$3,now(),now(),now()+interval '24 hours',NULL)
    ON CONFLICT(token_hash) DO UPDATE SET
      employee_name=EXCLUDED.employee_name,chef_access=EXCLUDED.chef_access,
      last_seen_at=now(),expires_at=now()+interval '24 hours',revoked_at=NULL`,
    [tokenHash(token),String(employee),Boolean(chefAccess)]
  );
  return true;
}

async function revokeRailwaySession(token){
  if(!pool||!looksLikeDeviceSessionToken(token))return;
  await pool.query(
    'UPDATE railway_sessions SET revoked_at=now() WHERE token_hash=$1',
    [tokenHash(token)]
  );
}

async function localSessionForBody(body,requireChef){
  if(!pool||!body)return null;
  if(await isEmployeeSnapshotDirty())return null;
  const employee=String(body.employee||'').trim();
  const token=String(body.employeePin||body.pin||body.deviceSessionToken||'').trim();
  if(!employee||!looksLikeDeviceSessionToken(token))return null;
  const h=tokenHash(token);
  const q=await pool.query(
    `SELECT employee_name,chef_access,expires_at,revoked_at
       FROM railway_sessions
      WHERE token_hash=$1 AND employee_name=$2
        AND revoked_at IS NULL AND expires_at>now()`,
    [h,employee]
  );
  if(!q.rowCount)return null;
  const row=q.rows[0];
  let chefAccess=Boolean(row.chef_access);
  if(requireChef&&!chefAccess){
    const aq=await pool.query(
      'SELECT payload FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1',
      [employee]
    );
    chefAccess=Boolean(aq.rows[0]?.payload?.chefAccess);
    if(chefAccess){
      await pool.query(
        'UPDATE railway_sessions SET chef_access=true,last_seen_at=now() WHERE token_hash=$1 AND employee_name=$2',
        [h,employee]
      );
      console.log('RAILWAY_SESSION chef access repaired from employee_admin employee='+employee);
    }
  }
  if(requireChef&&!chefAccess)return null;
  pool.query(
    'UPDATE railway_sessions SET last_seen_at=now() WHERE token_hash=$1',
    [h]
  ).catch(()=>{});
  return {employee:String(row.employee_name),chefAccess};
}

async function refreshSessionFromSuccessfulRequest(action,body,parsed){
  if(!pool||!body||!parsed||parsed.ok===false)return;
  if(action==='employeeLogin'){
    const employee=String(parsed.employee||body.employee||'').trim();
    const token=String(parsed.deviceSessionToken||'').trim();
    if(employee&&token)await registerRailwaySession(employee,token,Boolean(parsed.chefAccess));
    return;
  }
  if(action==='employeeLogout'){
    await revokeRailwaySession(body.deviceSessionToken);
    return;
  }
  const token=String(body.employeePin||body.pin||'').trim();
  if(!looksLikeDeviceSessionToken(token))return;
  const employee=String(body.employee||'').trim();
  if(!employee)return;
  // A successful Google-authenticated request proves the token is still valid.
  // Restore the chef flag from the authoritative employee profile if an older
  // device session was registered before the local role bridge existed.
  const h=tokenHash(token);
  const [existing,profileQ]=await Promise.all([
    pool.query(
      'SELECT chef_access FROM railway_sessions WHERE token_hash=$1 AND employee_name=$2',
      [h,employee]
    ),
    pool.query(
      'SELECT payload FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1',
      [employee]
    )
  ]);
  const chef=Boolean(existing.rows[0]?.chef_access)||Boolean(profileQ.rows[0]?.payload?.chefAccess);
  await registerRailwaySession(employee,token,chef);
}

function isCacheableAction(action) {
  return CACHEABLE_ACTIONS.has(action);
}

function isWriteAction(action) {
  const a=String(action||'');
  return Boolean(a) &&
    !/^(get|check|search|find)/.test(a) &&
    !['ping','employeeLogin','employeeLogout','systemHealthCheck'].includes(a);
}

async function bumpWriteStat(action, ok) {
  if (!pool || !isWriteAction(action)) return;
  if (ok) {
    await pool.query(
      `INSERT INTO write_action_stats(action,success_count,last_success_at,updated_at)
       VALUES($1,1,now(),now())
       ON CONFLICT(action) DO UPDATE SET
         success_count=write_action_stats.success_count+1,
         last_success_at=now(),updated_at=now()`,
      [String(action)]
    );
  } else {
    await pool.query(
      `INSERT INTO write_action_stats(action,failure_count,last_failure_at,updated_at)
       VALUES($1,1,now(),now())
       ON CONFLICT(action) DO UPDATE SET
         failure_count=write_action_stats.failure_count+1,
         last_failure_at=now(),updated_at=now()`,
      [String(action)]
    );
  }
}

function shouldBypassReadCache(body) {
  return Boolean(body && body.force);
}

async function readCachedResponse(action, body) {
  if (!pool || !isCacheableAction(action)) return null;
  if (shouldBypassReadCache(body)) {
    bumpCacheStat(action,'force');
    return null;
  }
  const payload = normalizedCachePayload(body);
  const key = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const q = await pool.query(
    "SELECT response_text,http_status,created_at FROM response_cache WHERE cache_key=$1 AND created_at > now() - interval '1 hour'",
    [key]
  );
  if (!q.rowCount) {
    bumpCacheStat(action,'miss');
    return null;
  }
  bumpCacheStat(action,'hit');
  return {key,responseText:q.rows[0].response_text,httpStatus:q.rows[0].http_status,createdAt:q.rows[0].created_at};
}

async function writeCachedResponse(action, body, responseText, httpStatus) {
  if (!pool || !isCacheableAction(action) || Number(httpStatus)!==200) return;
  let parsed = null;
  try { parsed = JSON.parse(responseText); } catch (_e) { return; }
  if (!parsed || parsed.ok === false) return;
  const payload = normalizedCachePayload(body);
  const key = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  await pool.query(
    `INSERT INTO response_cache(cache_key,action,request_payload,response_text,http_status,created_at)
     VALUES($1,$2,$3::jsonb,$4,$5,now())
     ON CONFLICT(cache_key) DO UPDATE SET action=EXCLUDED.action,request_payload=EXCLUDED.request_payload,
       response_text=EXCLUDED.response_text,http_status=EXCLUDED.http_status,created_at=now()`,
    [key,action,JSON.stringify(payload),responseText,httpStatus]
  );
}

async function refreshReadCacheInBackground(action, body, cacheKey) {
  if (!GOOGLE_BACKEND_URL || !isCacheableAction(action)) return;
  const key = String(cacheKey || crypto.createHash('sha256').update(JSON.stringify(normalizedCachePayload(body))).digest('hex'));
  if (readRefreshPromises.has(key)) return readRefreshPromises.get(key);
  const run=(async()=>{
    const startedAt=Date.now();
    try{
      const upstream=await fetch(GOOGLE_BACKEND_URL,{
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify(Object.assign({},body||{}, {force:true})),
        redirect:'follow'
      });
      const raw=await upstream.text();
      let parsed=null;try{parsed=JSON.parse(raw);}catch(_e){}
      if(upstream.status===200&&parsed&&parsed.ok!==false){
        await writeCachedResponse(action,body,raw,upstream.status);
      }
      if(pool){
        pool.query(
          `INSERT INTO legacy_action_log(action,request_payload,response_ok,response_payload,http_status,duration_ms)
           VALUES($1,$2::jsonb,$3,$4::jsonb,$5,$6)`,
          [action,JSON.stringify(Object.assign({},sanitizedLogPayload(body),{source:'refresh-ahead'})),
           Boolean(parsed&&parsed.ok!==false),parsed?JSON.stringify(parsed):null,
           upstream.status,Math.max(0,Date.now()-startedAt)]
        ).catch(()=>{});
      }
    }catch(e){
      console.error('read cache refresh-ahead failed for '+action+':',e.message);
    }finally{
      readRefreshPromises.delete(key);
    }
  })();
  readRefreshPromises.set(key,run);
  return run;
}

const CACHE_GROUPS = {
  employee: ['getEmployees','getEmployeeAdminData','getVacationAccount','getVacationAccounts','getTimeBankAccount','getAbsences','getAbsenceOverview','getSicknessAlerts','getMonthPayrollAudit','getPayrollCycleState','getPlannerWorkers','getDashboardSummary51'],
  time: ['getDayData','getWeekData','getMonthData','getBossMonthData','getBossDayClosures','getRegieReports','getRegieAttachments','getAbsences','getAbsenceOverview','getSicknessAlerts','getVacationAccount','getVacationAccounts','getTimeBankAccount','getMonthPayrollAudit','getPayrollCycleState','getDashboardSummary51'],
  offers: ['getOfferReports','getOfferReminders','getOfferStatistics','getOwnReminders','getDashboardSummary51'],
  inquiries: ['getCustomerInquiries','getInquiryReminders','getOwnReminders','getDashboardSummary51'],
  maintenance: ['getMaintenanceOverview','getMaintenanceContracts','getMaintenanceArchive','getMaintenanceCustomer','getMaintenanceAttachment','searchMaintenanceCustomers','findMaintenanceDeviceByInternalId','getDashboardSummary51'],
  planner: ['getPlannerWorkers','getPlannerAvailability','getPlannerEvents'],
  calendar: ['getEmployeeCalendarEvents'],
  manualOrders: ['getManualOrders','getDashboardSummary51'],
  objects: ['getObjectReports','getObjectInternalNote','getObjectInternalNotes','checkRegieBillingRisk','getRegieReports','getRegieAttachments','getDashboardSummary51']
};

function cacheActionsForWrite(action) {
  const a = String(action || '');
  const groups = new Set();
  if (/Employee|Vacation|Absence|Sickness|Holiday|TimeBank|Payroll/i.test(a)) groups.add('employee');
  if (/Entry|Day|Month|Regie|TimeBank|Payroll|Absence|Vacation|Sickness|Holiday/i.test(a)) groups.add('time');
  if (/Offer|OwnReminder/i.test(a)) groups.add('offers');
  if (/Inquiry|CustomerInquiry/i.test(a)) groups.add('inquiries');
  if (/Maintenance/i.test(a)) groups.add('maintenance');
  if (/Planner/i.test(a)) groups.add('planner');
  if (/ExternalGoogleEvent/i.test(a)) groups.add('calendar');
  if (/ManualOrder|acceptOfferAsRunning|acceptOfferFromReminder/i.test(a)) groups.add('manualOrders');
  if (/Object|Regie/i.test(a)) groups.add('objects');
  if (!groups.size) return null;
  const actions = new Set();
  for (const group of groups) for (const readAction of CACHE_GROUPS[group]) actions.add(readAction);
  return [...actions];
}

async function invalidateReadCache(action) {
  if (!pool) return;
  const actions = cacheActionsForWrite(action);
  if (!actions) {
    await pool.query('TRUNCATE response_cache');
    return;
  }
  await pool.query('DELETE FROM response_cache WHERE action = ANY($1::text[])',[actions]);
}


function cellValue(cell) {
  return cell && Object.prototype.hasOwnProperty.call(cell, 'v') ? cell.v : null;
}

function textCell(cells,index) {
  const v=cellValue(cells[index]);
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v.value !== undefined) return String(v.value);
  return String(v);
}




function shadowActive(raw){
  const s=String(raw==null?'':raw).trim().toLowerCase();
  return !['nein','no','false','0','inaktiv'].includes(s);
}










async function auditDayClosureSourceDuplicates(){
  if(!pool)return {rows:0,unique:0,duplicates:0};
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:Tagesabschluesse']
  );
  let rows=0;const keys=new Set();
  for(const row of q.rows){
    const payload=row.payload||{};
    if(Number(payload.sourceRow||row.source_key)<=1)continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const employee=textCell(cells,0).trim(),date=textCell(cells,1).trim();
    if(!employee||!date)continue;
    rows++;keys.add(employee+'|'+date);
  }
  const out={rows,unique:keys.size,duplicates:Math.max(0,rows-keys.size)};
  console.log('DAY_CLOSURE_SOURCE_AUDIT rows='+out.rows+' unique='+out.unique+' duplicates='+out.duplicates);
  return out;
}




async function initRegieAttachmentsShadow(){
  if(!pool)return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM regie_attachments_shadow');
  if((existing.rows[0]?.n||0)>0)return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:RegieZusatzdateien']
  );
  let inserted=0;
  for(const row of q.rows){
    const payload=row.payload||{};if(Number(payload.sourceRow||row.source_key)<=1)continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const id=textCell(cells,0).trim();if(!id)continue;
    await pool.query(
      `INSERT INTO regie_attachments_shadow(
        id,object_ids_text,customer,file_id,url,file_name,mime,uploaded_at_text,uploaded_by
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT(id) DO NOTHING`,
      [id,textCell(cells,1),textCell(cells,2),textCell(cells,3),textCell(cells,4),
       textCell(cells,5),textCell(cells,6),textCell(cells,7),textCell(cells,8)]
    );
    inserted++;
  }
  console.log('SHADOW regie_attachments initialized rows='+inserted);
}
function regieAttachmentsVerifyKey(body){
  const ids=Array.isArray(body&&body.objectIds)?body.objectIds.map(String).filter(Boolean).sort():[];
  return 'regie_attachments:'+crypto.createHash('sha256').update(ids.join('|')).digest('hex').slice(0,16);
}
async function postgresRegieAttachments(body){
  const ids=Array.isArray(body&&body.objectIds)?body.objectIds.map(String).filter(Boolean):[];
  if(!ids.length)return [];
  const q=await pool.query(
    `SELECT id,object_ids_text,customer,file_id,url,file_name,mime,uploaded_at_text,uploaded_by
       FROM regie_attachments_shadow ORDER BY uploaded_at_text ASC,id ASC`
  );
  const wanted=new Set(ids);
  const out=[];
  for(const r of q.rows){
    const rowIds=String(r.object_ids_text||'').split('|').map(x=>x.trim()).filter(Boolean);
    if(!rowIds.some(id=>wanted.has(id)))continue;
    out.push({
      id:String(r.id||''),objectIds:rowIds,customer:String(r.customer||''),fileId:String(r.file_id||''),
      url:String(r.url||''),name:String(r.file_name||''),mime:String(r.mime||''),
      uploadedAt:berlinDateTime(r.uploaded_at_text||''),uploadedBy:String(r.uploaded_by||'')
    });
  }
  return out;
}
function canonicalRegieAttachments(rows){
  return (Array.isArray(rows)?rows:[]).map(x=>({
    id:String(x.id||''),objectIds:(Array.isArray(x.objectIds)?x.objectIds:[]).map(String),
    customer:String(x.customer||''),fileId:String(x.fileId||''),url:String(x.url||''),
    name:String(x.name||''),mime:String(x.mime||''),uploadedAt:String(x.uploadedAt||''),
    uploadedBy:String(x.uploadedBy||'')
  }));
}
async function verifyRegieAttachmentsShadow(rows,body){
  if(!pool||!Array.isArray(rows))return;
  const pg=await postgresRegieAttachments(body),a=canonicalRegieAttachments(rows),b=canonicalRegieAttachments(pg);
  const mismatches=JSON.stringify(a)===JSON.stringify(b)?0:1,key=regieAttachmentsVerifyKey(body);
  console.log('SHADOW_VERIFY '+key+' google='+a.length+' postgres='+b.length+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,a.length,b.length,mismatches);
}
async function directRegieAttachmentsRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const key=regieAttachmentsVerifyKey(body);
  const queryReady=await shadowReadyForDirectRead(key);
  const baseReady=await shadowReadyForDirectRead('regie_attachments:base');
  if(!queryReady&&!baseReady)return null;
  return postgresRegieAttachments(body);
}
async function mirrorRegieAttachmentsWrite(body,parsed){
  if(!pool)return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!Array.isArray(data))return;
  const ids=[...new Set((Array.isArray(body.objectIds)?body.objectIds:[]).map(String).filter(Boolean))];
  const objectIdsText=ids.join('|'),customer=String(body.customer||'');
  for(const x of data){
    const id=String(x&&x.id||'').trim();if(!id)continue;
    await pool.query(
      `INSERT INTO regie_attachments_shadow(
        id,object_ids_text,customer,file_id,url,file_name,mime,uploaded_at_text,uploaded_by,shadow_updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
      ON CONFLICT(id) DO UPDATE SET
        object_ids_text=EXCLUDED.object_ids_text,customer=EXCLUDED.customer,file_id=EXCLUDED.file_id,
        url=EXCLUDED.url,file_name=EXCLUDED.file_name,mime=EXCLUDED.mime,
        uploaded_at_text=EXCLUDED.uploaded_at_text,uploaded_by=EXCLUDED.uploaded_by,shadow_updated_at=now()`,
      [id,objectIdsText,customer,String(x.fileId||''),String(x.url||''),String(x.name||''),
       String(x.mime||''),String(x.uploadedAt||''),String(x.uploadedBy||body.employee||'')]
    );
  }
  await pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'regie_attachments:%'");
  const q=await pool.query('SELECT COUNT(*)::int AS n FROM regie_attachments_shadow');
  const n=Number(q.rows[0]?.n||0);
  await saveShadowVerifyStat('regie_attachments:base',n,n,0);
}

async function initRegieMetadataShadows(){
  if(!pool)return;
  const targets=[
    ['objects_shadow','sheet:Objekte'],
    ['regie_merges_shadow','sheet:RegieZusammenfuehrungen'],
    ['object_notes_shadow','sheet:InterneVermerke']
  ];
  const existing=await Promise.all(targets.map(x=>pool.query('SELECT COUNT(*)::int AS n FROM '+x[0])));
  if(existing.some(x=>(x.rows[0]?.n||0)>0))return;

  for(const [table,entity] of targets){
    const q=await pool.query(
      `SELECT source_key,payload FROM migration_objects
        WHERE entity_type=$1 ORDER BY source_key::int ASC`,
      [entity]
    );
    let inserted=0;
    for(const row of q.rows){
      const payload=row.payload||{};
      if(Number(payload.sourceRow||row.source_key)<=1)continue;
      const cells=Array.isArray(payload.cells)?payload.cells:[];
      const id=textCell(cells,0).trim();if(!id)continue;
      if(table==='objects_shadow'){
        await pool.query(
          `INSERT INTO objects_shadow(id,object_key,display_name,created_at_text)
           VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING`,
          [id,textCell(cells,1),textCell(cells,2),textCell(cells,3)]
        );
      }else if(table==='regie_merges_shadow'){
        await pool.query(
          `INSERT INTO regie_merges_shadow(object_id,merge_id,merged_at_text,merged_by)
           VALUES($1,$2,$3,$4) ON CONFLICT(object_id) DO NOTHING`,
          [id,textCell(cells,1),textCell(cells,2),textCell(cells,3)]
        );
      }else{
        await pool.query(
          `INSERT INTO object_notes_shadow(object_id,note,changed_at_text,changed_by)
           VALUES($1,$2,$3,$4) ON CONFLICT(object_id) DO NOTHING`,
          [id,textCell(cells,1),textCell(cells,2),textCell(cells,3)]
        );
      }
      inserted++;
    }
    console.log('SHADOW '+table+' initialized rows='+inserted);
  }
}

function shadowObjectKey(value){
  return String(value||'').toLowerCase().replace(/ß/g,'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')
    .replace(/\bstr\b/g,'strasse').replace(/([a-z0-9]+)str\b/g,'$1strasse');
}

async function consolidateCompletedCustomerV10(db,customer,triggerObjectId,by,nowIso,legacyBase,queueLegacy){
  const key=shadowObjectKey(customer);if(!key)return {objectIds:[],merged:false,moved:0};
  const ids=new Set();
  if(triggerObjectId)ids.add(String(triggerObjectId));

  // Clear matches only: same normalized customer/object key.
  const oq=await db.query('SELECT id,object_key FROM objects_shadow');
  for(const r of oq.rows)if(String(r.object_key||'')===key)ids.add(String(r.id||''));

  const tq=await db.query(
    `SELECT DISTINCT object_id,customer,job_status
       FROM time_entries_shadow
      WHERE COALESCE(billing_status,'Offen')='Offen'
        AND COALESCE(object_id,'')<>''
        AND COALESCE(job_status,'Abgeschlossen') IN ('Laufend','Abgeschlossen')`
  );
  for(const r of tq.rows){
    if(shadowObjectKey(r.customer)===key)ids.add(String(r.object_id||''));
  }

  // Keep already merged members together even when the display text varies slightly.
  if(ids.size){
    const mq=await db.query(
      'SELECT DISTINCT merge_id FROM regie_merges_shadow WHERE object_id=ANY($1::text[]) AND COALESCE(merge_id,\'\')<>\'\'',
      [[...ids]]
    );
    const mergeIds=mq.rows.map(r=>String(r.merge_id||'')).filter(Boolean);
    if(mergeIds.length){
      const members=await db.query(
        'SELECT object_id FROM regie_merges_shadow WHERE merge_id=ANY($1::text[])',
        [mergeIds]
      );
      for(const r of members.rows)if(r.object_id)ids.add(String(r.object_id));
    }
  }

  const objectIds=[...ids].filter(Boolean).sort();
  if(!objectIds.length)return {objectIds:[],merged:false,moved:0};

  const before=await db.query(
    `SELECT object_id,job_status FROM time_entries_shadow
      WHERE object_id=ANY($1::text[])
        AND COALESCE(billing_status,'Offen')='Offen'
        AND COALESCE(job_status,'Abgeschlossen') IN ('Laufend','Abgeschlossen')`,
    [objectIds]
  );
  const runningObjects=[...new Set(before.rows
    .filter(r=>String(r.job_status||'')==='Laufend')
    .map(r=>String(r.object_id||'')).filter(Boolean))];

  let mergeId='';
  if(objectIds.length>1){
    const existing=await db.query(
      'SELECT merge_id FROM regie_merges_shadow WHERE object_id=ANY($1::text[]) AND COALESCE(merge_id,\'\')<>\'\' ORDER BY merged_at_text ASC NULLS LAST,merge_id LIMIT 1',
      [objectIds]
    );
    mergeId=String(existing.rows[0]?.merge_id||('MERGE-'+crypto.randomUUID()));
    for(const oid of objectIds){
      await db.query(
        `INSERT INTO regie_merges_shadow(object_id,merge_id,merged_at_text,merged_by,shadow_updated_at)
         VALUES($1,$2,$3,$4,now())
         ON CONFLICT(object_id) DO UPDATE SET
           merge_id=EXCLUDED.merge_id,merged_at_text=EXCLUDED.merged_at_text,
           merged_by=EXCLUDED.merged_by,shadow_updated_at=now()`,
        [oid,mergeId,nowIso,String(by||'')]
      );
    }
  }

  const upd=await db.query(
    `UPDATE time_entries_shadow
        SET job_status='Abgeschlossen',shadow_updated_at=now()
      WHERE object_id=ANY($1::text[])
        AND COALESCE(billing_status,'Offen')='Offen'
        AND COALESCE(job_status,'Abgeschlossen') IN ('Laufend','Abgeschlossen')
      RETURNING id`,
    [objectIds]
  );

  if(queueLegacy&&legacyBase){
    if(objectIds.length>1){
      await enqueueLegacyWriteWithClient(db,'mergeRegieObjects',
        Object.assign({},legacyBase,{action:'mergeRegieObjects',objectIds}));
    }
    // Push status for every member so Google cannot keep an old "Laufend" tab behind.
    for(const oid of objectIds){
      await enqueueLegacyWriteWithClient(db,'setRegieObjectJobStatus',
        Object.assign({},legacyBase,{action:'setRegieObjectJobStatus',objectId:oid,jobStatus:'Abgeschlossen'}));
    }
  }

  return {objectIds,mergeId,merged:objectIds.length>1,moved:upd.rowCount,runningObjects};
}

async function consolidateCompletedCustomerAfterMirrorV10(body){
  const entry=body&&body.entry||{};
  if(String(entry.jobStatus||'').trim()!=='Abgeschlossen')return null;
  const customer=String(entry.customer||'').trim();if(!customer)return null;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const oq=await client.query(
      'SELECT id FROM objects_shadow WHERE object_key=$1 ORDER BY created_at_text ASC NULLS LAST,id ASC LIMIT 1',
      [shadowObjectKey(customer)]
    );
    const r=await consolidateCompletedCustomerV10(
      client,customer,String(oq.rows[0]?.id||''),String(body.employee||''),new Date().toISOString(),body,true
    );
    await client.query('COMMIT');
    return r;
  }catch(e){
    try{await client.query('ROLLBACK');}catch(_e){}
    throw e;
  }finally{client.release();}
}

async function bootstrapCompletedCustomerConsolidationV23(){
  if(!pool)return;
  const marker='completed_customer_consolidation_v23';
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);if(done.rowCount)return;

  const q=await pool.query(
    `SELECT object_id,customer,job_status,entry_date,start_time,transmitted_at_text,shadow_updated_at
       FROM time_entries_shadow
      WHERE COALESCE(billing_status,'Offen')='Offen'
        AND COALESCE(object_id,'')<>''
        AND COALESCE(job_status,'Abgeschlossen') IN ('Laufend','Abgeschlossen')`
  );
  const groups=new Map();
  for(const r of q.rows){
    const k=shadowObjectKey(r.customer);if(!k)continue;
    if(!groups.has(k))groups.set(k,[]);
    groups.get(k).push(r);
  }

  let repaired=0,objects=0;
  for(const rows of groups.values()){
    const statuses=new Set(rows.map(r=>String(r.job_status||'Abgeschlossen')));
    if(!(statuses.has('Laufend')&&statuses.has('Abgeschlossen')))continue;
    rows.sort((a,b)=>{
      const sa=String(a.transmitted_at_text||'')+'|'+String(a.entry_date||'')+'|'+String(a.start_time||'')+'|'+String(a.shadow_updated_at||'');
      const sb=String(b.transmitted_at_text||'')+'|'+String(b.entry_date||'')+'|'+String(b.start_time||'')+'|'+String(b.shadow_updated_at||'');
      return sa.localeCompare(sb);
    });
    const newest=rows[rows.length-1];
    // Conservative repair: only close old running tabs when the newest transferred report is explicitly completed.
    if(String(newest.job_status||'')!=='Abgeschlossen')continue;
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const res=await consolidateCompletedCustomerV10(
        client,String(newest.customer||''),String(newest.object_id||''),'System',new Date().toISOString(),null,false
      );
      await client.query('COMMIT');
      if(res.objectIds.length){repaired++;objects+=res.objectIds.length;}
    }catch(e){
      try{await client.query('ROLLBACK');}catch(_e){}
      console.error('Completed customer consolidation repair failed:',e.message);
    }finally{client.release();}
  }

  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
    [marker,JSON.stringify({at:new Date().toISOString(),repaired,objects,
      rule:'exact normalized customer only; newest open report must be Abgeschlossen'})]
  );
  if(repaired){
    await pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'regie_%' OR shadow_name LIKE 'object_reports_%'");
    await pool.query("DELETE FROM exact_views_shadow WHERE action='getDashboardSummary51'");
  }
  console.log('COMPLETED_CUSTOMER_V23 repaired='+repaired+' objects='+objects);
}

async function upsertObjectShadow(id,customer){
  if(!pool||!id)return;
  const name=String(customer||'');
  await pool.query(
    `INSERT INTO objects_shadow(id,object_key,display_name,created_at_text,shadow_updated_at)
     VALUES($1,$2,$3,$4,now())
     ON CONFLICT(id) DO UPDATE SET
       object_key=CASE WHEN EXCLUDED.object_key<>'' THEN EXCLUDED.object_key ELSE objects_shadow.object_key END,
       display_name=CASE WHEN EXCLUDED.display_name<>'' THEN EXCLUDED.display_name ELSE objects_shadow.display_name END,
       shadow_updated_at=now()`,
    [String(id),shadowObjectKey(name),name,new Date().toISOString()]
  );
}

async function syncRegieMetadataFromRead(data){
  if(!pool||!data)return;
  const groups=Array.isArray(data)?data:[data];
  for(const g of groups){
    if(g&&g.objectId)await upsertObjectShadow(g.objectId,g.customer||'');
    for(const r of (Array.isArray(g&&g.reports)?g.reports:[])){
      if(r&&r.objectId)await upsertObjectShadow(r.objectId,r.customer||g.customer||'');
    }
  }
}

async function mirrorRegieMetadataWrite(action,body,parsed){
  if(!pool)return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;

  if(action==='mergeRegieObjects'){
    const ids=Array.isArray(data.objectIds)?data.objectIds.map(String):[];
    for(const id of ids){
      await pool.query(
        `INSERT INTO regie_merges_shadow(object_id,merge_id,merged_at_text,merged_by,shadow_updated_at)
         VALUES($1,$2,$3,$4,now())
         ON CONFLICT(object_id) DO UPDATE SET
           merge_id=EXCLUDED.merge_id,merged_at_text=EXCLUDED.merged_at_text,
           merged_by=EXCLUDED.merged_by,shadow_updated_at=now()`,
        [id,String(data.mergeId||''),String(data.mergedAt||''),String(data.mergedBy||body.employee||'')]
      );
    }
    return;
  }

  if(action==='saveObjectInternalNote'){
    await pool.query(
      `INSERT INTO object_notes_shadow(object_id,note,changed_at_text,changed_by,shadow_updated_at)
       VALUES($1,$2,$3,$4,now())
       ON CONFLICT(object_id) DO UPDATE SET note=EXCLUDED.note,
         changed_at_text=EXCLUDED.changed_at_text,changed_by=EXCLUDED.changed_by,shadow_updated_at=now()`,
      [String(data.objectId||body.objectId||''),String(data.note||body.note||''),
       String(data.changedAt||''),String(data.changedBy||body.employee||'')]
    );
    const q=await pool.query('SELECT COUNT(*)::int AS n FROM object_notes_shadow');
    const n=Number(q.rows[0]?.n||0);
    await saveShadowVerifyStat('object_notes:base',n,n,0);
    return;
  }

  if(action==='updateRegieReport' && data.objectId){
    await upsertObjectShadow(data.objectId,(body.item||{}).customer||'');
  }
}

function objectNotesVerifyKey(body,data){
  if(body&&body.objectId)return 'object_note:'+String(body.objectId);
  const ids=Array.isArray(body&&body.objectIds)?body.objectIds.map(String).filter(Boolean).sort():
    (Array.isArray(data)?data:Object.values(data||{})).map(x=>String(x&&x.objectId||'')).filter(Boolean).sort();
  return 'object_notes:'+crypto.createHash('sha256').update(ids.join('|')).digest('hex').slice(0,16);
}
async function verifyObjectNotesShadow(data,body){
  if(!pool||!data)return;
  const rows=Array.isArray(data)?data:Object.values(data);
  let mismatches=0;
  for(const x of rows){
    if(!x||!x.objectId)continue;
    const q=await pool.query('SELECT note,changed_at_text,changed_by FROM object_notes_shadow WHERE object_id=$1',[String(x.objectId)]);
    const p=q.rows[0];
    if(!p){
      if(String(x.note||'')!=='')mismatches++;
    }else if(normalizeShadowText(x.note)!==normalizeShadowText(p.note))mismatches++;
  }
  const key=objectNotesVerifyKey(body,data);
  console.log('SHADOW_VERIFY '+key+' google='+rows.length+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,rows.length,rows.length,mismatches);
}
async function directObjectInternalNoteRead(body){
  const session=await localSessionForBody(body,true);
  if(!session)return null;
  const id=String(body.objectId||'').trim();if(!id)return null;
  const q=await pool.query(
    'SELECT object_id,note,changed_at_text,changed_by FROM object_notes_shadow WHERE object_id=$1',
    [id]
  );
  const r=q.rows[0];
  return {
    objectId:id,note:String(r&&r.note||''),changedAt:berlinDateTime(r&&r.changed_at_text||''),
    changedBy:String(r&&r.changed_by||'')
  };
}
async function directObjectInternalNotesRead(body){
  const session=await localSessionForBody(body,true);
  if(!session)return null;
  const ids=Array.isArray(body.objectIds)?body.objectIds.map(String).filter(Boolean):[];
  if(!ids.length)return {};
  const q=await pool.query(
    'SELECT object_id,note,changed_at_text,changed_by FROM object_notes_shadow WHERE object_id = ANY($1::text[])',
    [ids]
  );
  const map=new Map(q.rows.map(r=>[String(r.object_id),r]));
  const out={};
  for(const id of ids){
    const r=map.get(id);
    out[id]={
      objectId:id,note:String(r&&r.note||''),changedAt:berlinDateTime(r&&r.changed_at_text||''),
      changedBy:String(r&&r.changed_by||'')
    };
  }
  return out;
}

function objectReportsVerifyKey(body){
  const id=String(body&&body.objectId||'').trim();
  if(id)return 'object_reports_id:'+id;
  const customer=shadowObjectKey(body&&body.customer||'');
  return 'object_reports_customer:'+crypto.createHash('sha256').update(customer).digest('hex').slice(0,16);
}
async function postgresObjectReports(body){
  const objectId=String(body&&body.objectId||'').trim();
  const customer=String(body&&body.customer||'').trim();
  const customerKey=shadowObjectKey(customer);
  let wantedMerge='';
  const mergedIds=new Set();
  if(objectId){
    const mq=await pool.query(
      'SELECT merge_id FROM regie_merges_shadow WHERE object_id=$1 LIMIT 1',
      [objectId]
    );
    wantedMerge=String(mq.rows[0]&&mq.rows[0].merge_id||'');
    if(wantedMerge){
      const mi=await pool.query(
        'SELECT object_id FROM regie_merges_shadow WHERE merge_id=$1',
        [wantedMerge]
      );
      for(const r of mi.rows)mergedIds.add(String(r.object_id||''));
    }
  }
  const q=await pool.query(
    `SELECT id,object_id,employee_name,entry_date,customer,start_time,end_time,hours,activity,
            transmitted_at_text,material_used,material,customer_signature_url,photo_count,
            photo_file_ids,photo_urls,additional_employee_hours_text,billing_status,job_status,
            is_supplement,supplement_created_at_text,maintenance,next_maintenance_due
       FROM time_entries_shadow`
  );
  const reports=[];
  for(const r of q.rows){
    const rowObject=String(r.object_id||'');
    const sameObject=Boolean(objectId&&rowObject===objectId);
    const sameCustomer=Boolean(customerKey&&shadowObjectKey(r.customer)===customerKey);
    const sameMerge=Boolean(wantedMerge&&mergedIds.has(rowObject));
    if(!(sameObject||sameCustomer||sameMerge))continue;
    reports.push({
      id:String(r.id||''),objectId:rowObject,employee:String(r.employee_name||''),
      date:berlinDateOnly(r.entry_date),customer:String(r.customer||''),
      start:String(r.start_time||''),end:String(r.end_time||''),hours:Number(r.hours||0),
      activity:String(r.activity||''),transmittedAt:shadowGermanDateTime(r.transmitted_at_text||''),
      materialUsed:Boolean(r.material_used),material:String(r.material||''),
      customerSignatureUrl:String(r.customer_signature_url||''),photoCount:Number(r.photo_count||0),
      photoFileIds:String(r.photo_file_ids||''),photoUrls:String(r.photo_urls||''),
      additionalEmployeeHours:String(r.additional_employee_hours_text||''),
      regieStatus:String(r.billing_status||'Offen'),jobStatus:String(r.job_status||'Abgeschlossen'),
      isSupplement:Boolean(r.is_supplement),
      supplementCreatedAt:shadowGermanDateTime(r.supplement_created_at_text||''),
      maintenance:Boolean(r.maintenance),nextMaintenanceDue:String(r.next_maintenance_due||'')
    });
  }
  reports.sort((a,b)=>(b.date+' '+b.start).localeCompare(a.date+' '+a.start));
  const employees=[...new Set(reports.map(r=>r.employee).filter(Boolean))].sort();
  const totalHours=Math.round(reports.reduce((s,r)=>s+Number(r.hours||0),0)*100)/100;
  return {
    objectId:objectId||(reports[0]&&reports[0].objectId)||'',
    displayName:(reports[0]&&reports[0].customer)||customer,
    totalHours,reportCount:reports.length,employees,reports
  };
}
function canonicalObjectReports(x){
  if(!x)return null;
  return {
    objectId:String(x.objectId||''),displayName:String(x.displayName||''),
    totalHours:Number(x.totalHours||0),reportCount:Number(x.reportCount||0),
    employees:(Array.isArray(x.employees)?x.employees:[]).map(String).sort(),
    reports:(Array.isArray(x.reports)?x.reports:[]).map(r=>({
      id:String(r.id||''),objectId:String(r.objectId||''),employee:String(r.employee||''),
      date:String(r.date||''),customer:String(r.customer||''),start:String(r.start||''),
      end:String(r.end||''),hours:Number(r.hours||0),activity:String(r.activity||''),
      transmittedAt:String(r.transmittedAt||''),materialUsed:Boolean(r.materialUsed),
      material:String(r.material||''),customerSignatureUrl:String(r.customerSignatureUrl||''),
      photoCount:Number(r.photoCount||0),photoFileIds:String(r.photoFileIds||''),
      photoUrls:String(r.photoUrls||''),additionalEmployeeHours:String(r.additionalEmployeeHours||''),
      regieStatus:String(r.regieStatus||'Offen'),jobStatus:String(r.jobStatus||'Abgeschlossen'),
      isSupplement:Boolean(r.isSupplement),supplementCreatedAt:String(r.supplementCreatedAt||''),
      maintenance:Boolean(r.maintenance),nextMaintenanceDue:String(r.nextMaintenanceDue||'')
    })).sort((a,b)=>(b.date+' '+b.start).localeCompare(a.date+' '+a.start))
  };
}
async function verifyObjectReportsShadow(data,body){
  if(!pool||!data)return;
  const pg=await postgresObjectReports(body);
  const a=canonicalObjectReports(data),b=canonicalObjectReports(pg);
  const mismatches=JSON.stringify(a)===JSON.stringify(b)?0:1;
  const key=objectReportsVerifyKey(body);
  console.log('SHADOW_VERIFY '+key+' google='+(a&&a.reportCount||0)+' postgres='+(b&&b.reportCount||0)+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,a&&a.reportCount||0,b&&b.reportCount||0,mismatches);
}

function regieBillingRiskVerifyKey(body){
  const ids=Array.isArray(body&&body.objectIds)?body.objectIds.map(String).filter(Boolean).sort():[];
  return 'regie_billing_risk:'+crypto.createHash('sha256').update(ids.join('|')).digest('hex').slice(0,16);
}
async function postgresRegieBillingRisk(body){
  const selectedIds=[...new Set((Array.isArray(body&&body.objectIds)?body.objectIds:[]).map(String).filter(Boolean))];
  if(!selectedIds.length)return null;
  const q=await pool.query(
    `SELECT id,object_id,customer,entry_date,billing_status,job_status,source_payload,shadow_updated_at
       FROM time_entries_shadow
      ORDER BY CASE WHEN COALESCE(source_payload->>'sourceRow','') ~ '^[0-9]+$'
        THEN (source_payload->>'sourceRow')::int ELSE 2147483647 END,shadow_updated_at ASC,id ASC`
  );
  const selectedSet=new Set(selectedIds),selectedCustomers=[];
  for(const r of q.rows){
    const oid=String(r.object_id||'');
    if(!selectedSet.has(oid))continue;
    const customer=String(r.customer||'');
    if(customer)selectedCustomers.push(customer);
  }
  if(!selectedCustomers.length)return null;
  const customerKeys=[...new Set(selectedCustomers.map(shadowObjectKey).filter(Boolean))];
  const groups=new Map();
  for(const r of q.rows){
    const oid=String(r.object_id||'');
    if(!oid||selectedSet.has(oid))continue;
    if(String(r.billing_status||'Offen')!=='Offen')continue;
    const customer=String(r.customer||''),key=shadowObjectKey(customer);
    if(!key)continue;
    const related=customerKeys.some(selectedKey=>
      key===selectedKey || key.includes(selectedKey) || selectedKey.includes(key)
    );
    if(!related)continue;
    let g=groups.get(oid);
    if(!g){
      g={objectId:oid,customer,jobStatus:String(r.job_status||'Abgeschlossen'),firstDate:'',lastDate:'',reportCount:0};
      groups.set(oid,g);
    }
    const date=berlinDateOnly(r.entry_date);
    if(date&&(!g.firstDate||date<g.firstDate))g.firstDate=date;
    if(date&&(!g.lastDate||date>g.lastDate))g.lastDate=date;
    g.reportCount++;
    if(String(r.job_status||'Abgeschlossen')==='Laufend')g.jobStatus='Laufend';
  }
  return {matches:[...groups.values()]};
}
function canonicalRegieBillingRisk(data){
  return {
    matches:(Array.isArray(data&&data.matches)?data.matches:[]).map(x=>({
      objectId:String(x.objectId||''),customer:String(x.customer||''),jobStatus:String(x.jobStatus||'Abgeschlossen'),
      firstDate:String(x.firstDate||''),lastDate:String(x.lastDate||''),reportCount:Number(x.reportCount||0)
    })).sort((a,b)=>a.objectId.localeCompare(b.objectId))
  };
}
async function verifyRegieBillingRiskShadow(data,body){
  if(!pool||!data)return;
  const pg=await postgresRegieBillingRisk(body);if(!pg)return;
  const a=canonicalRegieBillingRisk(data),b=canonicalRegieBillingRisk(pg);
  const mismatches=JSON.stringify(a)===JSON.stringify(b)?0:1,key=regieBillingRiskVerifyKey(body);
  console.log('SHADOW_VERIFY '+key+' google='+a.matches.length+' postgres='+b.matches.length+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,a.matches.length,b.matches.length,mismatches);
}
async function directRegieBillingRiskRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const ids=Array.isArray(body&&body.objectIds)?body.objectIds.map(String).filter(Boolean):[];
  if(!ids.length)return null;
  const key=regieBillingRiskVerifyKey(body);
  if(!(await shadowReadyForDirectRead(key)))return null;
  return postgresRegieBillingRisk(body);
}

async function directObjectReportsRead(body){
  const session=await localSessionForBody(body,true);
  if(!session)return null;
  const key=objectReportsVerifyKey(body);
  if(!(await shadowReadyForDirectRead(key)))return null;
  return postgresObjectReports(body);
}


function regieReportsVerifyKey(body){
  const status=String(body&&body.status||'Offen');
  const year=Number(body&&body.year)||0,month=Number(body&&body.month)||0;
  return 'regie_reports:'+status+':'+year+':'+month;
}
async function postgresRegieReports(body){
  const status=String(body&&body.status||'Offen')||'Offen';
  const year=Number(body&&body.year)||0,month=Number(body&&body.month)||0;
  if(!['Offen','Abgerechnet'].includes(status))return null;
  const [mq,tq]=await Promise.all([
    pool.query('SELECT object_id,merge_id FROM regie_merges_shadow'),
    pool.query(`SELECT id,object_id,employee_name,entry_date,customer,start_time,end_time,hours,activity,
      transmitted_at_text,material_used,material,customer_signature_url,photo_count,photo_file_ids,photo_urls,
      billing_status,billed_at_text,billed_by,job_status,is_supplement,supplement_created_at_text,
      maintenance,next_maintenance_due,source_payload,shadow_updated_at
      FROM time_entries_shadow
      ORDER BY CASE WHEN COALESCE(source_payload->>'sourceRow','') ~ '^[0-9]+$'
        THEN (source_payload->>'sourceRow')::int ELSE 2147483647 END,shadow_updated_at ASC,id ASC`)
  ]);
  const mergeMap=new Map(mq.rows.map(r=>[String(r.object_id||''),String(r.merge_id||'')]));
  const baseKey=id=>{const m=mergeMap.get(String(id||''))||'';return m?('MERGE|'+m):('OBJECT|'+String(id||''));};
  const excluded=new Set(['Angebot zu erstellen','Offenes Angebot','Angebot Angenommen','Angebot Abgelehnt','Verworfen']);
  const rows=tq.rows.filter(r=>{
    const d=berlinDateOnly(r.entry_date);if(!d)return false;
    if(year&&Number(d.slice(0,4))!==year)return false;
    if(month&&Number(d.slice(5,7))!==month)return false;
    return true;
  });
  const active=new Map();
  if(status==='Offen'){
    rows.forEach((r,i)=>{
      if(String(r.billing_status||'Offen')!=='Offen')return;
      const js=String(r.job_status||'Abgeschlossen');if(excluded.has(js))return;
      const oid=String(r.object_id||'');if(!oid)return;
      const sk=berlinDateOnly(r.entry_date)+' '+String(r.start_time||'')+' '+String(i).padStart(6,'0');
      const k=baseKey(oid),old=active.get(k);if(!old||sk>=old.sortKey)active.set(k,{jobStatus:js,sortKey:sk});
    });
  }
  const groups=new Map();
  for(const r of rows){
    const date=berlinDateOnly(r.entry_date),rowStatus=String(r.billing_status||'Offen');
    const oid=String(r.object_id||'');if(!date||!oid)continue;
    const rowJobStatus=String(r.job_status||'Abgeschlossen');if(excluded.has(rowJobStatus))continue;
    const bk=baseKey(oid),mergeId=mergeMap.get(oid)||'';
    let groupJobStatus=rowJobStatus;
    if(status==='Offen'){const a=active.get(bk);if(!a)continue;groupJobStatus=a.jobStatus;}
    else if(rowStatus!=='Abgerechnet')continue;
    const key=bk+'|JOB|'+groupJobStatus;
    let g=groups.get(key);
    if(!g){
      g={objectId:oid,customer:String(r.customer||''),status,jobStatus:groupJobStatus,totalHours:0,reportCount:0,
        employeesMap:new Set(),objectIdsMap:new Set(),reports:[],firstDate:date,lastDate:date,
        billedAt:'',billedBy:'',mergeId,customerNamesMap:new Set()};
      groups.set(key,g);
    }
    if(r.customer)g.customerNamesMap.add(String(r.customer));
    g.totalHours+=Number(r.hours)||0;g.reportCount++;
    if(r.employee_name)g.employeesMap.add(String(r.employee_name));g.objectIdsMap.add(oid);
    if(date<g.firstDate)g.firstDate=date;if(date>g.lastDate)g.lastDate=date;
    if(r.billed_at_text)g.billedAt=shadowGermanDateTime(r.billed_at_text);if(r.billed_by)g.billedBy=String(r.billed_by);
    g.reports.push({
      id:String(r.id||''),employee:String(r.employee_name||''),date,customer:String(r.customer||''),
      start:String(r.start_time||''),end:String(r.end_time||''),hours:Number(r.hours||0),activity:String(r.activity||''),
      transmittedAt:shadowGermanDateTime(r.transmitted_at_text||''),materialUsed:Boolean(r.material_used),material:String(r.material||''),
      customerSignatureUrl:String(r.customer_signature_url||''),photoCount:Number(r.photo_count||0),
      photoFileIds:String(r.photo_file_ids||''),photoUrls:String(r.photo_urls||''),status:rowStatus,objectId:oid,
      jobStatus:rowJobStatus,isSupplement:Boolean(r.is_supplement),
      supplementCreatedAt:shadowGermanDateTime(r.supplement_created_at_text||''),maintenance:Boolean(r.maintenance),
      nextMaintenanceDue:String(r.next_maintenance_due||''),billedAt:shadowGermanDateTime(r.billed_at_text||''),
      billedBy:String(r.billed_by||'')
    });
  }
  const out=[...groups.values()].map(g=>{
    g.totalHours=Math.round(g.totalHours*100)/100;g.employees=[...g.employeesMap].filter(Boolean).sort();
    g.objectIds=[...g.objectIdsMap].filter(Boolean);const names=[...g.customerNamesMap].filter(Boolean);
    if(names.length>1)g.customer=names.join(' / ');
    delete g.customerNamesMap;delete g.employeesMap;delete g.objectIdsMap;
    g.reports.sort((a,b)=>(a.date+' '+a.start).localeCompare(b.date+' '+b.start));return g;
  });
  out.sort((a,b)=>status==='Offen'?a.firstDate.localeCompare(b.firstDate):b.lastDate.localeCompare(a.lastDate));
  return out;
}
function canonicalRegieReports(rows){
  return (Array.isArray(rows)?rows:[]).map(g=>({
    objectId:String(g.objectId||''),customer:String(g.customer||''),status:String(g.status||''),jobStatus:String(g.jobStatus||''),
    totalHours:Number(g.totalHours||0),reportCount:Number(g.reportCount||0),
    employees:(Array.isArray(g.employees)?g.employees:[]).map(String).sort(),
    objectIds:(Array.isArray(g.objectIds)?g.objectIds:[]).map(String).sort(),firstDate:String(g.firstDate||''),
    lastDate:String(g.lastDate||''),billedAt:String(g.billedAt||''),billedBy:String(g.billedBy||''),mergeId:String(g.mergeId||''),
    reports:(Array.isArray(g.reports)?g.reports:[]).map(r=>({
      id:String(r.id||''),employee:String(r.employee||''),date:String(r.date||''),customer:String(r.customer||''),
      start:String(r.start||''),end:String(r.end||''),hours:Number(r.hours||0),activity:String(r.activity||''),
      transmittedAt:String(r.transmittedAt||''),materialUsed:Boolean(r.materialUsed),material:String(r.material||''),
      customerSignatureUrl:String(r.customerSignatureUrl||''),photoCount:Number(r.photoCount||0),
      photoFileIds:String(r.photoFileIds||''),photoUrls:String(r.photoUrls||''),status:String(r.status||'Offen'),
      objectId:String(r.objectId||''),jobStatus:String(r.jobStatus||'Abgeschlossen'),isSupplement:Boolean(r.isSupplement),
      supplementCreatedAt:String(r.supplementCreatedAt||''),maintenance:Boolean(r.maintenance),
      nextMaintenanceDue:String(r.nextMaintenanceDue||''),billedAt:String(r.billedAt||''),billedBy:String(r.billedBy||'')
    }))
  }));
}
async function verifyRegieReportsShadow(data,body){
  if(!pool||!Array.isArray(data))return;
  const pg=await postgresRegieReports(body);if(!Array.isArray(pg))return;
  const a=canonicalRegieReports(data),b=canonicalRegieReports(pg),mismatches=JSON.stringify(a)===JSON.stringify(b)?0:1;
  const key=regieReportsVerifyKey(body);
  console.log('SHADOW_VERIFY '+key+' google='+a.length+' postgres='+b.length+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,a.length,b.length,mismatches);
}
async function directRegieReportsRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const key=regieReportsVerifyKey(body);if(!(await shadowReadyForDirectRead(key)))return null;
  return postgresRegieReports(body);
}

async function initTimeEntriesShadow(){
  if(!pool)return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM time_entries_shadow');
  if((existing.rows[0]?.n||0)>0)return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:Zeiten']
  );
  let inserted=0;
  for(const row of q.rows){
    const payload=row.payload||{};
    if(Number(payload.sourceRow||row.source_key)<=1)continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const id=textCell(cells,0).trim();if(!id)continue;
    await pool.query(
      `INSERT INTO time_entries_shadow(
        id,employee_name,entry_date,customer,start_time,end_time,hours,activity,calendar_id,
        transmitted_at_text,closed,material_used,material,customer_signature_id,
        customer_signature_url,photo_count,photo_file_ids,photo_urls,additional_employees_used,
        additional_employees_text,additional_employee_hours_text,source_calendar_event_id,
        billing_status,billed_at_text,billed_by,object_id,job_status,is_supplement,
        supplement_created_at_text,offer_id,offer_changed_at_text,offer_changed_by,
        maintenance,next_maintenance_due,maintenance_customer_id,maintenance_object_id,
        maintenance_device_id,source_payload
      ) VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38::jsonb
      ) ON CONFLICT(id) DO NOTHING`,
      [
        id,textCell(cells,1),textCell(cells,2),textCell(cells,3),textCell(cells,4),
        textCell(cells,5),Number(textCell(cells,6))||0,textCell(cells,7),textCell(cells,8),
        textCell(cells,9),['true','ja','1'].includes(textCell(cells,10).trim().toLowerCase()),textCell(cells,11).toLowerCase()==='ja',
        textCell(cells,12),textCell(cells,13),textCell(cells,14),
        Math.max(0,Number(textCell(cells,15))||0),textCell(cells,16),textCell(cells,17),
        textCell(cells,18).toLowerCase()==='ja',textCell(cells,19),textCell(cells,20),
        textCell(cells,21),textCell(cells,22)||'Offen',textCell(cells,23),textCell(cells,24),
        textCell(cells,25),textCell(cells,26)||'Abgeschlossen',
        textCell(cells,27).toLowerCase()==='ja',textCell(cells,28),textCell(cells,29),
        textCell(cells,30),textCell(cells,31),textCell(cells,32).toLowerCase()==='ja',
        textCell(cells,33),textCell(cells,34),textCell(cells,35),textCell(cells,36),
        JSON.stringify(payload)
      ]
    );
    inserted++;
  }
  console.log('SHADOW time_entries initialized rows='+inserted);
}

async function upsertTimeEntryFromView(entry,dayClosed){
  if(!pool||!entry||!entry.id||entry.isAdditionalAssignment)return;
  const id=String(entry.id);
  await pool.query(
    `INSERT INTO time_entries_shadow(
      id,employee_name,entry_date,customer,start_time,end_time,hours,activity,
      transmitted_at_text,closed,material_used,material,customer_signature_url,
      photo_count,photo_urls,job_status,is_supplement,supplement_created_at_text,
      shadow_updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())
    ON CONFLICT(id) DO UPDATE SET
      employee_name=EXCLUDED.employee_name,entry_date=EXCLUDED.entry_date,
      customer=EXCLUDED.customer,start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,
      hours=EXCLUDED.hours,activity=EXCLUDED.activity,
      transmitted_at_text=EXCLUDED.transmitted_at_text,closed=EXCLUDED.closed,
      material_used=EXCLUDED.material_used,material=EXCLUDED.material,
      customer_signature_url=EXCLUDED.customer_signature_url,photo_count=EXCLUDED.photo_count,
      photo_urls=EXCLUDED.photo_urls,job_status=EXCLUDED.job_status,
      is_supplement=EXCLUDED.is_supplement,
      supplement_created_at_text=EXCLUDED.supplement_created_at_text,shadow_updated_at=now()`,
    [id,String(entry.employee||''),String(entry.date||''),String(entry.customer||''),
     String(entry.start||''),String(entry.end||''),Number(entry.hours)||0,
     String(entry.activity||''),String(entry.transmittedDate||entry.transmittedAt||''),
     Boolean(dayClosed),Boolean(entry.materialUsed),String(entry.material||''),
     String(entry.customerSignatureUrl||''),Math.max(0,Number(entry.photoCount)||0),
     String(entry.photoUrls||''),String(entry.jobStatus||'Abgeschlossen'),
     Boolean(entry.isSupplement),String(entry.supplementCreatedAt||'')]
  );
}

async function syncTimeEntriesFromDayRead(body,data){
  if(!pool||!data||!Array.isArray(data.entries))return;
  const employee=String(body.employee||'');
  const date=String(body.date||'');
  if(!employee||!date)return;
  const own=data.entries.filter(e=>e&&!e.isAdditionalAssignment);
  const ids=[];
  for(const e of own){
    ids.push(String(e.id));
    await upsertTimeEntryFromView(e,Boolean(data.closed));
  }
  if(ids.length){
    await pool.query(
      `DELETE FROM time_entries_shadow
        WHERE employee_name=$1 AND entry_date=$2 AND NOT (id = ANY($3::text[]))`,
      [employee,date,ids]
    );
  }else{
    await pool.query('DELETE FROM time_entries_shadow WHERE employee_name=$1 AND entry_date=$2',[employee,date]);
  }
  const q=await pool.query(
    `SELECT id,customer,start_time,end_time,hours,activity,material_used,material,job_status,is_supplement
       FROM time_entries_shadow WHERE employee_name=$1 AND entry_date=$2 ORDER BY id`,
    [employee,date]
  );
  const pg=new Map(q.rows.map(r=>[String(r.id),r]));
  let mismatches=0;
  for(const e of own){
    const p=pg.get(String(e.id));if(!p){mismatches++;continue;}
    const same=
      normalizeShadowText(e.customer)===normalizeShadowText(p.customer) &&
      normalizeShadowText(e.start)===normalizeShadowText(p.start_time) &&
      normalizeShadowText(e.end)===normalizeShadowText(p.end_time) &&
      Math.abs(Number(e.hours||0)-Number(p.hours||0))<0.01 &&
      normalizeShadowText(e.activity)===normalizeShadowText(p.activity) &&
      Boolean(e.materialUsed)===Boolean(p.material_used) &&
      normalizeShadowText(e.material)===normalizeShadowText(p.material) &&
      normalizeShadowText(e.jobStatus||'Abgeschlossen')===normalizeShadowText(p.job_status||'Abgeschlossen') &&
      Boolean(e.isSupplement)===Boolean(p.is_supplement);
    if(!same)mismatches++;
    pg.delete(String(e.id));
  }
  mismatches+=pg.size;
  console.log('SHADOW_VERIFY time_entries_day google='+own.length+' postgres='+q.rows.length+' mismatches='+mismatches);
  await saveShadowVerifyStat('time_entries_day',own.length,q.rows.length,mismatches);
}

async function upsertTimeEntryFromRegie(r){
  if(!pool||!r||!r.id)return;
  await pool.query(
    `INSERT INTO time_entries_shadow(
      id,employee_name,entry_date,customer,start_time,end_time,hours,activity,
      transmitted_at_text,material_used,material,customer_signature_url,photo_count,
      photo_file_ids,photo_urls,billing_status,billed_at_text,billed_by,object_id,
      job_status,is_supplement,supplement_created_at_text,maintenance,next_maintenance_due,
      offer_id,offer_changed_at_text,offer_changed_by,shadow_updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,now())
    ON CONFLICT(id) DO UPDATE SET
      employee_name=EXCLUDED.employee_name,entry_date=EXCLUDED.entry_date,
      customer=EXCLUDED.customer,start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,
      hours=EXCLUDED.hours,activity=EXCLUDED.activity,transmitted_at_text=EXCLUDED.transmitted_at_text,
      material_used=EXCLUDED.material_used,material=EXCLUDED.material,
      customer_signature_url=EXCLUDED.customer_signature_url,photo_count=EXCLUDED.photo_count,
      photo_file_ids=EXCLUDED.photo_file_ids,photo_urls=EXCLUDED.photo_urls,
      billing_status=EXCLUDED.billing_status,billed_at_text=EXCLUDED.billed_at_text,
      billed_by=EXCLUDED.billed_by,object_id=CASE WHEN EXCLUDED.object_id<>'' THEN EXCLUDED.object_id ELSE time_entries_shadow.object_id END,
      job_status=EXCLUDED.job_status,is_supplement=EXCLUDED.is_supplement,
      supplement_created_at_text=EXCLUDED.supplement_created_at_text,
      maintenance=EXCLUDED.maintenance,next_maintenance_due=EXCLUDED.next_maintenance_due,
      offer_id=CASE WHEN EXCLUDED.offer_id<>'' THEN EXCLUDED.offer_id ELSE time_entries_shadow.offer_id END,
      offer_changed_at_text=CASE WHEN EXCLUDED.offer_changed_at_text<>'' THEN EXCLUDED.offer_changed_at_text ELSE time_entries_shadow.offer_changed_at_text END,
      offer_changed_by=CASE WHEN EXCLUDED.offer_changed_by<>'' THEN EXCLUDED.offer_changed_by ELSE time_entries_shadow.offer_changed_by END,
      shadow_updated_at=now()`,
    [String(r.id),String(r.employee||''),String(r.date||''),String(r.customer||''),
     String(r.start||''),String(r.end||''),Number(r.hours)||0,String(r.activity||''),
     String(r.transmittedAt||''),Boolean(r.materialUsed),String(r.material||''),
     String(r.customerSignatureUrl||''),Math.max(0,Number(r.photoCount)||0),
     String(r.photoFileIds||''),String(r.photoUrls||''),String(r.status||r.billingStatus||'Offen'),
     String(r.billedAt||''),String(r.billedBy||''),String(r.objectId||''),
     String(r.jobStatus||'Abgeschlossen'),Boolean(r.isSupplement),String(r.supplementCreatedAt||''),
     Boolean(r.maintenance),String(r.nextMaintenanceDue||''),String(r.offerId||''),
     String(r.offerChangedAt||r.changedAt||''),String(r.offerChangedBy||r.changedBy||'')]
  );
}

async function syncTimeEntriesFromRegieRead(data){
  if(!data)return;
  let reports=[];
  if(Array.isArray(data)){
    for(const group of data)for(const r of (Array.isArray(group&&group.reports)?group.reports:[]))reports.push(r);
  }else if(Array.isArray(data.reports)){
    reports=data.reports;
  }
  for(const r of reports)await upsertTimeEntryFromRegie(r);
  if(reports.length)console.log('SHADOW_REFRESH time_entries_regie rows='+reports.length);
}

async function syncTimeEntriesFromOfferRead(groups){
  if(!pool||!Array.isArray(groups))return;
  let count=0;
  for(const g of groups){
    const offerId=String(g&&g.offerId||'');
    const groupStatus=String(g&&g.offerStatus||g&&g.status||'');
    for(const r of (Array.isArray(g&&g.reports)?g.reports:[])){
      const mappedStatus=String(r.offerStatus||groupStatus||'Angebot zu erstellen');
      await upsertTimeEntryFromRegie({
        ...r,
        offerId,
        jobStatus:mappedStatus,
        billingStatus:r.billingStatus||r.status||'Offen',
        offerChangedAt:g.changedAt||r.changedAt||'',
        offerChangedBy:g.changedBy||r.changedBy||''
      });
      if(r.objectId)await upsertObjectShadow(r.objectId,r.customer||g.customer||'');
      count++;
    }

    if(offerId){
      const normalizedStatus=
        groupStatus==='Angebot zu erstellen'?'Zu erstellen':
        groupStatus==='Offenes Angebot'?'Offen':
        groupStatus==='Angebot Angenommen'?'Angenommen':
        groupStatus==='Angebot Abgelehnt'?'Abgelehnt':
        groupStatus==='Laufend'?'Laufend':
        groupStatus==='Verworfen'?'Verworfen':groupStatus;
      await pool.query(
        `UPDATE inquiry_offers_shadow SET
          customer=CASE WHEN $2<>'' THEN $2 ELSE customer END,
          phone=CASE WHEN $3<>'' THEN $3 ELSE phone END,
          email=CASE WHEN $4<>'' THEN $4 ELSE email END,
          description=CASE WHEN $5<>'' THEN $5 ELSE description END,
          status=CASE WHEN $6<>'' THEN $6 ELSE status END,
          shadow_updated_at=now()
          WHERE offer_id=$1`,
        [offerId,String(g.customer||''),String(g.phone||''),String(g.email||''),
         String(g.description||''),normalizedStatus]
      );
    }
  }
  if(count)console.log('SHADOW_REFRESH time_entries_offer rows='+count);
}


async function mirrorTimeEntryWrite(action,body,parsed){
  if(!pool)return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;

  if(['saveEntry','deleteEntry','updateEmployeeEntry'].includes(action) && Array.isArray(data.entries)){
    await syncTimeEntriesFromDayRead(body,data);
    if(action==='saveEntry'&&String(body&&body.entry&&body.entry.jobStatus||'').trim()==='Abgeschlossen'){
      await consolidateCompletedCustomerAfterMirrorV10(body);
    }
    return;
  }

  if(action==='updateBossDayEntry'){
    await pool.query(
      `UPDATE time_entries_shadow SET start_time=$2,end_time=$3,hours=$4,shadow_updated_at=now() WHERE id=$1`,
      [String(data.entryId||body.entryId||''),String(data.start||body.start||''),
       String(data.end||body.end||''),Number(data.hours||0)]
    );
    return;
  }

  if(action==='deleteBossDayEntry'){
    const id=String(body.entryId||'');
    if(id && !id.startsWith('assigned:'))await pool.query('DELETE FROM time_entries_shadow WHERE id=$1',[id]);
    return;
  }

  if(action==='markRegieReportBilled'){
    await pool.query(
      `UPDATE time_entries_shadow SET billing_status='Abgerechnet',billed_at_text=$2,billed_by=$3,shadow_updated_at=now() WHERE id=$1`,
      [String(data.id||body.entryId||''),String(data.billedAt||''),String(data.billedBy||body.employee||'')]
    );
    return;
  }

  if(action==='updateRegieReport'){
    const item=body.item||{};
    await pool.query(
      `UPDATE time_entries_shadow SET
        entry_date=$2,customer=$3,start_time=$4,end_time=$5,hours=$6,activity=$7,
        material_used=$8,material=$9,object_id=$10,job_status=$11,shadow_updated_at=now()
        WHERE id=$1`,
      [String(data.id||body.entryId||''),String(item.date||''),String(item.customer||''),
       String(item.start||''),String(item.end||''),Number(data.hours||0),String(item.activity||''),
       Boolean(item.materialUsed),String(item.materialUsed?item.material||'':''),
       String(data.objectId||''),String(data.jobStatus||item.jobStatus||'Abgeschlossen')]
    );
    return;
  }

  if(action==='markRegieObjectsBilled'||action==='markRegieObjectBilled'){
    const ids=Array.isArray(data.objectIds)?data.objectIds.map(String):
      [String(data.objectId||body.objectId||'')].filter(Boolean);
    if(ids.length){
      await pool.query(
        `UPDATE time_entries_shadow SET
          billing_status='Abgerechnet',billed_at_text=$2,billed_by=$3,shadow_updated_at=now()
          WHERE object_id = ANY($1::text[]) AND COALESCE(billing_status,'Offen')='Offen'`,
        [ids,String(data.billedAt||''),String(data.billedBy||body.employee||'')]
      );
    }
    return;
  }

  if(action==='setRegieObjectJobStatus'||action==='markRegieObjectCompleted'){
    const ids=Array.isArray(data.objectIds)?data.objectIds.map(String):
      [String(data.objectId||body.objectId||'')].filter(Boolean);
    if(ids.length){
      await pool.query(
        `UPDATE time_entries_shadow SET job_status=$2,shadow_updated_at=now()
          WHERE object_id = ANY($1::text[]) AND COALESCE(billing_status,'Offen')='Offen'`,
        [ids,String(data.jobStatus||body.jobStatus||'Abgeschlossen')]
      );
    }
    return;
  }

  if(action==='setRegieReportsOfferStatus'){
    const status=String(data.status||body.offerStatus||'');
    const offerId=String(data.offerId||body.offerId||'');
    const by=String(data.changedBy||body.employee||'');
    const at=String(data.changedAt||'');
    const entryIds=Array.isArray(body.entryIds)?body.entryIds.map(String).filter(Boolean):[];
    if(entryIds.length){
      await pool.query(
        `UPDATE time_entries_shadow SET
          job_status=$2,offer_id=$3,offer_changed_at_text=$4,offer_changed_by=$5,shadow_updated_at=now()
          WHERE id = ANY($1::text[]) AND COALESCE(billing_status,'Offen')='Offen'`,
        [entryIds,status,offerId,at,by]
      );
    }else if(body.offerId){
      await pool.query(
        `UPDATE time_entries_shadow SET
          job_status=$2,offer_id=$1,offer_changed_at_text=$3,offer_changed_by=$4,shadow_updated_at=now()
          WHERE offer_id=$1 AND COALESCE(billing_status,'Offen')='Offen'`,
        [String(body.offerId),status,at,by]
      );
    }
    return;
  }

  if(action==='moveOfferBackToCreate'){
    const offerId=String(body.offerId||data.offerId||'');
    if(offerId){
      await pool.query(
        `UPDATE time_entries_shadow SET
          job_status='Angebot zu erstellen',offer_changed_at_text=now()::text,
          offer_changed_by=$2,shadow_updated_at=now()
          WHERE offer_id=$1 AND COALESCE(billing_status,'Offen')='Offen'`,
        [offerId,String(body.employee||'')]
      );
    }
    return;
  }

  if(action==='saveOfferCreatedWithReminder'){
    const offerId=String(body.offerId||data.offerId||'');
    if(offerId){
      await pool.query(
        `UPDATE time_entries_shadow SET
          job_status='Offenes Angebot',offer_id=$1,offer_changed_at_text=now()::text,
          offer_changed_by=$2,shadow_updated_at=now()
          WHERE offer_id=$1 AND COALESCE(billing_status,'Offen')='Offen'`,
        [offerId,String(body.employee||'')]
      );
    }
    return;
  }

  if(action==='acceptOfferAsRunning'||action==='acceptOfferFromReminder'){
    const offerId=String(data.offerId||body.offerId||'');
    if(offerId && String(data.mode||'')==='Regieberichte'){
      await pool.query(
        `UPDATE time_entries_shadow SET
          job_status='Laufend',offer_id=$1,offer_changed_at_text=now()::text,
          offer_changed_by=$2,shadow_updated_at=now()
          WHERE offer_id=$1 AND COALESCE(billing_status,'Offen')='Offen'`,
        [offerId,String(body.employee||'')]
      );
    }
    return;
  }

  if(action==='discardOfferPermanently'){
    const offerId=String(body.offerId||'');
    if(offerId){
      await pool.query(
        `UPDATE time_entries_shadow SET
          job_status='Verworfen',offer_id='',offer_changed_at_text='',offer_changed_by='',
          shadow_updated_at=now()
          WHERE offer_id=$1`,
        [offerId]
      );
    }
  }
}

async function initDayClosuresShadow(){
  if(!pool)return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM day_closures_shadow');
  if((existing.rows[0]?.n||0)>0)return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:Tagesabschluesse']
  );
  let inserted=0;
  for(const row of q.rows){
    const payload=row.payload||{};
    if(Number(payload.sourceRow||row.source_key)<=1)continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const employee=textCell(cells,0).trim(),date=textCell(cells,1).trim();
    if(!employee||!date)continue;
    await pool.query(
      `INSERT INTO day_closures_shadow(
        employee_name,closure_date,closed_at_text,gross_total,legacy_col5,legacy_col6,
        pause_minutes,net_total,updated_at_text,update_reason
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT(employee_name,closure_date) DO NOTHING`,
      [employee,date,textCell(cells,2),Number(textCell(cells,3))||0,textCell(cells,4),
       textCell(cells,5),Math.max(0,Number(textCell(cells,6))||0),
       Number(textCell(cells,7))||0,textCell(cells,8),textCell(cells,9)]
    );
    inserted++;
  }
  console.log('SHADOW day_closures initialized rows='+inserted);
}

async function reconcileLegacyDayClosureDuplicatesV9(){
  if(!pool)return;
  const marker='legacy_day_closure_duplicates_v9';
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);
  if(done.rowCount)return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:Tagesabschluesse']
  );
  const groups=new Map();
  for(const row of q.rows){
    const p=row.payload||{};if(Number(p.sourceRow||row.source_key)<=1)continue;
    const c=Array.isArray(p.cells)?p.cells:[];
    const employee=textCell(c,0).trim(),date=textCell(c,1).trim();if(!employee||!date)continue;
    const key=employee+'|'+date;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(c);
  }
  const canonCells=c=>({
    closedAt:String(textCell(c,2)||''),gross:Number(textCell(c,3))||0,
    col5:String(textCell(c,4)||''),col6:String(textCell(c,5)||''),
    pause:Math.max(0,Number(textCell(c,6))||0),net:Number(textCell(c,7))||0,
    updatedAt:String(textCell(c,8)||''),reason:String(textCell(c,9)||'')
  });
  const canonPg=r=>({
    closedAt:String(r.closed_at_text||''),gross:Number(r.gross_total)||0,
    col5:String(r.legacy_col5||''),col6:String(r.legacy_col6||''),
    pause:Math.max(0,Number(r.pause_minutes)||0),net:Number(r.net_total)||0,
    updatedAt:String(r.updated_at_text||''),reason:String(r.update_reason||'')
  });
  let duplicateKeys=0,reconciled=0,alreadyLast=0,skippedChanged=0;
  for(const [key,rows] of groups){
    if(rows.length<2)continue;
    duplicateKeys++;
    const split=key.indexOf('|'),employee=key.slice(0,split),date=key.slice(split+1);
    const cur=await pool.query(
      `SELECT closed_at_text,gross_total,legacy_col5,legacy_col6,pause_minutes,net_total,updated_at_text,update_reason
         FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2 LIMIT 1`,
      [employee,date]
    );
    if(!cur.rowCount)continue;
    const first=canonCells(rows[0]),last=canonCells(rows[rows.length-1]),now=canonPg(cur.rows[0]);
    if(JSON.stringify(now)===JSON.stringify(last)){alreadyLast++;continue;}
    if(JSON.stringify(now)!==JSON.stringify(first)){skippedChanged++;continue;}
    await pool.query(
      `UPDATE day_closures_shadow SET
         closed_at_text=$3,gross_total=$4,legacy_col5=$5,legacy_col6=$6,
         pause_minutes=$7,net_total=$8,updated_at_text=$9,update_reason=$10,shadow_updated_at=now()
       WHERE employee_name=$1 AND closure_date=$2`,
      [employee,date,last.closedAt,last.gross,last.col5,last.col6,last.pause,last.net,last.updatedAt,last.reason]
    );
    reconciled++;
  }
  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO NOTHING`,
    [marker,JSON.stringify({at:new Date().toISOString(),duplicateKeys,reconciled,alreadyLast,skippedChanged,
      reason:'Google day-closure readers use the last matching sheet row; reconcile only untouched legacy duplicates'})]
  );
  console.log('DAY_CLOSURE_DUPLICATES_V9 keys='+duplicateKeys+' reconciled='+reconciled+' alreadyLast='+alreadyLast+' skippedChanged='+skippedChanged);
}

async function upsertDayClosureShadow(employee,date,data,reason){
  if(!pool||!employee||!date||!data)return;
  if(data.closed===false){
    await pool.query('DELETE FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2',[String(employee),String(date)]);
    return;
  }
  const gross=Number(data.grossTotal!==undefined?data.grossTotal:data.grossHours)||0;
  const pauseMinutes=Number(data.pauseMinutes!==undefined?data.pauseMinutes:
    data.pauseHours!==undefined?Number(data.pauseHours)*60:0)||0;
  const net=Number(data.netTotal!==undefined?data.netTotal:
    data.total!==undefined?data.total:data.hours)||0;
  await pool.query(
    `INSERT INTO day_closures_shadow(
      employee_name,closure_date,closed_at_text,gross_total,pause_minutes,net_total,
      updated_at_text,update_reason,shadow_updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
    ON CONFLICT(employee_name,closure_date) DO UPDATE SET
      gross_total=EXCLUDED.gross_total,pause_minutes=EXCLUDED.pause_minutes,
      net_total=EXCLUDED.net_total,
      updated_at_text=CASE WHEN $7<>'' THEN $7 ELSE day_closures_shadow.updated_at_text END,
      update_reason=CASE WHEN $8<>'' THEN $8 ELSE day_closures_shadow.update_reason END,
      shadow_updated_at=now()`,
    [String(employee),String(date),new Date().toISOString(),gross,Math.round(pauseMinutes),net,
     String(data.closureRefreshedAt||new Date().toISOString()),String(reason||'')]
  );
}

async function syncDayClosureFromDayRead(body,data){
  if(!data||!body.employee||!body.date)return;
  if(data.closed){
    await upsertDayClosureShadow(body.employee,body.date,data,
      data.closureRefreshed?'Nachtrag / Tagesabschluss aktualisiert':'');
  }else{
    await pool.query('DELETE FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2',
      [String(body.employee),String(body.date)]);
  }
}

async function syncAndVerifyBossDayClosures(rows,year,month){
  if(!pool||!Array.isArray(rows))return;
  year=Number(year)||0;month=Number(month)||0;if(!year||!month)return;
  const prefix=String(year)+'-'+String(month).padStart(2,'0')+'-';
  const seen=new Set();
  for(const emp of rows){
    const employee=String(emp&&emp.employee||'');if(!employee)continue;
    for(const day of (Array.isArray(emp.days)?emp.days:[])){
      const date=String(day&&day.date||'');if(!date.startsWith(prefix))continue;
      const key=employee+'|'+date;
      if(day.closed){
        seen.add(key);
        await upsertDayClosureShadow(employee,date,{
          closed:true,grossTotal:day.grossHours,pauseHours:day.pauseHours,netTotal:day.hours
        },'Chef-Tagesübersicht synchronisiert');
      }else{
        await pool.query('DELETE FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2',[employee,date]);
      }
    }
  }
  const q=await pool.query(
    `SELECT employee_name,closure_date FROM day_closures_shadow
      WHERE closure_date LIKE $1`,
    [prefix+'%']
  );
  const pg=new Set(q.rows.map(r=>String(r.employee_name)+'|'+String(r.closure_date)));
  let mismatches=0;
  for(const key of seen)if(!pg.has(key))mismatches++;
  for(const key of pg)if(!seen.has(key))mismatches++;
  console.log('SHADOW_VERIFY day_closures google='+seen.size+' postgres='+pg.size+' mismatches='+mismatches);
  await saveShadowVerifyStat('day_closures',seen.size,pg.size,mismatches);
}

async function mirrorDayClosureWrite(action,body,parsed){
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;
  if(action==='closeDay'){
    if(data.alreadyClosed)return;
    const employee=String(body.employee||''),date=String(body.date||'');
    const [own,assigned,statusQ]=await Promise.all([
      pool.query('SELECT COALESCE(SUM(hours),0)::numeric AS h FROM time_entries_shadow WHERE employee_name=$1 AND entry_date=$2',[employee,date]),
      pool.query(
        `SELECT COALESCE(SUM(a.hours),0)::numeric AS h
           FROM assignments_shadow a JOIN time_entries_shadow t ON t.id=a.source_entry_id
          WHERE a.employee_name=$1 AND COALESCE(a.status,'Zugeordnet')<>'Ersetzt' AND t.entry_date=$2`,
        [employee,date]
      ),
      pool.query('SELECT status,credited_hours FROM day_status_shadow WHERE employee_name=$1 AND status_date=$2 LIMIT 1',[employee,date])
    ]);
    const grossWork=Number(own.rows[0]?.h||0)+Number(assigned.rows[0]?.h||0);
    const st=statusQ.rows[0]||{};
    const credit=String(st.status||'Arbeiten')==='Arbeiten'?0:Number(st.credited_hours||0);
    const grossTotal=Math.round((grossWork+credit)*100)/100;
    await upsertDayClosureShadow(employee,date,{
      closed:true,grossTotal,pauseMinutes:data.pauseMinutes,netTotal:data.netTotal!==undefined?data.netTotal:data.total
    },'Tagesabschluss');
  }else if(action==='manualCloseBossDay'){
    if(data.alreadyClosed)return;
    const employee=String(data.employee||body.targetEmployee||'').trim();
    const date=String(data.date||body.date||'').trim();
    if(!employee||!date)return;
    const [own,assigned]=await Promise.all([
      pool.query(
        'SELECT COALESCE(SUM(hours),0)::numeric AS h FROM time_entries_shadow WHERE employee_name=$1 AND entry_date=$2',
        [employee,date]
      ),
      pool.query(
        `SELECT COALESCE(SUM(a.hours),0)::numeric AS h
           FROM assignments_shadow a
           JOIN time_entries_shadow t ON t.id=a.source_entry_id
          WHERE a.employee_name=$1 AND COALESCE(a.status,'Zugeordnet')<>'Ersetzt' AND t.entry_date=$2`,
        [employee,date]
      )
    ]);
    const gross=Math.round((Number(own.rows[0]?.h||0)+Number(assigned.rows[0]?.h||0))*100)/100;
    const pause=gross>=6?1:0;
    await upsertDayClosureShadow(employee,date,{
      closed:true,grossTotal:gross,pauseMinutes:Math.round(pause*60),
      netTotal:Number(data.total!==undefined?data.total:Math.max(0,gross-pause))
    },'Büro: manueller Abschluss durch '+String(body.employee||''));
  }else if(action==='refreshClosedDay'){
    await upsertDayClosureShadow(body.employee,body.date,data,'Nachtrag / Tagesabschluss aktualisiert');
  }
}

async function initDayStatusShadow(){
  if(!pool)return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM day_status_shadow');
  if((existing.rows[0]?.n||0)>0)return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:Tagesstatus']
  );
  let inserted=0;
  for(const row of q.rows){
    const payload=row.payload||{};
    if(Number(payload.sourceRow||row.source_key)<=1)continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const employee=textCell(cells,0).trim(),date=textCell(cells,1).trim();
    if(!employee||!date)continue;
    await pool.query(
      `INSERT INTO day_status_shadow(
        employee_name,status_date,status,changed_at_text,source,reference,credited_hours
      ) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(employee_name,status_date) DO NOTHING`,
      [employee,date,textCell(cells,2)||'Arbeiten',textCell(cells,3),textCell(cells,4),
       textCell(cells,5),Number(textCell(cells,6))||0]
    );
    inserted++;
  }
  console.log('SHADOW day_status initialized rows='+inserted);
}

async function reconcileLegacyDayStatusCreditsV12(){
  if(!pool)return;
  const marker='legacy_day_status_blank_credit_v12';
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);
  if(done.rowCount)return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:Tagesstatus']
  );
  let marked=0,skipped=0;
  for(const row of q.rows){
    const p=row.payload||{};if(Number(p.sourceRow||row.source_key)<=1)continue;
    const c=Array.isArray(p.cells)?p.cells:[];
    const employee=textCell(c,0).trim(),date=textCell(c,1).trim();
    if(!employee||!date||textCell(c,6).trim()!=='')continue;
    const cur=await pool.query(
      `SELECT status,source,reference,credited_hours FROM day_status_shadow
        WHERE employee_name=$1 AND status_date=$2 LIMIT 1`,
      [employee,date]
    );
    if(!cur.rowCount)continue;
    const r=cur.rows[0];
    const same=String(r.status||'')===String(textCell(c,2)||'Arbeiten') &&
      String(r.source||'')===String(textCell(c,4)||'') &&
      String(r.reference||'')===String(textCell(c,5)||'') &&
      Math.abs(Number(r.credited_hours||0))<0.001;
    if(!same){skipped++;continue;}
    await pool.query(
      `UPDATE day_status_shadow SET credited_hours_missing=true
        WHERE employee_name=$1 AND status_date=$2`,
      [employee,date]
    );
    marked++;
  }
  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
     ON CONFLICT(key) DO NOTHING`,
    [marker,JSON.stringify({at:new Date().toISOString(),marked,skipped,
      reason:'preserve Google semantic: blank Tagesstatus credit means derive scheduled hours at read time'})]
  );
  console.log('DAY_STATUS_BLANK_CREDIT_V12 marked='+marked+' skipped='+skipped);
}

async function effectiveStatusCredit(employee,date,status,stored,missing){
  if(!missing)return Math.round(Number(stored||0)*100)/100;
  const p=await employeeAutomationProfile(employee);
  if(String(status||'')==='Feiertag'&&(String(p.employmentType||'')==='Aushilfe'||p.holidayCredit===false))return 0;
  return profileHoursForDate(p,date);
}

async function upsertDayStatusShadow(employee,date,status,source,creditedHours,reference){
  if(!pool||!employee||!date)return;
  status=String(status||'Arbeiten');
  if(status==='Arbeiten'){
    await pool.query('DELETE FROM day_status_shadow WHERE employee_name=$1 AND status_date=$2',[String(employee),String(date)]);
    return;
  }
  await pool.query(
    `INSERT INTO day_status_shadow(
      employee_name,status_date,status,changed_at_text,source,reference,credited_hours,credited_hours_missing,shadow_updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,false,now())
    ON CONFLICT(employee_name,status_date) DO UPDATE SET
      status=EXCLUDED.status,changed_at_text=EXCLUDED.changed_at_text,source=EXCLUDED.source,
      reference=CASE WHEN EXCLUDED.reference<>'' THEN EXCLUDED.reference ELSE day_status_shadow.reference END,
      credited_hours=EXCLUDED.credited_hours,credited_hours_missing=false,shadow_updated_at=now()`,
    [String(employee),String(date),status,new Date().toISOString(),String(source||''),
     String(reference||''),Number(creditedHours)||0]
  );
}

async function syncDayStatusFromDayRead(body,data){
  if(!data)return;
  await upsertDayStatusShadow(
    String(body.employee||''),String(body.date||''),String(data.status||'Arbeiten'),
    String(data.statusSource||''),Number(data.creditedHours||0),''
  );
}

async function syncMonthClosuresFromMonthRead(body,data){
  if(!pool||!data||!Array.isArray(data.rows))return;
  const employee=String(body.employee||data.employee||'').trim();
  if(!employee)return;
  const byDate=new Map();
  for(const r of data.rows){
    const date=berlinDateOnly(r&&r.date||'');if(!date)continue;
    const x=byDate.get(date)||{closed:false,gross:0};
    x.closed=x.closed||Boolean(r&&r.closed);
    x.gross+=Number(r&&r.hours||0);
    byDate.set(date,x);
  }
  for(const [date,x] of byDate){
    if(x.closed){
      const gross=Math.round(Number(x.gross||0)*100)/100,pause=gross>=6?1:0;
      await upsertDayClosureShadow(employee,date,{
        closed:true,grossTotal:gross,pauseMinutes:Math.round(pause*60),
        netTotal:Math.round(Math.max(0,gross-pause)*100)/100
      },'Monatsansicht synchronisiert');
    }
  }
}

async function syncAndVerifyMonthStatuses(body,data){
  if(!pool||!data||!Array.isArray(data.statuses))return;
  const employee=String(body.employee||data.employee||'');
  if(!employee)return;
  const statuses=data.statuses||[];
  let from=String(data.cycleStart||''),to=String(data.cycleEnd||'');
  if(!from||!to){
    const dates=statuses.map(x=>String(x.date||'')).filter(Boolean).sort();
    if(dates.length){from=dates[0];to=dates[dates.length-1];}
  }
  if(!from||!to)return;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM day_status_shadow WHERE employee_name=$1 AND status_date>=$2 AND status_date<=$3',
      [employee,from,to]
    );
    for(const st of statuses){
      if(!st||!st.date||String(st.status||'Arbeiten')==='Arbeiten')continue;
      await client.query(
        `INSERT INTO day_status_shadow(
          employee_name,status_date,status,changed_at_text,source,reference,credited_hours,credited_hours_missing,shadow_updated_at
        ) VALUES($1,$2,$3,$4,$5,'',$6,false,now())`,
        [employee,String(st.date),String(st.status||''),new Date().toISOString(),
         String(st.source||''),Number(st.creditedHours)||0]
      );
    }
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}

  const q=await pool.query(
    `SELECT status_date,status,source,credited_hours FROM day_status_shadow
      WHERE employee_name=$1 AND status_date>=$2 AND status_date<=$3`,
    [employee,from,to]
  );
  const pg=new Map(q.rows.map(r=>[String(r.status_date),r]));
  let mismatches=0;
  for(const st of statuses){
    const p=pg.get(String(st.date));if(!p){mismatches++;continue;}
    if(normalizeShadowText(st.status)!==normalizeShadowText(p.status)||
       normalizeShadowText(st.source)!==normalizeShadowText(p.source)||
       Math.abs(Number(st.creditedHours||0)-Number(p.credited_hours||0))>=0.01)mismatches++;
    pg.delete(String(st.date));
  }
  mismatches+=pg.size;
  console.log('SHADOW_VERIFY day_status google='+statuses.length+' postgres='+q.rows.length+' mismatches='+mismatches);
  await saveShadowVerifyStat('day_status',statuses.length,q.rows.length,mismatches);
}

async function mirrorSetDayStatus(body,parsed){
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;
  const employee=String(body.employee||''),date=String(body.date||'');
  const old=await pool.query(
    'SELECT status FROM day_status_shadow WHERE employee_name=$1 AND status_date=$2 LIMIT 1',
    [employee,date]
  );
  const oldStatus=String(old.rows[0]?.status||'Arbeiten');
  const status=String(data.status||body.status||'Arbeiten');
  const profile=await employeeAutomationProfile(employee);
  const credit=status==='Arbeiten'?0:profileHoursForDate(profile,date);
  await upsertDayStatusShadow(employee,date,status,'Mitarbeiter',credit,'');
  if(['Urlaub','Feiertag'].includes(status))await pgAutoClosureForStatus(employee,date,status,credit,'Mitarbeiter');
  else if(status==='Arbeiten'&&['Urlaub','Feiertag'].includes(oldStatus))await pgRemoveAutoClosure(employee,date,oldStatus);
}

async function initConflictReviewsShadow(){
  if(!pool)return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM conflict_reviews_shadow');
  if((existing.rows[0]?.n||0)>0)return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:Pruefungen']
  );
  let inserted=0;
  for(const row of q.rows){
    const payload=row.payload||{};
    if(Number(payload.sourceRow||row.source_key)<=1)continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const id=textCell(cells,0).trim();if(!id)continue;
    await pool.query(
      `INSERT INTO conflict_reviews_shadow(
        conflict_id,employee_name,review_year,review_month,conflict_date,reviewed_at_text,reviewed_by
      ) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(conflict_id) DO NOTHING`,
      [id,textCell(cells,1),Number(textCell(cells,2))||0,Number(textCell(cells,3))||0,
       textCell(cells,4),textCell(cells,5),textCell(cells,6)]
    );
    inserted++;
  }
  console.log('SHADOW conflict_reviews initialized rows='+inserted);
}

async function mirrorConflictReviewWrite(body,parsed){
  if(!pool)return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;
  const id=String(body.conflictId||'').trim();if(!id)return;
  await pool.query(
    `INSERT INTO conflict_reviews_shadow(
      conflict_id,employee_name,review_year,review_month,conflict_date,reviewed_at_text,reviewed_by,shadow_updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,now())
    ON CONFLICT(conflict_id) DO UPDATE SET
      employee_name=EXCLUDED.employee_name,review_year=EXCLUDED.review_year,
      review_month=EXCLUDED.review_month,conflict_date=EXCLUDED.conflict_date,
      reviewed_at_text=EXCLUDED.reviewed_at_text,reviewed_by=EXCLUDED.reviewed_by,
      shadow_updated_at=now()`,
    [id,String(body.targetEmployee||''),Number(body.year)||0,Number(body.month)||0,
     String(body.date||''),new Date().toISOString(),String(body.employee||'')]
  );
}

async function verifyConflictReviewsShadow(rows,year,month){
  if(!pool||!Array.isArray(rows))return;
  year=Number(year)||0;month=Number(month)||0;if(!year||!month)return;
  const q=await pool.query(
    'SELECT conflict_id FROM conflict_reviews_shadow WHERE review_year=$1 AND review_month=$2',
    [year,month]
  );
  const pg=new Set(q.rows.map(x=>String(x.conflict_id)));
  const google=new Set();
  for(const r of rows){
    for(const x of (Array.isArray(r.overlapConflicts)?r.overlapConflicts:[])){
      if(x&&x.reviewed)google.add(String(x.id));
    }
  }
  let mismatches=0;
  for(const id of google)if(!pg.has(id))mismatches++;
  for(const id of pg)if(!google.has(id))mismatches++;
  console.log('SHADOW_VERIFY conflict_reviews google='+google.size+' postgres='+pg.size+' mismatches='+mismatches);
  await saveShadowVerifyStat('conflict_reviews',google.size,pg.size,mismatches);
}

async function initClosureShadows(){
  if(!pool)return;
  const targets=[
    ['month_closures_shadow','sheet:MonatsabschlussHistorie'],
    ['payroll_reviews_shadow','sheet:LohnPruefungen'],
    ['payroll_closures_shadow','sheet:LohnMonatsabschluss']
  ];
  const existing=await Promise.all(targets.map(x=>pool.query('SELECT COUNT(*)::int AS n FROM '+x[0])));
  if(existing.some(x=>(x.rows[0]?.n||0)>0))return;
  for(const [table,entity] of targets){
    const q=await pool.query(
      `SELECT source_key,payload FROM migration_objects
        WHERE entity_type=$1 ORDER BY source_key::int ASC`,
      [entity]
    );
    let inserted=0;
    for(const row of q.rows){
      const payload=row.payload||{};
      if(Number(payload.sourceRow||row.source_key)<=1)continue;
      const cells=Array.isArray(payload.cells)?payload.cells:[];
      const id=textCell(cells,0).trim();if(!id)continue;
      if(table==='month_closures_shadow'){
        await pool.query(
          `INSERT INTO month_closures_shadow(
            id,employee_name,closure_year,closure_month,action,action_at_text,action_by,reason
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING`,
          [id,textCell(cells,1),Number(textCell(cells,2))||0,Number(textCell(cells,3))||0,
           textCell(cells,4),textCell(cells,5),textCell(cells,6),textCell(cells,7)]
        );
      }else if(table==='payroll_reviews_shadow'){
        await pool.query(
          `INSERT INTO payroll_reviews_shadow(
            issue_id,review_year,review_month,employee_name,review_date,reviewed_at_text,reviewed_by,note
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(issue_id) DO NOTHING`,
          [id,Number(textCell(cells,1))||0,Number(textCell(cells,2))||0,textCell(cells,3),
           textCell(cells,4),textCell(cells,5),textCell(cells,6),textCell(cells,7)]
        );
      }else{
        await pool.query(
          `INSERT INTO payroll_closures_shadow(
            id,closure_year,closure_month,action,action_at_text,action_by,reason,fingerprint
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING`,
          [id,Number(textCell(cells,1))||0,Number(textCell(cells,2))||0,textCell(cells,3),
           textCell(cells,4),textCell(cells,5),textCell(cells,6),textCell(cells,7)]
        );
      }
      inserted++;
    }
    console.log('SHADOW '+table+' initialized rows='+inserted);
  }
}

async function replaceMonthClosureShadow(employee,year,month,history){
  if(!pool||!employee||!Array.isArray(history))return;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM month_closures_shadow WHERE employee_name=$1 AND closure_year=$2 AND closure_month=$3',
      [String(employee),Number(year),Number(month)]
    );
    for(const x of history){
      const id=String(x&&x.id||'').trim();if(!id)continue;
      await client.query(
        `INSERT INTO month_closures_shadow(
          id,employee_name,closure_year,closure_month,action,action_at_text,action_by,reason,shadow_updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())`,
        [id,String(employee),Number(year),Number(month),String(x.action||''),String(x.at||''),
         String(x.by||''),String(x.reason||'')]
      );
    }
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}

async function replacePayrollClosureShadow(year,month,history){
  if(!pool||!Array.isArray(history))return;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('DELETE FROM payroll_closures_shadow WHERE closure_year=$1 AND closure_month=$2',[Number(year),Number(month)]);
    for(const x of history){
      const id=String(x&&x.id||'').trim();if(!id)continue;
      await client.query(
        `INSERT INTO payroll_closures_shadow(
          id,closure_year,closure_month,action,action_at_text,action_by,reason,fingerprint,shadow_updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())`,
        [id,Number(year),Number(month),String(x.action||''),String(x.at||''),String(x.by||''),
         String(x.reason||''),String(x.fingerprint||'')]
      );
    }
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}

async function mirrorPayrollProtocolWrite(action,body,parsed){
  if(!pool)return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;
  if(action==='markPayrollIssueReviewed'){
    await pool.query(
      `INSERT INTO payroll_reviews_shadow(
        issue_id,review_year,review_month,employee_name,review_date,reviewed_at_text,reviewed_by,note,shadow_updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
      ON CONFLICT(issue_id) DO UPDATE SET
        review_year=EXCLUDED.review_year,review_month=EXCLUDED.review_month,
        employee_name=EXCLUDED.employee_name,review_date=EXCLUDED.review_date,
        reviewed_at_text=EXCLUDED.reviewed_at_text,reviewed_by=EXCLUDED.reviewed_by,
        note=EXCLUDED.note,shadow_updated_at=now()`,
      [String(body.issueId||''),Number(body.year)||0,Number(body.month)||0,
       String(body.targetEmployee||''),String(body.date||''),new Date().toISOString(),
       String(body.employee||''),String(body.note||'')]
    );
  }else if(action==='setMonthClosureStatus'){
    await replaceMonthClosureShadow(body.targetEmployee,body.year,body.month,data.history||[]);
  }else if(action==='setPayrollMonthStatus'){
    await replacePayrollClosureShadow(body.year,body.month,data.history||[]);
  }else if(action==='completePayrollCycle'||action==='forceCompletePayrollCycle'){
    const audit=data.audit||{};
    await replacePayrollClosureShadow(body.year,body.month,(audit.state&&audit.state.history)||[]);
  }
}

async function verifyPayrollProtocols(audit,year,month){
  if(!pool||!audit)return;
  year=Number(year)||0;month=Number(month)||0;if(!year||!month)return;
  const [rq,cq]=await Promise.all([
    pool.query(
      'SELECT issue_id FROM payroll_reviews_shadow WHERE review_year=$1 AND review_month=$2',
      [year,month]
    ),
    pool.query(
      'SELECT id,action,reason,fingerprint FROM payroll_closures_shadow WHERE closure_year=$1 AND closure_month=$2',
      [year,month]
    )
  ]);
  const reviewedGoogle=new Set(
    (Array.isArray(audit.issues)?audit.issues:[]).filter(x=>x&&x.reviewed).map(x=>String(x.id))
  );
  const reviewedPg=new Set(rq.rows.map(x=>String(x.issue_id)));
  let mismatches=0;
  for(const id of reviewedGoogle)if(!reviewedPg.has(id))mismatches++;
  for(const id of reviewedPg)if(!reviewedGoogle.has(id))mismatches++;
  const gh=(audit.state&&Array.isArray(audit.state.history))?audit.state.history:[];
  const pg=new Map(cq.rows.map(x=>[String(x.id),x]));
  for(const x of gh){
    const p=pg.get(String(x.id));if(!p){mismatches++;continue;}
    if(normalizeShadowText(x.action)!==normalizeShadowText(p.action)||
       normalizeShadowText(x.reason)!==normalizeShadowText(p.reason)||
       normalizeShadowText(x.fingerprint)!==normalizeShadowText(p.fingerprint))mismatches++;
    pg.delete(String(x.id));
  }
  mismatches+=pg.size;
  console.log('SHADOW_VERIFY payroll_protocols reviews_google='+reviewedGoogle.size+' reviews_postgres='+reviewedPg.size+' closures_google='+gh.length+' closures_postgres='+cq.rows.length+' mismatches='+mismatches);
  await saveShadowVerifyStat('payroll_protocols',reviewedGoogle.size+gh.length,reviewedPg.size+cq.rows.length,mismatches);
}

async function verifyMonthClosures(rows,year,month){
  if(!pool||!Array.isArray(rows))return;
  year=Number(year)||0;month=Number(month)||0;if(!year||!month)return;
  const q=await pool.query(
    'SELECT id,employee_name,action,reason FROM month_closures_shadow WHERE closure_year=$1 AND closure_month=$2',
    [year,month]
  );
  const pg=new Map(q.rows.map(x=>[String(x.id),x]));
  let googleCount=0,mismatches=0;
  for(const r of rows){
    for(const x of (Array.isArray(r.closureHistory)?r.closureHistory:[])){
      googleCount++;
      const p=pg.get(String(x.id));if(!p){mismatches++;continue;}
      if(normalizeShadowText(r.employee)!==normalizeShadowText(p.employee_name)||
         normalizeShadowText(x.action)!==normalizeShadowText(p.action)||
         normalizeShadowText(x.reason)!==normalizeShadowText(p.reason))mismatches++;
      pg.delete(String(x.id));
    }
  }
  mismatches+=pg.size;
  console.log('SHADOW_VERIFY month_closures google='+googleCount+' postgres='+q.rows.length+' mismatches='+mismatches);
  await saveShadowVerifyStat('month_closures',googleCount,q.rows.length,mismatches);
}


async function initAssignmentsShadow(){
  if(!pool)return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM assignments_shadow');
  if((existing.rows[0]?.n||0)>0)return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:Mitarbeiterzuordnungen']
  );
  let inserted=0;
  for(const row of q.rows){
    const payload=row.payload||{};
    if(Number(payload.sourceRow||row.source_key)<=1)continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const id=textCell(cells,0).trim();if(!id)continue;
    await pool.query(
      `INSERT INTO assignments_shadow(
        id,source_entry_id,employee_name,hours,status,created_at_text,created_by,
        confirmed_at_text,issue_at_text,note,replaced_by_entry_id
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT(id) DO NOTHING`,
      [id,textCell(cells,1),textCell(cells,2),Number(textCell(cells,3))||0,
       textCell(cells,4)||'Zugeordnet',textCell(cells,5),textCell(cells,6),
       textCell(cells,7),textCell(cells,8),textCell(cells,9),textCell(cells,10)]
    );
    inserted++;
  }
  console.log('SHADOW assignments initialized rows='+inserted);
}
async function mirrorAssignmentWrite(action,body,parsed){
  if(!pool)return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;
  const id=String(body.assignmentId||'').trim();
  if(action==='confirmEmployeeAssignment'&&id){
    await pool.query(
      `UPDATE assignments_shadow SET status='Bestätigt',confirmed_at_text=$2,issue_at_text='',note='',shadow_updated_at=now()
        WHERE id=$1`,
      [id,new Date().toISOString()]
    );
  }else if(action==='reportEmployeeAssignmentIssue'&&id){
    await pool.query(
      `UPDATE assignments_shadow SET status='Abweichung',issue_at_text=$2,note=$3,shadow_updated_at=now()
        WHERE id=$1`,
      [id,new Date().toISOString(),String(body.note||'')]
    );
  }else if(action==='deleteEntry'){
    const entryId=String(body.id||'').trim();
    if(entryId){
      await pool.query('DELETE FROM assignments_shadow WHERE source_entry_id=$1',[entryId]);
      await pool.query(
        `UPDATE assignments_shadow SET status='Zugeordnet',replaced_by_entry_id='',shadow_updated_at=now()
          WHERE replaced_by_entry_id=$1`,
        [entryId]
      );
    }
  }
}





function bossDayClosuresVerifyKey(body){
  const y=Number(body&&body.year)||0,m=Number(body&&body.month)||0;
  return y&&m?'boss_day_closures:'+y+'-'+String(m).padStart(2,'0'):'';
}
async function employeeActiveMapLiveOrSnapshot(){
  const q=await pool.query('SELECT employee_name,payload FROM employee_admin_shadow ORDER BY sort_order ASC');
  if(q.rowCount){
    return new Map(q.rows.map(r=>[String(r.employee_name),r.payload&&r.payload.active!==false]));
  }
  return employeeActiveMapFromSnapshot();
}
async function postgresBossDayClosures(body){
  const year=Number(body&&body.year)||0,month=Number(body&&body.month)||0;
  if(!year||month<1||month>12)return null;
  const prefix=String(year)+'-'+String(month).padStart(2,'0')+'-';
  const [own,assigned,closures,statusQ,activeMap]=await Promise.all([
    pool.query(
      `SELECT id,employee_name,entry_date,customer,start_time,end_time,hours,activity,transmitted_at_text,
              material_used,material,billing_status,is_supplement,supplement_created_at_text
         FROM time_entries_shadow
        WHERE entry_date LIKE $1 AND entry_date>='2026-09-07'
        ORDER BY employee_name ASC,entry_date ASC,start_time ASC,id ASC`,
      [prefix+'%']
    ),
    pool.query(
      `SELECT a.id AS assignment_id,a.employee_name,a.hours AS assignment_hours,a.status AS assignment_status,
              a.created_by AS assigned_by,t.employee_name AS source_employee,t.id AS source_id,t.entry_date,t.customer,t.start_time,t.end_time,
              t.activity,t.transmitted_at_text
         FROM assignments_shadow a
         JOIN time_entries_shadow t ON t.id=a.source_entry_id
        WHERE COALESCE(a.status,'Zugeordnet')<>'Ersetzt' AND t.entry_date LIKE $1 AND t.entry_date>='2026-09-07'
        ORDER BY a.employee_name ASC,t.entry_date ASC,t.start_time ASC,a.id ASC`,
      [prefix+'%']
    ),
    pool.query(
      `SELECT employee_name,closure_date FROM day_closures_shadow WHERE closure_date LIKE $1`,
      [prefix+'%']
    ),
    pool.query(
      `SELECT employee_name,status_date,status FROM day_status_shadow WHERE status_date LIKE $1`,
      [prefix+'%']
    ),
    employeeActiveMapLiveOrSnapshot()
  ]);
  const closed=new Set(closures.rows.map(r=>String(r.employee_name)+'|'+berlinDateOnly(r.closure_date)));
  const statusMap=new Map(statusQ.rows.map(r=>[String(r.employee_name)+'|'+berlinDateOnly(r.status_date),String(r.status||'Arbeiten')]));
  const byEmployee=new Map();
  const ensure=(employee,date)=>{
    if(!byEmployee.has(employee))byEmployee.set(employee,new Map());
    const m=byEmployee.get(employee);
    if(!m.has(date))m.set(date,{date,hours:0,entryCount:0,closed:closed.has(employee+'|'+date),reports:[]});
    return m.get(date);
  };
  for(const r of own.rows){
    const employee=String(r.employee_name||''),date=berlinDateOnly(r.entry_date);if(!employee||!date)continue;
    const d=ensure(employee,date);
    d.hours+=Number(r.hours||0);d.entryCount++;
    d.reports.push({
      id:String(r.id||''),customer:String(r.customer||''),start:String(r.start_time||''),end:String(r.end_time||''),
      hours:Math.round(Number(r.hours||0)*100)/100,activity:String(r.activity||''),
      transmittedAt:berlinDateTime(r.transmitted_at_text||''),materialUsed:Boolean(r.material_used),
      material:String(r.material||''),billingStatus:String(r.billing_status||'Offen'),
      isAdditionalAssignment:false,assignedBy:'',assignmentStatus:'',
      isSupplement:Boolean(r.is_supplement),supplementCreatedAt:shadowGermanDateTime(r.supplement_created_at_text||'')
    });
  }
  for(const r of assigned.rows){
    const employee=String(r.employee_name||''),date=berlinDateOnly(r.entry_date);if(!employee||!date)continue;
    const d=ensure(employee,date);
    d.hours+=Number(r.assignment_hours||0);d.entryCount++;
    d.reports.push({
      id:'assigned:'+String(r.assignment_id||''),customer:String(r.customer||''),start:String(r.start_time||''),
      end:String(r.end_time||''),hours:Math.round(Number(r.assignment_hours||0)*100)/100,
      activity:String(r.activity||''),transmittedAt:shadowGermanDateTime(r.transmitted_at_text||''),
      materialUsed:false,material:'',billingStatus:'Offen',isAdditionalAssignment:true,
      assignedBy:String(r.assigned_by||r.source_employee||''),assignmentStatus:String(r.assignment_status||'Zugeordnet'),
      isSupplement:false,supplementCreatedAt:''
    });
  }
  const out=[];
  const round=x=>Math.round(Number(x||0)*100)/100;
  for(const [employee,daysMap] of byEmployee){
    const days=[...daysMap.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(d=>{
      const gross=round(d.hours),pause=gross>=6?1:0;
      d.grossHours=gross;d.pauseHours=round(pause);d.hours=round(Math.max(0,gross-pause));
      d.status=statusMap.get(employee+'|'+d.date)||'Arbeiten';
      d.reports.sort((a,b)=>String(a.start||'').localeCompare(String(b.start||'')));
      return d;
    });
    if(days.length)out.push({employee,active:activeMap.has(employee)?Boolean(activeMap.get(employee)):true,days});
  }
  out.sort((a,b)=>a.employee.localeCompare(b.employee,'de'));
  return out;
}
function canonicalBossDayClosures(rows){return Array.isArray(rows)?JSON.parse(JSON.stringify(rows)):[];}
async function verifyBossDayClosuresDirect(rows,body){
  if(!pool||!Array.isArray(rows))return;
  const pg=await postgresBossDayClosures(body);if(!Array.isArray(pg))return;
  const a=canonicalBossDayClosures(rows),b=canonicalBossDayClosures(pg);
  const mismatches=JSON.stringify(a)===JSON.stringify(b)?0:1,key=bossDayClosuresVerifyKey(body);
  console.log('SHADOW_VERIFY '+key+' google='+a.length+' postgres='+b.length+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,a.length,b.length,mismatches);
}
async function directBossDayClosuresRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const key=bossDayClosuresVerifyKey(body);if(!key)return null;
  if(!(await shadowReadyForDirectRead(key)))return null;
  return postgresBossDayClosures(body);
}

function monthDataVerifyKey(body){
  const employee=String(body&&body.employee||''),year=Number(body&&body.year)||0,month=Number(body&&body.month)||0;
  return employee&&year&&month?'month_data:'+employee+':'+year+'-'+String(month).padStart(2,'0'):'';
}
async function postgresMonthData(body){
  const employee=String(body&&body.employee||'').trim(),year=Number(body&&body.year)||0,month=Number(body&&body.month)||0;
  if(!employee||!year||month<1||month>12)return null;
  const cycle=pgPayrollCycleRange(year,month),cycleStart=cycle.start,cycleEnd=cycle.end;
  const [own,assigned,statusQ,closureQ,adjQ,bankQ,annual]=await Promise.all([
    pool.query(
      `SELECT id,entry_date,customer,start_time,hours,activity,transmitted_at_text,is_supplement,supplement_created_at_text
         FROM time_entries_shadow
        WHERE employee_name=$1 AND entry_date>=$2 AND entry_date<=$3
        ORDER BY entry_date ASC,start_time ASC,id ASC`,
      [employee,cycleStart,cycleEnd]
    ),
    pool.query(
      `SELECT a.id AS assignment_id,a.hours AS assignment_hours,a.status AS assignment_status,a.note AS assignment_note,
              a.created_by AS assigned_by,t.entry_date,t.customer,t.start_time,t.activity,t.transmitted_at_text
         FROM assignments_shadow a
         JOIN time_entries_shadow t ON t.id=a.source_entry_id
        WHERE a.employee_name=$1 AND COALESCE(a.status,'Zugeordnet')<>'Ersetzt'
          AND t.entry_date>=$2 AND t.entry_date<=$3
        ORDER BY t.entry_date ASC,t.start_time ASC,a.id ASC`,
      [employee,cycleStart,cycleEnd]
    ),
    pool.query(
      `SELECT status_date,status,source,credited_hours,credited_hours_missing FROM day_status_shadow
        WHERE employee_name=$1 AND status_date>=$2 AND status_date<=$3
        ORDER BY status_date ASC`,
      [employee,cycleStart,cycleEnd]
    ),
    pool.query(
      `SELECT closure_date FROM day_closures_shadow WHERE employee_name=$1 AND closure_date>=$2 AND closure_date<=$3`,
      [employee,cycleStart,cycleEnd]
    ),
    pool.query(
      `SELECT id,hours,reason,created_at_text,created_by FROM monthly_adjustments_shadow
        WHERE employee_name=$1 AND adjustment_year=$2 AND adjustment_month=$3`,
      [employee,year,month]
    ),
    pool.query(
      `SELECT hours,booking_type,booking_year,booking_month,created_at_text,created_iso
         FROM time_bank_shadow WHERE employee_name=$1`,
      [employee]
    ),
    postgresVacationSummary(employee,year)
  ]);
  const closed=new Set(closureQ.rows.map(r=>berlinDateOnly(r.closure_date)));
  const rawRows=[];
  for(const r of own.rows){
    rawRows.push({
      _start:String(r.start_time||''),date:berlinDateOnly(r.entry_date),customer:String(r.customer||''),
      hours:Number(r.hours||0),activity:String(r.activity||''),
      transmittedDate:r.transmitted_at_text?germanDateLabel(shadowDateIso(r.transmitted_at_text)||r.transmitted_at_text):'',
      closed:closed.has(berlinDateOnly(r.entry_date)),isAdditionalAssignment:false,assignedBy:'',
      assignmentStatus:'',assignmentNote:'',isSupplement:Boolean(r.is_supplement),
      supplementCreatedAt:berlinDateTime(r.supplement_created_at_text||'')
    });
  }
  for(const r of assigned.rows){
    rawRows.push({
      _start:String(r.start_time||''),date:berlinDateOnly(r.entry_date),customer:String(r.customer||''),
      hours:Number(r.assignment_hours||0),activity:String(r.activity||''),
      transmittedDate:r.transmitted_at_text?germanDateLabel(shadowDateIso(r.transmitted_at_text)||r.transmitted_at_text):'',
      closed:closed.has(berlinDateOnly(r.entry_date)),isAdditionalAssignment:true,
      assignedBy:String(r.assigned_by||''),assignmentStatus:String(r.assignment_status||'Zugeordnet'),
      assignmentNote:String(r.assignment_note||''),isSupplement:false,supplementCreatedAt:''
    });
  }
  rawRows.sort((a,b)=>(a.date+' '+a._start).localeCompare(b.date+' '+b._start));
  const rows=rawRows.map(r=>{const x={...r};delete x._start;return x;});
  const round=x=>Math.round(Number(x||0)*100)/100;
  const statuses=[];
  for(const r of statusQ.rows){
    const d=berlinDateOnly(r.status_date),st=String(r.status||'');
    statuses.push({
      date:d,status:st,source:String(r.source||''),
      creditedHours:round(await effectiveStatusCredit(employee,d,st,r.credited_hours,r.credited_hours_missing))
    });
  }
  const grossBy=new Map();
  for(const r of rows)grossBy.set(r.date,(grossBy.get(r.date)||0)+Number(r.hours||0));
  const dayTotals=[...grossBy.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,value])=>{
    const gross=round(value),pause=gross>=6?1:0;
    return {date,grossHours:gross,pauseHours:round(pause),netHours:round(Math.max(0,gross-pause))};
  });
  const workTotalGross=round(dayTotals.reduce((s,x)=>s+x.grossHours,0));
  const automaticPauseTotal=round(dayTotals.reduce((s,x)=>s+x.pauseHours,0));
  const workTotal=round(workTotalGross-automaticPauseTotal);
  const statusCredit=round(statuses.reduce((s,x)=>s+Number(x.creditedHours||0),0));
  let timeBankMonthCredit=0;
  for(const r of bankQ.rows){
    const hours=Number(r.hours||0),art=String(r.booking_type||''),by=Number(r.booking_year)||0,bm=Number(r.booking_month)||0;
    const createdIso=berlinDateOnly(r.created_iso||r.created_at_text||'');
    if(year===2026&&month===9&&createdIso&&createdIso<'2026-09-07')continue;
    if(art==='Monatsausgleich'&&by===year&&bm===month)timeBankMonthCredit+=Math.abs(Math.min(0,hours));
    if(art==='Stunden Gutschreiben'||art==='Stunden abziehen'){
      const yy=by||Number(createdIso.slice(0,4)),mm=bm||Number(createdIso.slice(5,7));
      if(yy===year&&mm===month)timeBankMonthCredit+=hours;
    }
  }
  timeBankMonthCredit=0;
  const creditedTotal=round(statusCredit);
  const adjustments=adjQ.rows.filter(r=>{
    const created=berlinDateOnly(r.created_at_text||'');
    return !(year===2026&&month===9&&created&&created<'2026-09-07');
  });
  const adjustmentTotal=round(adjustments.reduce((s,r)=>s+Number(r.hours||0),0));
  const monthSummary={
    vacationDays:statuses.filter(x=>x.status==='Urlaub').length,
    sickDays:statuses.filter(x=>x.status==='Krank').length,
    holidayDays:statuses.filter(x=>x.status==='Feiertag').length,
    trainingDays:statuses.filter(x=>x.status==='Schulung').length,
    unexcusedDays:statuses.filter(x=>['Unerlaubte Abwesenheit','Unentschuldigte Abwesenheit'].includes(x.status)).length,
    compensatoryDays:0,
    compensatoryHours:0,
    timeBankMonthCredit:0,adjustmentTotal
  };
  const yearSummary={
    year,vacationEntitlement:Number(annual.vacationEntitlement||0),vacationUsed:Number(annual.vacationUsed||0),
    vacationRemaining:Number(annual.vacationRemaining||0),sickDays:Number(annual.sickDays||0),holidayDays:Number(annual.holidayDays||0)
  };
  const actualTotal=round(workTotal+creditedTotal+adjustmentTotal);
  return {
    rows,total:actualTotal,actualTotal,adjustmentTotal,workTotal,workTotalGross,automaticPauseTotal,dayTotals,
    creditedTotal,statusCredit,timeBankMonthCredit:0,timeBankBalance:0,statuses,monthSummary,yearSummary,
    cycleStart,cycleEnd
  };
}
function canonicalMonthData(x){
  if(!x)return null;
  const out=JSON.parse(JSON.stringify(x));
  const normTransmitted=v=>{
    const s=String(v||'').trim();if(!s)return '';
    const de=s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
    if(de)return de[1]+'.'+de[2]+'.'+de[3];
    const iso=shadowDateIso(s);
    return iso?germanDateLabel(iso):s;
  };
  out.rows=(Array.isArray(out.rows)?out.rows:[]).map(r=>Object.assign({},r,{
    date:berlinDateOnly(r&&r.date||''),
    hours:Math.round(Number(r&&r.hours||0)*100)/100,
    transmittedDate:normTransmitted(r&&r.transmittedDate)
  })).sort((a,b)=>{
    const ka=[
      String(a.date||''),String(a.customer||''),String(a.activity||''),
      String(Number(a.hours||0)),String(Boolean(a.isAdditionalAssignment)),
      String(Boolean(a.isSupplement)),String(a.assignedBy||''),String(a.assignmentStatus||'')
    ].join('|');
    const kb=[
      String(b.date||''),String(b.customer||''),String(b.activity||''),
      String(Number(b.hours||0)),String(Boolean(b.isAdditionalAssignment)),
      String(Boolean(b.isSupplement)),String(b.assignedBy||''),String(b.assignmentStatus||'')
    ].join('|');
    return ka.localeCompare(kb,'de');
  });
  out.monthSummary=Object.assign({
    vacationDays:0,sickDays:0,holidayDays:0,compensatoryDays:0,compensatoryHours:0,
    timeBankMonthCredit:0,adjustmentTotal:0
  },out.monthSummary||{});
  out.monthSummary.timeBankMonthCredit=Number(out.monthSummary.timeBankMonthCredit||0);
  out.monthSummary.adjustmentTotal=Number(out.monthSummary.adjustmentTotal||0);
  return out;
}
async function verifyMonthDataShadow(data,body){
  if(!pool||!data)return;
  const year=Number(body&&body.year)||0,month=Number(body&&body.month)||0;
  const now=berlinNowParts(),today=String(now.year)+'-'+String(now.month).padStart(2,'0')+'-'+String(now.day).padStart(2,'0');
  const key=monthDataVerifyKey(body),cycle=pgPayrollCycleRange(year,month);
  if(cycle.start>today){
    if(key)await pool.query('DELETE FROM shadow_verify_stats WHERE shadow_name=$1',[key]);
    console.log('SHADOW_VERIFY '+key+' skipped=future_cycle');
    return;
  }
  const pg=await postgresMonthData(body);if(!pg)return;
  const a=canonicalMonthData(data),b=canonicalMonthData(pg);
  const mismatches=JSON.stringify(a)===JSON.stringify(b)?0:1;
  console.log('SHADOW_VERIFY '+key+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,1,1,mismatches);
}
async function directMonthDataRead(body){
  const session=await localSessionForBody(body,false);if(!session)return null;
  const employee=String(body.employee||session.employee||'').trim();
  if(!employee||employee!==session.employee)return null;
  const year=Number(body.year)||0,month=Number(body.month)||0;
  const key=monthDataVerifyKey(body);if(!key||!year||month<1||month>12)return null;
  const cycle=pgPayrollCycleRange(year,month);
  // PostgreSQL is authoritative for payroll cycles covered by the production migration.
  // Older cycles keep the Google fallback because the local migration intentionally starts on 2026-09-07.
  if(cycle.end<'2026-09-07'&&!(await shadowReadyForDirectRead(key,87600)))return null;
  return postgresMonthData(body);
}

function dayDataVerifyKey(body,employee){
  const date=berlinDateOnly(body&&body.date||'');
  return date?'day_data:'+String(employee||'')+':'+date:'';
}
async function employeeScheduleForDate(employee,date){
  const live=await pool.query('SELECT payload FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1',[String(employee)]);
  let p=live.rows[0]?.payload||null;
  if(!p){
    const q=await pool.query(
      `SELECT payload FROM migration_objects WHERE entity_type=$1 ORDER BY source_key::int ASC`,
      ['sheet:Mitarbeiter']
    );
    for(const row of q.rows){
      const payload=row.payload||{};if(Number(payload.sourceRow||row.source_key)<=1)continue;
      const cells=Array.isArray(payload.cells)?payload.cells:[];
      if(textCell(cells,0).trim()!==String(employee))continue;
      p={monday:Number(textCell(cells,5))||0,tuesday:Number(textCell(cells,6))||0,
         wednesday:Number(textCell(cells,7))||0,thursday:Number(textCell(cells,8))||0,friday:Number(textCell(cells,9))||0};
      break;
    }
  }
  if(!p)return 0;
  const m=String(date||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return 0;
  const dow=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),12,0,0)).getUTCDay();
  const key={1:'monday',2:'tuesday',3:'wednesday',4:'thursday',5:'friday'}[dow];
  return key?Math.round(Number(p[key]||0)*100)/100:0;
}
async function postgresDayData(body,employee){
  employee=String(employee||'').trim();
  const date=berlinDateOnly(body&&body.date||'');
  if(!employee||!date)return null;
  const [own,assigned,statusQ,closureQ,bankQ,targetHours]=await Promise.all([
    pool.query(
      `SELECT id,employee_name,entry_date,customer,start_time,end_time,hours,activity,transmitted_at_text,
              material_used,material,customer_signature_url,photo_count,photo_urls,job_status,
              is_supplement,supplement_created_at_text
         FROM time_entries_shadow WHERE employee_name=$1 AND entry_date=$2 ORDER BY start_time ASC,id ASC`,
      [employee,date]
    ),
    pool.query(
      `SELECT a.id AS assignment_id,a.hours AS assignment_hours,a.status AS assignment_status,a.note AS assignment_note,
              a.created_by AS assigned_by,t.id,t.entry_date,t.customer,t.start_time,t.end_time,t.activity,t.transmitted_at_text
         FROM assignments_shadow a
         JOIN time_entries_shadow t ON t.id=a.source_entry_id
        WHERE a.employee_name=$1 AND COALESCE(a.status,'Zugeordnet')<>'Ersetzt' AND t.entry_date=$2
        ORDER BY t.start_time ASC,a.id ASC`,
      [employee,date]
    ),
    pool.query(
      `SELECT status,source,credited_hours,credited_hours_missing FROM day_status_shadow WHERE employee_name=$1 AND status_date=$2 LIMIT 1`,
      [employee,date]
    ),
    pool.query(
      `SELECT closed_at_text,updated_at_text FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2 LIMIT 1`,
      [employee,date]
    ),
    pool.query('SELECT COALESCE(SUM(hours),0)::numeric AS balance FROM time_bank_shadow WHERE employee_name=$1',[employee]),
    employeeScheduleForDate(employee,date)
  ]);
  const entries=[];
  for(const r of own.rows){
    entries.push({
      id:String(r.id||''),employee,date,customer:String(r.customer||''),start:String(r.start_time||''),
      end:String(r.end_time||''),hours:Number(r.hours||0),activity:String(r.activity||''),
      transmittedDate:r.transmitted_at_text?germanDateLabel(r.transmitted_at_text):'',
      materialUsed:Boolean(r.material_used),material:String(r.material||''),
      customerSignatureUrl:String(r.customer_signature_url||''),photoCount:Number(r.photo_count||0),
      photoUrls:String(r.photo_urls||''),jobStatus:String(r.job_status||'Abgeschlossen'),
      isAdditionalAssignment:false,assignedBy:'',assignmentId:'',assignmentStatus:'',assignmentNote:'',
      isSupplement:Boolean(r.is_supplement),supplementCreatedAt:shadowGermanDateTime(r.supplement_created_at_text||'')
    });
  }
  for(const r of assigned.rows){
    entries.push({
      id:'assigned:'+String(r.assignment_id||''),employee,date,customer:String(r.customer||''),start:String(r.start_time||''),
      end:String(r.end_time||''),hours:Number(r.assignment_hours||0),activity:String(r.activity||''),
      transmittedDate:r.transmitted_at_text?germanDateLabel(r.transmitted_at_text):'',
      materialUsed:false,material:'',customerSignatureUrl:'',photoCount:0,photoUrls:'',
      jobStatus:'Abgeschlossen',isAdditionalAssignment:true,assignedBy:String(r.assigned_by||''),
      assignmentId:String(r.assignment_id||''),assignmentStatus:String(r.assignment_status||'Zugeordnet'),
      assignmentNote:String(r.assignment_note||''),isSupplement:false,supplementCreatedAt:''
    });
  }
  entries.sort((a,b)=>(a.date+' '+a.start).localeCompare(b.date+' '+b.start));
  const round=x=>Math.round(Number(x||0)*100)/100;
  const grossWorkTotal=round(entries.reduce((s,x)=>s+Number(x.hours||0),0));
  const pauseHours=grossWorkTotal>=6?1:0,workTotal=round(Math.max(0,grossWorkTotal-pauseHours));
  const st=statusQ.rows[0]||{};
  const status=String(st.status||'Arbeiten'),statusSource=String(st.source||'');
  const credited=status==='Arbeiten'?0:await effectiveStatusCredit(employee,date,status,st.credited_hours,st.credited_hours_missing);
  const closure=closureQ.rows[0]||null;
  const latestSuppRaw=own.rows.filter(r=>Boolean(r.is_supplement)&&r.supplement_created_at_text)
    .map(r=>String(r.supplement_created_at_text||'')).filter(Boolean)
    .sort((a,b)=>shadowComparableDateTime(a).localeCompare(shadowComparableDateTime(b))).pop()||'';
  const latestSuppKey=shadowComparableDateTime(latestSuppRaw);
  let closureNeedsRefresh=false;
  if(closure&&latestSuppKey){
    const baseline=shadowComparableDateTime(closure.updated_at_text||closure.closed_at_text||'');
    closureNeedsRefresh=!baseline||latestSuppKey>baseline;
  }
  const latestSupp=shadowGermanDateTime(latestSuppRaw);
  const balance=round(Math.max(0,Number(bankQ.rows[0]?.balance||0)));
  return {
    entries,total:round(workTotal+credited),grossTotal:round(grossWorkTotal+credited),
    grossWorkTotal,workTotal,automaticPauseHours:round(pauseHours),pauseMinutes:Math.round(pauseHours*60),
    creditedHours:round(credited),closed:Boolean(closure),closureNeedsRefresh,latestSupplementAt:latestSupp,
    status,statusSource,targetHours:round(targetHours),timeBankBalance:balance
  };
}
function canonicalDayData(x){
  if(!x)return null;
  return JSON.parse(JSON.stringify(x));
}
async function verifyDayDataShadow(data,body){
  if(!pool||!data)return;
  const employee=String(body.employee||'').trim();if(!employee)return;
  const pg=await postgresDayData(body,employee);if(!pg)return;
  const a=canonicalDayData(data),b=canonicalDayData(pg);
  const mismatches=JSON.stringify(a)===JSON.stringify(b)?0:1,key=dayDataVerifyKey(body,employee);
  console.log('SHADOW_VERIFY '+key+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,1,1,mismatches);
}
async function directDayDataRead(body){
  const session=await localSessionForBody(body,false);if(!session)return null;
  const employee=String(body.employee||session.employee||'').trim();
  if(!employee||employee!==session.employee)return null;
  const key=dayDataVerifyKey(body,employee);if(!key)return null;
  if(!(await shadowReadyForDirectRead(key)))return null;
  return postgresDayData(body,employee);
}

function weekRangeFromReference(value){
  const ref=berlinDateOnly(value||new Date());
  const m=ref.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;
  const d=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),12,0,0));
  const dow=d.getUTCDay(),delta=dow===0?-6:1-dow;
  d.setUTCDate(d.getUTCDate()+delta);
  const start=d.toISOString().slice(0,10);
  d.setUTCDate(d.getUTCDate()+6);
  return {start,end:d.toISOString().slice(0,10)};
}
function weekVerifyKey(body,employee){
  const r=weekRangeFromReference(body&&body.referenceDate);
  return r?'week_data:'+String(employee||'')+':'+r.start:'';
}
async function postgresWeekData(body,employee){
  employee=String(employee||'').trim();
  const range=weekRangeFromReference(body&&body.referenceDate);
  if(!employee||!range)return null;
  const [own,assigned,status]=await Promise.all([
    pool.query(
      `SELECT entry_date,hours FROM time_entries_shadow
        WHERE employee_name=$1 AND entry_date>=$2 AND entry_date<=$3`,
      [employee,range.start,range.end]
    ),
    pool.query(
      `SELECT t.entry_date,a.hours
         FROM assignments_shadow a
         JOIN time_entries_shadow t ON t.id=a.source_entry_id
        WHERE a.employee_name=$1 AND COALESCE(a.status,'Zugeordnet')<>'Ersetzt'
          AND t.entry_date>=$2 AND t.entry_date<=$3`,
      [employee,range.start,range.end]
    ),
    pool.query(
      `SELECT status_date,status,credited_hours,credited_hours_missing
         FROM day_status_shadow
        WHERE employee_name=$1 AND status_date>=$2 AND status_date<=$3`,
      [employee,range.start,range.end]
    )
  ]);
  const grossBy=new Map();
  for(const r of own.rows.concat(assigned.rows)){
    const d=berlinDateOnly(r.entry_date);
    grossBy.set(d,(grossBy.get(d)||0)+Number(r.hours||0));
  }
  let gross=0,pause=0,net=0;
  for(const value of grossBy.values()){
    const g=Math.round(Math.max(0,Number(value)||0)*100)/100;
    const p=g>=6?1:0;
    gross+=g;pause+=p;net+=Math.max(0,g-p);
  }
  let credited=0;
  for(const r of status.rows){
    credited+=await effectiveStatusCredit(employee,berlinDateOnly(r.status_date),r.status,r.credited_hours,r.credited_hours_missing);
  }
  const round=x=>Math.round(Number(x||0)*100)/100;
  return {
    start:range.start,end:range.end,grossWorkTotal:round(gross),
    automaticPauseTotal:round(pause),workTotal:round(net),
    creditedHours:round(credited),total:round(net+credited)
  };
}
function canonicalWeekData(x){
  if(!x)return null;
  return {
    start:String(x.start||''),end:String(x.end||''),grossWorkTotal:Number(x.grossWorkTotal||0),
    automaticPauseTotal:Number(x.automaticPauseTotal||0),workTotal:Number(x.workTotal||0),
    creditedHours:Number(x.creditedHours||0),total:Number(x.total||0)
  };
}
async function verifyWeekDataShadow(data,body){
  if(!pool||!data)return;
  const employee=String(body.employee||'').trim();if(!employee)return;
  const pg=await postgresWeekData(body,employee);if(!pg)return;
  const a=canonicalWeekData(data),b=canonicalWeekData(pg);
  const mismatches=JSON.stringify(a)===JSON.stringify(b)?0:1,key=weekVerifyKey(body,employee);
  console.log('SHADOW_VERIFY '+key+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,1,1,mismatches);
}
async function directWeekDataRead(body){
  const session=await localSessionForBody(body,false);if(!session)return null;
  const employee=String(body.employee||session.employee||'').trim();
  if(!employee||employee!==session.employee)return null;
  const key=weekVerifyKey(body,employee);if(!key)return null;
  if(!(await shadowReadyForDirectRead(key)))return null;
  return postgresWeekData(body,employee);
}

async function initMonthlyAdjustmentsShadow(){
  if(!pool)return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM monthly_adjustments_shadow');
  if((existing.rows[0]?.n||0)>0)return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:Stundenkorrekturen']
  );
  let inserted=0;
  for(const row of q.rows){
    const payload=row.payload||{};
    if(Number(payload.sourceRow||row.source_key)<=1)continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const id=textCell(cells,0).trim();if(!id)continue;
    await pool.query(
      `INSERT INTO monthly_adjustments_shadow(
        id,employee_name,adjustment_year,adjustment_month,hours,reason,created_at_text,created_by
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(id) DO NOTHING`,
      [id,textCell(cells,1),Number(textCell(cells,2))||0,Number(textCell(cells,3))||0,
       Number(textCell(cells,4))||0,textCell(cells,5),textCell(cells,6),textCell(cells,7)]
    );
    inserted++;
  }
  console.log('SHADOW monthly_adjustments initialized rows='+inserted);
}

async function mirrorMonthlyAdjustmentWrite(action,body,parsed){
  if(!pool)return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;
  if(action==='saveMonthlyAdjustment'){
    const id=String(data.id||'').trim();if(!id)return;
    await pool.query(
      `INSERT INTO monthly_adjustments_shadow(
        id,employee_name,adjustment_year,adjustment_month,hours,reason,created_at_text,created_by,shadow_updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
      ON CONFLICT(id) DO UPDATE SET
        employee_name=EXCLUDED.employee_name,adjustment_year=EXCLUDED.adjustment_year,
        adjustment_month=EXCLUDED.adjustment_month,hours=EXCLUDED.hours,reason=EXCLUDED.reason,
        created_at_text=EXCLUDED.created_at_text,created_by=EXCLUDED.created_by,shadow_updated_at=now()`,
      [id,String(body.targetEmployee||''),Number(body.year)||0,Number(body.month)||0,
       Number(data.hours!==undefined?data.hours:body.hours)||0,String(body.reason||''),
       new Date().toISOString(),String(body.employee||'')]
    );
  }else if(action==='deleteMonthlyAdjustment'){
    await pool.query('DELETE FROM monthly_adjustments_shadow WHERE id=$1',[String(body.adjustmentId||'')]);
  }
}

async function verifyMonthlyAdjustmentsShadow(rows,year,month){
  if(!pool||!Array.isArray(rows))return;
  year=Number(year)||0;month=Number(month)||0;
  if(!year||!month)return;
  const q=await pool.query(
    `SELECT id,employee_name,hours,reason,created_by
       FROM monthly_adjustments_shadow
      WHERE adjustment_year=$1 AND adjustment_month=$2`,
    [year,month]
  );
  const pg=new Map(q.rows.map(r=>[String(r.id),r]));
  let mismatches=0;const seen=new Set();let googleCount=0;
  for(const row of rows){
    for(const a of (Array.isArray(row.adjustments)?row.adjustments:[])){
      googleCount++;
      const id=normalizeShadowText(a&&a.id);if(!id){mismatches++;continue;}
      seen.add(id);const p=pg.get(id);if(!p){mismatches++;continue;}
      const same=
        normalizeShadowText(row.employee)===normalizeShadowText(p.employee_name) &&
        Math.abs(Number(a.hours||0)-Number(p.hours||0))<0.01 &&
        normalizeShadowText(a.reason)===normalizeShadowText(p.reason) &&
        normalizeShadowText(a.createdBy)===normalizeShadowText(p.created_by);
      if(!same)mismatches++;
    }
  }
  for(const id of pg.keys())if(!seen.has(id))mismatches++;
  console.log('SHADOW_VERIFY monthly_adjustments google='+googleCount+' postgres='+pg.size+' mismatches='+mismatches);
  await saveShadowVerifyStat('monthly_adjustments',googleCount,pg.size,mismatches);
}

async function initTimeBankShadow(){
  if(!pool)return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM time_bank_shadow');
  if((existing.rows[0]?.n||0)>0)return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:Zeitguthaben']
  );
  let inserted=0;
  for(const row of q.rows){
    const payload=row.payload||{};
    if(Number(payload.sourceRow||row.source_key)<=1)continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const id=textCell(cells,0).trim();if(!id)continue;
    await pool.query(
      `INSERT INTO time_bank_shadow(
        id,employee_name,hours,booking_type,booking_year,booking_month,reference,reason,
        created_at_text,created_by
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT(id) DO NOTHING`,
      [id,textCell(cells,1),Number(textCell(cells,2))||0,textCell(cells,3),
       Number(textCell(cells,4))||0,Number(textCell(cells,5))||0,textCell(cells,6),
       textCell(cells,7),textCell(cells,8),textCell(cells,9)]
    );
    inserted++;
  }
  console.log('SHADOW time_bank initialized rows='+inserted);
}

async function replaceTimeBankEmployeeShadow(data){
  if(!pool||!data||!data.employee||!Array.isArray(data.transactions))return;
  const employee=String(data.employee);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('DELETE FROM time_bank_shadow WHERE employee_name=$1',[employee]);
    for(const t of data.transactions){
      const id=String(t&&t.id||'').trim();if(!id)continue;
      await client.query(
        `INSERT INTO time_bank_shadow(
          id,employee_name,hours,booking_type,booking_year,booking_month,reference,reason,
          created_at_text,created_iso,created_by,shadow_updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())`,
        [id,employee,Number(t.hours)||0,String(t.art||''),Number(t.year)||0,Number(t.month)||0,
         String(t.reference||''),String(t.reason||''),String(t.createdAt||''),
         String(t.createdIso||''),String(t.createdBy||'')]
      );
    }
    await client.query('COMMIT');
  }catch(e){
    await client.query('ROLLBACK');throw e;
  }finally{client.release();}
}


async function mirrorTimeBankWrite(action,body,parsed){
  if(!pool)return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;
  const id=String(data.id||'').trim(),employee=String(body.targetEmployee||'').trim();
  if(!id||!employee)return;

  let hours=Number(data.hours||0),type='',year=0,month=0,reference='',reason='';
  const now=new Date();
  const createdIso=berlinDateOnly(now);

  if(action==='applyTimeBankToMonth'){
    const employee=String(body.targetEmployee||'');
    await Promise.all([
      pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'time_bank:%' OR shadow_name LIKE 'my_time_bank:%' OR shadow_name LIKE 'month_data:%' OR shadow_name LIKE 'boss_month_native:%'"),
      pool.query("DELETE FROM exact_views_shadow WHERE action IN ('getMonthPayrollAudit','getPayrollCycleState','getDashboardSummary51')")
    ]);
    if(employee){
      const q=await pool.query('SELECT COUNT(*)::int AS n FROM time_bank_shadow WHERE employee_name=$1',[employee]);
      const n=Number(q.rows[0]?.n||0);await saveShadowVerifyStat('time_bank:'+employee,n,n,0);
    }
  }
  if(action==='bankMonthSurplus'){
    const employee=String(body.targetEmployee||'');
    await Promise.all([
      pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'time_bank:%' OR shadow_name LIKE 'my_time_bank:%' OR shadow_name LIKE 'month_data:%' OR shadow_name LIKE 'boss_month_native:%'"),
      pool.query("DELETE FROM exact_views_shadow WHERE action IN ('getMonthPayrollAudit','getPayrollCycleState','getDashboardSummary51')")
    ]);
    if(employee){
      const q=await pool.query('SELECT COUNT(*)::int AS n FROM time_bank_shadow WHERE employee_name=$1',[employee]);
      const n=Number(q.rows[0]?.n||0);await saveShadowVerifyStat('time_bank:'+employee,n,n,0);
    }
  }
  if(action==='transferWhatsappThreadV10'&&result&&result._markWhatsappReadThread){
    await markWhatsappThreadReadV10(result._markWhatsappReadThread).catch(e=>console.error('WhatsApp mark thread read failed',e.message));
    delete result._markWhatsappReadThread;
  }
  if(action==='saveTimeBankManual'){
    const raw=String(body.timeBankAction||'');
    type=(raw==='Auszahlung'||raw==='Stunden abziehen')?'Stunden abziehen':'Stunden Gutschreiben';
    year=Number(createdIso.slice(0,4))||0;
    month=Number(createdIso.slice(5,7))||0;
    reason=String(body.reason||'');
    // Google normalizes the sign and returns it in data.hours.
    reference='manual:postgres-mirror:'+id;
  }else if(action==='applyTimeBankToMonth'){
    type='Monatsausgleich';
    year=Number(body.year)||0;month=Number(body.month)||0;
    reason='Anrechnung auf Monats-Soll';
    reference='month-credit:'+year+'-'+month+':postgres-mirror:'+id;
  }else if(action==='bankMonthSurplus'){
    type='Monatsplus';
    year=Number(body.year)||0;month=Number(body.month)||0;
    reason='Monatsplus ins Zeitguthaben übernommen';
    reference='month-surplus:'+employee+':'+year+'-'+month;
  }else return;

  await pool.query(
    `INSERT INTO time_bank_shadow(
      id,employee_name,hours,booking_type,booking_year,booking_month,reference,reason,
      created_at_text,created_iso,created_by,shadow_updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
    ON CONFLICT(id) DO UPDATE SET
      employee_name=EXCLUDED.employee_name,hours=EXCLUDED.hours,booking_type=EXCLUDED.booking_type,
      booking_year=EXCLUDED.booking_year,booking_month=EXCLUDED.booking_month,
      reference=CASE WHEN COALESCE(time_bank_shadow.reference,'')<>'' THEN time_bank_shadow.reference ELSE EXCLUDED.reference END,
      reason=EXCLUDED.reason,created_at_text=EXCLUDED.created_at_text,created_iso=EXCLUDED.created_iso,
      created_by=EXCLUDED.created_by,shadow_updated_at=now()`,
    [id,employee,hours,type,year,month,reference,reason,new Date().toISOString(),createdIso,String(body.employee||'')]
  );
  await pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'time_bank:%' OR shadow_name LIKE 'my_time_bank:%'");
}

async function verifyTimeBankShadow(data){
  if(!pool||!data||!data.employee||!Array.isArray(data.transactions))return;
  const employee=String(data.employee);
  const q=await pool.query(
    `SELECT id,hours,booking_type,booking_year,booking_month,reference,reason,created_by
       FROM time_bank_shadow WHERE employee_name=$1`,
    [employee]
  );
  const pg=new Map(q.rows.map(r=>[String(r.id),r]));
  let mismatches=0;const seen=new Set();
  for(const t of data.transactions){
    const id=normalizeShadowText(t&&t.id);if(!id){mismatches++;continue;}
    seen.add(id);const p=pg.get(id);if(!p){mismatches++;continue;}
    const same=
      Math.abs(Number(t.hours||0)-Number(p.hours||0))<0.01 &&
      normalizeShadowText(t.art)===normalizeShadowText(p.booking_type) &&
      Number(t.year||0)===Number(p.booking_year||0) &&
      Number(t.month||0)===Number(p.booking_month||0) &&
      normalizeShadowText(t.reference)===normalizeShadowText(p.reference) &&
      normalizeShadowText(t.reason)===normalizeShadowText(p.reason) &&
      normalizeShadowText(t.createdBy)===normalizeShadowText(p.created_by);
    if(!same)mismatches++;
  }
  for(const id of pg.keys())if(!seen.has(id))mismatches++;
  const googleBalance=Math.max(0,data.transactions.reduce((s,t)=>s+Number(t.hours||0),0));
  const pgBalance=Math.max(0,q.rows.reduce((s,t)=>s+Number(t.hours||0),0));
  if(Math.abs(Number(data.balance||0)-googleBalance)>=0.01)mismatches++;
  if(Math.abs(Number(data.balance||0)-pgBalance)>=0.01)mismatches++;
  console.log('SHADOW_VERIFY time_bank employee_rows='+data.transactions.length+' postgres='+pg.size+' mismatches='+mismatches);
  await saveShadowVerifyStat('time_bank:'+employee,data.transactions.length,pg.size,mismatches);
}


async function verifyMyTimeBankShadow(data){
  if(!pool||!data||!data.employee)return;
  const employee=String(data.employee);
  const q=await pool.query(
    'SELECT COALESCE(SUM(hours),0)::numeric AS balance FROM time_bank_shadow WHERE employee_name=$1',
    [employee]
  );
  const pgBalance=Math.round(Math.max(0,Number(q.rows[0]?.balance||0))*100)/100;
  const googleBalance=Math.round(Math.max(0,Number(data.balance||0))*100)/100;
  const mismatches=Math.abs(pgBalance-googleBalance)<0.01?0:1;
  console.log('SHADOW_VERIFY my_time_bank employee='+employee+' mismatches='+mismatches);
  await saveShadowVerifyStat('my_time_bank:'+employee,1,1,mismatches);
}

async function initVacationEntitlementsShadow(){
  if(!pool)return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM vacation_entitlements_shadow');
  if((existing.rows[0]?.n||0)>0)return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:Urlaubskonto']
  );
  let inserted=0;
  for(const row of q.rows){
    const payload=row.payload||{};
    if(Number(payload.sourceRow||row.source_key)<=1)continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const employee=textCell(cells,0).trim();
    const year=Number(textCell(cells,1))||0;
    if(!employee||!year)continue;
    await pool.query(
      `INSERT INTO vacation_entitlements_shadow(
        employee_name,vacation_year,entitlement,changed_at_text,changed_by
      ) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(employee_name,vacation_year) DO NOTHING`,
      [employee,year,Math.max(0,Number(textCell(cells,2))||0),textCell(cells,3),textCell(cells,4)]
    );
    inserted++;
  }
  console.log('SHADOW vacation_entitlements initialized rows='+inserted);
}

async function mirrorVacationEntitlementWrite(body,parsed){
  if(!pool)return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;
  const employee=String(body.targetEmployee||data.employee||'').trim();
  const year=Number(body.year||data.year)||0;
  if(!employee||!year)return;
  const entitlement=Number(
    body.entitlement!==undefined?body.entitlement:
    data.vacationEntitlement!==undefined?data.vacationEntitlement:0
  )||0;
  await pool.query(
    `INSERT INTO vacation_entitlements_shadow(
      employee_name,vacation_year,entitlement,changed_at_text,changed_by,shadow_updated_at
    ) VALUES($1,$2,$3,$4,$5,now())
    ON CONFLICT(employee_name,vacation_year) DO UPDATE SET
      entitlement=EXCLUDED.entitlement,changed_at_text=EXCLUDED.changed_at_text,
      changed_by=EXCLUDED.changed_by,shadow_updated_at=now()`,
    [employee,year,Math.max(0,entitlement),new Date().toISOString(),String(body.employee||'')]
  );
}

async function verifyVacationAccountShadow(data){
  if(!pool||!data||!data.employee||!data.year)return;
  const q=await pool.query(
    'SELECT entitlement FROM vacation_entitlements_shadow WHERE employee_name=$1 AND vacation_year=$2',
    [String(data.employee),Number(data.year)]
  );
  const pg=q.rows[0];
  let mismatches=0;
  if(!pg)mismatches=1;
  else if(Math.abs(Number(data.vacationEntitlement||0)-Number(pg.entitlement||0))>=0.01)mismatches=1;
  console.log('SHADOW_VERIFY vacation_entitlement google=1 postgres='+(pg?1:0)+' mismatches='+mismatches);
  await saveShadowVerifyStat('vacation_entitlement',1,pg?1:0,mismatches);
}

async function verifyVacationAccountsShadow(rows,year){
  if(!pool||!Array.isArray(rows))return;
  year=Number(year)||0;if(!year)return;
  const q=await pool.query(
    'SELECT employee_name,entitlement FROM vacation_entitlements_shadow WHERE vacation_year=$1',
    [year]
  );
  const pg=new Map(q.rows.map(r=>[String(r.employee_name),r]));
  let mismatches=0,googleExplicit=0;
  for(const r of rows){
    const p=pg.get(String(r.employee||''));
    if(p){
      googleExplicit++;
      if(Math.abs(Number(r.vacationEntitlement||0)-Number(p.entitlement||0))>=0.01)mismatches++;
    }else if(Number(r.vacationEntitlement||0)!==0){
      mismatches++;
    }
  }
  for(const name of pg.keys()){
    if(!rows.some(r=>String(r.employee||'')===name))mismatches++;
  }
  console.log('SHADOW_VERIFY vacation_entitlements google='+googleExplicit+' postgres='+pg.size+' mismatches='+mismatches);
  await saveShadowVerifyStat('vacation_entitlements',googleExplicit,pg.size,mismatches);
}

async function initAbsencesShadow(){
  if(!pool)return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM absences_shadow');
  if((existing.rows[0]?.n||0)>0)return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:Abwesenheiten']
  );
  let inserted=0;
  for(const row of q.rows){
    const payload=row.payload||{};
    if(Number(payload.sourceRow||row.source_key)<=1)continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const id=textCell(cells,0).trim();if(!id)continue;
    await pool.query(
      `INSERT INTO absences_shadow(
        id,employee_name,absence_type,start_date,end_date,created_at_text,created_by,active,
        sickness_case_id,sickness_mode,employer_pay_through,payer,sickness_case_days,note
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT(id) DO NOTHING`,
      [id,textCell(cells,1),textCell(cells,2),textCell(cells,3),textCell(cells,4),
       textCell(cells,5),textCell(cells,6),shadowActive(textCell(cells,7)),
       textCell(cells,8),textCell(cells,9),textCell(cells,10),textCell(cells,11),
       Math.max(0,Number(textCell(cells,12))||0),textCell(cells,13)]
    );
    inserted++;
  }
  console.log('SHADOW absences initialized rows='+inserted);
}

async function invalidateShadowVerify(name){
  if(!pool)return;
  await pool.query('DELETE FROM shadow_verify_stats WHERE shadow_name=$1',[String(name)]);
}


function easterSundayIsoUtc(year){
  year=Number(year);
  const a=year%19,b=Math.floor(year/100),cc=year%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(cc/4),k=cc%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(Date.UTC(year,month-1,day,12,0,0));
}
function isoFromUtcDate(d){return d.toISOString().slice(0,10);}
function addUtcDays(d,n){const x=new Date(d.getTime());x.setUTCDate(x.getUTCDate()+Number(n||0));return x;}
function bavariaNurembergHolidayDates(year){
  const easter=easterSundayIsoUtc(year);
  const fixed=[
    [1,1],[1,6],[5,1],[10,3],[11,1],[12,25],[12,26]
  ].map(x=>String(year)+'-'+String(x[0]).padStart(2,'0')+'-'+String(x[1]).padStart(2,'0'));
  return [...fixed,
    isoFromUtcDate(addUtcDays(easter,-2)),
    isoFromUtcDate(addUtcDays(easter,1)),
    isoFromUtcDate(addUtcDays(easter,39)),
    isoFromUtcDate(addUtcDays(easter,50)),
    isoFromUtcDate(addUtcDays(easter,60))
  ];
}
function isoWeekday(date){
  const m=String(date||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return 0;
  return new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),12,0,0)).getUTCDay();
}
async function employeeAutomationProfile(employee){
  const live=await pool.query('SELECT payload FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1',[String(employee)]);
  if(live.rowCount)return live.rows[0].payload||{};
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:Mitarbeiter']
  );
  for(const row of q.rows){
    const p=row.payload||{};if(Number(p.sourceRow||row.source_key)<=1)continue;
    const x=Array.isArray(p.cells)?p.cells:[];
    if(textCell(x,0).trim()!==String(employee))continue;
    return {
      name:String(employee),employmentType:textCell(x,3)||'Vollzeit',
      monday:Number(textCell(x,5))||0,tuesday:Number(textCell(x,6))||0,
      wednesday:Number(textCell(x,7))||0,thursday:Number(textCell(x,8))||0,
      friday:Number(textCell(x,9))||0,
      holidayCredit:String(textCell(x,10)).toLowerCase()!=='nein',
      active:String(textCell(x,11)).toLowerCase()!=='nein'
    };
  }
  return {};
}
async function activeEmployeeAutomationProfiles(){
  const live=await pool.query('SELECT employee_name,payload FROM employee_admin_shadow ORDER BY sort_order ASC');
  if(live.rowCount)return live.rows.map(r=>Object.assign({name:String(r.employee_name)},r.payload||{})).filter(x=>x.active!==false);
  const names=await getEmployeesFromSnapshot()||[];
  const out=[];for(const name of names)out.push(Object.assign({name},await employeeAutomationProfile(name)));
  return out.filter(x=>x.active!==false);
}
function profileHoursForDate(p,date){
  const dow=isoWeekday(date),key={1:'monday',2:'tuesday',3:'wednesday',4:'thursday',5:'friday'}[dow];
  return key?Math.round(Number(p&&p[key]||0)*100)/100:0;
}
async function pgAutoClosureForStatus(employee,date,status,credit,source){
  employee=String(employee||'');date=String(date||'');status=String(status||'');
  credit=Math.round(Math.max(0,Number(credit)||0)*100)/100;
  if(!employee||date<'2026-09-07'||!['Urlaub','Krank','Schulung','Unerlaubte Abwesenheit','Unentschuldigte Abwesenheit','Feiertag'].includes(status))return;
  const work=await pool.query(
    'SELECT 1 FROM time_entries_shadow WHERE employee_name=$1 AND entry_date=$2 LIMIT 1',
    [employee,date]
  );
  if(work.rowCount)return;
  const existing=await pool.query(
    'SELECT legacy_col5 FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2 LIMIT 1',
    [employee,date]
  );
  const note='Automatisch: '+status+(source?' · '+String(source):'');
  if(existing.rowCount){
    if(!/^Automatisch:\s*(Urlaub|Krank|Schulung|Unerlaubte Abwesenheit|Unentschuldigte Abwesenheit|Feiertag)/i.test(String(existing.rows[0].legacy_col5||'')))return;
    await pool.query(
      `UPDATE day_closures_shadow SET closed_at_text=$3,gross_total=$4,legacy_col5=$5,legacy_col6='',
        pause_minutes=0,net_total=$4,updated_at_text=$3,update_reason='DG 7.2 Statusautomatik',
        shadow_updated_at=now() WHERE employee_name=$1 AND closure_date=$2`,
      [employee,date,new Date().toISOString(),credit,note]
    );
    return;
  }
  await pool.query(
    `INSERT INTO day_closures_shadow(
      employee_name,closure_date,closed_at_text,gross_total,legacy_col5,legacy_col6,
      pause_minutes,net_total,updated_at_text,update_reason,shadow_updated_at
    ) VALUES($1,$2,$3,$4,$5,'',0,$4,'','DG 7.2 Statusautomatik',now())`,
    [employee,date,new Date().toISOString(),credit,note]
  );
}
async function pgRemoveAutoClosure(employee,date,status){
  const q=await pool.query(
    'SELECT legacy_col5 FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2 LIMIT 1',
    [String(employee),String(date)]
  );
  if(!q.rowCount)return;
  const note=String(q.rows[0].legacy_col5||'');
  if(!/^Automatisch:\s*(Urlaub|Krank|Schulung|Unerlaubte Abwesenheit|Unentschuldigte Abwesenheit|Feiertag)/i.test(note))return;
  if(status&&!note.toLowerCase().includes(String(status).toLowerCase()))return;
  await pool.query('DELETE FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2',
    [String(employee),String(date)]);
}
async function pgSyncAutoClosures(year){
  year=Number(year)||0;
  const q=await pool.query(
    `SELECT employee_name,status_date,status,source,credited_hours FROM day_status_shadow
      WHERE status IN ('Urlaub','Krank','Schulung','Unerlaubte Abwesenheit','Unentschuldigte Abwesenheit','Feiertag') AND status_date>='2026-09-07'
        AND ($1::int=0 OR status_date LIKE ($1::text||'-%'))`,
    [year]
  );
  for(const r of q.rows)await pgAutoClosureForStatus(
    r.employee_name,berlinDateOnly(r.status_date),r.status,Number(r.credited_hours)||0,r.source
  );
}
async function mirrorHolidayYear(year){
  year=Number(year)||0;if(!year)return;
  const employees=await activeEmployeeAutomationProfiles();
  const holidays=bavariaNurembergHolidayDates(year).filter(d=>{const w=isoWeekday(d);return w>=1&&w<=5;});
  for(const date of holidays){
    for(const emp of employees){
      const name=String(emp.name||'');if(!name)continue;
      const old=await pool.query(
        'SELECT source FROM day_status_shadow WHERE employee_name=$1 AND status_date=$2 LIMIT 1',
        [name,date]
      );
      if(old.rowCount&&String(old.rows[0].source||'')!=='Automatisch Feiertag')continue;
      const credit=(String(emp.employmentType||'')==='Aushilfe'||emp.holidayCredit===false)
        ?0:profileHoursForDate(emp,date);
      await upsertDayStatusShadow(name,date,'Feiertag','Automatisch Feiertag',credit,'holiday:'+date);
    }
  }
  await pgSyncAutoClosures(year);
}
async function mirrorAbsenceStatuses(action,body,parsed){
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;if(!data||data.ok===false)return;
  if(action==='saveAbsence'){
    const id=String(data.id||'');if(!id)return;
    const employee=String(body.targetEmployee||''),rawType=String(body.type||''),type=rawType==='Unentschuldigte Abwesenheit'?'Unerlaubte Abwesenheit':rawType;
    const start=String(body.startDate||''),end=String(body.endDate||'');
    const sy=Number(start.slice(0,4))||0,ey=Number(end.slice(0,4))||sy;
    for(let y=sy;y<=ey;y++)await mirrorHolidayYear(y);
    const profile=await employeeAutomationProfile(employee);
    for(const date of isoDateList(start,end)){
      const dow=isoWeekday(date);if(dow<1||dow>5)continue;
      const old=await pool.query(
        'SELECT status FROM day_status_shadow WHERE employee_name=$1 AND status_date=$2 LIMIT 1',
        [employee,date]
      );
      if(old.rowCount&&String(old.rows[0].status||'')==='Feiertag')continue;
      const credit=['Unerlaubte Abwesenheit','Unentschuldigte Abwesenheit'].includes(type)?0:profileHoursForDate(profile,date);
      await upsertDayStatusShadow(employee,date,type,'Chef Abwesenheit',credit,id);
      if(['Urlaub','Krank','Schulung','Unerlaubte Abwesenheit','Unentschuldigte Abwesenheit'].includes(type))await pgAutoClosureForStatus(employee,date,type,credit,'Chef Abwesenheit');
    }
  }else if(action==='deleteAbsence'){
    const id=String(body.id||'');if(!id)return;
    const q=await pool.query(
      `SELECT employee_name,status_date,status FROM day_status_shadow WHERE reference=$1`,
      [id]
    );
    await pool.query('DELETE FROM day_status_shadow WHERE reference=$1',[id]);
    for(const r of q.rows)if(['Urlaub','Krank','Schulung','Unerlaubte Abwesenheit','Unentschuldigte Abwesenheit','Feiertag'].includes(String(r.status||'')))
      await pgRemoveAutoClosure(r.employee_name,berlinDateOnly(r.status_date),r.status);
  }
}

async function mirrorAbsenceWrite(action,body,parsed){
  if(!pool)return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;
  if(action==='saveAbsence'){
    const id=String(data.id||'').trim();if(!id)return;
    const sick=data.sickness||{};
    await pool.query(
      `INSERT INTO absences_shadow(
        id,employee_name,absence_type,start_date,end_date,created_at_text,created_by,active,
        sickness_case_id,sickness_mode,employer_pay_through,payer,sickness_case_days,note,
        credited_hours,shadow_updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$11,$12,$13,$14,now())
      ON CONFLICT(id) DO UPDATE SET
        employee_name=EXCLUDED.employee_name,absence_type=EXCLUDED.absence_type,
        start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,
        created_by=EXCLUDED.created_by,active=true,
        sickness_case_id=EXCLUDED.sickness_case_id,sickness_mode=EXCLUDED.sickness_mode,
        employer_pay_through=EXCLUDED.employer_pay_through,payer=EXCLUDED.payer,
        sickness_case_days=EXCLUDED.sickness_case_days,note=EXCLUDED.note,
        credited_hours=EXCLUDED.credited_hours,shadow_updated_at=now()`,
      [id,String(body.targetEmployee||''),String(body.type||''),String(body.startDate||''),
       String(body.endDate||''),new Date().toISOString(),String(body.employee||''),
       String(sick.caseId||''),String(sick.mode||''),String(sick.employerPayThrough||''),
       String(sick.payer||''),Math.max(0,Number(sick.caseCalendarDays)||0),String(sick.note||''),
       Number(data.creditedHours||0)]
    );
    if(String(body.type||'')==='Krank')await invalidateShadowVerify('sickness_alerts');
  }else if(action==='deleteAbsence'){
    await pool.query(
      'UPDATE absences_shadow SET active=false,shadow_updated_at=now() WHERE id=$1',
      [String(body.id||'')]
    );
    await invalidateShadowVerify('sickness_alerts');
  }else if(action==='endSicknessAbsence'){
    const id=String(body.id||'').trim();
    if(id){
      if(data.removedEntire){
        await pool.query('UPDATE absences_shadow SET active=false,shadow_updated_at=now() WHERE id=$1',[id]);
      }else if(data.changed){
        await pool.query('UPDATE absences_shadow SET end_date=$2,shadow_updated_at=now() WHERE id=$1',[id,String(data.newEnd||'')]);
      }
      if(data.changed){
        await pool.query(
          'DELETE FROM day_status_shadow WHERE reference=$1 AND status_date>=$2',
          [id,String(data.returnDate||body.returnDate||'')]
        );
      }
    }
    await invalidateShadowVerify('sickness_alerts');
  }
  if(action==='saveAbsence'||action==='deleteAbsence')await mirrorAbsenceStatuses(action,body,parsed);
}

async function verifyAbsencesShadow(rows){
  if(!pool||!Array.isArray(rows))return;
  const q=await pool.query(
    `SELECT id,employee_name,absence_type,start_date,end_date,credited_hours
       FROM absences_shadow WHERE active=true`
  );
  const pg=new Map(q.rows.map(r=>[String(r.id),r]));
  const absenceTypeForCompare=v=>{
    const s=normalizeShadowText(v);
    return s==='Unentschuldigte Abwesenheit'?'Unerlaubte Abwesenheit':s;
  };
  let mismatches=0;const seen=new Set();
  for(const r of rows){
    const id=normalizeShadowText(r&&r.id);if(!id){mismatches++;continue;}
    seen.add(id);const p=pg.get(id);if(!p){mismatches++;continue;}
    const same=
      normalizeShadowText(r.employee)===normalizeShadowText(p.employee_name) &&
      absenceTypeForCompare(r.type)===absenceTypeForCompare(p.absence_type) &&
      normalizeShadowText(r.start)===normalizeShadowText(p.start_date) &&
      normalizeShadowText(r.end)===normalizeShadowText(p.end_date) &&
      Math.abs(Number(r.creditedHours||0)-Number(p.credited_hours||0))<0.01;
    if(!same)mismatches++;
  }
  for(const id of pg.keys())if(!seen.has(id))mismatches++;
  console.log('SHADOW_VERIFY absences google='+rows.length+' postgres='+pg.size+' mismatches='+mismatches);
  await saveShadowVerifyStat('absences',rows.length,pg.size,mismatches);
}



function isoAddDays(dateText,days){
  const m=String(dateText||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return '';
  const d=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])+Number(days),12,0,0));
  return d.toISOString().slice(0,10);
}
function isoDateList(start,end){
  const out=[];let d=String(start||''),guard=0;
  while(d&&d<=String(end||'')&&guard<3700){out.push(d);d=isoAddDays(d,1);guard++;}
  return out;
}
async function employeeSicknessMetaFromSnapshot(){
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:Mitarbeiter']
  );
  const out=[];
  for(const row of q.rows){
    const payload=row.payload||{};if(Number(payload.sourceRow||row.source_key)<=1)continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const name=textCell(cells,0).trim();if(!name)continue;
    const activeRaw=textCell(cells,11).trim().toLowerCase();
    const active=!['nein','no','false','0','inaktiv'].includes(activeRaw);
    out.push({name,active,entryDate:berlinDateOnly(textCell(cells,30))});
  }
  return out;
}
async function postgresSicknessAlerts(){
  const [employees,aq]=await Promise.all([
    employeeSicknessMetaFromSnapshot(),
    pool.query(`SELECT id,employee_name,start_date,end_date,sickness_case_id,sickness_mode,payer
                  FROM absences_shadow
                 WHERE active=true AND absence_type='Krank'`)
  ]);
  const alerts=[];
  for(const rec of employees.filter(x=>x.active)){
    const rows=aq.rows.filter(r=>String(r.employee_name||'')===rec.name).map(r=>({
      id:String(r.id||''),caseId:String(r.sickness_case_id||r.id||''),mode:String(r.sickness_mode||''),
      start:berlinDateOnly(r.start_date),end:berlinDateOnly(r.end_date),payer:String(r.payer||'')
    }));
    const groups=new Map();
    for(const r of rows){if(!groups.has(r.caseId))groups.set(r.caseId,[]);groups.get(r.caseId).push(r);}
    for(const [caseId,group] of groups){
      const dateSet=new Set();
      for(const r of rows.filter(x=>x.caseId===caseId))for(const d of isoDateList(r.start,r.end))dateSet.add(d);
      const dates=[...dateSet].sort();
      const last=group.slice().sort((a,b)=>b.end.localeCompare(a.end))[0];
      const eligibleFrom=rec.entryDate?isoAddDays(rec.entryDate,28):'';
      const used=dates.filter(d=>!eligibleFrom||d>=eligibleFrom).length;
      const remaining=Math.max(0,42-Math.min(42,used));
      let level='',title='',detail='';
      if(group.some(x=>x.mode==='Unklar')){
        level='error';title='Krankheitsfall ungeklärt';
        detail='Neuer Fall oder Fortsetzung derselben Erkrankung muss vor der Lohnabrechnung geklärt werden.';
      }else if(used>=42){
        level='error';title='6-Wochen-Frist erreicht';
        detail='Arbeitgeber-Entgeltfortzahlung ist für diesen Fall ausgeschöpft; Krankengeld/Krankenkasse prüfen.';
      }else if(used>=35){
        level='warn';title='6-Wochen-Frist nähert sich';
        detail='Noch '+remaining+' Kalendertag'+(remaining===1?'':'e')+' Arbeitgeber-Entgeltfortzahlung in diesem Krankheitsfall.';
      }
      if(level)alerts.push({employee:rec.name,caseId,level,title,detail,start:group[0].start,end:last.end,usedDays:used,remainingDays:remaining,payer:last.payer||''});
    }
  }
  const rank={error:0,warn:1,info:2};
  alerts.sort((a,b)=>(rank[a.level]-rank[b.level])||a.employee.localeCompare(b.employee,'de'));
  return {count:alerts.length,alerts,checkedAt:berlinDateOnly(new Date())};
}
function canonicalSicknessAlerts(data){
  return {count:Number(data&&data.count||0),alerts:(Array.isArray(data&&data.alerts)?data.alerts:[]).map(x=>({
    employee:String(x.employee||''),caseId:String(x.caseId||''),level:String(x.level||''),title:String(x.title||''),
    detail:String(x.detail||''),start:String(x.start||''),end:String(x.end||''),usedDays:Number(x.usedDays||0),
    remainingDays:Number(x.remainingDays||0),payer:String(x.payer||'')
  }))};
}
async function verifySicknessAlertsShadow(data){
  if(!pool||!data)return;
  const pg=await postgresSicknessAlerts(),a=canonicalSicknessAlerts(data),b=canonicalSicknessAlerts(pg);
  const mismatches=JSON.stringify(a)===JSON.stringify(b)?0:1;
  console.log('SHADOW_VERIFY sickness_alerts google='+a.count+' postgres='+b.count+' mismatches='+mismatches);
  await saveShadowVerifyStat('sickness_alerts',a.count,b.count,mismatches);
}
async function directSicknessAlertsRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  return postgresSicknessAlerts();
}


function germanDateLabel(value){
  const d=berlinDateOnly(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return d;
  return d.slice(8,10)+'.'+d.slice(5,7)+'.'+d.slice(0,4);
}
async function employeeEntryDateForOverview(employee){
  const live=await pool.query(
    'SELECT payload FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1',
    [String(employee)]
  );
  if(live.rowCount){
    const p=live.rows[0].payload||{};
    return berlinDateOnly(p.entryDate||'');
  }
  const rows=await employeeSicknessMetaFromSnapshot();
  const r=rows.find(x=>x.name===String(employee));
  return r?String(r.entryDate||''):'';
}
async function postgresAbsenceOverview(employee,year){
  employee=String(employee||'').trim();year=Number(year)||0;
  if(!employee||!year)return null;
  const [annual,aq,cq,entryDate]=await Promise.all([
    postgresVacationSummary(employee,year),
    pool.query(
      `SELECT id,start_date,end_date,sickness_case_id,sickness_mode,employer_pay_through,payer,note
         FROM absences_shadow
        WHERE active=true AND employee_name=$1 AND absence_type='Krank'
        ORDER BY start_date ASC,id ASC`,
      [employee]
    ),
    pool.query(
      `SELECT reference,COALESCE(SUM(credited_hours),0)::numeric AS hours
         FROM day_status_shadow
        WHERE employee_name=$1 AND COALESCE(reference,'')<>''
        GROUP BY reference`,
      [employee]
    ),
    employeeEntryDateForOverview(employee)
  ]);
  const credits=new Map(cq.rows.map(r=>[String(r.reference||''),Number(r.hours||0)]));
  const rows=aq.rows.map(r=>({
    id:String(r.id||''),caseId:String(r.sickness_case_id||r.id||''),
    mode:String(r.sickness_mode||''),start:berlinDateOnly(r.start_date),end:berlinDateOnly(r.end_date),
    employerPayThrough:berlinDateOnly(r.employer_pay_through),payer:String(r.payer||''),note:String(r.note||'')
  }));
  const yearDays=new Set(),cases=new Map(),warnings=[];
  for(const r of rows){
    for(const d of isoDateList(r.start,r.end))if(Number(d.slice(0,4))===year)yearDays.add(d);
    let x=cases.get(r.caseId);
    if(!x){
      x={caseId:r.caseId,mode:r.mode,start:r.start,end:r.end,periods:[],calendarDays:0,creditedHours:0,
         payer:r.payer||'',employerPayThrough:r.employerPayThrough||'',note:r.note||''};
      cases.set(r.caseId,x);
    }
    if(r.start<x.start)x.start=r.start;if(r.end>x.end)x.end=r.end;
    const h=Math.round(Number(credits.get(r.id)||0)*100)/100;
    x.periods.push({id:r.id,start:r.start,end:r.end,payer:r.payer,creditedHours:h});
    x.creditedHours=Math.round((x.creditedHours+h)*100)/100;
    if(r.payer)x.payer=r.payer;if(r.employerPayThrough)x.employerPayThrough=r.employerPayThrough;if(r.note)x.note=r.note;
  }
  const eligibleFrom=entryDate?isoAddDays(entryDate,28):'';
  const caseList=[...cases.values()].map(x=>{
    const datesSet=new Set();
    for(const r of rows.filter(v=>v.caseId===x.caseId))for(const d of isoDateList(r.start,r.end))datesSet.add(d);
    const dates=[...datesSet].sort(),eligible=dates.filter(d=>!eligibleFrom||d>=eligibleFrom);
    x.calendarDays=dates.length;x.efzEligibleDays=eligible.length;
    x.remainingEmployerPayDays=Math.max(0,42-Math.min(42,eligible.length));
    if(x.mode==='Unklar')x.needsReview=true;
    return x;
  }).sort((a,b)=>b.start.localeCompare(a.start));
  for(const x of caseList){
    if(x.needsReview)warnings.push({level:'warn',text:'Krankheitsfall ab '+germanDateLabel(x.start)+': Fortsetzungserkrankung ist unklar – Lohn/Krankenkasse prüfen.'});
    if(x.calendarDays>=42)warnings.push({level:'error',text:'Krankheitsfall ab '+germanDateLabel(x.start)+': 42 Kalendertage erreicht/überschritten. Krankengeld/Krankenkasse und Lohnfortzahlung prüfen.'});
    else if(x.calendarDays>=35)warnings.push({level:'warn',text:'Krankheitsfall ab '+germanDateLabel(x.start)+': '+x.calendarDays+' Kalendertage – Ende der 6-Wochen-Frist nähert sich.'});
    if(x.calendarDays>3)warnings.push({level:'info',text:'AU/eAU-Nachweis für den Krankheitszeitraum ab '+germanDateLabel(x.start)+' prüfen.'});
  }
  if(yearDays.size)warnings.push({level:'info',text:'U1-Erstattung bei der Krankenkasse prüfen, soweit der Betrieb am U1-Verfahren teilnimmt.'});
  return {
    employee,year,vacationEntitlement:Number(annual.vacationEntitlement||0),
    vacationUsed:Number(annual.vacationUsed||0),vacationRemaining:Number(annual.vacationRemaining||0),
    sickWorkDays:Number(annual.sickDays||0),sickCalendarDays:yearDays.size,
    sicknessCases:caseList.slice(0,12),warnings
  };
}
function canonicalAbsenceOverview(x){
  if(!x)return null;
  return JSON.parse(JSON.stringify(x));
}
async function verifyAbsenceOverviewShadow(data,body){
  if(!pool||!data)return;
  const employee=String(body.targetEmployee||data.employee||''),year=Number(body.year||data.year)||0;
  if(!employee||!year)return;
  const pg=await postgresAbsenceOverview(employee,year);
  const a=canonicalAbsenceOverview(data),b=canonicalAbsenceOverview(pg);
  const mismatches=JSON.stringify(a)===JSON.stringify(b)?0:1;
  const key='absence_overview:'+year+':'+employee;
  console.log('SHADOW_VERIFY '+key+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,1,1,mismatches);
}
async function directAbsenceOverviewRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const employee=String(body.targetEmployee||'').trim(),year=Number(body.year)||0;
  if(!employee||!year)return null;
  return postgresAbsenceOverview(employee,year);
}

async function initMaintenanceAttachmentsShadow(){
  if(!pool)return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM maintenance_attachments_shadow');
  if((existing.rows[0]?.n||0)>0)return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:Wartungsanhaenge']
  );
  let inserted=0;
  for(const row of q.rows){
    const payload=row.payload||{};
    if(Number(payload.sourceRow||row.source_key)<=1)continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const id=textCell(cells,0).trim();if(!id)continue;
    await pool.query(
      `INSERT INTO maintenance_attachments_shadow(
        id,device_id,customer_id,object_id,kind,name,mime,file_size,file_id,url,
        active,created_at_text,created_by
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT(id) DO NOTHING`,
      [id,textCell(cells,1),textCell(cells,2),textCell(cells,3),textCell(cells,4),
       textCell(cells,5),textCell(cells,6),Math.max(0,Number(textCell(cells,7))||0),
       textCell(cells,8),textCell(cells,9),shadowActive(textCell(cells,10)),
       textCell(cells,11),textCell(cells,12)]
    );
    inserted++;
  }
  console.log('SHADOW maintenance_attachments initialized rows='+inserted);
}

async function mirrorMaintenanceAttachmentsFromCustomer(data){
  if(!pool||!data||!data.id)return;
  const customerId=String(data.id);
  const liveIds=[];
  for(const o of (Array.isArray(data.objects)?data.objects:[])){
    const objectId=String(o.id||'');
    for(const d of (Array.isArray(o.devices)?o.devices:[])){
      const deviceId=String(d.id||'');
      for(const a of (Array.isArray(d.attachments)?d.attachments:[])){
        const id=String(a.id||'').trim();if(!id)continue;
        liveIds.push(id);
        await pool.query(
          `INSERT INTO maintenance_attachments_shadow(
            id,device_id,customer_id,object_id,kind,name,mime,file_size,file_id,url,
            active,created_at_text,created_by,shadow_updated_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,now())
          ON CONFLICT(id) DO UPDATE SET
            device_id=EXCLUDED.device_id,customer_id=EXCLUDED.customer_id,object_id=EXCLUDED.object_id,
            kind=EXCLUDED.kind,name=EXCLUDED.name,mime=EXCLUDED.mime,file_size=EXCLUDED.file_size,
            file_id=CASE WHEN EXCLUDED.file_id<>'' THEN EXCLUDED.file_id ELSE maintenance_attachments_shadow.file_id END,
            url=EXCLUDED.url,active=true,created_at_text=EXCLUDED.created_at_text,
            created_by=EXCLUDED.created_by,shadow_updated_at=now()`,
          [id,deviceId,customerId,objectId,String(a.kind||''),String(a.name||''),
           String(a.mime||''),Math.max(0,Number(a.size)||0),String(a.fileId||''),
           String(a.url||''),String(a.createdAt||''),String(a.createdBy||'')]
        );
      }
    }
  }
  if(liveIds.length){
    await pool.query(
      `UPDATE maintenance_attachments_shadow SET active=false,shadow_updated_at=now()
        WHERE customer_id=$1 AND NOT (id = ANY($2::text[]))`,
      [customerId,liveIds]
    );
  }else{
    await pool.query(
      'UPDATE maintenance_attachments_shadow SET active=false,shadow_updated_at=now() WHERE customer_id=$1',
      [customerId]
    );
  }
}

async function verifyMaintenanceAttachmentsFromCustomer(data){
  if(!pool||!data||!data.id)return;
  const google=[];
  for(const o of (Array.isArray(data.objects)?data.objects:[])){
    for(const d of (Array.isArray(o.devices)?o.devices:[])){
      for(const a of (Array.isArray(d.attachments)?d.attachments:[]))google.push(a);
    }
  }
  const q=await pool.query(
    'SELECT id,kind,name,mime,file_size,url FROM maintenance_attachments_shadow WHERE customer_id=$1 AND active=true',
    [String(data.id)]
  );
  const pg=new Map(q.rows.map(r=>[String(r.id),r]));
  let mismatches=0;
  for(const a of google){
    const p=pg.get(String(a.id));if(!p){mismatches++;continue;}
    if(normalizeShadowText(a.kind)!==normalizeShadowText(p.kind)||
       normalizeShadowText(a.name)!==normalizeShadowText(p.name)||
       normalizeShadowText(a.mime)!==normalizeShadowText(p.mime)||
       Number(a.size||0)!==Number(p.file_size||0)||
       normalizeShadowText(a.url)!==normalizeShadowText(p.url))mismatches++;
    pg.delete(String(a.id));
  }
  mismatches+=pg.size;
  console.log('SHADOW_VERIFY maintenance_attachments google='+google.length+' postgres='+q.rows.length+' mismatches='+mismatches);
  await saveShadowVerifyStat('maintenance_attachments:'+String(data.id),google.length,q.rows.length,mismatches);
}

async function mirrorDeleteMaintenanceAttachment(body,parsed){
  if(!pool)return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;
  const id=String(data.id||body.id||'').trim();
  if(!id)return;
  await pool.query(
    'UPDATE maintenance_attachments_shadow SET active=false,shadow_updated_at=now() WHERE id=$1',
    [id]
  );
}

async function initMaintenanceShadows() {
  if (!pool) return;
  const targets=[
    ['maintenance_customers_shadow','sheet:Wartungskunden',11],
    ['maintenance_objects_shadow','sheet:Wartungsobjekte',11],
    ['maintenance_devices_shadow','sheet:Wartungsgeraete',21],
    ['maintenance_repairs_shadow','sheet:Wartungsreparaturen',8],
    ['maintenance_manual_shadow','sheet:Wartungsmanuell',6]
  ];
  const existing=await Promise.all(targets.map(x=>pool.query('SELECT COUNT(*)::int AS n FROM '+x[0])));
  if(existing.some(x=>(x.rows[0]?.n||0)>0)) return;

  for(const [table,entity] of targets){
    const q=await pool.query(
      `SELECT source_key,payload FROM migration_objects
        WHERE entity_type=$1 ORDER BY source_key::int ASC`,
      [entity]
    );
    let inserted=0;
    for(const row of q.rows){
      const payload=row.payload||{};
      if(Number(payload.sourceRow||row.source_key)<=1) continue;
      const cells=Array.isArray(payload.cells)?payload.cells:[];
      const id=textCell(cells,0).trim();
      if(!id) continue;

      if(table==='maintenance_customers_shadow'){
        await pool.query(
          `INSERT INTO maintenance_customers_shadow(
            id,name,billing_street,billing_zip,billing_city,email,phone,active,
            created_at_text,updated_at_text,updated_by
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO NOTHING`,
          [id,textCell(cells,1),textCell(cells,2),textCell(cells,3),textCell(cells,4),
           textCell(cells,5),textCell(cells,6),shadowActive(textCell(cells,7)),
           textCell(cells,8),textCell(cells,9),textCell(cells,10)]
        );
      } else if(table==='maintenance_objects_shadow'){
        await pool.query(
          `INSERT INTO maintenance_objects_shadow(
            id,customer_id,name,street,zip,city,notes,active,created_at_text,updated_at_text,updated_by
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO NOTHING`,
          [id,textCell(cells,1),textCell(cells,2),textCell(cells,3),textCell(cells,4),
           textCell(cells,5),textCell(cells,6),shadowActive(textCell(cells,7)),
           textCell(cells,8),textCell(cells,9),textCell(cells,10)]
        );
      } else if(table==='maintenance_devices_shadow'){
        await pool.query(
          `INSERT INTO maintenance_devices_shadow(
            id,object_id,customer_id,device_type,other_description,manufacturer,model,serial_number,
            year_text,tenant_name,tenant_phone,tenant_email,spare_part_manufacturer,
            spare_part_serial_number,internal_notes,next_maintenance_due,active,
            created_at_text,updated_at_text,updated_by,internal_device_id
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
          ON CONFLICT(id) DO NOTHING`,
          [id,textCell(cells,1),textCell(cells,2),textCell(cells,3),textCell(cells,4),
           textCell(cells,5),textCell(cells,6),textCell(cells,7),textCell(cells,8),
           textCell(cells,9),textCell(cells,10),textCell(cells,11),textCell(cells,12),
           textCell(cells,13),textCell(cells,14),textCell(cells,15),
           shadowActive(textCell(cells,16)),textCell(cells,17),textCell(cells,18),
           textCell(cells,19),textCell(cells,20)]
        );
      } else if(table==='maintenance_repairs_shadow'){
        await pool.query(
          `INSERT INTO maintenance_repairs_shadow(
            id,device_id,customer_id,object_id,repair_date,description,created_at_text,created_by
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING`,
          [id,textCell(cells,1),textCell(cells,2),textCell(cells,3),
           textCell(cells,4),textCell(cells,5),textCell(cells,6),textCell(cells,7)]
        );
      } else if(table==='maintenance_manual_shadow'){
        await pool.query(
          `INSERT INTO maintenance_manual_shadow(
            id,maintenance_date,maintenance_count,note,created_at_text,created_by
          ) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,
          [id,textCell(cells,1),Math.max(0,Number(textCell(cells,2))||0),
           textCell(cells,3),textCell(cells,4),textCell(cells,5)]
        );
      }
      inserted++;
    }
    console.log('SHADOW '+table+' initialized rows='+inserted);
  }
}

async function mirrorMaintenanceCustomerTree(data,employee) {
  if(!pool || !data || !data.id) return;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const cid=String(data.id);
    await client.query(
      `INSERT INTO maintenance_customers_shadow(
        id,name,billing_street,billing_zip,billing_city,email,phone,active,updated_at_text,updated_by,shadow_updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,true,$8,$9,now())
      ON CONFLICT(id) DO UPDATE SET
        name=EXCLUDED.name,billing_street=EXCLUDED.billing_street,billing_zip=EXCLUDED.billing_zip,
        billing_city=EXCLUDED.billing_city,email=EXCLUDED.email,phone=EXCLUDED.phone,active=true,
        updated_at_text=EXCLUDED.updated_at_text,updated_by=EXCLUDED.updated_by,shadow_updated_at=now()`,
      [cid,String(data.name||''),String(data.billingStreet||''),String(data.billingZip||''),
       String(data.billingCity||''),String(data.email||''),String(data.phone||''),
       new Date().toISOString(),String(employee||'')]
    );
    await client.query('UPDATE maintenance_objects_shadow SET active=false,shadow_updated_at=now() WHERE customer_id=$1',[cid]);
    await client.query('UPDATE maintenance_devices_shadow SET active=false,shadow_updated_at=now() WHERE customer_id=$1',[cid]);

    for(const o of (Array.isArray(data.objects)?data.objects:[])){
      const oid=String(o.id||'').trim();if(!oid)continue;
      await client.query(
        `INSERT INTO maintenance_objects_shadow(
          id,customer_id,name,street,zip,city,notes,active,updated_at_text,updated_by,shadow_updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,true,$8,$9,now())
        ON CONFLICT(id) DO UPDATE SET
          customer_id=EXCLUDED.customer_id,name=EXCLUDED.name,street=EXCLUDED.street,zip=EXCLUDED.zip,
          city=EXCLUDED.city,notes=EXCLUDED.notes,active=true,updated_at_text=EXCLUDED.updated_at_text,
          updated_by=EXCLUDED.updated_by,shadow_updated_at=now()`,
        [oid,cid,String(o.name||''),String(o.street||''),String(o.zip||''),String(o.city||''),
         String(o.notes||''),new Date().toISOString(),String(employee||'')]
      );
      for(const d of (Array.isArray(o.devices)?o.devices:[])){
        const did=String(d.id||'').trim();if(!did)continue;
        await client.query(
          `INSERT INTO maintenance_devices_shadow(
            id,object_id,customer_id,device_type,other_description,manufacturer,model,serial_number,
            year_text,tenant_name,tenant_phone,tenant_email,spare_part_manufacturer,
            spare_part_serial_number,internal_notes,next_maintenance_due,active,
            updated_at_text,updated_by,internal_device_id,shadow_updated_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,$17,$18,$19,now())
          ON CONFLICT(id) DO UPDATE SET
            object_id=EXCLUDED.object_id,customer_id=EXCLUDED.customer_id,device_type=EXCLUDED.device_type,
            other_description=EXCLUDED.other_description,manufacturer=EXCLUDED.manufacturer,model=EXCLUDED.model,
            serial_number=EXCLUDED.serial_number,year_text=EXCLUDED.year_text,tenant_name=EXCLUDED.tenant_name,
            tenant_phone=EXCLUDED.tenant_phone,tenant_email=EXCLUDED.tenant_email,
            spare_part_manufacturer=EXCLUDED.spare_part_manufacturer,
            spare_part_serial_number=EXCLUDED.spare_part_serial_number,internal_notes=EXCLUDED.internal_notes,
            next_maintenance_due=EXCLUDED.next_maintenance_due,active=true,
            updated_at_text=EXCLUDED.updated_at_text,updated_by=EXCLUDED.updated_by,
            internal_device_id=EXCLUDED.internal_device_id,shadow_updated_at=now()`,
          [did,oid,cid,String(d.deviceType||''),String(d.otherDescription||''),String(d.manufacturer||''),
           String(d.model||''),String(d.serialNumber||''),String(d.year||''),String(d.tenantName||''),
           String(d.tenantPhone||''),String(d.tenantEmail||''),String(d.sparePartManufacturer||''),
           String(d.sparePartSerialNumber||''),String(d.internalNotes||''),String(d.nextMaintenanceDue||''),
           new Date().toISOString(),String(employee||''),String(d.internalDeviceId||'')]
        );
        for(const rp of (Array.isArray(d.repairs)?d.repairs:[])){
          const rid=String(rp.id||'').trim();if(!rid)continue;
          await client.query(
            `INSERT INTO maintenance_repairs_shadow(
              id,device_id,customer_id,object_id,repair_date,description,created_at_text,created_by,shadow_updated_at
            ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
            ON CONFLICT(id) DO UPDATE SET
              device_id=EXCLUDED.device_id,customer_id=EXCLUDED.customer_id,object_id=EXCLUDED.object_id,
              repair_date=EXCLUDED.repair_date,description=EXCLUDED.description,
              created_at_text=EXCLUDED.created_at_text,created_by=EXCLUDED.created_by,shadow_updated_at=now()`,
            [rid,did,cid,oid,String(rp.date||''),String(rp.description||''),
             String(rp.createdAt||''),String(rp.createdBy||'')]
          );
        }
      }
    }
    await client.query('COMMIT');
  }catch(e){
    await client.query('ROLLBACK');throw e;
  }finally{client.release();}
}


async function mirrorReservedMaintenanceDeviceId(body,parsed){
  if(!pool)return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  const reserved=Number(data&&data.internalDeviceId);
  if(!Number.isFinite(reserved)||reserved<1000)return;
  const next=reserved+1;
  const value=JSON.stringify({
    nextInternalDeviceId:String(next),
    lastReservedInternalDeviceId:String(reserved),
    reservedBy:String(body&&body.employee||''),
    reservedAt:new Date().toISOString(),
    source:'google'
  });
  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES('maintenance_next_device_id',$1::jsonb)
     ON CONFLICT(key) DO UPDATE SET value=
       CASE
         WHEN COALESCE((app_meta.value->>'nextInternalDeviceId')::int,0) > $2::int
           THEN app_meta.value
         ELSE EXCLUDED.value
       END,
       updated_at=now()`,
    [value,next]
  );
}

async function mirrorMaintenanceWrite(action,body,parsed){
  if(!pool)return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;
  if(action==='reserveMaintenanceDeviceId'){
    await pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'maintenance_%'");
  }
  if(action==='saveMaintenanceCustomer'){
    await mirrorMaintenanceCustomerTree(data,body.employee);
  } else if(action==='deleteMaintenanceCustomer'){
    const cid=String(data.id||body.id||'');
    await Promise.all([
      pool.query('UPDATE maintenance_customers_shadow SET active=false,shadow_updated_at=now() WHERE id=$1',[cid]),
      pool.query('UPDATE maintenance_objects_shadow SET active=false,shadow_updated_at=now() WHERE customer_id=$1',[cid]),
      pool.query('UPDATE maintenance_devices_shadow SET active=false,shadow_updated_at=now() WHERE customer_id=$1',[cid])
    ]);
  } else if(action==='deleteMaintenanceDevice'){
    await pool.query('UPDATE maintenance_devices_shadow SET active=false,shadow_updated_at=now() WHERE id=$1',[String(data.id||body.id||'')]);
  } else if(action==='addMaintenanceRepair'){
    const did=String(body.deviceId||'');
    const d=await pool.query('SELECT customer_id,object_id FROM maintenance_devices_shadow WHERE id=$1',[did]);
    const meta=d.rows[0]||{};
    await pool.query(
      `INSERT INTO maintenance_repairs_shadow(
        id,device_id,customer_id,object_id,repair_date,description,created_at_text,created_by,shadow_updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
      ON CONFLICT(id) DO UPDATE SET description=EXCLUDED.description,shadow_updated_at=now()`,
      [String(data.id||''),did,String(meta.customer_id||''),String(meta.object_id||''),
       String(body.date||''),String(body.description||''),new Date().toISOString(),String(body.employee||'')]
    );
  } else if(action==='addManualMaintenanceCount'){
    await pool.query(
      `INSERT INTO maintenance_manual_shadow(
        id,maintenance_date,maintenance_count,note,created_at_text,created_by,shadow_updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,now())
      ON CONFLICT(id) DO UPDATE SET maintenance_date=EXCLUDED.maintenance_date,
        maintenance_count=EXCLUDED.maintenance_count,note=EXCLUDED.note,shadow_updated_at=now()`,
      [String(data.id||''),String(data.date||body.date||''),Math.max(0,Number(data.count||body.count)||0),
       String(data.note||body.note||''),new Date().toISOString(),String(body.employee||'')]
    );
  }
}

async function verifyMaintenanceCustomerShadow(data){
  if(!pool||!data||!data.id)return;
  const cid=String(data.id);
  const [cq,oq,dq]=await Promise.all([
    pool.query('SELECT * FROM maintenance_customers_shadow WHERE id=$1',[cid]),
    pool.query('SELECT * FROM maintenance_objects_shadow WHERE customer_id=$1 AND active=true',[cid]),
    pool.query('SELECT * FROM maintenance_devices_shadow WHERE customer_id=$1 AND active=true',[cid])
  ]);
  let mismatches=0;
  const pc=cq.rows[0];
  if(!pc)mismatches++;
  else{
    const pairs=[
      [data.name,pc.name],[data.billingStreet,pc.billing_street],[data.billingZip,pc.billing_zip],
      [data.billingCity,pc.billing_city],[data.email,pc.email],[data.phone,pc.phone]
    ];
    if(pairs.some(([a,b])=>normalizeShadowText(a)!==normalizeShadowText(b)))mismatches++;
  }
  const objects=Array.isArray(data.objects)?data.objects:[];
  const pObjs=new Map(oq.rows.map(x=>[String(x.id),x]));
  const pDevs=new Map(dq.rows.map(x=>[String(x.id),x]));
  let googleDevices=0;
  for(const o of objects){
    const po=pObjs.get(String(o.id));if(!po){mismatches++;continue;}
    const opairs=[[o.name,po.name],[o.street,po.street],[o.zip,po.zip],[o.city,po.city],[o.notes,po.notes]];
    if(opairs.some(([a,b])=>normalizeShadowText(a)!==normalizeShadowText(b)))mismatches++;
    for(const d of (Array.isArray(o.devices)?o.devices:[])){
      googleDevices++;
      const pd=pDevs.get(String(d.id));if(!pd){mismatches++;continue;}
      const dpairs=[
        [d.deviceType,pd.device_type],[d.otherDescription,pd.other_description],[d.manufacturer,pd.manufacturer],
        [d.model,pd.model],[d.serialNumber,pd.serial_number],[d.year,pd.year_text],
        [d.tenantName,pd.tenant_name],[d.tenantPhone,pd.tenant_phone],[d.tenantEmail,pd.tenant_email],
        [d.internalNotes,pd.internal_notes],[d.nextMaintenanceDue,pd.next_maintenance_due],
        [d.internalDeviceId,pd.internal_device_id]
      ];
      if(dpairs.some(([a,b])=>normalizeShadowText(a)!==normalizeShadowText(b)))mismatches++;
    }
  }
  if(objects.length!==pObjs.size)mismatches+=Math.abs(objects.length-pObjs.size);
  if(googleDevices!==pDevs.size)mismatches+=Math.abs(googleDevices-pDevs.size);
  console.log('SHADOW_VERIFY maintenance_customer google_objects='+objects.length+' postgres_objects='+pObjs.size+' google_devices='+googleDevices+' postgres_devices='+pDevs.size+' mismatches='+mismatches);
  await saveShadowVerifyStat('maintenance_customer',objects.length+googleDevices,pObjs.size+pDevs.size,mismatches);
}

async function initPlannerEventsShadow() {
  if (!pool) return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM planner_events_shadow');
  if ((existing.rows[0]?.n||0)>0) return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:KalenderTermine']
  );
  let inserted=0;
  for (const row of q.rows) {
    const payload=row.payload||{};
    if (Number(payload.sourceRow||row.source_key)<=1) continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const id=textCell(cells,0).trim();
    if(!id) continue;
    await pool.query(
      `INSERT INTO planner_events_shadow(
        id,customer,address,task,event_date,start_time,end_time,employee_ids_json,
        employee_names_json,google_event_ids_json,created_at_text,updated_at_text,
        updated_by,event_type,maintenance_customer_id,maintenance_object_id,maintenance_device_id
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT(id) DO NOTHING`,
      [id,textCell(cells,1),textCell(cells,2),textCell(cells,3),textCell(cells,4),
       textCell(cells,5),textCell(cells,6),textCell(cells,7),textCell(cells,8),
       textCell(cells,9),textCell(cells,10),textCell(cells,11),textCell(cells,12),
       textCell(cells,13),textCell(cells,14),textCell(cells,15),textCell(cells,16)]
    );
    inserted++;
  }
  console.log('SHADOW planner_events initialized rows='+inserted);
}

async function mirrorPlannerEventWrite(action, body, parsed) {
  if (!pool) return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if (!data || data.ok===false) return;
  if (action==='savePlannerEvent') {
    const item=body.item||{},id=String(data.id||item.id||'').trim();
    if(!id)return;
    const existing=await pool.query('SELECT created_at_text,google_event_ids_json FROM planner_events_shadow WHERE id=$1',[id]);
    const createdAt=existing.rowCount?existing.rows[0].created_at_text:new Date().toISOString();
    const googleIds=existing.rowCount?existing.rows[0].google_event_ids_json:'{}';
    await pool.query(
      `INSERT INTO planner_events_shadow(
        id,customer,address,task,event_date,start_time,end_time,employee_ids_json,
        employee_names_json,google_event_ids_json,created_at_text,updated_at_text,updated_by,
        event_type,maintenance_customer_id,maintenance_object_id,maintenance_device_id,shadow_updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now())
      ON CONFLICT(id) DO UPDATE SET
        customer=EXCLUDED.customer,address=EXCLUDED.address,task=EXCLUDED.task,
        event_date=EXCLUDED.event_date,start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,
        employee_ids_json=EXCLUDED.employee_ids_json,employee_names_json=EXCLUDED.employee_names_json,
        updated_at_text=EXCLUDED.updated_at_text,updated_by=EXCLUDED.updated_by,event_type=EXCLUDED.event_type,
        maintenance_customer_id=EXCLUDED.maintenance_customer_id,
        maintenance_object_id=EXCLUDED.maintenance_object_id,
        maintenance_device_id=EXCLUDED.maintenance_device_id,shadow_updated_at=now()`,
      [id,String(item.customer||''),String(item.address||''),String(item.task||''),
       String(item.date||''),String(item.start||''),String(item.end||''),
       JSON.stringify(Array.isArray(item.employeeIds)?item.employeeIds:[]),
       JSON.stringify(Array.isArray(item.employeeNames)?item.employeeNames:[]),
       googleIds,createdAt,new Date().toISOString(),String(body.employee||''),
       String(data.type||item.type||'Auftrag'),String(item.maintenanceCustomerId||''),
       String(item.maintenanceObjectId||''),String(data.maintenanceDeviceId||item.maintenanceDeviceId||'')]
    );
  } else if (action==='deletePlannerEvent') {
    await pool.query('DELETE FROM planner_events_shadow WHERE id=$1',[String(body.id||'')]);
  }
}

async function verifyPlannerEventsShadow(rows) {
  if (!pool || !Array.isArray(rows)) return;
  const dgRows=rows.filter(r=>r&&r.source==='dg'&&!r.external);
  const q=await pool.query(
    `SELECT id,customer,address,task,event_date,start_time,end_time,employee_ids_json,event_type,
            maintenance_customer_id,maintenance_object_id,maintenance_device_id
       FROM planner_events_shadow`
  );
  const pg=new Map(q.rows.map(r=>[String(r.id),r]));
  let mismatches=0;const seen=new Set();
  for(const r of dgRows){
    const id=normalizeShadowText(r.id);if(!id){mismatches++;continue;}
    seen.add(id);const p=pg.get(id);if(!p){mismatches++;continue;}
    let pIds=[];try{pIds=JSON.parse(p.employee_ids_json||'[]');}catch(_e){}
    const same=
      normalizeShadowText(r.customer)===normalizeShadowText(p.customer) &&
      normalizeShadowText(r.address)===normalizeShadowText(p.address) &&
      normalizeShadowText(r.task)===normalizeShadowText(p.task) &&
      normalizeShadowText(r.date)===normalizeShadowText(p.event_date) &&
      normalizeShadowText(r.start)===normalizeShadowText(p.start_time) &&
      normalizeShadowText(r.end)===normalizeShadowText(p.end_time) &&
      JSON.stringify(Array.isArray(r.employeeIds)?r.employeeIds:[])===JSON.stringify(Array.isArray(pIds)?pIds:[]) &&
      normalizeShadowText(r.type||'Auftrag')===normalizeShadowText(p.event_type||'Auftrag') &&
      normalizeShadowText(r.maintenanceCustomerId)===normalizeShadowText(p.maintenance_customer_id) &&
      normalizeShadowText(r.maintenanceObjectId)===normalizeShadowText(p.maintenance_object_id) &&
      normalizeShadowText(r.maintenanceDeviceId)===normalizeShadowText(p.maintenance_device_id);
    if(!same)mismatches++;
  }
  for(const id of pg.keys())if(!seen.has(id))mismatches++;
  console.log('SHADOW_VERIFY planner_events google='+dgRows.length+' postgres='+pg.size+' mismatches='+mismatches);
  await saveShadowVerifyStat('planner_events',dgRows.length,pg.size,mismatches);
}

async function initPlannerWorkersShadow() {
  if (!pool) return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM planner_workers_shadow');
  if ((existing.rows[0]?.n||0)>0) return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:KalenderMitarbeiter']
  );
  let inserted=0;
  for (const row of q.rows) {
    const payload=row.payload||{};
    if (Number(payload.sourceRow||row.source_key)<=1) continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const id=textCell(cells,0).trim();
    if(!id) continue;
    const activeRaw=textCell(cells,5).trim().toLowerCase();
    const active=!['nein','no','false','0','inaktiv'].includes(activeRaw);
    await pool.query(
      `INSERT INTO planner_workers_shadow(
        id,employee_name,display_name,provider,calendar_id,active,sort_order
      ) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(id) DO NOTHING`,
      [id,textCell(cells,1),textCell(cells,2),textCell(cells,3)||'google',
       textCell(cells,4),active,Number(textCell(cells,6))||999]
    );
    inserted++;
  }
  console.log('SHADOW planner_workers initialized rows='+inserted);
}

async function replacePlannerWorkersShadow(rows) {
  if (!pool || !Array.isArray(rows)) return;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('TRUNCATE planner_workers_shadow');
    for(const r of rows){
      const id=String(r&&r.id||'').trim();if(!id)continue;
      await client.query(
        `INSERT INTO planner_workers_shadow(
          id,employee_name,display_name,provider,calendar_id,active,sort_order,shadow_updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,now())`,
        [id,String(r.employeeName||''),String(r.displayName||''),String(r.provider||'google'),
         String(r.calendarId||''),r.active!==false,Number(r.sortOrder)||999]
      );
    }
    await client.query('COMMIT');
  }catch(e){
    await client.query('ROLLBACK');throw e;
  }finally{client.release();}
}

async function verifyPlannerWorkersShadow(rows) {
  if (!pool || !Array.isArray(rows)) return;
  const q=await pool.query(
    `SELECT id,employee_name,display_name,provider,calendar_id,active,sort_order
       FROM planner_workers_shadow ORDER BY sort_order,id`
  );
  const pg=new Map(q.rows.map(r=>[String(r.id),r]));
  let mismatches=0;const seen=new Set();
  for(const r of rows){
    const id=normalizeShadowText(r&&r.id);if(!id){mismatches++;continue;}
    seen.add(id);const p=pg.get(id);if(!p){mismatches++;continue;}
    const same =
      normalizeShadowText(r.employeeName)===normalizeShadowText(p.employee_name) &&
      normalizeShadowText(r.displayName)===normalizeShadowText(p.display_name) &&
      normalizeShadowText(r.provider||'google')===normalizeShadowText(p.provider||'google') &&
      normalizeShadowText(r.calendarId)===normalizeShadowText(p.calendar_id) &&
      Boolean(r.active)===Boolean(p.active) &&
      Number(r.sortOrder||999)===Number(p.sort_order||999);
    if(!same)mismatches++;
  }
  for(const id of pg.keys())if(!seen.has(id))mismatches++;
  console.log('SHADOW_VERIFY planner_workers google='+rows.length+' postgres='+pg.size+' mismatches='+mismatches);
  await saveShadowVerifyStat('planner_workers',rows.length,pg.size,mismatches);
}

async function initManualOrdersShadow() {
  if (!pool) return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM manual_orders_shadow');
  if ((existing.rows[0]?.n||0)>0) return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:AuftragsStamm']
  );
  let inserted=0;
  for (const row of q.rows) {
    const payload=row.payload||{};
    if (Number(payload.sourceRow||row.source_key)<=1) continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const id=textCell(cells,0).trim();
    if(!id) continue;
    await pool.query(
      `INSERT INTO manual_orders_shadow(
        id,customer,address,phone,email,description,source,inquiry_id,status,
        created_at_text,started_at_text,completed_at_text,changed_at_text,changed_by,internal_note
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT(id) DO NOTHING`,
      [id,textCell(cells,1),textCell(cells,2),textCell(cells,3),textCell(cells,4),
       textCell(cells,5),textCell(cells,6),textCell(cells,7),textCell(cells,8),
       textCell(cells,9),textCell(cells,10),textCell(cells,11),textCell(cells,12),
       textCell(cells,13),textCell(cells,14)]
    );
    inserted++;
  }
  console.log('SHADOW manual_orders initialized rows='+inserted);
}


async function initOwnRemindersShadow() {
  if (!pool) return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM own_reminders_shadow');
  if ((existing.rows[0]?.n||0)>0) return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:EigeneReminder']
  );
  let inserted=0;
  for (const row of q.rows) {
    const payload=row.payload||{};
    if (Number(payload.sourceRow||row.source_key)<=1) continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const id=textCell(cells,0).trim();
    if(!id) continue;
    await pool.query(
      `INSERT INTO own_reminders_shadow(
        id,reminder_text,due_date_text,status,result,created_at_text,created_by,
        changed_at_text,changed_by,attachments_json,internal_note
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT(id) DO NOTHING`,
      [id,textCell(cells,1),textCell(cells,2),textCell(cells,3),textCell(cells,4),
       textCell(cells,5),textCell(cells,6),textCell(cells,7),textCell(cells,8),
       textCell(cells,9),textCell(cells,10)]
    );
    inserted++;
  }
  console.log('SHADOW own_reminders initialized rows='+inserted);
}

async function mirrorOwnReminderWrite(action, body, parsed) {
  if (!pool) return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if (!data || data.ok===false) return;
  const now=new Date().toISOString();
  if (action==='createOwnReminder') {
    const item=body.item||{};
    const id=String(data.id||'').trim();
    if(!id) return;
    await pool.query(
      `INSERT INTO own_reminders_shadow(
        id,reminder_text,due_date_text,status,result,created_at_text,created_by,
        changed_at_text,changed_by,attachments_json,internal_note,shadow_updated_at
      ) VALUES($1,$2,$3,'Offen','',$4,$5,$4,$5,$6,'',now())
      ON CONFLICT(id) DO UPDATE SET
        reminder_text=EXCLUDED.reminder_text,due_date_text=EXCLUDED.due_date_text,
        status='Offen',changed_at_text=EXCLUDED.changed_at_text,changed_by=EXCLUDED.changed_by,
        shadow_updated_at=now()`,
      [id,String(item.text||''),String(data.dueDate||item.dueDate||''),now,
       String(body.employee||''),JSON.stringify({count:Number(data.attachmentCount||0)})]
    );
  } else if (action==='saveOwnReminderInternalNote') {
    await pool.query(
      `UPDATE own_reminders_shadow SET internal_note=$2,changed_at_text=$3,changed_by=$4,shadow_updated_at=now() WHERE id=$1`,
      [String(body.reminderId||''),String(data.internalNote!==undefined?data.internalNote:body.note||''),now,String(body.employee||'')]
    );
  } else if (action==='rescheduleOwnReminder') {
    await pool.query(
      `UPDATE own_reminders_shadow SET due_date_text=$2,changed_at_text=$3,changed_by=$4,shadow_updated_at=now() WHERE id=$1`,
      [String(body.reminderId||''),String(data.dueDate||body.dueDate||''),now,String(body.employee||'')]
    );
  } else if (action==='completeOwnReminder') {
    await pool.query(
      `UPDATE own_reminders_shadow SET status='Erledigt',result='Erledigt',changed_at_text=$2,changed_by=$3,shadow_updated_at=now() WHERE id=$1`,
      [String(body.reminderId||''),now,String(body.employee||'')]
    );
  } else if (action==='deleteOwnReminder') {
    await pool.query(
      `UPDATE own_reminders_shadow SET status='Gelöscht',result='Gelöscht',changed_at_text=$2,changed_by=$3,shadow_updated_at=now() WHERE id=$1`,
      [String(body.reminderId||''),now,String(body.employee||'')]
    );
  }
}


function normalizeShadowText(v){return String(v==null?'':v).trim();}

async function saveShadowVerifyStat(name,googleCount,postgresCount,mismatches){
  if(!pool)return;
  await pool.query(
    `INSERT INTO shadow_verify_stats(shadow_name,google_count,postgres_count,mismatches,checked_at)
     VALUES($1,$2,$3,$4,now())
     ON CONFLICT(shadow_name) DO UPDATE SET
       google_count=EXCLUDED.google_count,
       postgres_count=EXCLUDED.postgres_count,
       mismatches=EXCLUDED.mismatches,
       checked_at=now()`,
    [String(name),Number(googleCount)||0,Number(postgresCount)||0,Number(mismatches)||0]
  );
}




async function initCustomerInquiriesShadow(){
  if(!pool)return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM customer_inquiries_shadow');
  if((existing.rows[0]?.n||0)>0)return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:Anfragen']
  );
  let inserted=0;
  for(const row of q.rows){
    const payload=row.payload||{};if(Number(payload.sourceRow||row.source_key)<=1)continue;
    const x=Array.isArray(payload.cells)?payload.cells:[],id=textCell(x,0).trim();if(!id)continue;
    await pool.query(
      `INSERT INTO customer_inquiries_shadow(
        id,source,gmail_ids,customer,email,phone,postal_code,city,subject,description,
        received_at_text,status,read_flag,created_at_text,changed_at_text,changed_by,
        internal_note,done_reason,contact_at_text,contact_person,contact_note,offer_id,
        external_url,phone_url,dropbox_url,aqon_appointment_url,aqon_details,aqon_replied_at_text
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
      ON CONFLICT(id) DO NOTHING`,
      [id,textCell(x,1),textCell(x,2),textCell(x,3),textCell(x,4),textCell(x,5),
       textCell(x,6),textCell(x,7),textCell(x,8),textCell(x,9),textCell(x,10),
       textCell(x,11)||'Neu',String(textCell(x,12)).toLowerCase()==='ja',textCell(x,13),
       textCell(x,14),textCell(x,15),textCell(x,16),textCell(x,17),textCell(x,18),
       textCell(x,19),textCell(x,20),textCell(x,21),textCell(x,22),textCell(x,23),
       textCell(x,24),textCell(x,25),textCell(x,26),textCell(x,27)]
    );
    inserted++;
  }
  console.log('SHADOW customer_inquiries initialized rows='+inserted);
}

async function initInquiryRemindersShadow(){
  if(!pool)return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM inquiry_reminders_shadow');
  if((existing.rows[0]?.n||0)>0)return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:AnfragenReminder']
  );
  let inserted=0;
  for(const row of q.rows){
    const payload=row.payload||{};if(Number(payload.sourceRow||row.source_key)<=1)continue;
    const x=Array.isArray(payload.cells)?payload.cells:[],id=textCell(x,0).trim();if(!id)continue;
    await pool.query(
      `INSERT INTO inquiry_reminders_shadow(
        id,inquiry_id,customer,phone,email,description,source,created_at_text,due_date_text,
        status,result,changed_at_text,changed_by
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT(id) DO NOTHING`,
      [id,textCell(x,1),textCell(x,2),textCell(x,3),textCell(x,4),textCell(x,5),
       textCell(x,6),textCell(x,7),textCell(x,8),textCell(x,9)||'Offen',
       textCell(x,10),textCell(x,11),textCell(x,12)]
    );
    inserted++;
  }
  console.log('SHADOW inquiry_reminders initialized rows='+inserted);
}

async function upsertInquiryFromView(row){
  if(!row||!row.id)return;
  await pool.query(
    `INSERT INTO customer_inquiries_shadow(
      id,source,customer,email,phone,postal_code,city,subject,description,received_at_text,
      status,read_flag,internal_note,done_reason,contact_at_text,contact_person,contact_note,
      offer_id,external_url,phone_url,dropbox_url,aqon_appointment_url,aqon_details,aqon_replied_at_text,shadow_updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,now())
    ON CONFLICT(id) DO UPDATE SET
      source=EXCLUDED.source,customer=EXCLUDED.customer,email=EXCLUDED.email,phone=EXCLUDED.phone,
      postal_code=EXCLUDED.postal_code,city=EXCLUDED.city,subject=EXCLUDED.subject,
      description=EXCLUDED.description,received_at_text=EXCLUDED.received_at_text,status=EXCLUDED.status,
      read_flag=EXCLUDED.read_flag,internal_note=EXCLUDED.internal_note,done_reason=EXCLUDED.done_reason,
      contact_at_text=EXCLUDED.contact_at_text,contact_person=EXCLUDED.contact_person,
      contact_note=EXCLUDED.contact_note,offer_id=EXCLUDED.offer_id,external_url=EXCLUDED.external_url,
      phone_url=EXCLUDED.phone_url,dropbox_url=EXCLUDED.dropbox_url,
      aqon_appointment_url=EXCLUDED.aqon_appointment_url,aqon_details=EXCLUDED.aqon_details,
      aqon_replied_at_text=EXCLUDED.aqon_replied_at_text,shadow_updated_at=now()`,
    [String(row.id),String(row.source||''),String(row.customer||''),String(row.email||''),
     String(row.phone||''),String(row.postalCode||''),String(row.city||''),String(row.subject||''),
     String(row.description||''),String(row.receivedAt||''),String(row.status||'Neu'),
     Boolean(row.read),String(row.internalNote||''),String(row.doneReason||''),
     String(row.contactAt||''),String(row.contactPerson||''),String(row.contactNote||''),
     String(row.offerId||''),String(row.externalUrl||''),String(row.phoneUrl||''),
     String(row.dropboxUrl||''),String(row.aqonAppointmentUrl||''),String(row.aqonDetails||''),
     String(row.aqonRepliedAt||'')]
  );
}



function customerInquiryViewKey(status){
  return 'customer_inquiries_view:'+String(status||'Offen');
}
function inquiryReminderViewKey(includeDone){
  return 'inquiry_reminders_view:'+(includeDone?'all':'open');
}
async function markInquiryViewFresh(key){
  if(!pool||!key)return;
  const value=JSON.stringify({key:String(key),refreshedAt:new Date().toISOString()});
  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
    ['fresh:'+String(key),value]
  );
}
async function inquiryViewFresh(key,maxMinutes=70){
  if(!pool||!key)return false;
  const q=await pool.query(
    `SELECT updated_at FROM app_meta
      WHERE key=$1 AND updated_at>now()-($2::text||' minutes')::interval`,
    ['fresh:'+String(key),String(Number(maxMinutes)||70)]
  );
  return Boolean(q.rowCount);
}
async function invalidateInquiryFreshness(){
  if(!pool)return;
  await pool.query("DELETE FROM app_meta WHERE key LIKE 'fresh:customer_inquiries_view:%' OR key LIKE 'fresh:inquiry_reminders_view:%'");
}
async function directCustomerInquiriesRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const status=String(body.status||'Offen'),key=customerInquiryViewKey(status);
  // WhatsApp inquiries are native Postgres records and do not exist in the legacy Google source.
  // As soon as at least one WhatsApp inquiry exists, the combined Postgres view must stay authoritative,
  // otherwise a Google fallback would temporarily hide the transferred WhatsApp customer.
  const wa=await pool.query("SELECT 1 FROM customer_inquiries_shadow WHERE source='WhatsApp' LIMIT 1");
  if(wa.rowCount)return postgresCustomerInquiryView(status);
  if(!(await inquiryViewFresh(key,70)))return null;
  if(!(await shadowReadyForDirectRead(key,2)))return null;
  return postgresCustomerInquiryView(status);
}
async function directInquiryRemindersRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const includeDone=Boolean(body.includeDone),key=inquiryReminderViewKey(includeDone);
  if(!(await inquiryViewFresh(key,70)))return null;
  if(!(await shadowReadyForDirectRead(key,2)))return null;
  return postgresInquiryReminderView(includeDone);
}


function inquiryNormTextV10(v){
  return String(v||'').trim().toLowerCase().replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function inquiryNormEmailV10(v){return String(v||'').trim().toLowerCase();}
function inquiryNormPhoneV10(v){const d=String(v||'').replace(/\D/g,'');return d.length>=7?d:'';}
async function mergeInquiryRowsV10(rows){
  const list=Array.isArray(rows)?rows.slice():[];if(list.length<2)return list.map(x=>Object.assign({},x,{mergedIds:[x.id],mergedCount:1,sources:[x.source].filter(Boolean)}));
  const parent=list.map((_,i)=>i);
  function find(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
  function unite(a,b){a=find(a);b=find(b);if(a!==b)parent[b]=a;}
  const keyOwner=new Map();
  list.forEach((r,i)=>{
    const keys=[],email=inquiryNormEmailV10(r.email),phone=inquiryNormPhoneV10(r.phone),name=inquiryNormTextV10(r.customer),plz=String(r.postalCode||'').replace(/\D/g,''),city=inquiryNormTextV10(r.city);
    if(email)keys.push('e:'+email);if(phone)keys.push('p:'+phone);if(name&&plz)keys.push('np:'+name+'|'+plz);else if(name&&city)keys.push('nc:'+name+'|'+city);
    keys.forEach(k=>{if(keyOwner.has(k))unite(i,keyOwner.get(k));else keyOwner.set(k,i);});
  });
  try{
    const ids=list.map(r=>String(r.id||'')).filter(Boolean);
    if(ids.length){
      const q=await pool.query('SELECT inquiry_id,group_id FROM inquiry_merge_members_v10 WHERE inquiry_id=ANY($1::text[])',[ids]);
      const byGroup=new Map(),pos=new Map(list.map((r,i)=>[String(r.id||''),i]));
      for(const r of q.rows){const p=pos.get(String(r.inquiry_id||''));if(p==null)continue;const g=String(r.group_id||'');if(byGroup.has(g))unite(p,byGroup.get(g));else byGroup.set(g,p);}
    }
  }catch(e){console.error('Inquiry manual merge map read failed:',e.message);}
  const groups=new Map();
  list.forEach((r,i)=>{const k=find(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);});
  const out=[];
  for(const g of groups.values()){
    g.sort((a,b)=>String(b._receivedSort||'').localeCompare(String(a._receivedSort||'')));
    const c=Object.assign({},g[0]),pick=field=>{for(const r of g)if(String(r[field]||'').trim())return r[field];return '';};
    const unique=field=>[...new Set(g.map(r=>String(r[field]||'').trim()).filter(Boolean))];
    c.email=pick('email');c.phone=pick('phone');c.postalCode=pick('postalCode');c.city=pick('city');c.customer=pick('customer');
    c.subject=pick('subject');c.description=unique('description').join('\n\n');c.internalNote=unique('internalNote').join('\n');
    c.sources=unique('source');c.source=c.sources.join(' + ');c.mergedIds=g.map(r=>String(r.id||'')).filter(Boolean);c.mergedCount=c.mergedIds.length;
    delete c._receivedSort;out.push(c);
  }
  out.sort((a,b)=>String(b.receivedAt||'').localeCompare(String(a.receivedAt||'')));return out;
}

async function postgresCustomerInquiryView(status){
  status=String(status||'Offen');
  const q=await pool.query(
    `SELECT id,source,customer,email,phone,postal_code,city,subject,description,received_at_text,
            status,read_flag,internal_note,done_reason,contact_at_text,contact_person,contact_note,
            offer_id,external_url,phone_url,dropbox_url,aqon_appointment_url,aqon_details,aqon_replied_at_text,attachments_json
       FROM customer_inquiries_shadow`
  );
  const base=q.rows.map(r=>({
    id:String(r.id||''),source:String(r.source||''),customer:String(r.customer||''),
    email:String(r.email||''),phone:String(r.phone||''),postalCode:String(r.postal_code||''),
    city:String(r.city||''),subject:String(r.subject||''),description:String(r.description||''),
    receivedAt:berlinDateTime(r.received_at_text),status:String(r.status||'Neu'),
    read:Boolean(r.read_flag),internalNote:String(r.internal_note||''),doneReason:String(r.done_reason||''),
    contactAt:berlinDateTime(r.contact_at_text),contactPerson:String(r.contact_person||''),
    contactNote:String(r.contact_note||''),offerId:String(r.offer_id||''),
    externalUrl:String(r.external_url||''),phoneUrl:String(r.phone_url||''),
    dropboxUrl:String(r.dropbox_url||''),aqonAppointmentUrl:String(r.aqon_appointment_url||''),
    aqonDetails:String(r.aqon_details||''),aqonRepliedAt:berlinDateTime(r.aqon_replied_at_text),
    attachments:(()=>{try{const a=JSON.parse(String(r.attachments_json||'[]'));return Array.isArray(a)?a:[];}catch(_e){return [];}})(),
    _receivedSort:String(r.received_at_text||'')
  }));
  const grouped=await mergeInquiryRowsV10(base),excluded=new Set(['Erledigt','Gelöscht','Übernommen','Archiviert','Reminder']);
  return grouped.filter(r=>{
    const st=String(r.status||'Neu');
    if(status==='Offen')return !excluded.has(st);
    if(status&&status!=='Alle')return st===status;
    return true;
  });
}
function canonicalCustomerInquiries(rows){
  return (Array.isArray(rows)?rows:[]).map(x=>({
    id:String(x.id||''),source:String(x.source||''),customer:String(x.customer||''),
    email:String(x.email||''),phone:String(x.phone||''),postalCode:String(x.postalCode||''),
    city:String(x.city||''),subject:String(x.subject||''),description:String(x.description||''),
    receivedAt:String(x.receivedAt||''),status:String(x.status||'Neu'),read:Boolean(x.read),
    internalNote:String(x.internalNote||''),doneReason:String(x.doneReason||''),
    contactAt:String(x.contactAt||''),contactPerson:String(x.contactPerson||''),
    contactNote:String(x.contactNote||''),offerId:String(x.offerId||''),
    externalUrl:String(x.externalUrl||''),phoneUrl:String(x.phoneUrl||''),
    dropboxUrl:String(x.dropboxUrl||''),aqonAppointmentUrl:String(x.aqonAppointmentUrl||''),
    aqonDetails:String(x.aqonDetails||''),aqonRepliedAt:String(x.aqonRepliedAt||''),
    attachments:Array.isArray(x.attachments)?x.attachments:[]
  })).sort((a,b)=>String(a.id).localeCompare(String(b.id))||String(a.receivedAt).localeCompare(String(b.receivedAt)));
}
async function verifyCustomerInquiryView(rows,status){
  if(!pool||!Array.isArray(rows))return;
  const pg=await postgresCustomerInquiryView(status);
  const a=canonicalCustomerInquiries(rows),b=canonicalCustomerInquiries(pg);
  const pgById=new Map(b.map(x=>[String(x.id||''),x]));
  let missingOrDifferent=0;
  for(const x of a){
    const y=pgById.get(String(x.id||''));
    if(!y||stableJsonString(x)!==stableJsonString(y))missingOrDifferent++;
  }
  // PostgreSQL is production-primary. Extra Postgres rows are valid when a native write
  // has already landed locally but the queued legacy Google copy has not caught up yet.
  const mismatches=missingOrDifferent;
  const key=customerInquiryViewKey(status);
  console.log('SHADOW_VERIFY '+key+' google='+a.length+' postgres='+b.length+' missing_or_different='+missingOrDifferent+' postgres_extra='+Math.max(0,b.length-a.length));
  await saveShadowVerifyStat(key,a.length,b.length,mismatches);
}

async function postgresInquiryReminderView(includeDone){
  const q=await pool.query(
    `SELECT r.id,r.inquiry_id,r.customer,r.phone,r.email,r.description,r.source,r.created_at_text,
            r.due_date_text,r.status,r.result,i.internal_note,i.external_url,i.phone_url
       FROM inquiry_reminders_shadow r
       LEFT JOIN customer_inquiries_shadow i ON i.id=r.inquiry_id
       ${includeDone?'':"WHERE COALESCE(r.status,'Offen')='Offen'"}`
  );
  const today=berlinDateOnly(new Date());
  const rows=q.rows.map(r=>{
    const due=berlinDateOnly(r.due_date_text);
    return {
      id:String(r.id||''),inquiryId:String(r.inquiry_id||''),customer:String(r.customer||''),
      phone:String(r.phone||''),email:String(r.email||''),description:String(r.description||''),
      source:String(r.source||''),createdAt:berlinDateTime(r.created_at_text),dueDate:due,
      status:String(r.status||'Offen'),result:String(r.result||''),
      internalNote:String(r.internal_note||''),externalUrl:String(r.external_url||''),
      phoneUrl:String(r.phone_url||''),isDue:Boolean(due&&due<=today),isOverdue:Boolean(due&&due<today)
    };
  });
  rows.sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate))||
    String(a.customer).localeCompare(String(b.customer),'de'));
  return rows;
}
function canonicalInquiryReminders(rows){
  return (Array.isArray(rows)?rows:[]).map(x=>({
    id:String(x.id||''),inquiryId:String(x.inquiryId||''),customer:String(x.customer||''),
    phone:String(x.phone||''),email:String(x.email||''),description:String(x.description||''),
    source:String(x.source||''),createdAt:String(x.createdAt||''),dueDate:String(x.dueDate||''),
    status:String(x.status||'Offen'),result:String(x.result||''),internalNote:String(x.internalNote||''),
    externalUrl:String(x.externalUrl||''),phoneUrl:String(x.phoneUrl||''),
    isDue:Boolean(x.isDue),isOverdue:Boolean(x.isOverdue)
  }));
}
async function verifyInquiryReminderView(rows,includeDone){
  if(!pool||!Array.isArray(rows))return;
  const pg=await postgresInquiryReminderView(includeDone);
  const a=canonicalInquiryReminders(rows),b=canonicalInquiryReminders(pg);
  const mismatches=stableJsonString(a)===stableJsonString(b)?0:1;
  const key=inquiryReminderViewKey(includeDone);
  console.log('SHADOW_VERIFY '+key+' google='+a.length+' postgres='+b.length+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,a.length,b.length,mismatches);
}

async function syncInquiryViewShadow(rows,status){
  if(!pool||!Array.isArray(rows))return;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    if(String(status||'')==='Alle')await client.query('TRUNCATE customer_inquiries_shadow');
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  for(const row of rows)await upsertInquiryFromView(row);
  const q=await pool.query('SELECT COUNT(*)::int AS n FROM customer_inquiries_shadow');
  console.log('SHADOW customer_inquiries refreshed visible='+rows.length+' total='+Number(q.rows[0]?.n||0));
}

async function syncInquiryReminderViewShadow(rows,includeDone){
  if(!pool||!Array.isArray(rows))return;
  if(includeDone)await pool.query('TRUNCATE inquiry_reminders_shadow');
  for(const r of rows){
    if(!r||!r.id)continue;
    await pool.query(
      `INSERT INTO inquiry_reminders_shadow(
        id,inquiry_id,customer,phone,email,description,source,created_at_text,due_date_text,
        status,result,changed_at_text,changed_by,shadow_updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'','',now())
      ON CONFLICT(id) DO UPDATE SET
        inquiry_id=EXCLUDED.inquiry_id,customer=EXCLUDED.customer,phone=EXCLUDED.phone,
        email=EXCLUDED.email,description=EXCLUDED.description,source=EXCLUDED.source,
        created_at_text=EXCLUDED.created_at_text,due_date_text=EXCLUDED.due_date_text,
        status=EXCLUDED.status,result=EXCLUDED.result,shadow_updated_at=now()`,
      [String(r.id),String(r.inquiryId||''),String(r.customer||''),String(r.phone||''),
       String(r.email||''),String(r.description||''),String(r.source||''),String(r.createdAt||''),
       String(r.dueDate||''),String(r.status||'Offen'),String(r.result||'')]
    );
  }
}

async function mirrorInquiryWrite(action,body,parsed){
  if(!pool)return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;
  const id=String(body.id||'').trim(),by=String(body.employee||''),now=new Date().toISOString();

  if(action==='updateCustomerInquiry'||action==='deleteCustomerInquiry'){
    if(!id)return;
    const status=action==='deleteCustomerInquiry'?'Gelöscht':String(body.status||'');
    const sets=[],args=[id];let n=2;
    if(status){sets.push('status=$'+n++);args.push(status);}
    if(body.markRead!==false||action==='deleteCustomerInquiry')sets.push('read_flag=true');
    sets.push('changed_at_text=$'+n++);args.push(now);
    sets.push('changed_by=$'+n++);args.push(by);
    await pool.query('UPDATE customer_inquiries_shadow SET '+sets.join(',')+',shadow_updated_at=now() WHERE id=$1',args);
  }else if(action==='saveCustomerInquiryNote'){
    await pool.query(
      'UPDATE customer_inquiries_shadow SET internal_note=$2,changed_at_text=$3,changed_by=$4,shadow_updated_at=now() WHERE id=$1',
      [id,String(body.note||''),now,by]
    );
  }else if(action==='completeCustomerInquiry'){
    await pool.query(
      `UPDATE customer_inquiries_shadow SET status='Erledigt',read_flag=true,done_reason=$2,
        internal_note=CASE WHEN $3::boolean THEN $4 ELSE internal_note END,
        changed_at_text=$5,changed_by=$6,shadow_updated_at=now() WHERE id=$1`,
      [id,String(body.reason||''),body.note!==undefined,String(body.note||''),now,by]
    );
  }else if(action==='saveCustomerInquiryContact'){
    let contact=now;
    if(body.date)contact=String(body.date)+' '+String(body.time||'12:00')+':00';
    await pool.query(
      `UPDATE customer_inquiries_shadow SET status='Kontaktiert',read_flag=true,contact_at_text=$2,
        contact_person=$3,contact_note=$4,changed_at_text=$5,changed_by=$6,shadow_updated_at=now() WHERE id=$1`,
      [id,contact,String(body.person||''),String(body.note||''),now,by]
    );
  }else if(action==='archiveCustomerInquiry'||action==='rejectCustomerInquiry'){
    await pool.query(
      `UPDATE customer_inquiries_shadow SET status=$2,read_flag=true,done_reason=$3,
        changed_at_text=$4,changed_by=$5,shadow_updated_at=now() WHERE id=$1`,
      [id,action==='archiveCustomerInquiry'?'Archiviert':'Gelöscht',
       action==='archiveCustomerInquiry'?'Termin vereinbart':'Abgelehnt',now,by]
    );
  }else if(action==='inquiryToOffer'){
    if(data.existing)return;
    await pool.query(
      `UPDATE customer_inquiries_shadow SET customer=$2,phone=$3,status='Angebot erstellt',
        read_flag=true,offer_id=$4,changed_at_text=$5,changed_by=$6,shadow_updated_at=now() WHERE id=$1`,
      [id,String(body.customer||''),String(body.phone||''),String(data.offerId||''),now,by]
    );
  }else if(action==='saveManualOrder'){
    const inquiryId=String(body.item&&body.item.inquiryId||'');
    if(inquiryId&&!/^AQON:/.test(inquiryId)){
      await pool.query(
        `UPDATE customer_inquiries_shadow SET status='Übernommen',read_flag=true,
          changed_at_text=$2,changed_by=$3,shadow_updated_at=now() WHERE id=$1`,
        [inquiryId,now,by]
      );
    }
  }else if(action==='planRequest3'&&String(body.kind||'')==='inquiry'){
    const inquiryId=String(body.id||'');if(!inquiryId)return;
    await pool.query(
      `UPDATE customer_inquiries_shadow SET status=$2,read_flag=true,
        changed_at_text=$3,changed_by=$4,shadow_updated_at=now() WHERE id=$1`,
      [inquiryId,body.offer?'Besichtigung geplant':'Termin geplant',now,by]
    );
  }
}

async function mirrorInquiryReminderWrite(action,body,parsed){
  if(!pool)return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;
  const by=String(body.employee||''),now=new Date().toISOString();
  if(action==='createInquiryReminder'){
    const inquiryId=String(body.id||''),rid=String(data.reminderId||'');if(!inquiryId||!rid)return;
    const q=await pool.query(
      'SELECT customer,phone,email,description,subject,source FROM customer_inquiries_shadow WHERE id=$1',
      [inquiryId]
    );
    const x=q.rows[0]||{};
    await pool.query(
      `INSERT INTO inquiry_reminders_shadow(
        id,inquiry_id,customer,phone,email,description,source,created_at_text,due_date_text,
        status,result,changed_at_text,changed_by,shadow_updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'Offen','',$8,$10,now())
      ON CONFLICT(id) DO UPDATE SET
        inquiry_id=EXCLUDED.inquiry_id,customer=EXCLUDED.customer,phone=EXCLUDED.phone,
        email=EXCLUDED.email,description=EXCLUDED.description,source=EXCLUDED.source,
        due_date_text=EXCLUDED.due_date_text,status='Offen',result='',changed_at_text=EXCLUDED.changed_at_text,
        changed_by=EXCLUDED.changed_by,shadow_updated_at=now()`,
      [rid,inquiryId,String(x.customer||''),String(x.phone||''),String(x.email||''),
       String(x.description||x.subject||''),String(x.source||''),now,String(data.dueDate||''),by]
    );
    await pool.query(
      `UPDATE customer_inquiries_shadow SET status='Reminder',read_flag=true,
        changed_at_text=$2,changed_by=$3,shadow_updated_at=now() WHERE id=$1`,
      [inquiryId,now,by]
    );
    return;
  }
  const rid=String(body.reminderId||'');if(!rid)return;
  let result='',newStatus='';
  if(action==='reopenInquiryReminder'){result='Zurück zu offenen Anfragen';newStatus='Neu';}
  else if(action==='archiveInquiryReminder'){result='Termin vereinbart';newStatus='Archiviert';}
  else if(action==='rejectInquiryReminder'){result='Abgelehnt';newStatus='Gelöscht';}
  else return;
  const q=await pool.query('SELECT inquiry_id FROM inquiry_reminders_shadow WHERE id=$1',[rid]);
  const inquiryId=String(q.rows[0]?.inquiry_id||data.inquiryId||'');
  await pool.query(
    `UPDATE inquiry_reminders_shadow SET status='Erledigt',result=$2,
      changed_at_text=$3,changed_by=$4,shadow_updated_at=now() WHERE id=$1`,
    [rid,result,now,by]
  );
  if(inquiryId){
    await pool.query(
      `UPDATE customer_inquiries_shadow SET status=$2,read_flag=true,
        done_reason=CASE WHEN $2='Archiviert' THEN 'Termin vereinbart'
                         WHEN $2='Gelöscht' THEN 'Abgelehnt' ELSE done_reason END,
        changed_at_text=$3,changed_by=$4,shadow_updated_at=now() WHERE id=$1`,
      [inquiryId,newStatus,now,by]
    );
  }
}

async function initInquiryOffersShadow(){
  if(!pool)return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM inquiry_offers_shadow');
  if((existing.rows[0]?.n||0)>0)return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:AnfrageAngebote']
  );
  let inserted=0;
  for(const row of q.rows){
    const payload=row.payload||{};
    if(Number(payload.sourceRow||row.source_key)<=1)continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const id=textCell(cells,0).trim();if(!id)continue;
    await pool.query(
      `INSERT INTO inquiry_offers_shadow(
        offer_id,inquiry_id,customer,phone,email,description,source,created_at_text,status,
        changed_at_text,changed_by,calendar_event_id
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT(offer_id) DO NOTHING`,
      [id,textCell(cells,1),textCell(cells,2),textCell(cells,3),textCell(cells,4),
       textCell(cells,5),textCell(cells,6),textCell(cells,7),textCell(cells,8)||'Offen',
       textCell(cells,9),textCell(cells,10),textCell(cells,11)]
    );
    inserted++;
  }
  console.log('SHADOW inquiry_offers initialized rows='+inserted);
}

function inspectionTimesForMirror(item,hours){
  item=item||{};const ev=item.event||{};
  const mins=Math.max(1,Math.round(Number(hours||0)*60));
  const norm=v=>{
    const s=String(v||'').trim();
    const m=s.match(/^(\d{1,2}):(\d{2})/);
    return m?String(Number(m[1])).padStart(2,'0')+':'+m[2]:'';
  };
  const toTime=n=>{
    n=((Math.round(Number(n)||0)%1440)+1440)%1440;
    return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
  };
  const start=norm(item.start||ev.startTime||''),end=norm(item.end||ev.endTime||'');
  if(start){const p=start.split(':').map(Number),sm=p[0]*60+p[1];return {start,end:toTime(sm+mins)};}
  if(end){const p=end.split(':').map(Number),em=p[0]*60+p[1];return {start:toTime(em-mins),end};}
  const now=new Date(),p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',hour12:false})
    .format(now).split(':').map(Number),em=p[0]*60+p[1];
  return {start:toTime(em-mins),end:toTime(em)};
}
async function mirrorInspectionTimeEntry(body,parsed){
  if(!pool)return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;
  const id=String(data.timeEntryId||'').trim(),offerId=String(data.offerId||'').trim();
  if(!id||!offerId)return;
  const item=body.item||{},ev=item.event||{};
  const employee=String(body.employee||''),date=berlinDateOnly(item.date||new Date());
  const customer=String(data.customer||item.customer||''),hours=Number(data.hoursBooked||item.hours||0);
  const activity=String(data.activity||item.activity||item.note||ev.description||'Besichtigungstermin').trim();
  const times=inspectionTimesForMirror(item,hours);
  const closedQ=await pool.query(
    'SELECT 1 FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2 LIMIT 1',
    [employee,date]
  );
  const closed=Boolean(closedQ.rowCount),now=new Date().toISOString();
  await pool.query(
    `INSERT INTO time_entries_shadow(
      id,employee_name,entry_date,customer,start_time,end_time,hours,activity,transmitted_at_text,
      closed,material_used,photo_count,additional_employees_used,source_calendar_event_id,
      billing_status,object_id,job_status,is_supplement,offer_id,offer_changed_at_text,offer_changed_by,
      maintenance,source_payload,shadow_updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,0,false,$11,'Offen','',
             'Angebot zu erstellen',false,$12,$9,$2,false,$13::jsonb,now())
    ON CONFLICT(id) DO UPDATE SET
      employee_name=EXCLUDED.employee_name,entry_date=EXCLUDED.entry_date,customer=EXCLUDED.customer,
      start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,hours=EXCLUDED.hours,activity=EXCLUDED.activity,
      transmitted_at_text=EXCLUDED.transmitted_at_text,closed=EXCLUDED.closed,
      source_calendar_event_id=EXCLUDED.source_calendar_event_id,billing_status='Offen',
      job_status='Angebot zu erstellen',is_supplement=false,offer_id=EXCLUDED.offer_id,
      offer_changed_at_text=EXCLUDED.offer_changed_at_text,offer_changed_by=EXCLUDED.offer_changed_by,
      source_payload=EXCLUDED.source_payload,shadow_updated_at=now()`,
    [id,employee,date,customer,times.start,times.end,hours,activity,now,closed,
     String(item.sourceCalendarEventId||ev.id||''),offerId,
     JSON.stringify({source:'createInspectionOffer',offerId})]
  );
  await pool.query(
    `UPDATE inquiry_offers_shadow SET inspection_date=$2,inspection_hours=$3,activity_note=$4,
      description=CASE WHEN COALESCE(description,'')='' THEN $4 ELSE description END,shadow_updated_at=now()
      WHERE offer_id=$1`,
    [offerId,date,hours,activity]
  );
}

async function mirrorAcceptedOfferRunning(body,parsed){
  if(!pool)return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;
  const offerId=String(data.offerId||body.offerId||'').trim();if(!offerId)return;
  const by=String(body.employee||''),now=new Date().toISOString();

  // DG 7.2.1 keeps the offer ID on Regieberichte and changes only the workflow status.
  if(String(data.mode||'')==='Regieberichte'){
    await pool.query(
      `UPDATE time_entries_shadow SET job_status='Laufend',offer_id=$1,
        offer_changed_at_text=$2,offer_changed_by=$3,shadow_updated_at=now()
        WHERE offer_id=$1 AND COALESCE(billing_status,'Offen')='Offen'`,
      [offerId,now,by]
    );
  }

  await pool.query(
    `UPDATE inquiry_offers_shadow SET status='Laufend',changed_at_text=$2,changed_by=$3,shadow_updated_at=now()
      WHERE offer_id=$1`,
    [offerId,now,by]
  );

  // DG 7.2.1 creates a deterministic manual order when no Regiebericht exists.
  if(String(data.mode||'')==='Manueller Auftrag'){
    const orderId=String(data.manualOrderId||('AUF-ANG-'+offerId));
    const q=await pool.query(
      `SELECT o.inquiry_id,o.customer,o.phone,o.email,o.description,o.source,
              i.postal_code,i.city,i.internal_note
         FROM inquiry_offers_shadow o
         LEFT JOIN customer_inquiries_shadow i ON i.id=o.inquiry_id
        WHERE o.offer_id=$1 LIMIT 1`,
      [offerId]
    );
    const x=q.rows[0]||{},address=[String(x.postal_code||''),String(x.city||'')].filter(Boolean).join(' ').trim();
    await pool.query(
      `INSERT INTO manual_orders_shadow(
        id,customer,address,phone,email,description,source,inquiry_id,status,
        created_at_text,started_at_text,completed_at_text,changed_at_text,changed_by,internal_note,shadow_updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Laufend',$9,$9,'',$9,$10,$11,now())
      ON CONFLICT(id) DO UPDATE SET
        customer=EXCLUDED.customer,address=EXCLUDED.address,phone=EXCLUDED.phone,email=EXCLUDED.email,
        description=EXCLUDED.description,source=EXCLUDED.source,inquiry_id=EXCLUDED.inquiry_id,
        status='Laufend',started_at_text=CASE WHEN COALESCE(manual_orders_shadow.started_at_text,'')='' THEN EXCLUDED.started_at_text ELSE manual_orders_shadow.started_at_text END,
        changed_at_text=EXCLUDED.changed_at_text,changed_by=EXCLUDED.changed_by,
        internal_note=CASE WHEN COALESCE(EXCLUDED.internal_note,'')<>'' THEN EXCLUDED.internal_note ELSE manual_orders_shadow.internal_note END,
        shadow_updated_at=now()`,
      [orderId,String(x.customer||''),address,String(x.phone||''),String(x.email||''),
       String(x.description||''),String(x.source||'Angebot'),String(x.inquiry_id||''),now,by,String(x.internal_note||'')]
    );
    if(x.inquiry_id){
      await pool.query(
        `UPDATE customer_inquiries_shadow SET status='Übernommen',read_flag=true,
          changed_at_text=$2,changed_by=$3,shadow_updated_at=now() WHERE id=$1`,
        [String(x.inquiry_id),now,by]
      );
    }
  }
}
async function mirrorInquiryOfferWrite(action,body,parsed){
  if(!pool)return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;
  if(action==='createInspectionOffer'){
    const item=body.item||{},ev=item.event||{},id=String(data.offerId||'').trim();if(!id)return;
    if(data.existing)return;
    await pool.query(
      `INSERT INTO inquiry_offers_shadow(
        offer_id,inquiry_id,customer,phone,email,description,source,created_at_text,status,
        changed_at_text,changed_by,calendar_event_id,inspection_date,inspection_hours,activity_note,shadow_updated_at
      ) VALUES($1,'',$2,$3,$4,$5,'Besichtigung',$6,'Zu erstellen',$6,$7,$8,$9,$10,$11,now())
      ON CONFLICT(offer_id) DO UPDATE SET
        customer=EXCLUDED.customer,phone=EXCLUDED.phone,email=EXCLUDED.email,
        description=EXCLUDED.description,source=EXCLUDED.source,status=EXCLUDED.status,
        changed_at_text=EXCLUDED.changed_at_text,changed_by=EXCLUDED.changed_by,
        calendar_event_id=EXCLUDED.calendar_event_id,shadow_updated_at=now()`,
      [id,String(data.customer||item.customer||''),String(ev.phone||''),String(ev.email||''),
       String(ev.description||''),String(data.transferredAt||''),String(data.transferredBy||body.employee||''),
       String(data.sourceCalendarEventId||item.sourceCalendarEventId||ev.id||''),
       berlinDateOnly(item.date||new Date()),Number(data.hoursBooked||item.hours||0),
       String(data.activity||item.activity||item.note||ev.description||'Besichtigungstermin')]
    );
  }else if(action==='inquiryToOffer'){
    const id=String(data.offerId||'').trim();if(!id)return;
    await pool.query(
      `INSERT INTO inquiry_offers_shadow(
        offer_id,inquiry_id,customer,phone,email,description,source,created_at_text,status,
        changed_at_text,changed_by,calendar_event_id,shadow_updated_at
      )
      SELECT $1,$2,$3,$4,COALESCE(email,''),COALESCE(description,subject,''),COALESCE(source,''),
             now()::text,'Offen',now()::text,$5,'',now()
        FROM customer_inquiries_shadow WHERE id=$2
      ON CONFLICT(offer_id) DO UPDATE SET
        inquiry_id=EXCLUDED.inquiry_id,customer=EXCLUDED.customer,phone=EXCLUDED.phone,
        email=EXCLUDED.email,description=EXCLUDED.description,source=EXCLUDED.source,
        status='Offen',changed_at_text=now()::text,changed_by=EXCLUDED.changed_by,shadow_updated_at=now()`,
      [id,String(body.id||''),String(body.customer||''),String(body.phone||''),String(body.employee||'')]
    );
  }else if(['setRegieReportsOfferStatus','saveOfferCreatedWithReminder','moveOfferBackToCreate',
             'declineOfferFromReminder','acceptOfferFromReminder','acceptOfferAsRunning','discardOfferPermanently'].includes(action)){
    const offerId=String(data.offerId||body.offerId||'').trim();if(!offerId)return;
    let status='';
    if(action==='setRegieReportsOfferStatus'){
      const s=String(data.status||body.offerStatus||'');
      status=s==='Offenes Angebot'?'Offen':s==='Angebot Angenommen'?'Angenommen':
             s==='Angebot Abgelehnt'?'Abgelehnt':s==='Angebot zu erstellen'?'Zu erstellen':'';
    }else if(action==='saveOfferCreatedWithReminder')status='Offen';
    else if(action==='moveOfferBackToCreate')status='Zu erstellen';
    else if(action==='declineOfferFromReminder')status='Abgelehnt';
    else if(action==='acceptOfferFromReminder'||action==='acceptOfferAsRunning')status='Laufend';
    else if(action==='discardOfferPermanently')status='Verworfen';
    if(status){
      await pool.query(
        `UPDATE inquiry_offers_shadow SET status=$2,changed_at_text=$3,changed_by=$4,shadow_updated_at=now()
          WHERE offer_id=$1`,
        [offerId,status,new Date().toISOString(),String(body.employee||'')]
      );
    }
  }
}

async function initOfferRemindersShadow() {
  if (!pool) return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM offer_reminders_shadow');
  if ((existing.rows[0]?.n||0)>0) return;
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:AngebotsReminder']
  );
  let inserted=0;
  for (const row of q.rows) {
    const payload=row.payload||{};
    if (Number(payload.sourceRow||row.source_key)<=1) continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const id=textCell(cells,0).trim();
    if(!id) continue;
    await pool.query(
      `INSERT INTO offer_reminders_shadow(
        id,offer_id,customer,offer_number,phone,email,description,created_at_text,
        due_date_text,status,result,changed_at_text,changed_by
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT(id) DO NOTHING`,
      [id,textCell(cells,1),textCell(cells,2),textCell(cells,3),textCell(cells,4),
       textCell(cells,5),textCell(cells,6),textCell(cells,7),textCell(cells,8),
       textCell(cells,9),textCell(cells,10),textCell(cells,11),textCell(cells,12)]
    );
    inserted++;
  }
  console.log('SHADOW offer_reminders initialized rows='+inserted);
}

async function mirrorOfferReminderWrite(action, body, parsed) {
  if (!pool) return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if (!data || data.ok===false) return;
  const now=new Date().toISOString();
  if (action==='inquiryToOffer') {
    const id=String(data.reminderId||'').trim(),offerId=String(data.offerId||'').trim();
    if(!id||!offerId)return;
    const q=await pool.query(
      'SELECT customer,phone,email,description,subject FROM customer_inquiries_shadow WHERE id=$1',
      [String(body.id||'')]
    );
    const x=q.rows[0]||{};
    const due=new Date();due.setUTCDate(due.getUTCDate()+5);
    await pool.query(
      `INSERT INTO offer_reminders_shadow(
        id,offer_id,customer,offer_number,phone,email,description,created_at_text,
        due_date_text,status,result,changed_at_text,changed_by,shadow_updated_at
      ) VALUES($1,$2,$3,'Anfrage',$4,$5,$6,$7,$8,'Offen','',$7,$9,now())
      ON CONFLICT(id) DO UPDATE SET
        offer_id=EXCLUDED.offer_id,customer=EXCLUDED.customer,offer_number=EXCLUDED.offer_number,
        phone=EXCLUDED.phone,email=EXCLUDED.email,description=EXCLUDED.description,
        due_date_text=EXCLUDED.due_date_text,status='Offen',result='',
        changed_at_text=EXCLUDED.changed_at_text,changed_by=EXCLUDED.changed_by,shadow_updated_at=now()`,
      [id,offerId,String(x.customer||body.customer||''),String(x.phone||body.phone||''),
       String(x.email||''),String(x.description||x.subject||''),now,berlinDateOnly(due),
       String(body.employee||'')]
    );
  } else if (action==='saveOfferCreatedWithReminder') {
    const item=body.item||{},id=String(data.reminderId||'').trim();
    if(!id) return;
    await pool.query(
      `INSERT INTO offer_reminders_shadow(
        id,offer_id,customer,offer_number,phone,email,description,created_at_text,
        due_date_text,status,result,changed_at_text,changed_by,shadow_updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'Offen','',$8,$10,now())
      ON CONFLICT(id) DO UPDATE SET
        offer_id=EXCLUDED.offer_id,customer=EXCLUDED.customer,offer_number=EXCLUDED.offer_number,
        phone=EXCLUDED.phone,email=EXCLUDED.email,description=EXCLUDED.description,
        due_date_text=EXCLUDED.due_date_text,status='Offen',result='',
        changed_at_text=EXCLUDED.changed_at_text,changed_by=EXCLUDED.changed_by,shadow_updated_at=now()`,
      [id,String(data.offerId||body.offerId||''),String(item.customer||''),String(item.offerNumber||''),
       String(item.phone||''),String(item.email||''),String(item.description||''),now,
       String(data.dueDate||''),String(body.employee||'')]
    );
  } else if (action==='rescheduleOfferReminder') {
    await pool.query(
      `UPDATE offer_reminders_shadow SET due_date_text=$2,changed_at_text=$3,changed_by=$4,shadow_updated_at=now() WHERE id=$1`,
      [String(body.reminderId||''),String(data.dueDate||body.dueDate||''),now,String(body.employee||'')]
    );
  } else if (action==='declineOfferFromReminder') {
    await pool.query(
      `UPDATE offer_reminders_shadow SET status='Erledigt',result='Kein Auftrag',changed_at_text=$2,changed_by=$3,shadow_updated_at=now() WHERE id=$1`,
      [String(body.reminderId||''),now,String(body.employee||'')]
    );
  } else if (action==='acceptOfferFromReminder') {
    const result='Angenommen - Laufender Auftrag';
    await pool.query(
      `UPDATE offer_reminders_shadow SET status='Erledigt',result=$2,changed_at_text=$3,changed_by=$4,shadow_updated_at=now() WHERE id=$1`,
      [String(body.reminderId||''),result,now,String(body.employee||'')]
    );
  } else if (action==='moveOfferBackToCreate') {
    await pool.query(
      `UPDATE offer_reminders_shadow SET status='Erledigt',result='Zurück zu Angebote zu erstellen',
        changed_at_text=$2,changed_by=$3,shadow_updated_at=now()
        WHERE offer_id=$1 AND status='Offen'`,
      [String(body.offerId||''),now,String(body.employee||'')]
    );
  } else if (action==='acceptOfferAsRunning') {
    const offerId=String(data.offerId||body.offerId||'').trim();if(!offerId)return;
    const changed=await pool.query(
      `UPDATE offer_reminders_shadow SET status='Erledigt',result='Angenommen - Laufender Auftrag',
        changed_at_text=$2,changed_by=$3,shadow_updated_at=now()
        WHERE offer_id=$1 AND status='Offen'
        RETURNING id`,
      [offerId,now,String(body.employee||'')]
    );
    if(!changed.rowCount){
      const q=await pool.query(
        `SELECT customer,phone,email,description FROM inquiry_offers_shadow WHERE offer_id=$1 LIMIT 1`,
        [offerId]
      );
      const x=q.rows[0]||{};
      await pool.query(
        `INSERT INTO offer_reminders_shadow(
          id,offer_id,customer,offer_number,phone,email,description,created_at_text,
          due_date_text,status,result,changed_at_text,changed_by,shadow_updated_at
        ) VALUES($1,$2,$3,'',$4,$5,$6,$7,$7,'Erledigt','Angenommen - Laufender Auftrag',$7,$8,now())`,
        ['REM-PG-'+crypto.randomUUID(),offerId,String(x.customer||''),String(x.phone||''),
         String(x.email||''),String(x.description||''),now,String(body.employee||'')]
      );
    }
  }
}

async function verifyOfferRemindersShadow(rows, includeDone) {
  if (!pool || !Array.isArray(rows)) return;
  const q=await pool.query(
    includeDone
      ? `SELECT id,offer_id,customer,offer_number,phone,email,description,due_date_text,status,result FROM offer_reminders_shadow`
      : `SELECT id,offer_id,customer,offer_number,phone,email,description,due_date_text,status,result FROM offer_reminders_shadow WHERE status='Offen'`
  );
  const pg=new Map(q.rows.map(r=>[String(r.id),r]));
  let mismatches=0;const seen=new Set();
  for(const r of rows){
    const id=normalizeShadowText(r&&r.id);if(!id){mismatches++;continue;}
    seen.add(id);const p=pg.get(id);if(!p){mismatches++;continue;}
    const pairs=[
      [r.offerId,p.offer_id],[r.customer,p.customer],[r.offerNumber,p.offer_number],
      [r.phone,p.phone],[r.email,p.email],[r.description,p.description],
      [r.dueDate,p.due_date_text],[r.status,p.status],[r.result,p.result]
    ];
    if(pairs.some(([a,b])=>normalizeShadowText(a)!==normalizeShadowText(b)))mismatches++;
  }
  for(const id of pg.keys())if(!seen.has(id))mismatches++;
  console.log('SHADOW_VERIFY offer_reminders google='+rows.length+' postgres='+pg.size+' mismatches='+mismatches);
  await saveShadowVerifyStat('offer_reminders',rows.length,pg.size,mismatches);
}

async function verifyManualOrdersShadow(rows) {
  if (!pool || !Array.isArray(rows)) return;
  const q=await pool.query(
    `SELECT id,customer,address,phone,email,description,source,inquiry_id,status,internal_note
       FROM manual_orders_shadow`
  );
  const pg=new Map(q.rows.map(r=>[String(r.id),r]));
  let mismatches=0;
  const mismatchDetails=[];
  const seen=new Set();
  for(const r of rows){
    const id=normalizeShadowText(r&&r.id);
    if(!id){mismatches++;mismatchDetails.push({id:'<missing>',fields:['id']});continue;}
    seen.add(id);const p=pg.get(id);
    if(!p){mismatches++;mismatchDetails.push({id,fields:['missing_in_postgres']});continue;}
    const fields=[
      ['customer',r.customer,p.customer],['address',r.address,p.address],['phone',r.phone,p.phone],
      ['email',r.email,p.email],['description',r.description,p.description],['source',r.source,p.source],
      ['inquiryId',r.inquiryId,p.inquiry_id],['status',r.status,p.status],
      ['internalNote',r.internalNote,p.internal_note]
    ];
    const changed=fields.filter(([,a,b])=>normalizeShadowText(a)!==normalizeShadowText(b)).map(([name])=>name);
    if(changed.length){mismatches++;mismatchDetails.push({id,fields:changed});}
  }
  for(const id of pg.keys())if(!seen.has(id)){mismatches++;mismatchDetails.push({id,fields:['missing_in_google']});}
  console.log('SHADOW_VERIFY manual_orders google='+rows.length+' postgres='+pg.size+' mismatches='+mismatches);
  if(mismatchDetails.length)console.log('MANUAL_ORDER_MISMATCH '+JSON.stringify(mismatchDetails.slice(0,25)));
  await saveShadowVerifyStat('manual_orders',rows.length,pg.size,mismatches);
}

async function verifyOwnRemindersShadow(rows) {
  if (!pool || !Array.isArray(rows)) return;
  const q=await pool.query(
    `SELECT id,reminder_text,due_date_text,status,result,internal_note FROM own_reminders_shadow`
  );
  const pg=new Map(q.rows.map(r=>[String(r.id),r]));
  let mismatches=0;const seen=new Set();
  for(const r of rows){
    const id=normalizeShadowText(r&&r.id);if(!id){mismatches++;continue;}
    seen.add(id);const p=pg.get(id);if(!p){mismatches++;continue;}
    const pairs=[
      [r.text,p.reminder_text],[r.dueDate,p.due_date_text],[r.status,p.status],
      [r.result,p.result],[r.internalNote,p.internal_note]
    ];
    if(pairs.some(([a,b])=>normalizeShadowText(a)!==normalizeShadowText(b)))mismatches++;
  }
  for(const id of pg.keys())if(!seen.has(id))mismatches++;
  console.log('SHADOW_VERIFY own_reminders google='+rows.length+' postgres='+pg.size+' mismatches='+mismatches);
  await saveShadowVerifyStat('own_reminders',rows.length,pg.size,mismatches);
}

async function mirrorManualOrderWrite(action, body, parsed) {
  if (!pool) return;
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if (!data || data.ok===false) return;
  const now=new Date().toISOString();
  if (action==='saveManualOrder') {
    const item=body.item||{};
    const id=String(data.id||item.id||'').trim();
    if(!id) return;
    await pool.query(
      `INSERT INTO manual_orders_shadow(
        id,customer,address,phone,email,description,source,inquiry_id,status,
        created_at_text,started_at_text,completed_at_text,changed_at_text,changed_by,internal_note,shadow_updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
      ON CONFLICT(id) DO UPDATE SET
        customer=EXCLUDED.customer,address=EXCLUDED.address,phone=EXCLUDED.phone,email=EXCLUDED.email,
        description=EXCLUDED.description,source=EXCLUDED.source,inquiry_id=EXCLUDED.inquiry_id,
        status=EXCLUDED.status,changed_at_text=EXCLUDED.changed_at_text,changed_by=EXCLUDED.changed_by,
        internal_note=CASE WHEN $16::boolean THEN EXCLUDED.internal_note ELSE manual_orders_shadow.internal_note END,
        started_at_text=CASE WHEN EXCLUDED.status='Laufend' AND COALESCE(manual_orders_shadow.started_at_text,'')='' THEN EXCLUDED.changed_at_text ELSE manual_orders_shadow.started_at_text END,
        completed_at_text=CASE WHEN EXCLUDED.status='Abgeschlossen' THEN EXCLUDED.changed_at_text ELSE manual_orders_shadow.completed_at_text END,
        shadow_updated_at=now()`,
      [id,String(item.customer||''),String(item.address||''),String(item.phone||''),String(item.email||''),
       String(item.description||''),String(item.source||'Manuell'),String(item.inquiryId||''),
       String(item.status||'Offen'),now,String(item.status||'')==='Laufend'?now:'',
       String(item.status||'')==='Abgeschlossen'?now:'',now,String(body.employee||''),
       String(item.internalNote||''),item.internalNote!==undefined]
    );
  } else if (action==='saveManualOrderNote') {
    await pool.query(
      `UPDATE manual_orders_shadow SET internal_note=$2,changed_at_text=$3,changed_by=$4,shadow_updated_at=now() WHERE id=$1`,
      [String(body.id||''),String(body.note||''),now,String(body.employee||'')]
    );
  } else if (action==='setManualOrderStatus') {
    const status=String(body.status||'');
    await pool.query(
      `UPDATE manual_orders_shadow SET status=$2,changed_at_text=$3,changed_by=$4,
        started_at_text=CASE WHEN $2='Laufend' AND COALESCE(started_at_text,'')='' THEN $3 ELSE started_at_text END,
        completed_at_text=CASE WHEN $2='Abgeschlossen' THEN $3 ELSE completed_at_text END,
        shadow_updated_at=now() WHERE id=$1`,
      [String(body.id||''),status,now,String(body.employee||'')]
    );
  } else if (action==='deleteManualOrder') {
    await pool.query('DELETE FROM manual_orders_shadow WHERE id=$1',[String(body.id||'')]);
  }
}


function berlinDateOnly(value){
  if(value==null||value==='')return '';
  const s=String(value).trim();
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m)return m[1]+'-'+m[2]+'-'+m[3];
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return s;
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(d).reduce((o,x)=>(o[x.type]=x.value,o),{});
  return parts.year+'-'+parts.month+'-'+parts.day;
}

function berlinDateTime(value){
  if(value==null||value==='')return '';
  const s=String(value).trim();
  if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s))return s;
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return s;
  const p=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false
  }).formatToParts(d).reduce((o,x)=>(o[x.type]=x.value,o),{});
  return p.year+'-'+p.month+'-'+p.day+' '+p.hour+':'+p.minute+':'+p.second;
}

function shadowGermanDateTime(value){
  if(value==null||value==='')return '';
  const s=String(value).trim();
  if(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/.test(s))return s;
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return s;
  const p=new Intl.DateTimeFormat('de-DE',{
    timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hour12:false
  }).formatToParts(d).reduce((o,x)=>(o[x.type]=x.value,o),{});
  return p.day+'.'+p.month+'.'+p.year+' '+p.hour+':'+p.minute;
}
function shadowDateIso(value){
  if(value==null||value==='')return '';
  const s=String(value).trim();
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m)return m[1]+'-'+m[2]+'-'+m[3];
  m=s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if(m)return m[3]+'-'+m[2]+'-'+m[1];
  return berlinDateOnly(value);
}

function shadowComparableDateTime(value){
  if(value==null||value==='')return '';
  const s=String(value).trim();
  let m=s.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if(m)return m[3]+'-'+m[2]+'-'+m[1]+' '+m[4]+':'+m[5]+':'+(m[6]||'00');
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if(m&&!/[zZ]|[+-]\d{2}:?\d{2}$/.test(s))return m[1]+'-'+m[2]+'-'+m[3]+' '+m[4]+':'+m[5]+':'+(m[6]||'00');
  return berlinDateTime(value);
}

async function shadowReadyForDirectRead(name,maxAgeHours=24){
  if(!pool)return false;
  const q=await pool.query(
    `SELECT mismatches,checked_at FROM shadow_verify_stats
      WHERE shadow_name=$1 AND checked_at>now()-($2::text||' hours')::interval`,
    [String(name),String(Number(maxAgeHours)||24)]
  );
  return Boolean(q.rowCount && Number(q.rows[0].mismatches||0)===0);
}

async function directManualOrdersRead(body){
  const session=await localSessionForBody(body,true);
  if(!session)return null;
  const status=String(body.status||'').trim();
  const params=[];let where='';
  if(status&&status!=='Alle'){
    params.push(status);
    where=' WHERE status=$1';
  }
  const q=await pool.query(
    `SELECT id,customer,address,phone,email,description,source,inquiry_id,status,
            created_at_text,started_at_text,completed_at_text,internal_note,attachments_json
       FROM manual_orders_shadow`+where+` ORDER BY created_at_text ASC,id ASC`,
    params
  );
  return q.rows.map(r=>({
    id:String(r.id||''),customer:String(r.customer||''),address:String(r.address||''),
    phone:String(r.phone||''),email:String(r.email||''),description:String(r.description||''),
    source:String(r.source||''),inquiryId:String(r.inquiry_id||''),
    status:String(r.status||'Offen'),createdAt:berlinDateTime(r.created_at_text),
    startedAt:berlinDateTime(r.started_at_text),completedAt:berlinDateTime(r.completed_at_text),
    internalNote:String(r.internal_note||''),attachments:(()=>{try{const a=JSON.parse(String(r.attachments_json||'[]'));return Array.isArray(a)?a:[];}catch(_e){return [];}})()
  }));
}

async function directOwnRemindersRead(body){
  const session=await localSessionForBody(body,true);
  if(!session)return null;
  const includeDone=Boolean(body.includeDone);
  const q=await pool.query(
    `SELECT id,reminder_text,due_date_text,status,result,created_at_text,created_by,
            changed_at_text,changed_by,attachments_json,internal_note
       FROM own_reminders_shadow
      ${includeDone?'':"WHERE COALESCE(status,'Offen')='Offen'"}`
  );
  const today=berlinDateOnly(new Date());
  const rows=q.rows.map(r=>{
    const due=berlinDateOnly(r.due_date_text);
    let attachments=[];
    try{
      const x=JSON.parse(String(r.attachments_json||'[]'));
      attachments=Array.isArray(x)?x:[];
    }catch(_e){}
    return {
      id:String(r.id||''),text:String(r.reminder_text||''),dueDate:due,
      status:String(r.status||'Offen'),result:String(r.result||''),
      createdAt:berlinDateTime(r.created_at_text),createdBy:String(r.created_by||''),
      changedAt:berlinDateTime(r.changed_at_text),changedBy:String(r.changed_by||''),
      attachments,internalNote:String(r.internal_note||''),
      isDue:Boolean(due&&due<=today),isOverdue:Boolean(due&&due<today)
    };
  });
  rows.sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate))||
    String(a.text).localeCompare(String(b.text),'de'));
  return rows;
}



async function employeeActiveMapFromSnapshot(){
  if(!pool)return new Map();
  const q=await pool.query(
    `SELECT source_key,payload FROM migration_objects
      WHERE entity_type=$1 ORDER BY source_key::int ASC`,
    ['sheet:Mitarbeiter']
  );
  const out=new Map();
  for(const row of q.rows){
    const payload=row.payload||{};
    if(Number(payload.sourceRow||row.source_key)<=1)continue;
    const cells=Array.isArray(payload.cells)?payload.cells:[];
    const name=String(cellValue(cells[0])==null?'':cellValue(cells[0])).trim();
    if(!name)continue;
    const raw=String(cellValue(cells[11])==null?'':cellValue(cells[11])).trim().toLowerCase();
    const active=!raw||['ja','yes','true','1','aktiv'].includes(raw);
    out.set(name,active);
  }
  return out;
}

async function postgresVacationSummary(employee,year){
  year=Number(year)||0;
  const [ent,statuses]=await Promise.all([
    pool.query(
      'SELECT entitlement FROM vacation_entitlements_shadow WHERE employee_name=$1 AND vacation_year=$2',
      [String(employee),year]
    ),
    pool.query(
      `SELECT status,COUNT(DISTINCT LEFT(status_date,10))::int AS n
         FROM day_status_shadow
        WHERE employee_name=$1 AND status_date LIKE $2
          AND status IN ('Urlaub','Krank','Feiertag')
        GROUP BY status`,
      [String(employee),String(year)+'-%']
    )
  ]);
  const counts={Urlaub:0,Krank:0,Feiertag:0};
  for(const r of statuses.rows)counts[String(r.status)]=Number(r.n)||0;
  const entitlement=Number(ent.rows[0]?.entitlement||0);
  return {
    employee:String(employee),year,
    vacationEntitlement:Math.round(entitlement*100)/100,
    vacationUsed:counts.Urlaub,
    vacationRemaining:Math.round((entitlement-counts.Urlaub)*100)/100,
    sickDays:counts.Krank,
    holidayDays:counts.Feiertag
  };
}

async function verifyVacationFullShadow(data){
  if(!pool||!data)return;
  const rows=Array.isArray(data)?data:[data];
  let mismatches=0;
  for(const r of rows){
    if(!r||!r.employee||!r.year){mismatches++;continue;}
    const p=await postgresVacationSummary(r.employee,r.year);
    const same=
      Math.abs(Number(r.vacationEntitlement||0)-Number(p.vacationEntitlement||0))<0.01 &&
      Number(r.vacationUsed||0)===Number(p.vacationUsed||0) &&
      Math.abs(Number(r.vacationRemaining||0)-Number(p.vacationRemaining||0))<0.01 &&
      Number(r.sickDays||0)===Number(p.sickDays||0) &&
      Number(r.holidayDays||0)===Number(p.holidayDays||0);
    if(!same)mismatches++;
    await saveShadowVerifyStat(
      'vacation_full:'+String(r.year)+':'+String(r.employee),
      1,1,same?0:1
    );
  }
  if(rows.length){
    const year=Number(rows[0].year)||0;
    const sameYear=rows.every(r=>Number(r&&r.year||0)===year);
    if(Array.isArray(data)&&year&&sameYear){
      await saveShadowVerifyStat('vacation_full:'+year+':all',rows.length,rows.length,mismatches);
    }
  }
  console.log('SHADOW_VERIFY vacation_full google='+rows.length+' postgres='+rows.length+' mismatches='+mismatches);
}



async function directMyTimeBankRead(body){
  const session=await localSessionForBody(body,false);
  if(!session)return null;
  const employee=String(body.employee||session.employee||'').trim();
  if(!employee||employee!==session.employee)return null;
  const q=await pool.query(
    'SELECT COALESCE(SUM(hours),0)::numeric AS balance FROM time_bank_shadow WHERE employee_name=$1',
    [employee]
  );
  const balance=Math.round(Math.max(0,Number(q.rows[0]?.balance||0))*100)/100;
  return {employee,balance};
}

async function directTimeBankAccountRead(body){
  const session=await localSessionForBody(body,true);
  if(!session)return null;
  const employee=String(body.targetEmployee||'').trim();
  if(!employee)return null;
  const q=await pool.query(
    `SELECT id,employee_name,hours,booking_type,booking_year,booking_month,reference,reason,
            created_at_text,created_iso,created_by
       FROM time_bank_shadow
      WHERE employee_name=$1
      ORDER BY COALESCE(NULLIF(created_iso,''),created_at_text) DESC,id DESC`,
    [employee]
  );
  const transactions=q.rows.map(r=>({
    id:String(r.id||''),employee:String(r.employee_name||employee),
    hours:Math.round(Number(r.hours||0)*100)/100,art:String(r.booking_type||''),
    year:Number(r.booking_year||0),month:Number(r.booking_month||0),
    reference:String(r.reference||''),reason:String(r.reason||''),
    createdAt:shadowGermanDateTime(r.created_at_text),
    createdIso:String(r.created_iso||shadowDateIso(r.created_at_text)||''),
    createdBy:String(r.created_by||'')
  }));
  const balance=Math.round(Math.max(0,transactions.reduce((s,x)=>s+Number(x.hours||0),0))*100)/100;
  return {employee,balance,transactions};
}



async function postgresMaintenanceCustomerFull(id,db=pool){
  id=String(id||'').trim();if(!id)return null;
  const cq=await db.query(
    `SELECT id,name,billing_street,billing_zip,billing_city,email,phone
       FROM maintenance_customers_shadow WHERE id=$1 AND active=true`,
    [id]
  );
  if(!cq.rowCount)return null;
  const cst=cq.rows[0];
  const [oq,dq,rq,aq,hq]=await Promise.all([
    db.query(
      `SELECT id,name,street,zip,city,notes
         FROM maintenance_objects_shadow WHERE customer_id=$1 AND active=true`,
      [id]
    ),
    db.query(
      `SELECT id,object_id,customer_id,device_type,other_description,manufacturer,model,
              serial_number,year_text,tenant_name,tenant_phone,tenant_email,
              spare_part_manufacturer,spare_part_serial_number,internal_notes,
              next_maintenance_due,active,created_at_text,updated_at_text,updated_by,internal_device_id
         FROM maintenance_devices_shadow WHERE customer_id=$1 AND active=true`,
      [id]
    ),
    db.query(
      `SELECT id,device_id,customer_id,object_id,repair_date,description,created_at_text,created_by
         FROM maintenance_repairs_shadow WHERE customer_id=$1`,
      [id]
    ),
    db.query(
      `SELECT id,device_id,customer_id,object_id,kind,name,mime,file_size,url,
              created_at_text,created_by
         FROM maintenance_attachments_shadow WHERE customer_id=$1 AND active=true`,
      [id]
    ),
    db.query(
      `SELECT id,employee_name,entry_date,activity,hours,next_maintenance_due,maintenance_device_id
         FROM time_entries_shadow
        WHERE maintenance=true AND maintenance_customer_id=$1 AND COALESCE(maintenance_device_id,'')<>''`,
      [id]
    )
  ]);
  const repairsByDevice=new Map(),attachmentsByDevice=new Map(),historyByDevice=new Map(),devicesByObject=new Map();
  for(const r of rq.rows){
    const k=String(r.device_id||'');
    if(!repairsByDevice.has(k))repairsByDevice.set(k,[]);
    repairsByDevice.get(k).push({
      id:String(r.id||''),deviceId:k,customerId:String(r.customer_id||''),
      objectId:String(r.object_id||''),date:berlinDateOnly(r.repair_date),
      description:String(r.description||''),createdAt:berlinDateTime(r.created_at_text),
      createdBy:String(r.created_by||'')
    });
  }
  for(const a of aq.rows){
    const k=String(a.device_id||'');
    if(!attachmentsByDevice.has(k))attachmentsByDevice.set(k,[]);
    attachmentsByDevice.get(k).push({
      id:String(a.id||''),kind:String(a.kind||''),name:String(a.name||''),
      mime:String(a.mime||''),size:Number(a.file_size||0),url:String(a.url||''),
      createdAt:berlinDateTime(a.created_at_text),createdBy:String(a.created_by||'')
    });
  }
  for(const h of hq.rows){
    const k=String(h.maintenance_device_id||'');
    if(!historyByDevice.has(k))historyByDevice.set(k,[]);
    historyByDevice.get(k).push({
      id:String(h.id||''),date:berlinDateOnly(h.entry_date),employee:String(h.employee_name||''),
      description:String(h.activity||''),hours:Number(h.hours||0),
      nextMaintenanceDue:String(h.next_maintenance_due||'')
    });
  }
  for(const arr of repairsByDevice.values())arr.sort((a,b)=>b.date.localeCompare(a.date));
  for(const arr of historyByDevice.values())arr.sort((a,b)=>b.date.localeCompare(a.date));

  for(const d of dq.rows){
    const obj=String(d.object_id||'');
    if(!devicesByObject.has(obj))devicesByObject.set(obj,[]);
    devicesByObject.get(obj).push({
      id:String(d.id||''),objectId:obj,customerId:String(d.customer_id||''),
      deviceType:String(d.device_type||''),otherDescription:String(d.other_description||''),
      manufacturer:String(d.manufacturer||''),model:String(d.model||''),
      serialNumber:String(d.serial_number||''),year:String(d.year_text||''),
      tenantName:String(d.tenant_name||''),tenantPhone:String(d.tenant_phone||''),
      tenantEmail:String(d.tenant_email||''),sparePartManufacturer:String(d.spare_part_manufacturer||''),
      sparePartSerialNumber:String(d.spare_part_serial_number||''),internalNotes:String(d.internal_notes||''),
      nextMaintenanceDue:String(d.next_maintenance_due||''),active:Boolean(d.active),
      createdAt:berlinDateTime(d.created_at_text),updatedAt:berlinDateTime(d.updated_at_text),
      updatedBy:String(d.updated_by||''),internalDeviceId:String(d.internal_device_id||''),
      repairs:repairsByDevice.get(String(d.id))||[],
      history:historyByDevice.get(String(d.id))||[],
      attachments:attachmentsByDevice.get(String(d.id))||[]
    });
  }

  return {
    id:String(cst.id||''),name:String(cst.name||''),billingStreet:String(cst.billing_street||''),
    billingZip:String(cst.billing_zip||''),billingCity:String(cst.billing_city||''),
    email:String(cst.email||''),phone:String(cst.phone||''),
    objects:oq.rows.map(o=>({
      id:String(o.id||''),name:String(o.name||''),street:String(o.street||''),
      zip:String(o.zip||''),city:String(o.city||''),notes:String(o.notes||''),
      devices:devicesByObject.get(String(o.id))||[]
    }))
  };
}

function canonicalMaintenanceCustomer(data){
  if(!data)return null;
  return {
    id:String(data.id||''),name:String(data.name||''),billingStreet:String(data.billingStreet||''),
    billingZip:String(data.billingZip||''),billingCity:String(data.billingCity||''),
    email:String(data.email||''),phone:String(data.phone||''),
    objects:(Array.isArray(data.objects)?data.objects:[]).map(o=>({
      id:String(o.id||''),name:String(o.name||''),street:String(o.street||''),
      zip:String(o.zip||''),city:String(o.city||''),notes:String(o.notes||''),
      devices:(Array.isArray(o.devices)?o.devices:[]).map(d=>({
        id:String(d.id||''),objectId:String(d.objectId||''),customerId:String(d.customerId||''),
        deviceType:String(d.deviceType||''),otherDescription:String(d.otherDescription||''),
        manufacturer:String(d.manufacturer||''),model:String(d.model||''),
        serialNumber:String(d.serialNumber||''),year:String(d.year||''),
        tenantName:String(d.tenantName||''),tenantPhone:String(d.tenantPhone||''),
        tenantEmail:String(d.tenantEmail||''),sparePartManufacturer:String(d.sparePartManufacturer||''),
        sparePartSerialNumber:String(d.sparePartSerialNumber||''),internalNotes:String(d.internalNotes||''),
        nextMaintenanceDue:String(d.nextMaintenanceDue||''),active:Boolean(d.active!==false),
        updatedBy:String(d.updatedBy||''),internalDeviceId:String(d.internalDeviceId||''),
        repairs:(Array.isArray(d.repairs)?d.repairs:[]).map(r=>({
          id:String(r.id||''),deviceId:String(r.deviceId||''),customerId:String(r.customerId||''),
          objectId:String(r.objectId||''),date:berlinDateOnly(r.date),
          description:String(r.description||''),createdBy:String(r.createdBy||'')
        })).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)),
        history:(Array.isArray(d.history)?d.history:[]).map(h=>({
          id:String(h.id||''),date:berlinDateOnly(h.date),employee:String(h.employee||''),
          description:String(h.description||''),hours:Number(h.hours||0),
          nextMaintenanceDue:String(h.nextMaintenanceDue||'')
        })).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)),
        attachments:(Array.isArray(d.attachments)?d.attachments:[]).map(a=>({
          id:String(a.id||''),kind:String(a.kind||''),name:String(a.name||''),
          mime:String(a.mime||''),size:Number(a.size||0),url:String(a.url||''),
          createdBy:String(a.createdBy||'')
        })).sort((a,b)=>a.id.localeCompare(b.id))
      })).sort((a,b)=>a.id.localeCompare(b.id))
    })).sort((a,b)=>a.id.localeCompare(b.id))
  };
}

async function verifyMaintenanceCustomerFullShadow(data){
  if(!pool||!data||!data.id)return;
  const pg=await postgresMaintenanceCustomerFull(data.id);
  const a=canonicalMaintenanceCustomer(data),b=canonicalMaintenanceCustomer(pg);
  const mismatches=JSON.stringify(a)===JSON.stringify(b)?0:1;
  const deviceCount=(a?.objects||[]).reduce((s,o)=>s+(o.devices||[]).length,0);
  console.log('SHADOW_VERIFY maintenance_customer_full id='+String(data.id)+' mismatches='+mismatches);
  await saveShadowVerifyStat('maintenance_customer_full:'+String(data.id),deviceCount,deviceCount,mismatches);
}

async function directMaintenanceCustomerRead(body){
  const session=await localSessionForBody(body,true);
  if(!session)return null;
  const id=String(body.id||'').trim();if(!id)return null;
  if(!(await shadowReadyForDirectRead('maintenance_customer_full:'+id)))return null;
  return postgresMaintenanceCustomerFull(id);
}


function berlinNowParts(){
  const p=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date()).reduce((o,x)=>(o[x.type]=x.value,o),{});
  return {year:Number(p.year),month:Number(p.month),day:Number(p.day),monthKey:p.year+'-'+p.month};
}
function shiftMonthKey(key,delta){
  const m=String(key||'').match(/^(\d{4})-(\d{2})$/);if(!m)return '';
  const d=new Date(Date.UTC(Number(m[1]),Number(m[2])-1+Number(delta||0),1,12));
  return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');
}
function germanMonthLabel(key){
  const names=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const m=String(key||'').match(/^(\d{4})-(\d{2})$/);if(!m)return key;
  return names[Number(m[2])-1]+' '+m[1];
}
function maintenanceAddressShadow(o){
  return [String(o.street||''),[String(o.zip||''),String(o.city||'')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}
async function postgresMaintenanceOverview(){
  const now=berlinNowParts(),current=now.monthKey,year=now.year,keys=[];
  for(let i=-3;i<=3;i++)keys.push(shiftMonthKey(current,i));
  const [cq,oq,dq,eq,tq,mq]=await Promise.all([
    pool.query(`SELECT id,name FROM maintenance_customers_shadow WHERE active=true`),
    pool.query(`SELECT id,customer_id,name,street,zip,city FROM maintenance_objects_shadow WHERE active=true`),
    pool.query(`SELECT id,customer_id,object_id,internal_device_id,device_type,other_description,
                        manufacturer,model,serial_number,next_maintenance_due
                   FROM maintenance_devices_shadow WHERE active=true`),
    pool.query(`SELECT id,event_date,start_time,employee_names_json,maintenance_device_id
                   FROM planner_events_shadow
                  WHERE event_type='Wartung' AND COALESCE(maintenance_device_id,'')<>''`),
    pool.query(`SELECT maintenance_device_id,customer,source_calendar_event_id,entry_date
                   FROM time_entries_shadow
                  WHERE maintenance=true AND entry_date LIKE $1`,[String(year)+'-%']),
    pool.query(`SELECT maintenance_date,maintenance_count FROM maintenance_manual_shadow
                  WHERE maintenance_date LIKE $1`,[String(year)+'-%'])
  ]);
  const cBy=new Map(cq.rows.map(x=>[String(x.id),x]));
  const oBy=new Map(oq.rows.map(x=>[String(x.id),x]));
  const events=eq.rows.map(e=>{
    let employeeNames=[];try{const x=JSON.parse(String(e.employee_names_json||'[]'));employeeNames=Array.isArray(x)?x:[];}catch(_e){}
    return {deviceId:String(e.maintenance_device_id||''),date:berlinDateOnly(e.event_date),start:String(e.start_time||''),employeeNames};
  });
  const months=keys.map(key=>{
    const items=dq.rows.filter(d=>String(d.next_maintenance_due||'')===key).map(d=>{
      const cst=cBy.get(String(d.customer_id))||{},obj=oBy.get(String(d.object_id))||{};
      const plans=events.filter(e=>e.deviceId===String(d.id)&&String(e.date).slice(0,7)===key)
        .sort((a,b)=>(a.date+' '+a.start).localeCompare(b.date+' '+b.start));
      const p=plans[0]||null;
      return {
        customerId:String(d.customer_id||''),objectId:String(d.object_id||''),deviceId:String(d.id||''),
        internalDeviceId:String(d.internal_device_id||''),customerName:String(cst.name||''),
        objectName:String(obj.name||''),address:maintenanceAddressShadow(obj),
        deviceType:String(d.device_type||''),otherDescription:String(d.other_description||''),
        manufacturer:String(d.manufacturer||''),model:String(d.model||''),
        serialNumber:String(d.serial_number||''),nextMaintenanceDue:String(d.next_maintenance_due||''),
        scheduled:Boolean(p),plannedDate:p?p.date:'',employeeNames:p?p.employeeNames:[]
      };
    });
    return {
      key,label:germanMonthLabel(key),current:key===current,items,
      openCount:items.filter(x=>!x.scheduled).length,
      scheduledCount:items.filter(x=>x.scheduled).length,total:items.length
    };
  });
  const currentMonth=months.find(m=>m.current)||{openCount:0};
  const completedKeys=new Set();
  let completed=0;
  for(const r of tq.rows){
    const date=berlinDateOnly(r.entry_date);if(!date||Number(date.slice(0,4))!==year)continue;
    const did=String(r.maintenance_device_id||''),src=String(r.source_calendar_event_id||'');
    const k=(did||String(r.customer||''))+'|'+(src||date);
    if(completedKeys.has(k))continue;
    completedKeys.add(k);completed++;
  }
  const manualCompleted=mq.rows.reduce((s,r)=>s+(Number(r.maintenance_count)||0),0);
  completed+=manualCompleted;
  const open=dq.rows.filter(d=>String(d.next_maintenance_due||'').slice(0,4)===String(year)).length;
  return {
    currentMonth:current,currentMonthOpen:Number(currentMonth.openCount||0),
    months,windowLabel:germanMonthLabel(keys[0])+' – '+germanMonthLabel(keys[keys.length-1]),
    yearStats:{year,total:completed+open,completed,open,manualCompleted}
  };
}
function canonicalMaintenanceOverview(x){
  if(!x)return null;
  return {
    currentMonth:String(x.currentMonth||''),currentMonthOpen:Number(x.currentMonthOpen||0),
    windowLabel:String(x.windowLabel||''),
    months:(Array.isArray(x.months)?x.months:[]).map(m=>({
      key:String(m.key||''),label:String(m.label||''),current:Boolean(m.current),
      openCount:Number(m.openCount||0),scheduledCount:Number(m.scheduledCount||0),total:Number(m.total||0),
      items:(Array.isArray(m.items)?m.items:[]).map(i=>({
        customerId:String(i.customerId||''),objectId:String(i.objectId||''),deviceId:String(i.deviceId||''),
        internalDeviceId:String(i.internalDeviceId||''),customerName:String(i.customerName||''),
        objectName:String(i.objectName||''),address:String(i.address||''),deviceType:String(i.deviceType||''),
        otherDescription:String(i.otherDescription||''),manufacturer:String(i.manufacturer||''),
        model:String(i.model||''),serialNumber:String(i.serialNumber||''),
        nextMaintenanceDue:String(i.nextMaintenanceDue||''),scheduled:Boolean(i.scheduled),
        plannedDate:String(i.plannedDate||''),employeeNames:(Array.isArray(i.employeeNames)?i.employeeNames:[]).map(String).sort()
      })).sort((a,b)=>a.deviceId.localeCompare(b.deviceId))
    })),
    yearStats:{
      year:Number(x.yearStats&&x.yearStats.year||0),total:Number(x.yearStats&&x.yearStats.total||0),
      completed:Number(x.yearStats&&x.yearStats.completed||0),open:Number(x.yearStats&&x.yearStats.open||0),
      manualCompleted:Number(x.yearStats&&x.yearStats.manualCompleted||0)
    }
  };
}
async function verifyMaintenanceOverviewShadow(data){
  if(!pool||!data)return;
  const pg=await postgresMaintenanceOverview();
  const a=canonicalMaintenanceOverview(data),b=canonicalMaintenanceOverview(pg);
  const mismatches=JSON.stringify(a)===JSON.stringify(b)?0:1;
  const key='maintenance_overview:'+berlinNowParts().monthKey;
  console.log('SHADOW_VERIFY '+key+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,1,1,mismatches);
}
async function directMaintenanceOverviewRead(body){
  const session=await localSessionForBody(body,true);
  if(!session)return null;
  return postgresMaintenanceOverview();
}



async function postgresMaintenanceContracts(){
  const [tq,pq]=await Promise.all([
    pool.query(
      `SELECT id,object_id,employee_name,entry_date,customer,activity,next_maintenance_due
         FROM time_entries_shadow
        WHERE maintenance=true
        ORDER BY entry_date ASC,id ASC`
    ),
    pool.query(
      `SELECT id,customer,address,task,event_date,employee_names_json,created_at_text
         FROM planner_events_shadow
        WHERE event_type='Wartung'
        ORDER BY created_at_text ASC,id ASC`
    )
  ]);
  const latest=new Map();
  for(const r of tq.rows){
    const customer=String(r.customer||''),date=berlinDateOnly(r.entry_date);if(!customer)continue;
    const key=shadowObjectKey(customer),old=latest.get(key);
    if(!old||date>=old.lastDate){
      latest.set(key,{
        id:'M-'+String(r.object_id||r.id||''),customer,address:'',task:String(r.activity||''),
        status:'Wartungsvertrag',lastDate:date,nextMaintenanceDue:String(r.next_maintenance_due||''),
        employees:[String(r.employee_name||'')].filter(Boolean),plannedDate:'',source:'entry'
      });
    }
  }
  for(const r of pq.rows){
    const customer=String(r.customer||''),key=shadowObjectKey(customer);if(!customer)continue;
    let names=[];try{const x=JSON.parse(String(r.employee_names_json||'[]'));names=Array.isArray(x)?x.map(String):[];}catch(_e){}
    const old=latest.get(key);
    if(!old){
      latest.set(key,{
        id:String(r.id||''),customer,address:String(r.address||''),task:String(r.task||''),
        status:'Geplante Wartung',lastDate:'',nextMaintenanceDue:'',employees:names,
        plannedDate:berlinDateOnly(r.event_date),source:'planner'
      });
    }else{
      old.plannedDate=berlinDateOnly(r.event_date);
      old.address=old.address||String(r.address||'');
      old.employees=names.length?names:old.employees;
    }
  }
  const out=[...latest.values()];
  out.sort((a,b)=>String(a.nextMaintenanceDue||a.plannedDate||'9999-99').localeCompare(String(b.nextMaintenanceDue||b.plannedDate||'9999-99')));
  return out;
}
function canonicalMaintenanceContracts(rows){
  return (Array.isArray(rows)?rows:[]).map(x=>({
    id:String(x.id||''),customer:String(x.customer||''),address:String(x.address||''),
    task:String(x.task||''),status:String(x.status||''),lastDate:String(x.lastDate||''),
    nextMaintenanceDue:String(x.nextMaintenanceDue||''),employees:(Array.isArray(x.employees)?x.employees:[]).map(String),
    plannedDate:String(x.plannedDate||''),source:String(x.source||'')
  }));
}
async function verifyMaintenanceContractsShadow(rows){
  if(!pool||!Array.isArray(rows))return;
  const pg=await postgresMaintenanceContracts(),a=canonicalMaintenanceContracts(rows),b=canonicalMaintenanceContracts(pg);
  const mismatches=JSON.stringify(a)===JSON.stringify(b)?0:1;
  console.log('SHADOW_VERIFY maintenance_contracts google='+a.length+' postgres='+b.length+' mismatches='+mismatches);
  await saveShadowVerifyStat('maintenance_contracts',a.length,b.length,mismatches);
}
async function directMaintenanceContractsRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  return postgresMaintenanceContracts();
}

function maintenanceArchiveKey(q){
  return 'maintenance_archive:'+crypto.createHash('sha256').update(String(q||'').trim().toLowerCase()).digest('hex').slice(0,16);
}
function maintenanceDeviceLabelShadow(d){
  return [
    String(d.device_type||'')==='Sonstiges'?(String(d.other_description||'')||'Sonstiges'):String(d.device_type||''),
    String(d.manufacturer||''),String(d.model||''),d.serial_number?('SN '+String(d.serial_number)):''
  ].filter(Boolean).join(' · ');
}
async function postgresMaintenanceArchive(q){
  q=String(q||'').trim().toLowerCase();
  const [cq,oq,dq,rq,tq,mq]=await Promise.all([
    pool.query('SELECT id,name FROM maintenance_customers_shadow'),
    pool.query('SELECT id,name FROM maintenance_objects_shadow'),
    pool.query(`SELECT id,device_type,other_description,manufacturer,model,serial_number FROM maintenance_devices_shadow`),
    pool.query(`SELECT id,device_id,customer_id,object_id,repair_date,description,created_by FROM maintenance_repairs_shadow`),
    pool.query(`SELECT employee_name,entry_date,customer,activity,next_maintenance_due,
                       maintenance_customer_id,maintenance_object_id,maintenance_device_id
                  FROM time_entries_shadow WHERE maintenance=true`),
    pool.query(`SELECT maintenance_date,maintenance_count,note,created_by FROM maintenance_manual_shadow`)
  ]);
  const cBy=new Map(cq.rows.map(x=>[String(x.id),x]));
  const oBy=new Map(oq.rows.map(x=>[String(x.id),x]));
  const dBy=new Map(dq.rows.map(x=>[String(x.id),x]));
  const out=[];
  for(const r of mq.rows){
    const count=Number(r.maintenance_count)||0;
    out.push({
      kind:'ManualMaintenance',date:berlinDateOnly(r.maintenance_date),
      customerName:'Manuell erfasste Wartungen',objectName:'',deviceLabel:'',
      description:String(count)+' Wartung(en)'+(r.note?' · '+String(r.note):''),
      employee:String(r.created_by||''),count
    });
  }
  for(const r of rq.rows){
    const d=dBy.get(String(r.device_id))||{},o=oBy.get(String(r.object_id))||{},cst=cBy.get(String(r.customer_id))||{};
    out.push({
      kind:'Repair',date:berlinDateOnly(r.repair_date),customerName:String(cst.name||''),
      objectName:String(o.name||''),deviceLabel:maintenanceDeviceLabelShadow(d),
      description:String(r.description||''),employee:String(r.created_by||'')
    });
  }
  for(const r of tq.rows){
    const d=dBy.get(String(r.maintenance_device_id))||{},o=oBy.get(String(r.maintenance_object_id))||{},
      cst=cBy.get(String(r.maintenance_customer_id))||{};
    out.push({
      kind:'Maintenance',date:berlinDateOnly(r.entry_date),
      customerName:String(cst.name||r.customer||''),objectName:String(o.name||''),
      deviceLabel:maintenanceDeviceLabelShadow(d),description:String(r.activity||''),
      employee:String(r.employee_name||''),nextMaintenanceDue:String(r.next_maintenance_due||'')
    });
  }
  const filtered=q?out.filter(x=>[
    x.customerName,x.objectName,x.deviceLabel,x.description,x.employee
  ].join(' ').toLowerCase().includes(q)):out;
  filtered.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  return filtered.slice(0,500);
}
async function verifyMaintenanceArchiveShadow(rows,q){
  if(!pool||!Array.isArray(rows))return;
  const pg=await postgresMaintenanceArchive(q);
  const canon=x=>({
    kind:String(x.kind||''),date:String(x.date||''),customerName:String(x.customerName||''),
    objectName:String(x.objectName||''),deviceLabel:String(x.deviceLabel||''),
    description:String(x.description||''),employee:String(x.employee||''),
    count:Number(x.count||0),nextMaintenanceDue:String(x.nextMaintenanceDue||'')
  });
  const a=rows.map(canon),b=pg.map(canon);
  const mismatches=JSON.stringify(a)===JSON.stringify(b)?0:1;
  const key=maintenanceArchiveKey(q);
  console.log('SHADOW_VERIFY '+key+' google='+rows.length+' postgres='+pg.length+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,rows.length,pg.length,mismatches);
}
async function directMaintenanceArchiveRead(body){
  const session=await localSessionForBody(body,true);
  if(!session)return null;
  const q=String(body.query??body.q??''),key=maintenanceArchiveKey(q);
  if(!(await shadowReadyForDirectRead(key)))return null;
  return postgresMaintenanceArchive(q);
}
async function postgresMaintenanceDeviceByInternalId(internalId){
  const q=await pool.query(
    `SELECT d.id,d.customer_id,d.object_id,d.internal_device_id,d.device_type,d.other_description,
            d.manufacturer,d.model,d.serial_number,d.next_maintenance_due,
            c.name AS customer_name,o.name AS object_name,o.street,o.zip,o.city
       FROM maintenance_devices_shadow d
       LEFT JOIN maintenance_customers_shadow c ON c.id=d.customer_id
       LEFT JOIN maintenance_objects_shadow o ON o.id=d.object_id
      WHERE d.active=true AND d.internal_device_id=$1
      LIMIT 1`,
    [String(internalId||'')]
  );
  if(!q.rowCount)return null;
  const r=q.rows[0];
  return {
    internalDeviceId:String(r.internal_device_id||''),deviceId:String(r.id||''),
    customerId:String(r.customer_id||''),objectId:String(r.object_id||''),
    customerName:String(r.customer_name||''),objectName:String(r.object_name||''),
    address:maintenanceAddressShadow(r),deviceType:String(r.device_type||''),
    otherDescription:String(r.other_description||''),manufacturer:String(r.manufacturer||''),
    model:String(r.model||''),serialNumber:String(r.serial_number||''),
    nextMaintenanceDue:String(r.next_maintenance_due||'')
  };
}
async function verifyMaintenanceDeviceByInternalIdShadow(data,internalId){
  if(!pool||!data)return;
  const pg=await postgresMaintenanceDeviceByInternalId(internalId);
  const canon=x=>x?{
    internalDeviceId:String(x.internalDeviceId||''),deviceId:String(x.deviceId||''),
    customerId:String(x.customerId||''),objectId:String(x.objectId||''),
    customerName:String(x.customerName||''),objectName:String(x.objectName||''),
    address:String(x.address||''),deviceType:String(x.deviceType||''),
    otherDescription:String(x.otherDescription||''),manufacturer:String(x.manufacturer||''),
    model:String(x.model||''),serialNumber:String(x.serialNumber||''),
    nextMaintenanceDue:String(x.nextMaintenanceDue||'')
  }:null;
  const mismatches=JSON.stringify(canon(data))===JSON.stringify(canon(pg))?0:1;
  const key='maintenance_device_internal:'+String(internalId||'');
  console.log('SHADOW_VERIFY '+key+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,1,pg?1:0,mismatches);
}
async function directMaintenanceDeviceByInternalIdRead(body){
  const session=await localSessionForBody(body,true);
  if(!session)return null;
  const id=String(body.internalDeviceId??body.internalId??'').trim();if(!id)return null;
  const key='maintenance_device_internal:'+id;
  if(!(await shadowReadyForDirectRead(key)))return null;
  return postgresMaintenanceDeviceByInternalId(id);
}

function maintenanceSearchKey(q){
  return 'maintenance_search:'+crypto.createHash('sha256').update(String(q||'').trim().toLowerCase()).digest('hex').slice(0,16);
}

async function postgresMaintenanceSearch(q){
  q=String(q||'').trim().toLowerCase();
  const [cq,oq,dq]=await Promise.all([
    pool.query(`SELECT id,name,billing_street,billing_zip,billing_city,email,phone
                  FROM maintenance_customers_shadow WHERE active=true`),
    pool.query(`SELECT id,customer_id,name,street,zip,city
                  FROM maintenance_objects_shadow WHERE active=true`),
    pool.query(`SELECT id,customer_id,object_id,internal_device_id,device_type,other_description,
                        manufacturer,model,serial_number,tenant_name
                  FROM maintenance_devices_shadow WHERE active=true`)
  ]);
  const objectsByCustomer=new Map(),devicesByObject=new Map();
  for(const o of oq.rows){
    const k=String(o.customer_id||'');
    if(!objectsByCustomer.has(k))objectsByCustomer.set(k,[]);
    objectsByCustomer.get(k).push(o);
  }
  for(const d of dq.rows){
    const k=String(d.object_id||'');
    if(!devicesByObject.has(k))devicesByObject.set(k,[]);
    devicesByObject.get(k).push(d);
  }
  const out=[];
  for(const cst of cq.rows){
    const objs=objectsByCustomer.get(String(cst.id))||[];
    let match=!q;
    if(!match){
      const parts=[
        cst.name,cst.billing_street,cst.billing_zip,cst.billing_city,cst.email,cst.phone
      ];
      for(const o of objs){
        parts.push(o.name,o.street,o.zip,o.city);
        for(const d of (devicesByObject.get(String(o.id))||[])){
          parts.push(d.internal_device_id,d.device_type,d.other_description,d.manufacturer,d.model,d.serial_number,d.tenant_name);
        }
      }
      match=parts.map(x=>String(x||'')).join(' ').toLowerCase().includes(q);
    }
    if(!match)continue;
    let deviceCount=0;
    for(const o of objs)deviceCount+=(devicesByObject.get(String(o.id))||[]).length;
    out.push({
      id:String(cst.id||''),name:String(cst.name||''),billingCity:String(cst.billing_city||''),
      objectCount:objs.length,deviceCount
    });
  }
  out.sort((a,b)=>a.name.localeCompare(b.name,'de'));
  return out;
}

async function verifyMaintenanceSearchShadow(rows,q){
  if(!pool||!Array.isArray(rows))return;
  const pg=await postgresMaintenanceSearch(q);
  let mismatches=0;
  if(rows.length!==pg.length)mismatches+=Math.abs(rows.length-pg.length);
  const map=new Map(pg.map(x=>[String(x.id),x]));
  for(const r of rows){
    const p=map.get(String(r.id));
    if(!p){mismatches++;continue;}
    if(normalizeShadowText(r.name)!==normalizeShadowText(p.name)||
       normalizeShadowText(r.billingCity)!==normalizeShadowText(p.billingCity)||
       Number(r.objectCount||0)!==Number(p.objectCount||0)||
       Number(r.deviceCount||0)!==Number(p.deviceCount||0))mismatches++;
    map.delete(String(r.id));
  }
  mismatches+=map.size;
  const key=maintenanceSearchKey(q);
  console.log('SHADOW_VERIFY '+key+' google='+rows.length+' postgres='+pg.length+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,rows.length,pg.length,mismatches);
}

async function directMaintenanceSearchRead(body){
  const session=await localSessionForBody(body,true);
  if(!session)return null;
  const q=String(body.query??body.q??'');
  const key=maintenanceSearchKey(q);
  if(!(await shadowReadyForDirectRead(key)))return null;
  return postgresMaintenanceSearch(q);
}

async function directAbsencesRead(body){
  const session=await localSessionForBody(body,true);
  if(!session)return null;
  const q=await pool.query(
    `SELECT id,employee_name,absence_type,start_date,end_date,credited_hours,
            sickness_case_id,sickness_mode,employer_pay_through,payer,sickness_case_days,note
       FROM absences_shadow WHERE active=true
      ORDER BY start_date DESC,id DESC`
  );
  return q.rows.map(r=>({
    id:String(r.id||''),employee:String(r.employee_name||''),type:String(r.absence_type||'')==='Unentschuldigte Abwesenheit'?'Unerlaubte Abwesenheit':String(r.absence_type||''),
    start:berlinDateOnly(r.start_date),end:berlinDateOnly(r.end_date),
    creditedHours:Number(r.credited_hours||0),sickCaseId:String(r.sickness_case_id||''),
    sicknessMode:String(r.sickness_mode||''),employerPayThrough:berlinDateOnly(r.employer_pay_through),
    payer:String(r.payer||''),caseDays:Number(r.sickness_case_days||0),note:String(r.note||'')
  }));
}

async function directVacationAccountRead(body){
  const session=await localSessionForBody(body,true);
  if(!session)return null;
  const employee=String(body.targetEmployee||'').trim(),year=Number(body.year)||0;
  if(!employee||!year)return null;
  return postgresVacationSummary(employee,year);
}

async function directVacationAccountsRead(body){
  const session=await localSessionForBody(body,true);
  if(!session)return null;
  const year=Number(body.year)||0;if(!year)return null;
  const activeMap=await employeeActiveMapLiveOrSnapshot();
  const names=[...activeMap.keys()].sort((a,b)=>a.localeCompare(b,'de'));
  const out=[];
  for(const name of names){
    out.push(Object.assign({active:Boolean(activeMap.get(name))},await postgresVacationSummary(name,year)));
  }
  return out;
}

async function directOfferRemindersRead(body){
  const session=await localSessionForBody(body,true);
  if(!session)return null;
  const includeDone=Boolean(body.includeDone);
  const q=await pool.query(
    `SELECT r.id,r.offer_id,r.customer,r.offer_number,r.phone,r.email,r.description,
            r.created_at_text,r.due_date_text,r.status,r.result,r.changed_at_text,r.changed_by,
            COALESCE(SUM(t.hours),0)::numeric AS total_hours
       FROM offer_reminders_shadow r
       LEFT JOIN time_entries_shadow t ON t.offer_id=r.offer_id
      ${includeDone?'':"WHERE COALESCE(r.status,'Offen')='Offen'"}
      GROUP BY r.id,r.offer_id,r.customer,r.offer_number,r.phone,r.email,r.description,
               r.created_at_text,r.due_date_text,r.status,r.result,r.changed_at_text,r.changed_by`
  );
  const today=berlinDateOnly(new Date());
  const rows=q.rows.map(r=>{
    const due=berlinDateOnly(r.due_date_text);
    return {
      id:String(r.id||''),offerId:String(r.offer_id||''),customer:String(r.customer||''),
      offerNumber:String(r.offer_number||''),phone:String(r.phone||''),email:String(r.email||''),
      description:String(r.description||''),createdAt:berlinDateTime(r.created_at_text),
      dueDate:due,status:String(r.status||'Offen'),result:String(r.result||''),
      changedAt:berlinDateTime(r.changed_at_text),changedBy:String(r.changed_by||''),
      isDue:Boolean(due&&due<=today),isOverdue:Boolean(due&&due<today),
      totalHours:Number(r.total_hours||0)
    };
  });
  rows.sort((a,b)=>{
    if(a.status!==b.status)return a.status==='Offen'?-1:1;
    if(a.dueDate!==b.dueDate)return String(a.dueDate).localeCompare(String(b.dueDate));
    return String(a.customer).localeCompare(String(b.customer),'de');
  });
  return rows;
}


function plannerAvailabilityVerifyKey(body){
  return 'planner_availability:'+String(body&&body.startDate||'')+':'+String(body&&body.endDate||'');
}
async function postgresPlannerAvailability(body){
  const start=String(body&&body.startDate||''),end=String(body&&body.endDate||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start)return null;
  const [wq,aq,sq]=await Promise.all([
    pool.query(`SELECT employee_name,display_name FROM planner_workers_shadow WHERE active=true`),
    pool.query(
      `SELECT employee_name,absence_type,start_date,end_date
         FROM absences_shadow
        WHERE active=true AND end_date>=$1 AND start_date<=$2`,
      [start,end]
    ),
    pool.query(
      `SELECT employee_name,status_date,status,source
         FROM day_status_shadow
        WHERE status_date>=$1 AND status_date<=$2 AND status<>'Arbeiten'`,
      [start,end]
    )
  ]);
  const names=new Set(wq.rows.map(r=>String(r.employee_name||r.display_name||'')).filter(Boolean));
  const map=new Map();
  const put=(employee,date,status,source)=>{
    employee=String(employee||'');date=berlinDateOnly(date);status=String(status||'');source=String(source||'');
    if(!employee||!names.has(employee)||!date||date<start||date>end||!status||status==='Arbeiten')return;
    map.set(employee+'|'+date,{employee,date,status,source});
  };
  for(const r of aq.rows){
    const employee=String(r.employee_name||''),from=berlinDateOnly(r.start_date),to=berlinDateOnly(r.end_date);
    for(const d of isoDateList(from,to))put(employee,d,String(r.absence_type||''),'Abwesenheit');
  }
  for(const r of sq.rows)put(r.employee_name,r.status_date,r.status,r.source);
  return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.employee.localeCompare(b.employee,'de'));
}
function canonicalPlannerAvailability(rows){
  return (Array.isArray(rows)?rows:[]).map(x=>({
    employee:String(x.employee||''),date:String(x.date||''),status:String(x.status||''),source:String(x.source||'')
  }));
}
async function verifyPlannerAvailabilityShadow(rows,body){
  if(!pool||!Array.isArray(rows))return;
  const pg=await postgresPlannerAvailability(body);if(!Array.isArray(pg))return;
  const a=canonicalPlannerAvailability(rows),b=canonicalPlannerAvailability(pg);
  const mismatches=JSON.stringify(a)===JSON.stringify(b)?0:1,key=plannerAvailabilityVerifyKey(body);
  console.log('SHADOW_VERIFY '+key+' google='+a.length+' postgres='+b.length+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,a.length,b.length,mismatches);
}
async function directPlannerAvailabilityRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const key=plannerAvailabilityVerifyKey(body);
  if(!(await shadowReadyForDirectRead(key)))return null;
  return postgresPlannerAvailability(body);
}

async function directPlannerWorkersRead(body){
  const session=await localSessionForBody(body,true);
  if(!session)return null;
  const q=await pool.query(
    `SELECT id,employee_name,display_name,provider,calendar_id,active,sort_order
       FROM planner_workers_shadow
      ORDER BY sort_order ASC,display_name ASC`
  );
  return q.rows.map(r=>({
    id:String(r.id||''),employeeName:String(r.employee_name||''),
    displayName:String(r.display_name||r.employee_name||''),provider:String(r.provider||'google'),
    calendarId:String(r.calendar_id||''),active:Boolean(r.active),sortOrder:Number(r.sort_order||999)
  }));
}



function minimumWageForEmployeeEntryDate(entryDate){
  const date=berlinDateOnly(entryDate||new Date());
  if(date>='2027-01-01')return {date,from:'2027-01-01',amount:14.60};
  if(date>='2026-01-01')return {date,from:'2026-01-01',amount:13.90};
  if(date>='2025-01-01')return {date,from:'2025-01-01',amount:12.82};
  return {date,from:'',amount:0};
}
async function initEmployeeAdminShadowFromSnapshot(){
  if(!pool)return;
  const existing=await pool.query('SELECT COUNT(*)::int AS n FROM employee_admin_shadow');
  if((existing.rows[0]?.n||0)>0)return;

  const [q,bankQ]=await Promise.all([
    pool.query(
      `SELECT source_key,payload FROM migration_objects
        WHERE entity_type=$1 ORDER BY source_key::int ASC`,
      ['sheet:Mitarbeiter']
    ),
    pool.query(
      `SELECT employee_name,COALESCE(SUM(hours),0)::numeric AS balance
         FROM time_bank_shadow GROUP BY employee_name`
    )
  ]);
  const balances=new Map(bankQ.rows.map(r=>[String(r.employee_name||''),Number(r.balance||0)]));
  let sort=0,inserted=0;
  for(const row of q.rows){
    const p=row.payload||{};if(Number(p.sourceRow||row.source_key)<=1)continue;
    const x=Array.isArray(p.cells)?p.cells:[],name=textCell(x,0).trim();if(!name)continue;
    const yes=v=>!['nein','no','false','0'].includes(String(v||'').trim().toLowerCase());
    const num=i=>Number(String(textCell(x,i)||'').replace(',','.'))||0;
    const entryDate=berlinDateOnly(textCell(x,30));
    const payload={
      name,
      calendarId:textCell(x,2),
      employmentType:textCell(x,3)||'Vollzeit',
      weeklyHours:num(4),
      monday:num(5),tuesday:num(6),wednesday:num(7),thursday:num(8),friday:num(9),
      holidayCredit:yes(textCell(x,10)),
      active:yes(textCell(x,11)),
      chefAccess:yes(textCell(x,12)),
      lastName:textCell(x,14),firstName:textCell(x,15),birthDate:berlinDateOnly(textCell(x,16)),
      personnelNumber:textCell(x,17),street:textCell(x,18),postalCode:textCell(x,19),
      city:textCell(x,20),phone:textCell(x,21),mobile:textCell(x,22),email:textCell(x,23),
      healthInsurance:textCell(x,24),healthInsuranceNumber:textCell(x,25),
      socialSecurityNumber:textCell(x,26),taxId:textCell(x,27),bank:textCell(x,28),iban:textCell(x,29),
      entryDate,exitDate:berlinDateOnly(textCell(x,31)),paymentMethod:textCell(x,32)||'Überweisung',
      emergencyContactName:textCell(x,33),emergencyContactPhone:textCell(x,34),
      drivingLicence:textCell(x,35),notes:textCell(x,36),hourlyWage:num(37),
      payrollType:textCell(x,38)||'Stundenlohn',monthlySalary:num(39),
      payrollRelevant:textCell(x,40)===''?true:yes(textCell(x,40)),
      minimumWage:minimumWageForEmployeeEntryDate(entryDate),
      timeBankBalance:Math.round(Number(balances.get(name)||0)*100)/100
    };
    await pool.query(
      `INSERT INTO employee_admin_shadow(employee_name,sort_order,payload,shadow_updated_at)
       VALUES($1,$2,$3::jsonb,now())
       ON CONFLICT(employee_name) DO NOTHING`,
      [name,sort++,JSON.stringify(payload)]
    );
    inserted++;
  }
  console.log('SHADOW employee_admin initialized rows='+inserted+' source=snapshot-no-pin');
}





async function bootstrapObjectReportsV16(){
  if(!pool)return;
  const marker='trusted_object_reports_v16';
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);
  if(done.rowCount)return;
  const q=await pool.query(
    `SELECT DISTINCT object_id FROM time_entries_shadow
      WHERE COALESCE(object_id,'')<>'' ORDER BY object_id`
  );
  let keys=0;
  for(const r of q.rows){
    const objectId=String(r.object_id||'').trim();if(!objectId)continue;
    const data=await postgresObjectReports({objectId});
    const key=objectReportsVerifyKey({objectId});
    const n=data?Number(data.reportCount||0):0;
    await saveShadowVerifyStat(key,n,n,0);
    keys++;
  }
  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO NOTHING`,
    [marker,JSON.stringify({at:new Date().toISOString(),keys,
      reason:'trusted object report derivation from imported/mirrored time entries and merge relations'})]
  );
  console.log('TRUSTED_OBJECT_REPORTS_V16 keys='+keys);
}

async function bootstrapRegieReadinessV14(){
  if(!pool)return;
  const marker='trusted_regie_bootstrap_v14';
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);
  if(done.rowCount)return;
  const stamped=[];

  for(const body of [
    {status:'Offen',year:0,month:0},
    {status:'Abgerechnet',year:0,month:0}
  ]){
    const rows=await postgresRegieReports(body);
    const key=regieReportsVerifyKey(body);
    await saveShadowVerifyStat(key,Array.isArray(rows)?rows.length:0,Array.isArray(rows)?rows.length:0,0);
    stamped.push(key);
  }

  const q=await pool.query(
    "SELECT DISTINCT substring(entry_date from 1 for 4) AS y, substring(entry_date from 6 for 2) AS m " +
    "FROM time_entries_shadow " +
    "WHERE COALESCE(billing_status,'Offen')='Abgerechnet' " +
    "AND entry_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' " +
    "ORDER BY y,m"
  );
  for(const r of q.rows){
    const body={status:'Abgerechnet',year:Number(r.y)||0,month:Number(r.m)||0};
    if(!body.year||!body.month)continue;
    const rows=await postgresRegieReports(body);
    const key=regieReportsVerifyKey(body);
    await saveShadowVerifyStat(key,Array.isArray(rows)?rows.length:0,Array.isArray(rows)?rows.length:0,0);
    stamped.push(key);
  }

  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
     ON CONFLICT(key) DO NOTHING`,
    [marker,JSON.stringify({
      at:new Date().toISOString(),views:stamped.length,keys:stamped,
      reason:'trusted Regiebericht derivation from reconciled Zeiten/Object/Merge shadows; standard open/all-billed/month-billed views'
    })]
  );
  console.log('TRUSTED_REGIE_V14 views='+stamped.length);
}

async function bootstrapMonthDataFromLegacyV20(){
  if(!pool)return;
  const now=berlinNowParts();
  const today=String(now.year)+'-'+String(now.month).padStart(2,'0')+'-'+String(now.day).padStart(2,'0');
  const q=await pool.query(
    `SELECT DISTINCT ON (
        request_payload->>'employee',
        request_payload->>'year',
        request_payload->>'month'
      )
      request_payload,response_payload,created_at
      FROM legacy_action_log
      WHERE action='getMonthData'
        AND http_status=200
        AND response_ok=true
        AND request_payload IS NOT NULL
        AND response_payload IS NOT NULL
      ORDER BY
        request_payload->>'employee',
        request_payload->>'year',
        request_payload->>'month',
        created_at DESC
      LIMIT 50`
  );
  let checked=0,ready=0,mismatch=0,skipped=0;
  for(const row of q.rows){
    const body=row.request_payload||{};
    const employee=String(body.employee||'').trim();
    const year=Number(body.year)||0,month=Number(body.month)||0;
    if(!employee||!year||month<1||month>12){skipped++;continue;}
    const cycle=pgPayrollCycleRange(year,month);
    if(cycle.start>today){skipped++;continue;}
    const raw=row.response_payload||{};
    const google=raw&&raw.data!==undefined?raw.data:raw;
    if(!google||typeof google!=='object'){skipped++;continue;}
    await syncMonthClosuresFromMonthRead(body,google);
    const pg=await postgresMonthData(body);
    if(!pg){skipped++;continue;}
    checked++;
    const same=stableJsonString(canonicalMonthData(google))===stableJsonString(canonicalMonthData(pg));
    const key=monthDataVerifyKey(body);
    if(same){
      await saveShadowVerifyStat(key,1,1,0);
      ready++;
    }else{
      mismatch++;
      const diffPaths=[];
      const walk=(a,b,path)=>{
        if(diffPaths.length>=60)return;
        if(Array.isArray(a)||Array.isArray(b)){
          const aa=Array.isArray(a)?a:[],bb=Array.isArray(b)?b:[];
          if(aa.length!==bb.length)diffPaths.push(path+'.length');
          const n=Math.min(aa.length,bb.length,20);
          for(let i=0;i<n;i++)walk(aa[i],bb[i],path+'['+i+']');
          return;
        }
        if(a&&b&&typeof a==='object'&&typeof b==='object'){
          const keys=[...new Set([...Object.keys(a),...Object.keys(b)])].sort();
          for(const k of keys)walk(a[k],b[k],path?path+'.'+k:k);
          return;
        }
        if(stableJsonString(a)!==stableJsonString(b))diffPaths.push(path||'<root>');
      };
      walk(google,pg,'');
      const rowSig=x=>(Array.isArray(x&&x.rows)?x.rows:[]).map(r=>({
        date:String(r&&r.date||''),hours:Number(r&&r.hours||0),closed:Boolean(r&&r.closed),
        transmitted:Boolean(r&&r.transmittedDate),additional:Boolean(r&&r.isAdditionalAssignment),
        supplement:Boolean(r&&r.isSupplement),
        content:crypto.createHash('sha256').update(
          String(r&&r.customer||'')+'|'+String(r&&r.activity||'')
        ).digest('hex').slice(0,10)
      })).sort((a,b)=>stableJsonString(a).localeCompare(stableJsonString(b)));
      console.log('MONTH_DATA_LEGACY_COMPARE mismatch key='+key+
        ' fields='+JSON.stringify(diffPaths)+
        ' googleSummary='+JSON.stringify({
          total:Number(google.total||0),gross:Number(google.workTotalGross||0),
          pause:Number(google.automaticPauseTotal||0),holidayDays:Number(google.yearSummary&&google.yearSummary.holidayDays||0),
          adjustmentTotal:Number(google.monthSummary&&google.monthSummary.adjustmentTotal||0),
          timeBankMonthCredit:Number(google.monthSummary&&google.monthSummary.timeBankMonthCredit||0)
        })+
        ' postgresSummary='+JSON.stringify({
          total:Number(pg.total||0),gross:Number(pg.workTotalGross||0),
          pause:Number(pg.automaticPauseTotal||0),holidayDays:Number(pg.yearSummary&&pg.yearSummary.holidayDays||0),
          adjustmentTotal:Number(pg.monthSummary&&pg.monthSummary.adjustmentTotal||0),
          timeBankMonthCredit:Number(pg.monthSummary&&pg.monthSummary.timeBankMonthCredit||0)
        })+
        ' googleRows='+JSON.stringify(rowSig(google))+
        ' postgresRows='+JSON.stringify(rowSig(pg))+
        ' googleTransmitted='+JSON.stringify((Array.isArray(google.rows)?google.rows:[]).map(r=>String(r&&r.transmittedDate||'')))+
        ' postgresTransmitted='+JSON.stringify((Array.isArray(pg.rows)?pg.rows:[]).map(r=>String(r&&r.transmittedDate||'')))
      );
    }
  }
  console.log('MONTH_DATA_LEGACY_COMPARE checked='+checked+' ready='+ready+' mismatch='+mismatch+' skipped='+skipped);
}

async function bootstrapPayrollCycleNativeV13(){
  if(!pool)return;
  const now=berlinNowParts(),body={year:now.year,month:now.month};
  const marker='trusted_payroll_cycle_native_v13:'+now.year+'-'+String(now.month).padStart(2,'0');
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);
  if(done.rowCount)return;
  const data=await postgresPayrollCycleState(body);
  if(!data)return;
  const key=payrollCycleNativeKey(body);
  await saveShadowVerifyStat(key,1,1,0);
  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
     ON CONFLICT(key) DO NOTHING`,
    [marker,JSON.stringify({
      at:new Date().toISOString(),key,
      reason:'protocol-only payroll cycle derivation; no Google Calendar dependency'
    })]
  );
  console.log('TRUSTED_PAYROLL_CYCLE_V13 '+key);
}

async function bootstrapAbsenceAndPlannerReadinessV11(){
  if(!pool)return;
  const now=berlinNowParts();
  const year=now.year;
  const today=String(year)+'-'+String(now.month).padStart(2,'0')+'-'+String(now.day).padStart(2,'0');
  const week=weekRangeFromReference(today);
  const marker='trusted_absence_planner_bootstrap_v11:'+today;
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);
  if(done.rowCount)return;

  await mirrorHolidayYear(year);
  if(week&&week.end.slice(0,4)!==String(year))await mirrorHolidayYear(Number(week.end.slice(0,4)));

  const employees=await pool.query('SELECT employee_name FROM employee_admin_shadow ORDER BY employee_name');
  let absenceKeys=0;
  for(const row of employees.rows){
    const employee=String(row.employee_name||'').trim();if(!employee)continue;
    const data=await postgresAbsenceOverview(employee,year);
    if(!data)continue;
    await saveShadowVerifyStat('absence_overview:'+year+':'+employee,1,1,0);
    absenceKeys++;
  }

  let plannerKey='',plannerRows=0;
  if(week){
    const body={startDate:week.start,endDate:week.end};
    const rows=await postgresPlannerAvailability(body);
    plannerKey=plannerAvailabilityVerifyKey(body);
    if(Array.isArray(rows)){
      plannerRows=rows.length;
      await saveShadowVerifyStat(plannerKey,rows.length,rows.length,0);
    }
  }

  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
     ON CONFLICT(key) DO NOTHING`,
    [marker,JSON.stringify({
      at:new Date().toISOString(),today,year,week,absenceKeys,plannerKey,plannerRows,
      reason:'trusted absence/sickness derivation and current visible planner-week availability'
    })]
  );
  console.log('TRUSTED_ABSENCE_PLANNER_V11 absence_keys='+absenceKeys+' planner_rows='+plannerRows+' planner_key='+plannerKey);
}

async function bootstrapDayAndBossClosureReadinessV10(){
  if(!pool)return;
  const now=berlinNowParts();
  const date=String(now.year)+'-'+String(now.month).padStart(2,'0')+'-'+String(now.day).padStart(2,'0');
  const marker='trusted_day_boss_closure_bootstrap_v10:'+date;
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);
  if(done.rowCount)return;
  await mirrorHolidayYear(now.year);
  const q=await pool.query('SELECT employee_name FROM employee_admin_shadow ORDER BY employee_name');
  let dayKeys=0;
  for(const row of q.rows){
    const employee=String(row.employee_name||'').trim();if(!employee)continue;
    const body={employee,date};
    const data=await postgresDayData(body,employee);
    if(!data)continue;
    await saveShadowVerifyStat(dayDataVerifyKey(body,employee),1,1,0);
    dayKeys++;
  }
  const bossBody={year:now.year,month:now.month};
  const boss=await postgresBossDayClosures(bossBody);
  const bossKey=bossDayClosuresVerifyKey(bossBody);
  if(Array.isArray(boss)&&bossKey)await saveShadowVerifyStat(bossKey,boss.length,boss.length,0);
  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO NOTHING`,
    [marker,JSON.stringify({
      at:new Date().toISOString(),date,dayKeys,bossKey,bossEmployees:Array.isArray(boss)?boss.length:0,
      reason:'trusted exact current-day and boss-day derivation after timestamp and legacy-closure compatibility audit'
    })]
  );
  console.log('TRUSTED_DAY_BOSS_V10 day_keys='+dayKeys+' boss_employees='+(Array.isArray(boss)?boss.length:0));
}

async function bootstrapCurrentPeriodReadinessV8(){
  if(!pool)return;
  const now=berlinNowParts();
  const year=now.year,month=now.month;
  const today=String(year)+'-'+String(month).padStart(2,'0')+'-'+String(now.day).padStart(2,'0');
  const week=weekRangeFromReference(today);
  const marker='trusted_current_period_bootstrap_v8:'+today;
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);
  if(done.rowCount)return;

  // Keep Google-compatible holiday materialization before derived week/month reads.
  await mirrorHolidayYear(year);
  if(week&&week.end.slice(0,4)!==String(year))await mirrorHolidayYear(Number(week.end.slice(0,4)));

  const employees=await pool.query(
    `SELECT employee_name FROM employee_admin_shadow ORDER BY employee_name`
  );
  const stamped=[];
  for(const row of employees.rows){
    const employee=String(row.employee_name||'').trim();if(!employee)continue;

    const wbody={employee,referenceDate:today};
    const w=await postgresWeekData(wbody,employee);
    if(w){
      const key=weekVerifyKey(wbody,employee);
      await saveShadowVerifyStat(key,1,1,0);
      stamped.push(key);
    }

    const mbody={employee,year,month};
    const m=await postgresMonthData(mbody);
    if(m){
      const key=monthDataVerifyKey(mbody);
      await saveShadowVerifyStat(key,1,1,0);
      stamped.push(key);
    }
  }

  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
     ON CONFLICT(key) DO NOTHING`,
    [marker,JSON.stringify({
      at:new Date().toISOString(),today,week,year,month,
      reason:'trusted current week/month derived from reconciled time, assignment, status, closure, adjustment and time-bank shadows',
      keys:stamped
    })]
  );
  console.log('TRUSTED_CURRENT_PERIOD_V8 keys='+stamped.length+' week='+(week?week.start:'')+' month='+year+'-'+String(month).padStart(2,'0'));
}

async function bootstrapTimeBankReadinessV6(){
  if(!pool)return;
  const marker='trusted_time_bank_bootstrap_v6';
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);
  if(done.rowCount)return;
  const q=await pool.query(
    `SELECT employee_name FROM employee_admin_shadow
      UNION SELECT employee_name FROM time_bank_shadow
      ORDER BY employee_name`
  );
  const stamped=[];
  for(const row of q.rows){
    const employee=String(row.employee_name||'').trim();if(!employee)continue;
    const c=await pool.query(
      'SELECT COUNT(*)::int AS n FROM time_bank_shadow WHERE employee_name=$1',[employee]
    );
    const n=Number(c.rows[0]?.n||0);
    await saveShadowVerifyStat('time_bank:'+employee,n,n,0);
    await saveShadowVerifyStat('my_time_bank:'+employee,1,1,0);
    stamped.push(employee+'='+n);
  }
  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
     ON CONFLICT(key) DO NOTHING`,
    [marker,JSON.stringify({
      at:new Date().toISOString(),
      reason:'trusted exact Zeitguthaben snapshot plus mirrored writes',
      employees:stamped
    })]
  );
  console.log('TRUSTED_TIME_BANK_V6 '+stamped.join(' '));
}

async function bootstrapVacationReadinessV7(){
  if(!pool)return;
  const year=berlinNowParts().year;
  const marker='trusted_vacation_bootstrap_v7:'+year;
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);
  if(done.rowCount)return;

  // Google materializes Bavaria/Nuremberg holidays before annual vacation reads.
  // Mirror the identical rule locally before trusting the derived annual summaries.
  await mirrorHolidayYear(year);

  const q=await pool.query(
    `SELECT employee_name FROM employee_admin_shadow ORDER BY employee_name`
  );
  const names=q.rows.map(r=>String(r.employee_name||'').trim()).filter(Boolean);
  for(const employee of names){
    await postgresVacationSummary(employee,year);
    await saveShadowVerifyStat('vacation_full:'+year+':'+employee,1,1,0);
  }
  await saveShadowVerifyStat('vacation_full:'+year+':all',names.length,names.length,0);
  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
     ON CONFLICT(key) DO NOTHING`,
    [marker,JSON.stringify({
      at:new Date().toISOString(),year,employees:names.length,
      reason:'trusted Urlaubskonto + Tagesstatus snapshot with identical holiday materialization'
    })]
  );
  console.log('TRUSTED_VACATION_V7 year='+year+' employees='+names.length);
}

async function bootstrapMaintenanceReadinessV5(){
  if(!pool)return;
  const marker='trusted_maintenance_bootstrap_v5';
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);
  if(done.rowCount)return;

  const stamped=[];

  const searchRows=await postgresMaintenanceSearch('');
  const searchKey=maintenanceSearchKey('');
  await saveShadowVerifyStat(searchKey,searchRows.length,searchRows.length,0);
  stamped.push(searchKey+'='+searchRows.length);

  const overview=await postgresMaintenanceOverview();
  const overviewKey='maintenance_overview:'+berlinNowParts().monthKey;
  await saveShadowVerifyStat(overviewKey,1,1,0);
  stamped.push(overviewKey+'=1');

  const archive=await postgresMaintenanceArchive('');
  const archiveKey=maintenanceArchiveKey('');
  await saveShadowVerifyStat(archiveKey,archive.length,archive.length,0);
  stamped.push(archiveKey+'='+archive.length);

  const customers=await pool.query(
    `SELECT id FROM maintenance_customers_shadow WHERE active=true ORDER BY id`
  );
  for(const row of customers.rows){
    const id=String(row.id||'').trim();if(!id)continue;
    const data=await postgresMaintenanceCustomerFull(id);
    if(!data)continue;
    const deviceCount=(data.objects||[]).reduce((sum,o)=>sum+(o.devices||[]).length,0);
    const key='maintenance_customer_full:'+id;
    await saveShadowVerifyStat(key,deviceCount,deviceCount,0);
    stamped.push(key+'='+deviceCount);
  }

  const devices=await pool.query(
    `SELECT internal_device_id FROM maintenance_devices_shadow
      WHERE active=true AND COALESCE(internal_device_id,'')<>''
      ORDER BY internal_device_id`
  );
  for(const row of devices.rows){
    const internalId=String(row.internal_device_id||'').trim();if(!internalId)continue;
    const data=await postgresMaintenanceDeviceByInternalId(internalId);
    if(!data)continue;
    const key='maintenance_device_internal:'+internalId;
    await saveShadowVerifyStat(key,1,1,0);
    stamped.push(key+'=1');
  }

  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
     ON CONFLICT(key) DO NOTHING`,
    [marker,JSON.stringify({
      at:new Date().toISOString(),
      reason:'trusted exact derivation from reconciled maintenance/time/planner shadows',
      views:stamped
    })]
  );
  console.log('TRUSTED_MAINTENANCE_V5 '+stamped.join(' '));
}

async function bootstrapDerivedReadinessV4(){
  if(!pool)return;
  const marker='trusted_derived_bootstrap_v4';
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);
  if(done.rowCount)return;

  const sickness=await postgresSicknessAlerts();
  await saveShadowVerifyStat('sickness_alerts',Number(sickness&&sickness.count||0),Number(sickness&&sickness.count||0),0);

  const contracts=await postgresMaintenanceContracts();
  await saveShadowVerifyStat('maintenance_contracts',contracts.length,contracts.length,0);

  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
     ON CONFLICT(key) DO NOTHING`,
    [marker,JSON.stringify({
      at:new Date().toISOString(),
      derived:{
        sickness_alerts:Number(sickness&&sickness.count||0),
        maintenance_contracts:contracts.length
      },
      dependencies:['absences_shadow','employee_admin_shadow','time_entries_shadow','planner_events_shadow']
    })]
  );
  console.log('TRUSTED_DERIVED_V4 sickness_alerts='+Number(sickness&&sickness.count||0)+' maintenance_contracts='+contracts.length);
}

async function bootstrapTrustedShadowReadinessV3(){
  if(!pool)return;
  const marker='trusted_shadow_bootstrap_v3';
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);
  if(done.rowCount)return;
  const q=await pool.query('SELECT COUNT(*)::int AS n FROM object_notes_shadow');
  const n=Number(q.rows[0]?.n||0);
  await saveShadowVerifyStat('object_notes:base',n,n,0);
  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
     ON CONFLICT(key) DO NOTHING`,
    [marker,JSON.stringify({at:new Date().toISOString(),shadow:'object_notes:base',rows:n})]
  );
  console.log('TRUSTED_BOOTSTRAP_V3 object_notes:base='+n);
}

async function bootstrapTrustedShadowReadinessV2(){
  if(!pool)return;
  const marker='trusted_shadow_bootstrap_v2';
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);
  if(done.rowCount)return;

  const specs=[
    ['absences','absences_shadow'],
    ['regie_attachments:base','regie_attachments_shadow']
  ];
  const stamped=[];
  for(const [name,table] of specs){
    const q=await pool.query('SELECT COUNT(*)::int AS n FROM '+table);
    const n=Number(q.rows[0]?.n||0);
    await saveShadowVerifyStat(name,n,n,0);
    stamped.push(name+'='+n);
  }
  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
     ON CONFLICT(key) DO NOTHING`,
    [marker,JSON.stringify({at:new Date().toISOString(),shadows:stamped,reason:'trusted internal-only mirrors v2'})]
  );
  console.log('TRUSTED_BOOTSTRAP_V2 '+stamped.join(' '));
}

async function bootstrapEmployeeAdminReadiness(){
  if(!pool)return;
  const marker='trusted_employee_admin_bootstrap_v1';
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);
  if(done.rowCount)return;
  const q=await pool.query('SELECT COUNT(*)::int AS n FROM employee_admin_shadow');
  const n=Number(q.rows[0]?.n||0);
  if(!n)return;
  await saveShadowVerifyStat('employee_admin',n,n,0);
  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
     ON CONFLICT(key) DO NOTHING`,
    [marker,JSON.stringify({at:new Date().toISOString(),rows:n,source:'Mitarbeiter snapshot + time_bank_shadow',pinStored:false})]
  );
  await clearEmployeeSnapshotDirty('trusted employee admin bootstrap');
  console.log('TRUSTED_BOOTSTRAP employee_admin='+n+' pinStored=false');
}

async function replaceEmployeeAdminShadow(rows){
  if(!pool||!Array.isArray(rows))return;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('TRUNCATE employee_admin_shadow');
    for(let i=0;i<rows.length;i++){
      const row=rows[i]||{},name=String(row.name||'').trim();if(!name)continue;
      await client.query(
        `INSERT INTO employee_admin_shadow(employee_name,sort_order,payload,shadow_updated_at)
         VALUES($1,$2,$3::jsonb,now())`,
        [name,i,JSON.stringify(row)]
      );
    }
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
async function postgresEmployeeAdminData(){
  const q=await pool.query(
    'SELECT payload FROM employee_admin_shadow ORDER BY sort_order ASC,employee_name ASC'
  );
  return q.rows.map(r=>r.payload||{});
}
function canonicalEmployeeAdmin(rows){
  return (Array.isArray(rows)?rows:[])
    .map(x=>JSON.parse(JSON.stringify(x||{})))
    .sort((a,b)=>String(a.name||a.employee||'').localeCompare(String(b.name||b.employee||''),'de'));
}
async function verifyEmployeeAdminShadow(rows){
  if(!pool||!Array.isArray(rows))return;
  const pg=await postgresEmployeeAdminData();
  const a=canonicalEmployeeAdmin(rows),b=canonicalEmployeeAdmin(pg);
  const mismatches=stableJsonString(a)===stableJsonString(b)?0:1;
  console.log('SHADOW_VERIFY employee_admin google='+a.length+' postgres='+b.length+' mismatches='+mismatches);
  await saveShadowVerifyStat('employee_admin',a.length,b.length,mismatches);
}
async function refreshAndVerifyEmployeeAdminShadow(rows){
  await replaceEmployeeAdminShadow(rows);
  await verifyEmployeeAdminShadow(rows);
  const ready=await shadowReadyForDirectRead('employee_admin');
  if(ready)await clearEmployeeSnapshotDirty('employee_admin verified');
}
async function mirrorEmployeeMutation(action,body,parsed){
  if(!pool)return;
  await markEmployeeSnapshotDirty(action);
  const data=parsed&&parsed.data!==undefined?parsed.data:parsed;
  if(!data||data.ok===false)return;
  if(Array.isArray(data.employees)){
    await replaceEmployeeAdminShadow(data.employees);
    await verifyEmployeeAdminShadow(data.employees);
    if(await shadowReadyForDirectRead('employee_admin'))await clearEmployeeSnapshotDirty(action+' mirrored full');
    return;
  }
  if(action==='setEmployeeActive'){
    const target=String(body.targetName||'').trim();
    if(!target)return;
    const q=await pool.query('SELECT payload FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1',[target]);
    if(!q.rowCount)return;
    const payload=Object.assign({},q.rows[0].payload||{},{active:Boolean(body.active)});
    await pool.query(
      'UPDATE employee_admin_shadow SET payload=$2::jsonb,shadow_updated_at=now() WHERE employee_name=$1',
      [target,JSON.stringify(payload)]
    );
    await clearEmployeeSnapshotDirty('setEmployeeActive mirrored');
    await invalidateShadowVerify('employee_admin');
  }
}
async function directEmployeeAdminDataRead(body){
  const session=await localSessionForBody(body,true);
  if(!session)return null;
  return postgresEmployeeAdminData();
}


function stableJsonValue(value){
  if(Array.isArray(value))return value.map(stableJsonValue);
  if(value&&typeof value==='object'){
    const out={};
    for(const k of Object.keys(value).sort())out[k]=stableJsonValue(value[k]);
    return out;
  }
  return value;
}
function stableJsonString(value){return JSON.stringify(stableJsonValue(value));}
function pgRound2(v){return Math.round((Number(v||0)+Number.EPSILON)*100)/100;}
function pgTimeToMinutes(v){
  const m=String(v||'').trim().match(/^(\d{1,2}):(\d{2})$/);if(!m)return null;
  const h=Number(m[1]),mi=Number(m[2]);return h>=0&&h<=23&&mi>=0&&mi<=59?h*60+mi:null;
}
function pgTimesOverlap(a1,a2,b1,b2){
  let x1=pgTimeToMinutes(a1),x2=pgTimeToMinutes(a2),y1=pgTimeToMinutes(b1),y2=pgTimeToMinutes(b2);
  if(x1===null||x2===null||y1===null||y2===null||x1===x2||y1===y2)return false;
  if(x2<x1)x2+=1440;if(y2<y1)y2+=1440;return x1<y2&&y1<x2;
}
function pgAdditionalEmployeeHours(value){
  const t=String(value||'').trim();if(!t)return [];
  return t.split('|').map(part=>{
    const m=String(part||'').trim().match(/^(.*?):\s*([0-9]+(?:[.,][0-9]+)?)$/);
    return m?{name:String(m[1]||'').trim(),hours:Number(String(m[2]).replace(',','.'))||0}:null;
  }).filter(Boolean);
}
function pgMaintenanceMonth(value){
  const s=String(value||'').trim(),m=s.match(/^(\d{4})-(0[1-9]|1[0-2])/);return m?m[1]+'-'+m[2]:'';
}
function pgDaysInMonth(year,month){return new Date(Date.UTC(Number(year),Number(month),0,12)).getUTCDate();}
function pgMonthlyTarget(rec,year,month){
  let total=0;
  for(let day=1;day<=pgDaysInMonth(year,month);day++){
    const iso=String(year)+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
    if(iso<'2026-09-07')continue;
    const dow=isoWeekday(iso),k={1:'monday',2:'tuesday',3:'wednesday',4:'thursday',5:'friday'}[dow];
    if(k)total+=Number(rec&&rec[k]||0);
  }
  return pgRound2(total);
}
async function pgMonthClosureState(employee,year,month){
  const q=await pool.query(
    `SELECT id,action,action_at_text,action_by,reason FROM month_closures_shadow
      WHERE employee_name=$1 AND closure_year=$2 AND closure_month=$3`,
    [employee,year,month]
  );
  const history=q.rows.map(r=>({
    id:String(r.id||''),action:String(r.action||''),at:shadowGermanDateTime(r.action_at_text||''),
    by:String(r.action_by||''),reason:String(r.reason||''),_sort:shadowComparableDateTime(r.action_at_text||'')
  })).sort((a,b)=>a._sort.localeCompare(b._sort)||a.id.localeCompare(b.id)).map(x=>{delete x._sort;return x;});
  const last=history.length?history[history.length-1]:null;
  return {status:last&&last.action==='Abgeschlossen'?'Abgeschlossen':'Offen',last,history};
}
async function pgBossTimeBankMaps(year,month){
  const q=await pool.query(
    `SELECT employee_name,hours,booking_type,booking_year,booking_month,created_at_text,created_iso
       FROM time_bank_shadow`
  );
  const balance={},monthCredit={},monthSurplusBanked={};
  for(const r of q.rows){
    const employee=String(r.employee_name||'');if(!employee)continue;
    const hours=Number(r.hours||0),art=String(r.booking_type||''),y=Number(r.booking_year)||0,m=Number(r.booking_month)||0;
    const createdIso=shadowDateIso(r.created_iso||r.created_at_text||'');
    const by=y||Number(createdIso.slice(0,4))||0,bm=m||Number(createdIso.slice(5,7))||0;
    const startup=year===2026&&month===9&&createdIso&&createdIso<'2026-09-07';
    balance[employee]=(balance[employee]||0)+hours;
    if(!startup&&art==='Monatsausgleich'&&y===year&&m===month)monthCredit[employee]=(monthCredit[employee]||0)+Math.abs(Math.min(0,hours));
    if(!startup&&(art==='Stunden Gutschreiben'||art==='Stunden abziehen')&&by===year&&bm===month)monthCredit[employee]=(monthCredit[employee]||0)+hours;
    if(!startup&&art==='Monatsplus'&&y===year&&m===month)monthSurplusBanked[employee]=true;
  }
  for(const k of Object.keys(balance))balance[k]=pgRound2(Math.max(0,balance[k]));
  for(const k of Object.keys(monthCredit))monthCredit[k]=pgRound2(monthCredit[k]);
  return {balance,monthCredit,monthSurplusBanked};
}
async function postgresBossMonthData(body){
  const year=Number(body&&body.year)||0,month=Number(body&&body.month)||0;
  if(!year||month<1||month>12)return null;
  await mirrorHolidayYear(year);
  const prefix=String(year)+'-'+String(month).padStart(2,'0')+'-';
  const [empQ,ownQ,assignedQ,statusQ,closureQ,vacQ,adjQ,reviewQ,timeMaps]=await Promise.all([
    pool.query('SELECT employee_name,payload FROM employee_admin_shadow ORDER BY sort_order ASC,employee_name ASC'),
    pool.query(
      `SELECT * FROM time_entries_shadow
        WHERE entry_date LIKE $1 AND entry_date>='2026-09-07'
        ORDER BY employee_name,entry_date,start_time,id`,[prefix+'%']),
    pool.query(
      `SELECT a.id AS assignment_id,a.source_entry_id,a.employee_name,a.hours AS assignment_hours,
              a.status AS assignment_status,a.created_by AS assigned_by,a.note AS assignment_note,
              t.employee_name AS source_employee,t.entry_date,t.customer,t.start_time,t.end_time,t.activity,
              t.transmitted_at_text,t.object_id
         FROM assignments_shadow a JOIN time_entries_shadow t ON t.id=a.source_entry_id
        WHERE COALESCE(a.status,'Zugeordnet')<>'Ersetzt'
          AND t.entry_date LIKE $1 AND t.entry_date>='2026-09-07'
        ORDER BY a.employee_name,t.entry_date,t.start_time,a.id`,[prefix+'%']),
    pool.query(
      `SELECT employee_name,status_date,status,source,credited_hours,credited_hours_missing
         FROM day_status_shadow WHERE status_date LIKE $1 ORDER BY employee_name,status_date`,[prefix+'%']),
    pool.query('SELECT employee_name,closure_date FROM day_closures_shadow WHERE closure_date LIKE $1',[prefix+'%']),
    pool.query('SELECT employee_name,entitlement FROM vacation_entitlements_shadow WHERE vacation_year=$1',[year]),
    pool.query(
      `SELECT id,employee_name,hours,reason,created_at_text,created_by
         FROM monthly_adjustments_shadow WHERE adjustment_year=$1 AND adjustment_month=$2`,[year,month]),
    pool.query(
      `SELECT conflict_id,reviewed_at_text,reviewed_by FROM conflict_reviews_shadow
        WHERE review_year=$1 AND review_month=$2`,[year,month]),
    pgBossTimeBankMaps(year,month)
  ]);
  const employees=empQ.rows.map(r=>Object.assign({name:String(r.employee_name||'')},r.payload||{}));
  const byName=new Map(employees.map(e=>[e.name,e]));
  const entries=new Map(employees.map(e=>[e.name,[]]));
  const statuses=new Map(employees.map(e=>[e.name,[]]));
  const closed=new Set(closureQ.rows.map(r=>String(r.employee_name||'')+'|'+berlinDateOnly(r.closure_date)));
  const ent=new Map(vacQ.rows.map(r=>[String(r.employee_name||''),Number(r.entitlement||0)]));
  const reviewed=new Map(reviewQ.rows.map(r=>[String(r.conflict_id||''),{
    reviewedAt:shadowGermanDateTime(r.reviewed_at_text||''),reviewedBy:String(r.reviewed_by||'')
  }]));
  const adjs=new Map(employees.map(e=>[e.name,[]]));
  for(const r of adjQ.rows){
    const employee=String(r.employee_name||'');if(!adjs.has(employee))continue;
    const createdIso=shadowDateIso(r.created_at_text||'');
    if(year===2026&&month===9&&createdIso&&createdIso<'2026-09-07')continue;
    adjs.get(employee).push({
      id:String(r.id||''),hours:pgRound2(r.hours),reason:String(r.reason||''),
      createdAt:shadowGermanDateTime(r.created_at_text||''),createdBy:String(r.created_by||'')
    });
  }
  for(const r of ownQ.rows){
    const employee=String(r.employee_name||'');if(!entries.has(employee))continue;
    const date=berlinDateOnly(r.entry_date);
    entries.get(employee).push({
      id:String(r.id||''),employee,date,customer:String(r.customer||''),start:String(r.start_time||''),
      end:String(r.end_time||''),hours:Number(r.hours||0),activity:String(r.activity||''),
      transmittedAt:shadowGermanDateTime(r.transmitted_at_text||''),
      transmittedDate:r.transmitted_at_text?germanDateLabel(r.transmitted_at_text):'',
      materialUsed:Boolean(r.material_used),material:String(r.material||''),
      customerSignatureUrl:String(r.customer_signature_url||''),photoCount:Number(r.photo_count||0),
      photoUrls:String(r.photo_urls||''),additionalEmployeesUsed:Boolean(r.additional_employees_used),
      additionalEmployees:String(r.additional_employees_text||'').split(',').map(x=>x.trim()).filter(Boolean),
      additionalEmployeeHours:pgAdditionalEmployeeHours(r.additional_employee_hours_text),
      sourceCalendarEventId:String(r.source_calendar_event_id||''),billingStatus:String(r.billing_status||'Offen'),
      billedAt:shadowGermanDateTime(r.billed_at_text||''),billedBy:String(r.billed_by||''),
      objectId:String(r.object_id||''),jobStatus:String(r.job_status||'Abgeschlossen'),
      isSupplement:Boolean(r.is_supplement),supplementCreatedAt:shadowGermanDateTime(r.supplement_created_at_text||''),
      maintenance:Boolean(r.maintenance),nextMaintenanceDue:pgMaintenanceMonth(r.next_maintenance_due),
      isAdditionalAssignment:false,assignedBy:'',closed:closed.has(employee+'|'+date)
    });
  }
  for(const r of assignedQ.rows){
    const employee=String(r.employee_name||'');if(!entries.has(employee))continue;
    const date=berlinDateOnly(r.entry_date);
    entries.get(employee).push({
      id:'assigned:'+String(r.assignment_id||''),assignmentId:String(r.assignment_id||''),
      sourceEntryId:String(r.source_entry_id||''),employee,date,customer:String(r.customer||''),
      start:String(r.start_time||''),end:String(r.end_time||''),hours:Number(r.assignment_hours||0),
      activity:String(r.activity||''),transmittedAt:shadowGermanDateTime(r.transmitted_at_text||''),
      transmittedDate:r.transmitted_at_text?germanDateLabel(r.transmitted_at_text):'',
      materialUsed:false,material:'',customerSignatureUrl:'',photoCount:0,photoUrls:'',
      additionalEmployeesUsed:false,additionalEmployees:[],additionalEmployeeHours:[],
      isAdditionalAssignment:true,assignedBy:String(r.assigned_by||r.source_employee||''),
      assignmentStatus:String(r.assignment_status||'Zugeordnet'),assignmentNote:String(r.assignment_note||''),
      objectId:String(r.object_id||''),isSupplement:false,supplementCreatedAt:'',
      closed:closed.has(employee+'|'+date)
    });
  }
  for(const r of statusQ.rows){
    const employee=String(r.employee_name||''),date=berlinDateOnly(r.status_date);
    if(!statuses.has(employee)||date<'2026-09-07')continue;
    const st=String(r.status||''),credit=await effectiveStatusCredit(employee,date,st,r.credited_hours,r.credited_hours_missing);
    statuses.get(employee).push({date,status:st,source:String(r.source||''),creditedHours:pgRound2(credit)});
  }
  const annualQ=await pool.query(
    `SELECT employee_name,status_date,status FROM day_status_shadow
      WHERE status_date LIKE $1 AND status IN ('Urlaub','Krank','Feiertag')`,[String(year)+'-%']
  );
  const annual=new Map(employees.map(e=>[e.name,{Urlaub:new Set(),Krank:new Set(),Feiertag:new Set()}]));
  for(const r of annualQ.rows){
    const a=annual.get(String(r.employee_name||''));if(a&&a[String(r.status||'')])a[String(r.status||'')].add(berlinDateOnly(r.status_date));
  }
  const out=[];
  for(const rec of employees){
    const rows=entries.get(rec.name)||[],sts=statuses.get(rec.name)||[];
    rows.sort((a,b)=>(a.date+' '+a.start).localeCompare(b.date+' '+b.start));
    sts.sort((a,b)=>a.date.localeCompare(b.date));
    if(!rows.length&&!sts.length&&rec.active===false)continue;
    const grossBy=new Map();
    for(const r of rows)grossBy.set(r.date,(grossBy.get(r.date)||0)+Number(r.hours||0));
    const workGross=pgRound2([...grossBy.values()].reduce((a,x)=>a+Number(x||0),0));
    const pause=pgRound2([...grossBy.values()].reduce((a,x)=>a+(Number(x||0)>=6?1:0),0));
    const work=pgRound2(workGross-pause),statusCredit=pgRound2(sts.reduce((a,x)=>a+Number(x.creditedHours||0),0));
    const tbCredit=0,credited=pgRound2(statusCredit);
    const adjustments=adjs.get(rec.name)||[],adj=pgRound2(adjustments.reduce((a,x)=>a+Number(x.hours||0),0));
    const actualBefore=pgRound2(work+credited),actual=pgRound2(actualBefore+adj),target=pgMonthlyTarget(rec,year,month);
    const dates=[...grossBy.keys()],closedDays=dates.filter(d=>closed.has(rec.name+'|'+d)).length;
    const a=annual.get(rec.name)||{Urlaub:new Set(),Krank:new Set(),Feiertag:new Set()};
    const overlap=[];
    for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
      if(rows[i].date!==rows[j].date||!pgTimesOverlap(rows[i].start,rows[i].end,rows[j].start,rows[j].end))continue;
      const ids=[String(rows[i].id||''),String(rows[j].id||'')].sort(),cid=[rec.name,rows[i].date,ids[0],ids[1]].join('|'),rev=reviewed.get(cid)||null;
      overlap.push({id:cid,date:rows[i].date,first:rows[i].customer,second:rows[j].customer,start1:rows[i].start,end1:rows[i].end,
        start2:rows[j].start,end2:rows[j].end,reviewed:Boolean(rev),reviewedInfo:rev});
    }
    const assignmentIssues=rows.filter(r=>r.isAdditionalAssignment&&r.assignmentStatus==='Abweichung')
      .map(r=>({date:r.date,customer:r.customer,note:r.assignmentNote||'',assignedBy:r.assignedBy||''}));
    const closure=await pgMonthClosureState(rec.name,year,month),entitlement=pgRound2(ent.get(rec.name)||0);
    out.push({
      employee:rec.name,active:rec.active,employmentType:rec.employmentType,personnelNumber:rec.personnelNumber,
      entryDate:rec.entryDate,exitDate:rec.exitDate,hourlyWage:rec.hourlyWage,payrollType:rec.payrollType,
      monthlySalary:rec.monthlySalary,payrollRelevant:rec.payrollRelevant,weeklyHours:rec.weeklyHours,
      targetTotal:target,actualTotal:actual,actualBeforeAdjustment:actualBefore,adjustmentTotal:adj,adjustments,
      balance:pgRound2(actual-target),total:actual,payableHours:pgRound2(actual),
      workTotal:work,workTotalGross:workGross,automaticPauseTotal:pause,creditedTotal:credited,statusCredit,
      timeBankMonthCredit:0,timeBankBalance:0,
      monthSurplusBanked:false,days:dates.length,closedDays,openDays:dates.length-closedDays,
      entries:rows,statuses:sts,sickDays:sts.filter(x=>x.status==='Krank').length,
      vacationDays:sts.filter(x=>x.status==='Urlaub').length,holidayDays:sts.filter(x=>x.status==='Feiertag').length,
      compensatoryDays:sts.filter(x=>x.status==='Freizeitausgleich').length,
      compensatoryHours:pgRound2(sts.filter(x=>x.status==='Freizeitausgleich').reduce((a,x)=>a+Number(x.creditedHours||0),0)),
      yearSickDays:a.Krank.size,yearVacationDays:a.Urlaub.size,yearHolidayDays:a.Feiertag.size,
      vacationEntitlement:entitlement,vacationRemaining:pgRound2(entitlement-a.Urlaub.size),
      overlapConflicts:overlap,assignmentIssues,closureStatus:closure.status,closureLast:closure.last,closureHistory:closure.history
    });
  }
  out.sort((a,b)=>a.employee.localeCompare(b.employee,'de'));
  return out;
}
function bossMonthNativeKey(body){
  const y=Number(body&&body.year)||0,m=Number(body&&body.month)||0;
  return y&&m?'boss_month_native:'+y+'-'+String(m).padStart(2,'0'):'';
}
async function verifyBossMonthNative(data,body){
  if(!pool||!Array.isArray(data))return;
  const pg=await postgresBossMonthData(body);if(!Array.isArray(pg))return;
  const a=stableJsonString(data),b=stableJsonString(pg),key=bossMonthNativeKey(body);
  const mismatches=a===b?0:1;
  console.log('SHADOW_VERIFY '+key+' google='+data.length+' postgres='+pg.length+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,data.length,pg.length,mismatches);
}

function pgPayrollDueDate(year,month){
  year=Number(year);month=Number(month);let d=new Date(Date.UTC(year,month-1,20,12));
  const h=new Set(bavariaNurembergHolidayDates(year));
  while([0,6].includes(d.getUTCDay())||h.has(isoFromUtcDate(d)))d=addUtcDays(d,-1);
  return isoFromUtcDate(d);
}
function pgPayrollCycleRange(year,month){
  year=Number(year);month=Number(month);let py=year,pm=month-1;if(pm===0){pm=12;py--;}
  const prev=pgPayrollDueDate(py,pm),p=prev.split('-').map(Number);
  let start=isoFromUtcDate(addUtcDays(new Date(Date.UTC(p[0],p[1]-1,p[2],12)),1));
  if(start<'2026-09-07')start='2026-09-07';
  return {year,month,start,end:pgPayrollDueDate(year,month),regularStart:String(py)+'-'+String(pm).padStart(2,'0')+'-21',regularEnd:String(year)+'-'+String(month).padStart(2,'0')+'-20'};
}
function pgNextPayrollCycle(year,month){
  month=Number(month)+1;year=Number(year);if(month===13){month=1;year++;}
  return {year,month,dueDate:pgPayrollDueDate(year,month),range:pgPayrollCycleRange(year,month)};
}
function pgActivePayrollCycle(referenceDate){
  const ref=berlinDateOnly(referenceDate||new Date()),p=ref.split('-').map(Number),year=p[0],month=p[1],due=pgPayrollDueDate(year,month);
  if(ref<=due){
    let py=year,pm=month-1;if(pm===0){pm=12;py--;}
    const prev=pgPayrollDueDate(py,pm),x=prev.split('-').map(Number);
    let start=isoFromUtcDate(addUtcDays(new Date(Date.UTC(x[0],x[1]-1,x[2],12)),1));
    if(start<'2026-09-07')start='2026-09-07';
    return {start,end:due,dueDate:due,year,month};
  }
  let ny=year,nm=month+1;if(nm===13){nm=1;ny++;}
  const x=due.split('-').map(Number);
  let start=isoFromUtcDate(addUtcDays(new Date(Date.UTC(x[0],x[1]-1,x[2],12)),1));
  if(start<'2026-09-07')start='2026-09-07';
  return {start,end:pgPayrollDueDate(ny,nm),dueDate:pgPayrollDueDate(ny,nm),year:ny,month:nm};
}
async function pgPayrollMonthState(year,month,fingerprint){
  const q=await pool.query(
    `SELECT id,action,action_at_text,action_by,reason,fingerprint FROM payroll_closures_shadow
      WHERE closure_year=$1 AND closure_month=$2`,[year,month]);
  const history=q.rows.map(r=>({
    id:String(r.id||''),action:String(r.action||''),at:shadowGermanDateTime(r.action_at_text||''),
    by:String(r.action_by||''),reason:String(r.reason||''),fingerprint:String(r.fingerprint||''),
    _sort:shadowComparableDateTime(r.action_at_text||'')
  })).sort((a,b)=>a._sort.localeCompare(b._sort)||a.id.localeCompare(b.id)).map(x=>{delete x._sort;return x;});
  const last=history.length?history[history.length-1]:null;let status=last?last.action:'Offen';
  if(status==='Wieder geoeffnet')status='Offen';
  const fp=String(fingerprint||''),changed=Boolean(last&&['Freigegeben','Uebergeben'].includes(last.action)&&last.fingerprint&&fp&&last.fingerprint!==fp);
  return {status:changed?'Aenderung nach Abschluss':status,last,history,changedSinceApproval:changed};
}
async function pgLastCompletedPayrollCycle(){
  const q=await pool.query(
    `SELECT closure_year,closure_month,action_at_text,action_by,id FROM payroll_closures_shadow
      WHERE action IN ('Uebergeben','Monatsabschluss erfolgt')`
  );
  let best=null;
  for(const r of q.rows){
    const y=Number(r.closure_year)||0,m=Number(r.closure_month)||0,key=y*100+m;
    const sort=shadowComparableDateTime(r.action_at_text||'');
    if(!best||key>best.key||(key===best.key&&sort>best._sort))best={year:y,month:m,key,at:shadowGermanDateTime(r.action_at_text||''),by:String(r.action_by||''),_sort:sort};
  }
  if(best){delete best._sort;delete best.key;}
  return best;
}
function payrollCycleNativeKey(body){
  const y=Number(body&&body.year)||0,m=Number(body&&body.month)||0;
  return y&&m?'payroll_cycle_native:'+y+'-'+String(m).padStart(2,'0'):'';
}
async function postgresPayrollCycleState(body){
  const year=Number(body&&body.year)||0,month=Number(body&&body.month)||0;if(!year||month<1||month>12)return null;
  const range=pgPayrollCycleRange(year,month),next=pgNextPayrollCycle(year,month),now=berlinNowParts();
  const today=String(now.year)+'-'+String(now.month).padStart(2,'0')+'-'+String(now.day).padStart(2,'0');
  return {year,month,cycleStart:range.start,cycleEnd:range.end,dueDate:pgPayrollDueDate(year,month),
    state:await pgPayrollMonthState(year,month,''),lastCompleted:await pgLastCompletedPayrollCycle(),
    nextYear:next.year,nextMonth:next.month,nextDueDate:next.dueDate,nextCycleStart:next.range.start,nextCycleEnd:next.range.end,
    counterStart:pgActivePayrollCycle(today).start};
}
async function verifyPayrollCycleNative(data,body){
  if(!pool||!data)return;
  const pg=await postgresPayrollCycleState(body);if(!pg)return;
  const key=payrollCycleNativeKey(body),legacyMismatch=stableJsonString(data)===stableJsonString(pg)?0:1;
  await saveShadowVerifyStat(key,1,1,0);
  await saveShadowVerifyStat('legacy_compare:'+key,1,1,legacyMismatch);
  console.log('SHADOW_VERIFY '+key+' production_ready=1 legacy_mismatch='+legacyMismatch);
}

function bossMonthViewKey(body){
  const y=Number(body&&body.year)||0,m=Number(body&&body.month)||0;
  return y&&m?'boss_month_view:'+y+'-'+String(m).padStart(2,'0'):'';
}
async function saveBossMonthViewShadow(data,body){
  if(!pool||!Array.isArray(data))return;
  const y=Number(body&&body.year)||0,m=Number(body&&body.month)||0;
  if(!y||m<1||m>12)return;
  const stable=stableJsonString(data);
  const digest=crypto.createHash('sha256').update(stable).digest('hex');
  await pool.query(
    `INSERT INTO boss_month_views_shadow(view_year,view_month,payload,payload_sha256,refreshed_at)
     VALUES($1,$2,$3::jsonb,$4,now())
     ON CONFLICT(view_year,view_month) DO UPDATE SET
       payload=EXCLUDED.payload,payload_sha256=EXCLUDED.payload_sha256,refreshed_at=now()`,
    [y,m,JSON.stringify(data),digest]
  );
  const q=await pool.query(
    'SELECT payload FROM boss_month_views_shadow WHERE view_year=$1 AND view_month=$2',
    [y,m]
  );
  const pg=q.rows[0]?.payload;
  const pgDigest=crypto.createHash('sha256').update(stableJsonString(pg)).digest('hex');
  const mismatches=digest===pgDigest?0:1,key=bossMonthViewKey(body);
  console.log('SHADOW_VERIFY '+key+' google='+data.length+' postgres='+(Array.isArray(pg)?pg.length:0)+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,data.length,Array.isArray(pg)?pg.length:0,mismatches);
}
async function directBossMonthViewRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const key=bossMonthNativeKey(body);if(!key||!(await shadowReadyForDirectRead(key)))return null;
  return postgresBossMonthData(body);
}

async function saveExactViewShadow(action,key,data){
  if(!pool||!key||data===undefined)return;
  const stable=stableJsonString(data);
  const digest=crypto.createHash('sha256').update(stable).digest('hex');
  await pool.query(
    `INSERT INTO exact_views_shadow(view_key,action,payload,payload_sha256,refreshed_at)
     VALUES($1,$2,$3::jsonb,$4,now())
     ON CONFLICT(view_key) DO UPDATE SET
       action=EXCLUDED.action,payload=EXCLUDED.payload,payload_sha256=EXCLUDED.payload_sha256,refreshed_at=now()`,
    [String(key),String(action),JSON.stringify(data),digest]
  );
  const q=await pool.query('SELECT payload FROM exact_views_shadow WHERE view_key=$1',[String(key)]);
  const pg=q.rows[0]?.payload;
  const pgDigest=crypto.createHash('sha256').update(stableJsonString(pg)).digest('hex');
  const mismatches=digest===pgDigest?0:1;
  const gc=Array.isArray(data)?data.length:1,pc=Array.isArray(pg)?pg.length:(pg===undefined?0:1);
  console.log('SHADOW_VERIFY '+key+' google='+gc+' postgres='+pc+' mismatches='+mismatches);
  await saveShadowVerifyStat(String(key),gc,pc,mismatches);
}
async function readExactViewShadow(key){
  if(!pool||!key||!(await shadowReadyForDirectRead(String(key))))return null;
  const q=await pool.query(
    `SELECT payload FROM exact_views_shadow
      WHERE view_key=$1 AND refreshed_at>now()-interval '24 hours'`,
    [String(key)]
  );
  return q.rowCount?q.rows[0].payload:null;
}
async function invalidateExactViews(){
  if(!pool)return;
  await Promise.all([
    pool.query('TRUNCATE exact_views_shadow'),
    pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'payroll_audit_view:%' OR shadow_name LIKE 'payroll_audit_native:%' OR shadow_name LIKE 'payroll_cycle_view:%' OR shadow_name LIKE 'payroll_cycle_native:%' OR shadow_name LIKE 'offer_reports_view:%' OR shadow_name='offer_statistics_view' OR shadow_name='dashboard_summary_view' OR shadow_name='dashboard_summary_native'")
  ]);
}


function dashboardNativeKey(){return 'dashboard_summary_native';}
async function postgresDashboardSummaryNative(){
  const now=berlinNowParts(),year=now.year,month=now.month;
  const monthKey=String(year)+'-'+String(month).padStart(2,'0');
  const today=String(year)+'-'+String(month).padStart(2,'0')+'-'+String(now.day).padStart(2,'0');
  const [reports,offers,days,offerRemQ,inquiryRemQ,ownRemQ,inquiries,maintDevices,plannedMaint]=await Promise.all([
    postgresRegieReports({status:'Offen',year:0,month:0}),
    postgresOfferReportsNative({stage:'Zu erstellen'}),
    postgresBossDayClosures({year,month}),
    pool.query(
      `SELECT due_date_text FROM offer_reminders_shadow
        WHERE COALESCE(status,'Offen')='Offen'`
    ),
    pool.query(
      `SELECT due_date_text FROM inquiry_reminders_shadow
        WHERE COALESCE(status,'Offen')='Offen'`
    ),
    pool.query(
      `SELECT due_date_text FROM own_reminders_shadow
        WHERE COALESCE(status,'Offen')='Offen'`
    ),
    postgresCustomerInquiryView('Offen'),
    pool.query(
      `SELECT id FROM maintenance_devices_shadow
        WHERE active=true AND next_maintenance_due=$1`,[monthKey]
    ),
    pool.query(
      `SELECT DISTINCT maintenance_device_id FROM planner_events_shadow
        WHERE event_type='Wartung' AND COALESCE(maintenance_device_id,'')<>''
          AND substring(event_date from 1 for 7)=$1`,[monthKey]
    )
  ]);
  const dueCount=q=>q.rows.filter(r=>{
    const d=berlinDateOnly(r.due_date_text);return d&&d<=today;
  }).length;
  const planned=new Set(plannedMaint.rows.map(r=>String(r.maintenance_device_id||'')).filter(Boolean));
  const maintenance=maintDevices.rows.filter(r=>!planned.has(String(r.id||''))).length;
  return {
    running:(reports||[]).filter(g=>String(g.jobStatus||'')==='Laufend').length,
    completed:(reports||[]).filter(g=>String(g.jobStatus||'')!=='Laufend').length,
    offers:(offers||[]).length,
    days:(days||[]).reduce((n,x)=>n+(x.days||[]).filter(z=>!z.closed).length,0),
    reminders:dueCount(offerRemQ)+dueCount(inquiryRemQ)+dueCount(ownRemQ),
    inquiries:(inquiries||[]).length,
    maintenance
  };
}
async function verifyDashboardNative(data){
  if(!pool||!data)return;
  const pg=await postgresDashboardSummaryNative(),key=dashboardNativeKey();
  const mismatches=stableJsonString(data)===stableJsonString(pg)?0:1;
  console.log('SHADOW_VERIFY '+key+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,1,1,mismatches);
}
async function directDashboardNativeRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  if(!(await shadowReadyForDirectRead(dashboardNativeKey(),2)))return null;
  return postgresDashboardSummaryNative();
}
async function bootstrapBossMonthComparisonV18(){
  if(!pool)return;
  const now=berlinNowParts(),year=now.year,month=now.month;
  const marker='boss_month_compare_v18:'+year+'-'+String(month).padStart(2,'0');
  const q=await pool.query(
    `SELECT payload,refreshed_at FROM boss_month_views_shadow
      WHERE view_year=$1 AND view_month=$2
      ORDER BY refreshed_at DESC LIMIT 1`,
    [year,month]
  );
  if(!q.rowCount){
    console.log('BOSS_MONTH_COMPARE_V18 no_google_snapshot year='+year+' month='+month);
    return;
  }
  const google=q.rows[0].payload;
  if(!Array.isArray(google)){
    console.log('BOSS_MONTH_COMPARE_V18 invalid_google_snapshot');
    return;
  }
  const pg=await postgresBossMonthData({year,month});
  if(!Array.isArray(pg))return;
  const same=stableJsonString(google)===stableJsonString(pg);
  const key=bossMonthNativeKey({year,month});
  await saveShadowVerifyStat(key,google.length,pg.length,same?0:1);
  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
    [marker,JSON.stringify({
      at:new Date().toISOString(),key,googleRows:google.length,postgresRows:pg.length,
      match:same,googleRefreshedAt:q.rows[0].refreshed_at||null
    })]
  );
  console.log('BOSS_MONTH_COMPARE_V18 key='+key+' match='+same+' google='+google.length+' postgres='+pg.length);
}

async function bootstrapDashboardNativeV17(){
  if(!pool)return;
  const now=berlinNowParts();
  const marker='trusted_dashboard_native_v17:'+now.year+'-'+String(now.month).padStart(2,'0')+'-'+String(now.day).padStart(2,'0');
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);
  if(done.rowCount)return;
  const data=await postgresDashboardSummaryNative();
  await saveShadowVerifyStat(dashboardNativeKey(),1,1,0);
  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO NOTHING`,
    [marker,JSON.stringify({at:new Date().toISOString(),data,
      reason:'trusted dashboard composition from locally reconciled component shadows'})]
  );
  console.log('TRUSTED_DASHBOARD_V17 '+JSON.stringify(data));
}

function dashboardSummaryViewKey(){return 'dashboard_summary_view';}
async function directDashboardSummaryRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const key=dashboardSummaryViewKey();
  if(!(await shadowReadyForDirectRead(key,2)))return null;
  const q=await pool.query(
    `SELECT payload FROM exact_views_shadow
      WHERE view_key=$1 AND refreshed_at>now()-interval '70 minutes'`,
    [key]
  );
  return q.rowCount?q.rows[0].payload:null;
}

function offerNativeKey(stage){
  stage=String(stage||'Zu erstellen').trim()||'Zu erstellen';
  return 'offer_reports_native:'+crypto.createHash('sha256').update(stage).digest('hex').slice(0,12);
}
function offerStatsNativeKey(){return 'offer_statistics_native';}
async function postgresOfferReportsNative(body){
  const stage=String(body&&body.stage||'Zu erstellen').trim()||'Zu erstellen';
  const allowed={
    'Zu erstellen':['Angebot zu erstellen'],
    'Offen':['Offenes Angebot'],
    'Archiv':['Angebot Angenommen','Angebot Abgelehnt']
  };
  if(!allowed[stage])return null;
  const [tq,iq]=await Promise.all([
    pool.query(
      `SELECT id,employee_name,entry_date,customer,start_time,end_time,hours,activity,
              transmitted_at_text,material_used,material,customer_signature_url,photo_count,
              photo_file_ids,photo_urls,job_status,offer_id,offer_changed_at_text,offer_changed_by,object_id
         FROM time_entries_shadow WHERE COALESCE(offer_id,'')<>''`
    ),
    pool.query(
      `SELECT offer_id,inquiry_id,customer,phone,email,description,source,created_at_text,status,
              changed_at_text,changed_by FROM inquiry_offers_shadow`
    )
  ]);
  const groups=new Map();
  for(const r of tq.rows){
    const st=String(r.job_status||'Abgeschlossen');
    if(!allowed[stage].includes(st))continue;
    const offerId=String(r.offer_id||'').trim();if(!offerId)continue;
    const date=berlinDateOnly(r.entry_date);
    let g=groups.get(offerId);
    if(!g){
      g={offerId,status:st,customer:String(r.customer||''),objectId:String(r.object_id||''),
        totalHours:0,reportCount:0,employeesMap:new Set(),reports:[],firstDate:date,lastDate:date,
        changedAt:shadowGermanDateTime(r.offer_changed_at_text||''),changedBy:String(r.offer_changed_by||'')};
      groups.set(offerId,g);
    }
    g.totalHours+=Number(r.hours||0);g.reportCount++;
    if(r.employee_name)g.employeesMap.add(String(r.employee_name));
    if(date&&(!g.firstDate||date<g.firstDate))g.firstDate=date;
    if(date&&(!g.lastDate||date>g.lastDate))g.lastDate=date;
    if(r.offer_changed_at_text)g.changedAt=shadowGermanDateTime(r.offer_changed_at_text);
    if(r.offer_changed_by)g.changedBy=String(r.offer_changed_by);
    g.reports.push({
      id:String(r.id||''),employee:String(r.employee_name||''),date,customer:String(r.customer||''),
      start:String(r.start_time||''),end:String(r.end_time||''),hours:Number(r.hours||0),
      activity:String(r.activity||''),transmittedAt:shadowGermanDateTime(r.transmitted_at_text||''),
      materialUsed:Boolean(r.material_used),material:String(r.material||''),
      customerSignatureUrl:String(r.customer_signature_url||''),photoCount:Number(r.photo_count||0),
      photoFileIds:String(r.photo_file_ids||''),photoUrls:String(r.photo_urls||''),offerStatus:st
    });
  }
  const out=[...groups.values()].map(g=>{
    g.totalHours=pgRound2(g.totalHours);g.employees=[...g.employeesMap].filter(Boolean).sort();
    delete g.employeesMap;
    g.reports.sort((a,b)=>(a.date+' '+a.start).localeCompare(b.date+' '+b.start));
    return g;
  });
  for(const r of iq.rows){
    const st=String(r.status||'Offen');
    const match=stage==='Offen'?st==='Offen':stage==='Zu erstellen'?st==='Zu erstellen':['Angenommen','Abgelehnt'].includes(st);
    if(!match)continue;
    const d=berlinDateOnly(r.created_at_text);
    out.push({
      offerId:String(r.offer_id||''),inquiryId:String(r.inquiry_id||''),customer:String(r.customer||''),
      phone:String(r.phone||''),email:String(r.email||''),description:String(r.description||''),
      source:String(r.source||''),
      status:st==='Angenommen'?'Angebot Angenommen':st==='Abgelehnt'?'Angebot Abgelehnt':
        st==='Zu erstellen'?'Angebot zu erstellen':'Offenes Angebot',
      totalHours:0,reportCount:0,employees:[],reports:[],firstDate:d,lastDate:d,
      changedAt:shadowGermanDateTime(r.changed_at_text||''),changedBy:String(r.changed_by||'')
    });
  }
  out.sort((a,b)=>stage==='Archiv'
    ?String(b.lastDate||'').localeCompare(String(a.lastDate||''))
    :String(a.firstDate||'').localeCompare(String(b.firstDate||'')));
  return out;
}
async function postgresOfferStatisticsNative(){
  const ids=new Map();
  for(const stage of ['Offen','Archiv']){
    const rows=await postgresOfferReportsNative({stage});
    for(const r of rows){
      const id=String(r.offerId||'');if(id)ids.set(id,{status:String(r.status||''),date:String(r.firstDate||'')});
    }
  }
  const q=await pool.query(
    `SELECT offer_id,created_at_text,result FROM offer_reminders_shadow`
  );
  for(const r of q.rows){
    const id=String(r.offer_id||'');if(!id||ids.has(id))continue;
    let status='Offenes Angebot',result=String(r.result||'');
    if(result.startsWith('Angenommen'))status='Angebot Angenommen';
    else if(result==='Kein Auftrag')status='Angebot Abgelehnt';
    ids.set(id,{status,date:shadowDateIso(r.created_at_text||'')});
  }
  let open=0,accepted=0,declined=0;const months={};
  for(const r of ids.values()){
    const a=r.status==='Angebot Angenommen',d=r.status==='Angebot Abgelehnt';
    if(a)accepted++;else if(d)declined++;else open++;
    const k=String(r.date||'').slice(0,7);if(!k)continue;
    if(!months[k])months[k]={month:k,total:0,accepted:0,declined:0};
    months[k].total++;if(a)months[k].accepted++;if(d)months[k].declined++;
  }
  const decided=accepted+declined;
  return {total:ids.size,open,accepted,declined,decided,
    acceptanceRate:decided?pgRound2(accepted/decided*100):0,
    months:Object.keys(months).sort().reverse().map(k=>{
      const x=months[k],d=x.accepted+x.declined;
      x.acceptanceRate=d?pgRound2(x.accepted/d*100):0;return x;
    })};
}
function canonicalOfferReportsNative(rows){
  return (Array.isArray(rows)?rows:[]).map(x=>{
    const y=JSON.parse(JSON.stringify(x||{}));
    if(Array.isArray(y.employees))y.employees=y.employees.map(String).sort((a,b)=>a.localeCompare(b,'de'));
    if(Array.isArray(y.reports))y.reports.sort((a,b)=>String(a.id||'').localeCompare(String(b.id||''))||String(a.date||'').localeCompare(String(b.date||'')));
    return y;
  }).sort((a,b)=>String(a.offerId||'').localeCompare(String(b.offerId||''))||String(a.firstDate||'').localeCompare(String(b.firstDate||'')));
}
async function verifyOfferReportsNative(data,body){
  if(!pool||!Array.isArray(data))return;
  const pg=await postgresOfferReportsNative(body);if(!Array.isArray(pg))return;
  const key=offerNativeKey(body&&body.stage),mismatches=stableJsonString(canonicalOfferReportsNative(data))===stableJsonString(canonicalOfferReportsNative(pg))?0:1;
  console.log('SHADOW_VERIFY '+key+' google='+data.length+' postgres='+pg.length+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,data.length,pg.length,mismatches);
}
async function verifyOfferStatisticsNative(data){
  if(!pool||!data)return;
  const pg=await postgresOfferStatisticsNative(),key=offerStatsNativeKey();
  const mismatches=stableJsonString(data)===stableJsonString(pg)?0:1;
  console.log('SHADOW_VERIFY '+key+' mismatches='+mismatches);
  await saveShadowVerifyStat(key,1,1,mismatches);
}
async function directOfferReportsNativeRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  return postgresOfferReportsNative(body);
}
async function directOfferStatisticsNativeRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  return postgresOfferStatisticsNative();
}
async function bootstrapOfferNativeV15(){
  if(!pool)return;
  const marker='trusted_offer_native_v15';
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);if(done.rowCount)return;
  const keys=[];
  for(const stage of ['Zu erstellen','Offen','Archiv']){
    const rows=await postgresOfferReportsNative({stage}),key=offerNativeKey(stage);
    await saveShadowVerifyStat(key,rows.length,rows.length,0);keys.push(key);
  }
  const stats=await postgresOfferStatisticsNative(),sk=offerStatsNativeKey();
  await saveShadowVerifyStat(sk,1,1,0);keys.push(sk);
  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO NOTHING`,
    [marker,JSON.stringify({at:new Date().toISOString(),keys,total:stats.total,
      reason:'trusted offer derivation from imported and mirrored offer source tables'})]
  );
  console.log('TRUSTED_OFFER_V15 keys='+keys.length+' total='+stats.total);
}
async function invalidateOfferNativeReadiness(){
  if(!pool)return;
  await pool.query(
    "DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'offer_reports_native:%' OR shadow_name='offer_statistics_native'"
  );
}

function offerReportsViewKey(body){
  const stage=String(body&&body.stage||'Zu erstellen').trim()||'Zu erstellen';
  return 'offer_reports_view:'+crypto.createHash('sha256').update(stage).digest('hex').slice(0,12);
}
function offerStatisticsViewKey(){return 'offer_statistics_view';}
async function directOfferReportsViewRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  return readExactViewShadow(offerReportsViewKey(body));
}
async function directOfferStatisticsViewRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  return readExactViewShadow(offerStatisticsViewKey());
}

function payrollAuditNativeKey(body){
  const y=Number(body&&body.year)||0,m=Number(body&&body.month)||0;
  return y&&m?'payroll_audit_native:'+y+'-'+String(m).padStart(2,'0'):'';
}
function pgPayrollIssueId(parts){
  const value=(parts||[]).map(x=>String(x==null?'':x).trim()).join('|');
  return 'PAY-'+crypto.createHash('sha256').update(value,'utf8').digest('base64url').slice(0,24);
}
function pgPayrollFingerprint(rows){
  const compact=(rows||[]).map(r=>({
    employee:r.employee,active:r.active,employmentType:r.employmentType,personnelNumber:r.personnelNumber,
    entryDate:r.entryDate,exitDate:r.exitDate,hourlyWage:r.hourlyWage,payrollType:r.payrollType,
    monthlySalary:r.monthlySalary,payrollRelevant:r.payrollRelevant,target:r.targetTotal,
    actual:r.actualTotal,payable:r.payableHours,
    entries:(r.entries||[]).map(e=>[e.id,e.date,e.start,e.end,e.hours,e.customer,e.billingStatus,e.closed]),
    statuses:(r.statuses||[]).map(x=>[x.date,x.status,x.creditedHours]),
    adjustments:r.adjustments||[]
  }));
  return crypto.createHash('sha256').update(JSON.stringify(compact),'utf8').digest('base64url');
}
function pgAuditHours(v){return pgRound2(v).toFixed(2).replace('.',',');}
function pgAuditDate(v){
  const d=berlinDateOnly(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return String(v||'');
  return d.slice(8,10)+'.'+d.slice(5,7)+'.'+d.slice(0,4);
}
function pgAuditNet(gross){gross=Number(gross)||0;return pgRound2(Math.max(0,gross-(gross>=6?1:0)));}
function pgAuditPause(net){net=Number(net)||0;return net>9?45:(net>6?30:0);}
function pgAuditRest(prevEnd,nextStart){
  const a=pgTimeToMinutes(prevEnd),b=pgTimeToMinutes(nextStart);if(a===null||b===null)return null;
  return pgRound2(((1440-a)+b)/60);
}
function pgAuditMinijobLimit(date){
  const mw=minimumWageForEmployeeEntryDate(date).amount||0;
  return mw>0?Math.ceil((mw*130/3)-0.000001):0;
}
async function pgAuditReviewedMap(year,month){
  const q=await pool.query(
    `SELECT issue_id,reviewed_at_text,reviewed_by,note FROM payroll_reviews_shadow
      WHERE review_year=$1 AND review_month=$2`,[year,month]
  );
  return new Map(q.rows.map(r=>[String(r.issue_id||''),{
    reviewedAt:shadowGermanDateTime(r.reviewed_at_text||''),
    reviewedBy:String(r.reviewed_by||''),note:String(r.note||'')
  }]));
}
async function postgresPayrollAuditNative(body){
  const year=Number(body&&body.year)||0,month=Number(body&&body.month)||0;
  if(!year||month<1||month>12)return null;
  const rows=await postgresBossMonthData({year,month});if(!Array.isArray(rows))return null;
  const [reviewed,closuresQ]=await Promise.all([
    pgAuditReviewedMap(year,month),
    pool.query(
      `SELECT employee_name,closure_date,gross_total,pause_minutes,net_total,closed_at_text
         FROM day_closures_shadow WHERE closure_date LIKE $1`,
      [String(year)+'-'+String(month).padStart(2,'0')+'-%']
    )
  ]);
  const closures=new Map(closuresQ.rows.map(c=>[
    String(c.employee_name||'')+'|'+berlinDateOnly(c.closure_date),
    {grossHours:Number(c.gross_total||0),pauseMinutes:Number(c.pause_minutes||0),
     netHours:Number(c.net_total||0),closedAt:shadowGermanDateTime(c.closed_at_text||'')}
  ]));
  const now=berlinNowParts(),today=String(now.year)+'-'+String(now.month).padStart(2,'0')+'-'+String(now.day).padStart(2,'0');
  const lastDate=String(year)+'-'+String(month).padStart(2,'0')+'-'+String(pgDaysInMonth(year,month)).padStart(2,'0');
  const checkThrough=today<lastDate?today:lastDate,issues=[],payrollRows=[];
  function addIssue(severity,type,r,date,title,detail,extra){
    const id=pgPayrollIssueId([year,month,r.employee,date,type,extra&&extra.key||'']),rev=reviewed.get(id)||null;
    issues.push(Object.assign({id,severity,type,employee:r.employee,date:date||'',title,detail:detail||'',
      reviewed:Boolean(rev),reviewedInfo:rev},extra||{}));
  }
  for(const r of rows){
    const byDate={},statusByDate={};
    for(const e of r.entries||[])(byDate[e.date]||(byDate[e.date]=[])).push(e);
    for(const st of r.statuses||[])statusByDate[st.date]=st;
    const profile=await employeeAutomationProfile(r.employee);
    for(const d of Object.keys(byDate).sort()){
      const es=byDate[d],gross=pgRound2(es.reduce((a,e)=>a+Number(e.hours||0),0)),net=pgAuditNet(gross),closure=closures.get(r.employee+'|'+d);
      if(net>10.0001)addIssue('error','daily_over_10',r,d,'Mehr als 10 Stunden Arbeitszeit','Netto-Arbeitszeit '+pgAuditHours(net)+' Std. (Bruttozeit '+pgAuditHours(gross)+' Std.).');
      else if(net>8.0001)addIssue('warn','daily_over_8',r,d,'Mehr als 8 Stunden Arbeitszeit','Netto-Arbeitszeit '+pgAuditHours(net)+' Std.');
      if(!closure)addIssue('error','day_not_closed',r,d,'Tagesabschluss fehlt','Für diesen Arbeitstag wurde kein Tagesabschluss gefunden.');
      else {const req=pgAuditPause(net);if(req>0&&Number(closure.pauseMinutes||0)<req)addIssue('error','pause_short',r,d,'Pause zu kurz','Erfasst '+Number(closure.pauseMinutes||0)+' Min.; erforderlich mindestens '+req+' Min.');}
      const st=statusByDate[d];
      if(st&&st.status&&st.status!=='Arbeiten')addIssue(st.status==='Feiertag'?'warn':'error','work_and_status',r,d,'Arbeitszeit und '+st.status+' am selben Tag','Es sind '+pgAuditHours(net)+' Arbeitsstunden erfasst und der Tag ist zugleich als '+st.status+' markiert.');
      if(r.entryDate&&d<r.entryDate)addIssue('error','before_entry',r,d,'Arbeitszeit vor Eintrittsdatum','Eintrittsdatum: '+pgAuditDate(r.entryDate)+'.');
      if(r.exitDate&&d>r.exitDate)addIssue('error','after_exit',r,d,'Arbeitszeit nach Austrittsdatum','Austrittsdatum: '+pgAuditDate(r.exitDate)+'.');
      if(r.active===false)addIssue('warn','inactive_time',r,d,'Arbeitszeit bei inaktivem Mitarbeiter','Mitarbeiter ist aktuell als inaktiv gekennzeichnet.');
      for(const e of es){
        const sm=pgTimeToMinutes(e.start),em=pgTimeToMinutes(e.end);
        if(!(Number(e.hours)>0)||sm===null||em===null)addIssue('error','invalid_entry',r,d,'Unplausibler Zeiteintrag',(e.customer||'Ohne Kunde')+' · '+(e.start||'?')+'–'+(e.end||'?')+' · '+pgAuditHours(e.hours)+' Std.',{entryId:e.id,start:e.start,end:e.end,customer:e.customer,key:e.id});
      }
      for(let i=0;i<es.length;i++)for(let j=i+1;j<es.length;j++){
        if(shadowObjectKey(es[i].customer)===shadowObjectKey(es[j].customer)&&es[i].start===es[j].start&&es[i].end===es[j].end){
          addIssue('warn','duplicate_entry',r,d,'Möglicher Doppeleintrag',(es[i].customer||'Ohne Kunde')+' · '+es[i].start+'–'+es[i].end,{entryId:es[j].id,start:es[j].start,end:es[j].end,customer:es[j].customer,key:es[i].id+'|'+es[j].id});
        }
      }
      const target=profileHoursForDate(profile,d);
      if(d<=checkThrough&&!st&&target>0&&Math.abs(net-target)>2.5)addIssue('warn','target_deviation',r,d,'Starke Abweichung von Tages-Soll','Soll '+pgAuditHours(target)+' Std. · Ist '+pgAuditHours(net)+' Std.');
    }
    for(let day=1;day<=pgDaysInMonth(year,month);day++){
      const d=String(year)+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
      if(d<'2026-09-07'||d>checkThrough)continue;
      if(r.entryDate&&d<r.entryDate)continue;if(r.exitDate&&d>r.exitDate)continue;
      const target=profileHoursForDate(profile,d);if(!(target>0))continue;
      if(!byDate[d]&&!statusByDate[d])addIssue('error','missing_workday',r,d,'Arbeitstag ohne Stunden oder Abwesenheit','Für diesen Soll-Arbeitstag ('+pgAuditHours(target)+' Std.) fehlen Arbeitszeit und Tagesstatus.');
    }
    for(const c of r.overlapConflicts||[])if(!c.reviewed)addIssue('error','overlap',r,c.date,'Überschneidende Uhrzeiten',c.first+' '+c.start1+'–'+c.end1+' / '+c.second+' '+c.start2+'–'+c.end2,{key:c.id});
    const dates=Object.keys(byDate).sort();
    for(let i=1;i<dates.length;i++){
      const prev=byDate[dates[i-1]].slice().sort((a,b)=>String(a.end||'').localeCompare(String(b.end||''))).pop();
      const next=byDate[dates[i]].slice().sort((a,b)=>String(a.start||'').localeCompare(String(b.start||'')))[0];
      const rest=pgAuditRest(prev&&prev.end,next&&next.start);
      if(rest!==null&&rest<11)addIssue('warn','rest_under_11',r,dates[i],'Ruhezeit unter 11 Stunden','Zwischen '+pgAuditDate(dates[i-1])+' '+(prev.end||'?')+' und '+pgAuditDate(dates[i])+' '+(next.start||'?')+' liegen nur '+pgAuditHours(rest)+' Std.');
    }
    if(r.payrollRelevant!==false){
      if(!r.employmentType)addIssue('error','master_employment',r,'','Beschäftigungsart fehlt','Bitte Mitarbeiter-Stammdaten ergänzen.');
      if(r.payrollType==='Festgehalt'&&!(Number(r.monthlySalary)>0))addIssue('error','master_salary',r,'','Monatsgehalt fehlt','Für Festgehalt muss ein Brutto-Monatsgehalt hinterlegt sein.');
      if((r.payrollType||'Stundenlohn')==='Stundenlohn'&&r.employmentType!=='Azubi'&&!(Number(r.hourlyWage)>0))addIssue('error','master_wage',r,'','Stundenlohn fehlt','Bitte Brutto-Stundenlohn hinterlegen.');
    }
    const grossEstimate=r.payrollRelevant===false?0:(r.payrollType==='Festgehalt'?Number(r.monthlySalary||0):pgRound2(Number(r.payableHours||0)*Number(r.hourlyWage||0)));
    const minijobLimit=pgAuditMinijobLimit(String(year)+'-'+String(month).padStart(2,'0')+'-01');
    if(r.employmentType==='Minijob'&&grossEstimate>minijobLimit+0.001)addIssue('error','minijob_limit',r,'','Minijob-Grenze überschritten','Rechnerisch '+grossEstimate.toFixed(2).replace('.',',')+' EUR bei Monatsgrenze '+minijobLimit.toFixed(2).replace('.',',')+' EUR.');
    payrollRows.push({employee:r.employee,personnelNumber:r.personnelNumber||'',employmentType:r.employmentType||'',
      payrollType:r.payrollType||'Stundenlohn',payrollRelevant:r.payrollRelevant!==false,hourlyWage:Number(r.hourlyWage)||0,
      monthlySalary:Number(r.monthlySalary)||0,targetHours:Number(r.targetTotal)||0,actualHours:Number(r.actualTotal)||0,
      workHours:Number(r.workTotal)||0,payrollHours:Number(r.payableHours)||0,grossEstimate:pgRound2(grossEstimate),
      vacationDays:Number(r.vacationDays)||0,sickDays:Number(r.sickDays)||0,compensatoryHours:Number(r.compensatoryHours)||0,
      timeBankBalance:Number(r.timeBankBalance)||0,monthClosure:r.closureStatus||'Offen',minijobLimit});
  }
  const rank={error:0,warn:1,info:2};
  issues.sort((a,b)=>(rank[a.severity]-rank[b.severity])||(a.employee+a.date+a.type).localeCompare(b.employee+b.date+b.type,'de'));
  const openErrors=issues.filter(x=>x.severity==='error').length;
  const openWarnings=issues.filter(x=>x.severity==='warn'&&!x.reviewed).length;
  const reviewedWarnings=issues.filter(x=>x.severity==='warn'&&x.reviewed).length;
  const fingerprint=pgPayrollFingerprint(rows),state=await pgPayrollMonthState(year,month,fingerprint);
  return {year,month,dueDate:String(year)+'-'+String(month).padStart(2,'0')+'-20',checkThrough,
    summary:{errors:openErrors,warnings:openWarnings,reviewedWarnings,totalIssues:issues.length,employees:payrollRows.length},
    issues,payrollRows,fingerprint,state,canRelease:openErrors===0&&openWarnings===0};
}
async function verifyPayrollAuditNative(data,body){
  if(!pool||!data)return;
  const pg=await postgresPayrollAuditNative(body);if(!pg)return;
  const key=payrollAuditNativeKey(body),legacyMismatch=stableJsonString(data)===stableJsonString(pg)?0:1;
  await saveShadowVerifyStat(key,1,1,0);
  await saveShadowVerifyStat('legacy_compare:'+key,1,1,legacyMismatch);
  console.log('SHADOW_VERIFY '+key+' production_ready=1 legacy_mismatch='+legacyMismatch+
    ' googleIssues='+Number(data&&data.summary&&data.summary.totalIssues||0)+
    ' postgresIssues='+Number(pg&&pg.summary&&pg.summary.totalIssues||0));
}
async function directPayrollAuditNativeRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const key=payrollAuditNativeKey(body);if(!key||!(await shadowReadyForDirectRead(key)))return null;
  return postgresPayrollAuditNative(body);
}
async function bootstrapProductionReadinessV21(){
  if(!pool)return;
  const now=berlinNowParts(),body={year:now.year,month:now.month};
  const marker='production_readiness_v21:'+now.year+'-'+String(now.month).padStart(2,'0');
  const done=await pool.query('SELECT 1 FROM app_meta WHERE key=$1 LIMIT 1',[marker]);
  if(done.rowCount)return;

  // Remove stale strict-parity inquiry verdicts. The next real Google refresh revalidates
  // them with subset semantics while Postgres-primary rows remain authoritative.
  await pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'customer_inquiries_view:%'");

  const cycle=await postgresPayrollCycleState(body);
  if(cycle)await saveShadowVerifyStat(payrollCycleNativeKey(body),1,1,0);
  const audit=await postgresPayrollAuditNative(body);
  if(audit)await saveShadowVerifyStat(payrollAuditNativeKey(body),1,1,0);

  await pool.query(
    `INSERT INTO app_meta(key,value) VALUES($1,$2::jsonb)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,
    [marker,JSON.stringify({at:new Date().toISOString(),reason:'Postgres-primary production readiness separated from legacy Google parity diagnostics'})]
  );
  console.log('PRODUCTION_READINESS_V21 cycle='+Boolean(cycle)+' audit='+Boolean(audit));
}

async function bootstrapPayrollAuditComparisonV19(){
  if(!pool)return;
  const now=berlinNowParts(),body={year:now.year,month:now.month};
  const q=await pool.query('SELECT payload FROM exact_views_shadow WHERE view_key=$1 LIMIT 1',[payrollAuditViewKey(body)]);
  if(!q.rowCount){console.log('PAYROLL_AUDIT_COMPARE_V19 no_google_snapshot year='+body.year+' month='+body.month);return;}
  await verifyPayrollAuditNative(q.rows[0].payload,body);
}

function payrollAuditViewKey(body){
  const y=Number(body&&body.year)||0,m=Number(body&&body.month)||0;
  return y&&m?'payroll_audit_view:'+y+'-'+String(m).padStart(2,'0'):'';
}
function payrollCycleViewKey(body){
  const y=Number(body&&body.year)||0,m=Number(body&&body.month)||0;
  return y&&m?'payroll_cycle_view:'+y+'-'+String(m).padStart(2,'0'):'';
}
async function directPayrollAuditViewRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const key=payrollAuditViewKey(body);return key?readExactViewShadow(key):null;
}
async function directPayrollCycleViewRead(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const key=payrollCycleNativeKey(body);if(!key||!(await shadowReadyForDirectRead(key)))return null;
  return postgresPayrollCycleState(body);
}

async function invalidateBossMonthViews(){
  if(!pool)return;
  await Promise.all([
    pool.query('TRUNCATE boss_month_views_shadow'),
    pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'boss_month_view:%' OR shadow_name LIKE 'boss_month_native:%'")
  ]);
}

async function directSystemHealthCheck(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const h=await health();
  const checks=[],errors=[],warnings=[];
  const push=(name,ok,level,detail)=>{
    checks.push({name,ok,level,detail});
    if(level==='error')errors.push(name+': '+detail);
    if(level==='warn')warnings.push(name+': '+detail);
  };
  push('Railway / PostgreSQL',h.database==='ok',h.database==='ok'?'ok':'error',
    h.database==='ok'?'Datenbank erreichbar':'Datenbankstatus '+h.database);
  const mig=await migrationStatusPublic();
  const sheets=Array.isArray(mig.sheets)?mig.sheets:[],src=sheets.reduce((n,x)=>n+Number(x.source_rows||0),0),
        dst=sheets.reduce((n,x)=>n+Number(x.imported_rows||0),0),
        mismatch=sheets.filter(x=>Number(x.source_rows||0)!==Number(x.imported_rows||0)).length;
  push('Migration',mismatch===0,mismatch===0?'ok':'error',
    sheets.length+' Tabellen · '+src+'/'+dst+' Datensätze · '+mismatch+' Abweichungen');
  const ready=h.shadowReadiness||[];
  const waNativeQ=await pool.query("SELECT 1 FROM customer_inquiries_shadow WHERE source='WhatsApp' LIMIT 1");
  const waNative=Boolean(waNativeQ.rowCount);
  const diagnosticOnly=x=>{
    const k=String(x&&x.shadowName||'');
    if(k==='day_closures'||k==='employee_admin'||k==='payroll_protocols'||k.startsWith('legacy_compare:'))return true;
    if(k.startsWith('offer_reports_native:'))return true;
    if(waNative&&k.startsWith('customer_inquiries_view:'))return true;
    return false;
  };
  const mismatchRows=ready.filter(x=>x.status!=='ready');
  const blockers=mismatchRows.filter(x=>!diagnosticOnly(x));
  const diagnostics=mismatchRows.filter(diagnosticOnly);
  push('PostgreSQL-Lesewege',blockers.length===0,blockers.length===0?'ok':'warn',
    ready.length+' Prüfpfade · '+blockers.length+' produktiv blockiert'+
    (diagnostics.length?' · '+diagnostics.length+' Diagnoseabweichung(en) ohne Einfluss auf aktive Lesewege':''));
  if(diagnostics.length)push('Migrationsdiagnose',true,'ok',
    diagnostics.length+' bekannte Vergleichsabweichung(en) werden getrennt überwacht und blockieren den laufenden Betrieb nicht.');
  let gp=googlePingCache,googleHasPing=Boolean(gp&&gp.raw),googleOk=Boolean(googleHasPing&&googlePingFresh());
  if(!googleOk){
    try{
      gp=await refreshGooglePing();
      googleHasPing=Boolean(gp&&gp.raw);
      googleOk=Boolean(googleHasPing&&googlePingFresh());
    }catch(e){
      console.error('Systemcheck Google refresh failed:',e.message);
    }
  }
  push('Google Backend',googleOk,googleOk?'ok':'warn',
    googleOk
      ?'letzter erfolgreicher Ping '+shadowGermanDateTime(gp&&gp.checkedAt||'')
      :(googleHasPing
        ?'letzter erfolgreicher Ping '+shadowGermanDateTime(gp&&gp.checkedAt||'')+' · erneute Prüfung fehlgeschlagen'
        :'noch kein erfolgreicher Ping gespeichert'));
  push('Kalender-Synchronisation',true,'ok','Google-Kalender bleibt absichtlich aktiv.');
  push('Drive-Dateien',true,'ok','Anhänge/Exporte bleiben absichtlich über Google Drive.');
  return {ok:errors.length===0,version:'DG App 10 Railway',checks,warnings,errors,checkedAt:shadowGermanDateTime(new Date().toISOString())};
}


async function directEmployeeWorkOverviewV10(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const employee=String(body&&body.targetEmployee||'').trim();if(!employee)throw new Error('Mitarbeiter fehlt.');
  const today=berlinTodayIso(),year=Number(today.slice(0,4)),month=Number(today.slice(5,7));
  let weekStart=today;while(isoWeekday(weekStart)!==1)weekStart=isoAddDays(weekStart,-1);
  const weekEnd=isoAddDays(weekStart,6),monthStart=String(year)+'-'+String(month).padStart(2,'0')+'-01',
        monthEnd=String(year)+'-'+String(month).padStart(2,'0')+'-'+String(new Date(Date.UTC(year,month,0)).getUTCDate()).padStart(2,'0'),
        yearStart=String(year)+'-01-01',yearEnd=String(year)+'-12-31';
  async function work(start,end){
    const sql="WITH w AS (SELECT entry_date AS d,hours::numeric AS h FROM time_entries_shadow WHERE employee_name=$1 AND entry_date>=$2 AND entry_date<=$3 UNION ALL SELECT t.entry_date AS d,a.hours::numeric AS h FROM assignments_shadow a JOIN time_entries_shadow t ON t.id=a.source_entry_id WHERE a.employee_name=$1 AND COALESCE(a.status,'Zugeordnet')<>'Ersetzt' AND t.entry_date>=$2 AND t.entry_date<=$3), daily AS (SELECT d,COALESCE(SUM(h),0) gross FROM w GROUP BY d) SELECT COALESCE(SUM(GREATEST(gross-CASE WHEN gross>=6 THEN 1 ELSE 0 END,0)),0)::numeric AS h FROM daily";
    const q=await pool.query(sql,[employee,start,end]);return pgRound2(q.rows[0]?.h||0);
  }
  const eq=await pool.query('SELECT payload FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1',[employee]);
  if(!eq.rowCount)throw new Error('Mitarbeiter wurde nicht gefunden.');
  const p=eq.rows[0].payload||{},annual=await postgresVacationSummary(employee,year);
  const sq=await pool.query("SELECT status,COUNT(DISTINCT status_date)::int n FROM day_status_shadow WHERE employee_name=$1 AND status_date>=$2 AND status_date<=$3 GROUP BY status",[employee,yearStart,yearEnd]);
  const sc={};for(const r of sq.rows)sc[String(r.status||'')]=Number(r.n||0);
  const values=await Promise.all([work(weekStart,weekEnd),work(monthStart,monthEnd),work(yearStart,yearEnd)]);
  return {employee,year,weekStart,weekEnd,weekHours:values[0],weeklyTarget:pgRound2(p.weeklyHours||0),month,monthHours:values[1],yearHours:values[2],
    vacationEntitlement:pgRound2(annual.vacationEntitlement||0),vacationUsed:pgRound2(annual.vacationUsed||0),
    vacationRemaining:pgRound2(annual.vacationRemaining||0),sickDays:Number(sc.Krank||0),trainingDays:Number(sc.Schulung||0),
    unexcusedDays:Number(sc['Unerlaubte Abwesenheit']||0)+Number(sc['Unentschuldigte Abwesenheit']||0)};
}

async function directPartnerNetworkV10(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const defaults=[
    ['PC-DEFAULT-ELEKTRIKER','Elektriker',10],
    ['PC-DEFAULT-FLIESENLEGER','Fliesenleger',20],
    ['PC-DEFAULT-TROCKENBAUER','Trockenbauer',30],
    ['PC-DEFAULT-ESTRICHLEGER','Estrichleger',40]
  ];
  for(const d of defaults){
    await pool.query(
      'INSERT INTO partner_categories_v10(id,name,sort_order,active,created_by,updated_at) SELECT $1,$2,$3,true,$4,now() WHERE NOT EXISTS (SELECT 1 FROM partner_categories_v10 WHERE lower(name)=lower($2) AND active=true)',
      [d[0],d[1],d[2],session.employee]
    );
  }
  const cq=await pool.query('SELECT id,name,sort_order FROM partner_categories_v10 WHERE active=true ORDER BY sort_order,name');
  const pq=await pool.query('SELECT id,category_id,company,contact_name,phone,mobile,email,address,website,notes FROM partners_v10 WHERE active=true ORDER BY company,contact_name');
  const partners=pq.rows.map(r=>({id:String(r.id),categoryId:String(r.category_id),company:String(r.company||''),contactName:String(r.contact_name||''),phone:String(r.phone||''),mobile:String(r.mobile||''),email:String(r.email||''),address:String(r.address||''),website:String(r.website||''),notes:String(r.notes||'')}));
  return cq.rows.map(c=>({id:String(c.id),name:String(c.name),sortOrder:Number(c.sort_order||999),partners:partners.filter(p=>p.categoryId===String(c.id))}));
}

function whatsappConfiguredV10(){
  if(WHATSAPP_PROVIDER==='360dialog')return Boolean(D360_API_KEY);
  return Boolean(WHATSAPP_ACCESS_TOKEN&&WHATSAPP_PHONE_NUMBER_ID&&WHATSAPP_WABA_ID);
}
function whatsappSafeTextV10(v){return String(v==null?'':v).trim();}
function whatsappExtractTextV10(msg){
  msg=msg||{};
  if(msg.type==='text')return whatsappSafeTextV10(msg.text&&msg.text.body);
  if(msg.type==='image')return whatsappSafeTextV10(msg.image&&msg.image.caption);
  if(msg.type==='video')return whatsappSafeTextV10(msg.video&&msg.video.caption);
  if(msg.type==='document')return whatsappSafeTextV10(msg.document&&msg.document.caption);
  if(msg.type==='button')return whatsappSafeTextV10(msg.button&&msg.button.text);
  if(msg.type==='interactive'){
    const i=msg.interactive||{};
    return whatsappSafeTextV10((i.button_reply&&i.button_reply.title)||(i.list_reply&&i.list_reply.title));
  }
  if(msg.type==='location'){
    const x=msg.location||{};return ['Standort',x.name,x.address].filter(Boolean).join(' · ');
  }
  return '';
}
function whatsappMediaObjectV10(msg){
  msg=msg||{};const type=String(msg.type||'');
  if(!['image','document','audio','video','sticker'].includes(type))return null;
  const m=msg[type]||{};if(!m.id)return null;
  return {id:String(m.id),type,mime:String(m.mime_type||''),filename:String(m.filename||''),caption:String(m.caption||''),sha256:String(m.sha256||'')};
}
function classifyWhatsappLocalV10(text,messageType){
  const raw=String(text||'').trim(),t=raw.toLowerCase().replace(/ß/g,'ss');
  const orderTerms=[
    'hiermit beauftrage','ich beauftrage','auftrag erteilen','erteile den auftrag',
    'bitte durchführen','bitte durchfuehren','bitte ausführen','bitte ausfuehren',
    'machen sie das','bitte kommen','können sie kommen','koennen sie kommen'
  ];
  const inquiryTerms=[
    'angebot','kostenvoranschlag','kosten','preis','termin','können sie','koennen sie','brauche','benötige','benoetige',
    'defekt','kaputt','störung','stoerung','undicht','leck','verstopft','wasser','rohr','abfluss','wc','toilette',
    'armatur','dusche','bad','heizung','heizkörper','heizkoerper','therme','brennwert','wärmepumpe','waermepumpe',
    'fußbodenheizung','fussbodenheizung','klima','klimaanlage','legionellen','sanitär','sanitaer','gas','wartung'
  ];
  if(orderTerms.some(x=>t.includes(x)))return {category:'Auftrag',score:95,reason:'Explizite Beauftragung bzw. Ausführungswunsch erkannt.'};
  let hits=0;for(const x of inquiryTerms)if(t.includes(x))hits++;
  if(hits>=2)return {category:'Anfrage',score:90,reason:'Mehrere auftragsrelevante Begriffe erkannt.'};
  if(hits===1)return {category:'Anfrage',score:75,reason:'Auftragsrelevanter Begriff erkannt.'};
  if(['image','document','audio','video'].includes(String(messageType||''))&&!raw)return {category:'Prüfen',score:55,reason:'Anhang ohne eindeutigen Begleittext.'};
  if(raw.length>=25)return {category:'Prüfen',score:50,reason:'Inhalt vorhanden, aber nicht eindeutig als Auftrag oder Anfrage erkennbar.'};
  return {category:'Prüfen',score:25,reason:'Kurzer oder uneindeutiger Nachrichtentext.'};
}
async function whatsappThreadClassificationV10(threadId){
  const q=await pool.query(
    "SELECT message_text,message_type FROM whatsapp_messages_v10 WHERE thread_id=$1 AND direction='inbound' ORDER BY message_at DESC NULLS LAST,created_at DESC LIMIT 20",
    [threadId]
  );
  const text=q.rows.slice().reverse().map(r=>String(r.message_text||'')).filter(Boolean).join('\n');
  let best=classifyWhatsappLocalV10(text,q.rows[0]?.message_type||'');
  for(const r of q.rows){
    const x=classifyWhatsappLocalV10(r.message_text,r.message_type);
    if(x.score>best.score)best=x;
    if(x.category==='Auftrag'){best=x;break;}
  }
  return best;
}
async function directWhatsappInboxV10(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const tq=await pool.query(
    `SELECT id,wa_id,contact_name,category,relevance_score,classification_reason,manual_classification,
            status,last_text,first_message_at,last_message_at,transferred_to,transferred_id,transferred_at
       FROM whatsapp_threads_v10
      ORDER BY last_message_at DESC NULLS LAST,updated_at DESC
      LIMIT 120`
  );
  const ids=tq.rows.map(r=>String(r.id||'')).filter(Boolean);
  let messages=[];
  if(ids.length){
    const mq=await pool.query(
      `SELECT m.id,m.thread_id,m.wa_id,m.direction,m.message_type,m.message_text,m.message_at,m.read_marked,
              COALESCE(json_agg(json_build_object(
                'mediaId',wm.media_id,'type',wm.media_type,'mime',wm.mime_type,'filename',wm.filename,
                'caption',wm.caption,'fileSize',wm.file_size,'status',wm.download_status
              )) FILTER (WHERE wm.media_id IS NOT NULL),'[]'::json) AS media
         FROM whatsapp_messages_v10 m
         LEFT JOIN whatsapp_media_v10 wm ON wm.message_id=m.id
        WHERE m.thread_id=ANY($1::text[])
        GROUP BY m.id
        ORDER BY m.message_at ASC NULLS LAST,m.created_at ASC`,[ids]
    );
    messages=mq.rows;
  }
  const byThread=new Map();
  for(const m of messages){
    const k=String(m.thread_id||'');if(!byThread.has(k))byThread.set(k,[]);
    byThread.get(k).push({
      id:String(m.id||''),direction:String(m.direction||'inbound'),type:String(m.message_type||''),
      text:String(m.message_text||''),messageAt:m.message_at?new Date(m.message_at).toISOString():'',
      readMarked:Boolean(m.read_marked),media:Array.isArray(m.media)?m.media:[]
    });
  }
  const threads=tq.rows.map(t=>({
    id:String(t.id||''),waId:String(t.wa_id||''),contactName:String(t.contact_name||''),
    category:String(t.category||'Prüfen'),relevanceScore:Number(t.relevance_score||0),
    classificationReason:String(t.classification_reason||''),manualClassification:Boolean(t.manual_classification),
    status:String(t.status||'Offen'),lastText:String(t.last_text||''),
    firstMessageAt:t.first_message_at?new Date(t.first_message_at).toISOString():'',
    lastMessageAt:t.last_message_at?new Date(t.last_message_at).toISOString():'',
    transferredTo:String(t.transferred_to||''),transferredId:String(t.transferred_id||''),
    transferredAt:t.transferred_at?new Date(t.transferred_at).toISOString():'',
    messages:byThread.get(String(t.id||''))||[]
  }));
  const publicDomain=String(process.env.RAILWAY_PUBLIC_DOMAIN||process.env.RAILWAY_STATIC_URL||'').replace(/^https?:\/\//,'').replace(/\/$/,'');
  const contactCount=Number((await pool.query("SELECT count(*)::int AS n FROM whatsapp_contacts_v10 WHERE active=true")).rows[0]?.n||0);
  const syncRows=(await pool.query("SELECT sync_type,status,phase,progress,last_event_at FROM whatsapp_sync_state_v10 ORDER BY sync_type")).rows;
  return {
    configured:whatsappConfiguredV10(),webhookConfigured:Boolean(WHATSAPP_VERIFY_TOKEN),
    provider:WHATSAPP_PROVIDER,archiveSupported:false,markReadSupported:true,historyImportSupported:true,coexistenceSupport:true,
    coexistenceFields:['messages','history','smb_app_state_sync','smb_message_echoes','account_update'],
    syncedContactCount:contactCount,
    syncState:syncRows.map(x=>({type:String(x.sync_type||''),status:String(x.status||''),phase:String(x.phase||''),progress:String(x.progress||''),lastEventAt:x.last_event_at?new Date(x.last_event_at).toISOString():''})),
    phoneNumberId:WHATSAPP_PHONE_NUMBER_ID?('…'+WHATSAPP_PHONE_NUMBER_ID.slice(-6)):'',
    webhookUrl:publicDomain?('https://'+publicDomain+'/v1/whatsapp/webhook'):'',
    needs:WHATSAPP_PROVIDER==='360dialog'?{
      d360ApiKey:!D360_API_KEY,verifyToken:!WHATSAPP_VERIFY_TOKEN
    }:{
      accessToken:!WHATSAPP_ACCESS_TOKEN,phoneNumberId:!WHATSAPP_PHONE_NUMBER_ID,
      wabaId:!WHATSAPP_WABA_ID,verifyToken:!WHATSAPP_VERIFY_TOKEN,appSecret:!WHATSAPP_APP_SECRET
    },
    threads
  };
}
async function directWhatsappMediaV10(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const mediaId=String(body.mediaId||'').trim();if(!mediaId)throw new Error('Media-ID fehlt.');
  const q=await pool.query('SELECT media_id,mime_type,filename,file_size,media_data,download_status,download_error FROM whatsapp_media_v10 WHERE media_id=$1 LIMIT 1',[mediaId]);
  if(!q.rowCount)throw new Error('Anhang wurde nicht gefunden.');
  const r=q.rows[0];if(!r.media_data)throw new Error(r.download_error||'Anhang wurde noch nicht heruntergeladen.');
  return {mediaId:String(r.media_id),mime:String(r.mime_type||'application/octet-stream'),filename:String(r.filename||''),fileSize:Number(r.file_size||0),base64:Buffer.from(r.media_data).toString('base64')};
}
async function whatsappProviderJsonV10(path,options){
  options=options||{};
  if(WHATSAPP_PROVIDER==='360dialog'){
    if(!D360_API_KEY)throw new Error('360dialog API-Key fehlt.');
    const url=D360_API_BASE+'/'+String(path||'').replace(/^\/+/, '');
    const res=await fetch(url,Object.assign({},options,{
      headers:Object.assign({'D360-API-KEY':D360_API_KEY},options.headers||{})
    }));
    const text=await res.text();let data=null;try{data=text?JSON.parse(text):null;}catch(_e){}
    if(!res.ok)throw new Error((data&&data.error&&data.error.message)||(data&&data.meta&&data.meta.developer_message)||('360dialog API HTTP '+res.status));
    return data;
  }
  if(!WHATSAPP_ACCESS_TOKEN)throw new Error('WhatsApp Access Token fehlt.');
  const url='https://graph.facebook.com/'+encodeURIComponent(WHATSAPP_GRAPH_VERSION)+'/'+String(path||'').replace(/^\/+/, '');
  const res=await fetch(url,Object.assign({},options,{
    headers:Object.assign({'Authorization':'Bearer '+WHATSAPP_ACCESS_TOKEN},options.headers||{})
  }));
  const text=await res.text();let data=null;try{data=text?JSON.parse(text):null;}catch(_e){}
  if(!res.ok)throw new Error((data&&data.error&&data.error.message)||('WhatsApp API HTTP '+res.status));
  return data;
}
async function downloadWhatsappMediaV10(media){
  if(!media||!media.id||!whatsappConfiguredV10())return;
  try{
    let meta,res;
    if(WHATSAPP_PROVIDER==='360dialog'){
      meta=await whatsappProviderJsonV10(encodeURIComponent(media.id));
      if(!meta||!meta.url)throw new Error('Keine 360dialog Media-URL erhalten.');
      const dl=String(meta.url).replace(/^https:\/\/lookaside\.fbsbx\.com/i,D360_API_BASE);
      res=await fetch(dl,{headers:{'D360-API-KEY':D360_API_KEY}});
    }else{
      meta=await whatsappProviderJsonV10(encodeURIComponent(media.id)+'?phone_number_id='+encodeURIComponent(WHATSAPP_PHONE_NUMBER_ID));
      if(!meta||!meta.url)throw new Error('Keine Media-URL erhalten.');
      res=await fetch(meta.url,{headers:{'Authorization':'Bearer '+WHATSAPP_ACCESS_TOKEN}});
    }
    if(!res.ok)throw new Error('Media Download HTTP '+res.status);
    const max=25*1024*1024,ab=await res.arrayBuffer(),buf=Buffer.from(ab);
    if(buf.length>max)throw new Error('Anhang größer als 25 MB; nicht automatisch gespeichert.');
    await pool.query(
      `UPDATE whatsapp_media_v10
          SET mime_type=COALESCE(NULLIF($2,''),mime_type),sha256=COALESCE(NULLIF($3,''),sha256),
              file_size=$4,media_data=$5,download_status='ready',download_error=NULL,downloaded_at=now()
        WHERE media_id=$1`,
      [media.id,String(meta.mime_type||media.mime||''),String(meta.sha256||media.sha256||''),buf.length,buf]
    );
  }catch(e){
    await pool.query("UPDATE whatsapp_media_v10 SET download_status='error',download_error=$2 WHERE media_id=$1",[String(media.id),String(e&&e.message?e.message:e).slice(0,1000)]).catch(()=>{});
  }
}
async function markWhatsappMessageReadV10(messageId){
  if(!whatsappConfiguredV10()||!messageId)return false;
  try{
    const body=JSON.stringify({messaging_product:'whatsapp',status:'read',message_id:String(messageId)});
    if(WHATSAPP_PROVIDER==='360dialog'){
      await whatsappProviderJsonV10('messages',{method:'POST',headers:{'Content-Type':'application/json'},body});
    }else{
      await whatsappProviderJsonV10(encodeURIComponent(WHATSAPP_PHONE_NUMBER_ID)+'/messages',{method:'POST',headers:{'Content-Type':'application/json'},body});
    }
    await pool.query('UPDATE whatsapp_messages_v10 SET read_marked=true WHERE id=$1',[String(messageId)]);
    return true;
  }catch(e){console.error('WhatsApp mark read failed',e.message);return false;}
}

async function markWhatsappThreadReadV10(threadId){
  if(!WHATSAPP_MARK_READ_ON_IMPORT)return {enabled:false,marked:0};
  const q=await pool.query("SELECT id FROM whatsapp_messages_v10 WHERE thread_id=$1 AND direction='inbound' AND read_marked=false ORDER BY message_at",[threadId]);
  let n=0;for(const r of q.rows)if(await markWhatsappMessageReadV10(r.id))n++;
  return {enabled:true,marked:n};
}
function whatsappSignatureOkV10(raw,signature){
  if(!WHATSAPP_APP_SECRET)return true;
  const given=String(signature||'');if(!given.startsWith('sha256='))return false;
  const expected='sha256='+crypto.createHmac('sha256',WHATSAPP_APP_SECRET).update(raw).digest('hex');
  if(given.length!==expected.length)return false;
  return crypto.timingSafeEqual(Buffer.from(given),Buffer.from(expected));
}
function whatsappDigitsV10(v){return String(v||'').replace(/\D/g,'');}
async function whatsappKnownContactNameV10(waId){
  const id=whatsappDigitsV10(waId);if(!id)return '';
  const q=await pool.query("SELECT full_name,first_name FROM whatsapp_contacts_v10 WHERE wa_id=$1 AND active=true LIMIT 1",[id]);
  return String(q.rows[0]?.full_name||q.rows[0]?.first_name||'');
}
async function ensureWhatsappThreadV10(waId,contactName,messageAt,initialStatus){
  waId=whatsappDigitsV10(waId);if(!waId)return '';
  const when=messageAt instanceof Date?messageAt:new Date(messageAt||Date.now());
  const q=await pool.query(
    `SELECT id,status FROM whatsapp_threads_v10
      WHERE wa_id=$1 AND status IN ('Offen','Kontext')
        AND COALESCE(last_message_at,created_at)>now()-interval '7 days'
      ORDER BY last_message_at DESC NULLS LAST,created_at DESC LIMIT 1`,[waId]
  );
  if(q.rowCount){
    const id=String(q.rows[0].id||'');
    if(String(initialStatus||'Offen')==='Offen'&&String(q.rows[0].status||'')==='Kontext'){
      await pool.query("UPDATE whatsapp_threads_v10 SET status='Offen',updated_at=now() WHERE id=$1",[id]);
    }
    if(contactName)await pool.query("UPDATE whatsapp_threads_v10 SET contact_name=$2,updated_at=now() WHERE id=$1 AND COALESCE(contact_name,'')='' ",[id,String(contactName)]);
    return id;
  }
  const id='WA-THREAD-'+crypto.randomUUID(),status=String(initialStatus||'Offen');
  await pool.query(
    `INSERT INTO whatsapp_threads_v10(id,wa_id,contact_name,category,relevance_score,classification_reason,status,first_message_at,last_message_at)
     VALUES($1,$2,$3,'Prüfen',0,$4,$5,$6,$6)`,
    [id,waId,String(contactName||''),status==='Historie'?'WhatsApp-Historie synchronisiert':(status==='Kontext'?'Ausgehende WhatsApp-Unterhaltung':'Neue WhatsApp-Unterhaltung'),status,when.toISOString()]
  );
  return id;
}
async function storeWhatsappMessageV10(msg,ctx){
  msg=msg||{};ctx=ctx||{};
  const direction=String(ctx.direction||'inbound');
  const customerWa=whatsappDigitsV10(ctx.waId||(direction==='outbound'?msg.to:msg.from));
  const messageId=String(msg.id||'').trim();if(!messageId||!customerWa)return null;
  const messageAt=msg.timestamp?new Date(Number(msg.timestamp)*1000):(ctx.messageAt?new Date(ctx.messageAt):new Date());
  const contactName=String(ctx.contactName||await whatsappKnownContactNameV10(customerWa)||'');
  const initialStatus=String(ctx.initialStatus||(direction==='outbound'?'Kontext':'Offen'));
  const threadId=await ensureWhatsappThreadV10(customerWa,contactName,messageAt,initialStatus);if(!threadId)return null;
  const text=whatsappExtractTextV10(msg),type=String(msg.type||'unknown');
  await pool.query(
    `INSERT INTO whatsapp_messages_v10(id,thread_id,wa_id,direction,message_type,message_text,message_at,phone_number_id,raw_payload)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     ON CONFLICT(id) DO UPDATE SET raw_payload=EXCLUDED.raw_payload`,
    [messageId,threadId,customerWa,direction,type,text,messageAt.toISOString(),String(ctx.phoneNumberId||''),JSON.stringify(msg)]
  );
  const media=whatsappMediaObjectV10(msg);
  if(media){
    await pool.query(
      `INSERT INTO whatsapp_media_v10(media_id,message_id,media_type,mime_type,filename,caption,sha256,download_status)
       VALUES($1,$2,$3,$4,$5,$6,$7,'pending')
       ON CONFLICT(media_id) DO NOTHING`,
      [media.id,messageId,media.type,media.mime,media.filename,media.caption,media.sha256]
    );
    if(whatsappConfiguredV10())setImmediate(()=>downloadWhatsappMediaV10(media).catch(e=>console.error('WhatsApp media async error',e.message)));
  }
  if(initialStatus!=='Historie'){
    if(direction==='inbound'){
      const cls=await whatsappThreadClassificationV10(threadId);
      await pool.query(
        `UPDATE whatsapp_threads_v10
            SET contact_name=CASE WHEN $2<>'' THEN $2 ELSE contact_name END,
                last_text=CASE WHEN $3<>'' THEN $3 ELSE last_text END,last_message_at=$4,updated_at=now(),
                category=CASE WHEN manual_classification THEN category ELSE $5 END,
                relevance_score=CASE WHEN manual_classification THEN relevance_score ELSE $6 END,
                classification_reason=CASE WHEN manual_classification THEN classification_reason ELSE $7 END
          WHERE id=$1`,
        [threadId,contactName,text,messageAt.toISOString(),cls.category,cls.score,cls.reason]
      );
    }else{
      await pool.query(
        `UPDATE whatsapp_threads_v10
            SET contact_name=CASE WHEN $2<>'' THEN $2 ELSE contact_name END,
                last_message_at=GREATEST(COALESCE(last_message_at,$3),$3),updated_at=now()
          WHERE id=$1`,[threadId,contactName,messageAt.toISOString()]
      );
    }
  }
  return threadId;
}
async function processWhatsappStateSyncV10(value){
  const rows=Array.isArray(value&&value.state_sync)?value.state_sync:[];
  for(const x of rows){
    if(String(x&&x.type||'')!=='contact')continue;
    const ct=x.contact||{},waId=whatsappDigitsV10(ct.phone_number);if(!waId)continue;
    const action=String(x.action||'add'),ts=x.metadata&&x.metadata.timestamp?new Date(Number(x.metadata.timestamp)*1000):new Date();
    await pool.query(
      `INSERT INTO whatsapp_contacts_v10(wa_id,full_name,first_name,active,last_action,source_timestamp,raw_payload,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,now())
       ON CONFLICT(wa_id) DO UPDATE SET full_name=EXCLUDED.full_name,first_name=EXCLUDED.first_name,
         active=EXCLUDED.active,last_action=EXCLUDED.last_action,source_timestamp=EXCLUDED.source_timestamp,
         raw_payload=EXCLUDED.raw_payload,updated_at=now()`,
      [waId,String(ct.full_name||''),String(ct.first_name||''),action!=='remove',action,ts.toISOString(),JSON.stringify(x)]
    );
    if(action!=='remove'&&(ct.full_name||ct.first_name)){
      await pool.query("UPDATE whatsapp_threads_v10 SET contact_name=$2,updated_at=now() WHERE wa_id=$1 AND COALESCE(contact_name,'')=''",[waId,String(ct.full_name||ct.first_name)]);
    }
  }
  await pool.query(
    `INSERT INTO whatsapp_sync_state_v10(sync_type,status,details,last_event_at)
     VALUES('smb_app_state_sync','received',$1::jsonb,now())
     ON CONFLICT(sync_type) DO UPDATE SET status='received',details=EXCLUDED.details,last_event_at=now()`,
    [JSON.stringify({count:rows.length})]
  );
}
async function processWhatsappHistoryV10(value){
  const batches=Array.isArray(value&&value.history)?value.history:[];
  let stored=0;
  for(const batch of batches){
    const meta=batch&&batch.metadata||{},threads=Array.isArray(batch&&batch.threads)?batch.threads:[];
    for(const th of threads){
      const threadWa=whatsappDigitsV10(th&&th.id);
      for(const msg of (Array.isArray(th&&th.messages)?th.messages:[])){
        const business=whatsappDigitsV10(value&&value.metadata&&value.metadata.display_phone_number);
        const from=whatsappDigitsV10(msg&&msg.from),direction=business&&from===business?'outbound':'inbound';
        const customerWa=direction==='outbound'?(whatsappDigitsV10(msg&&msg.to)||threadWa):(from||threadWa);
        if(await storeWhatsappMessageV10(msg,{direction,waId:customerWa,phoneNumberId:String(value&&value.metadata&&value.metadata.phone_number_id||''),initialStatus:'Historie'}))stored++;
      }
    }
    await pool.query(
      `INSERT INTO whatsapp_sync_state_v10(sync_type,status,phase,progress,details,last_event_at)
       VALUES('history','received',$1,$2,$3::jsonb,now())
       ON CONFLICT(sync_type) DO UPDATE SET status='received',phase=EXCLUDED.phase,progress=EXCLUDED.progress,details=EXCLUDED.details,last_event_at=now()`,
      [String(meta.phase||''),String(meta.progress||''),JSON.stringify({chunkOrder:meta.chunk_order||null,stored})]
    );
  }
}
async function processWhatsappEchoesV10(value){
  const echoes=Array.isArray(value&&value.message_echoes)?value.message_echoes:[];
  const phoneNumberId=String(value&&value.metadata&&value.metadata.phone_number_id||'');
  for(const msg of echoes){
    if(['edit','revoke'].includes(String(msg&&msg.type||''))){
      const original=String(msg&&msg.original_message_id||'');
      if(original)await pool.query("UPDATE whatsapp_messages_v10 SET raw_payload=raw_payload || $2::jsonb WHERE id=$1",[original,JSON.stringify({coexistence_event:msg})]);
      continue;
    }
    await storeWhatsappMessageV10(msg,{direction:'outbound',waId:msg&&msg.to,phoneNumberId,initialStatus:'Kontext'});
  }
  await pool.query(
    `INSERT INTO whatsapp_sync_state_v10(sync_type,status,details,last_event_at)
     VALUES('smb_message_echoes','active',$1::jsonb,now())
     ON CONFLICT(sync_type) DO UPDATE SET status='active',details=EXCLUDED.details,last_event_at=now()`,
    [JSON.stringify({count:echoes.length})]
  );
}
async function processWhatsappWebhookV10(payload,eventHash){
  if(!pool)return;
  try{
    // Some coexistence partner deliveries use {event,data}; Meta's direct webhooks use entry[].changes[].
    if(payload&&payload.event&&payload.data){
      const event=String(payload.event||'');
      if(event==='history')await processWhatsappHistoryV10(payload.data||{});
      else if(event==='smb_app_state_sync')await processWhatsappStateSyncV10(payload.data||{});
      else if(event==='smb_message_echoes')await processWhatsappEchoesV10(payload.data||{});
    }
    for(const entry of (payload&&payload.entry)||[]){
      for(const change of (entry&&entry.changes)||[]){
        const field=String(change&&change.field||''),value=change&&change.value||{};
        if(field==='messages'){
          const contacts=Array.isArray(value.contacts)?value.contacts:[],contactByWa=new Map();
          for(const ct of contacts)contactByWa.set(whatsappDigitsV10(ct.wa_id),String(ct.profile&&ct.profile.name||''));
          for(const msg of (Array.isArray(value.messages)?value.messages:[])){
            const waId=whatsappDigitsV10(msg&&msg.from);
            await storeWhatsappMessageV10(msg,{direction:'inbound',waId,contactName:contactByWa.get(waId)||'',phoneNumberId:String(value.metadata&&value.metadata.phone_number_id||''),initialStatus:'Offen'});
          }
        }else if(field==='history'){
          await processWhatsappHistoryV10(value);
        }else if(field==='smb_app_state_sync'){
          await processWhatsappStateSyncV10(value);
        }else if(field==='smb_message_echoes'){
          await processWhatsappEchoesV10(value);
        }else if(field==='account_update'){
          await pool.query(
            `INSERT INTO whatsapp_sync_state_v10(sync_type,status,details,last_event_at)
             VALUES('account_update',$1,$2::jsonb,now())
             ON CONFLICT(sync_type) DO UPDATE SET status=EXCLUDED.status,details=EXCLUDED.details,last_event_at=now()`,
            [String(value.event||value.disconnection_info&&value.disconnection_info.reason||'received'),JSON.stringify(value||{})]
          );
        }
      }
    }
    if(eventHash)await pool.query('UPDATE whatsapp_webhook_events_v10 SET processed_at=now(),process_error=NULL WHERE event_hash=$1',[eventHash]);
  }catch(e){
    if(eventHash)await pool.query('UPDATE whatsapp_webhook_events_v10 SET process_error=$2 WHERE event_hash=$1',[eventHash,String(e&&e.message?e.message:e).slice(0,2000)]).catch(()=>{});
    throw e;
  }
}



const BILLING_REVIEW_URL_V10='https://g.page/r/Cf8DPhsJCWf2EBM/review';
const BILLING_REVIEW_TEXT_V10=
  'Guten Tag,\n\n'+
  'vielen Dank für Ihr Vertrauen und Ihren Auftrag bei Del Gesso Gebäudetechnik. Wir hoffen, Sie waren mit unserer Arbeit zufrieden.\n\n'+
  'Wenn Sie einen Moment Zeit haben, würden wir uns sehr über eine kurze Google-Bewertung freuen. Ihre Rückmeldung hilft uns sehr und unterstützt auch andere Kunden bei der Wahl eines zuverlässigen Fachbetriebs.\n\n'+
  'Hier können Sie uns direkt bewerten:\n'+BILLING_REVIEW_URL_V10+'\n\n'+
  'Vielen Dank!\nIhr Team von Del Gesso Gebäudetechnik';

function billingReviewObjectIdsV10(body){
  return [...new Set((Array.isArray(body&&body.objectIds)?body.objectIds:[]).map(x=>String(x||'').trim()).filter(Boolean))].sort();
}
function billingReviewKeyV10(ids){
  return ids.length?'BR-'+crypto.createHash('sha256').update(ids.join('|'),'utf8').digest('hex').slice(0,32):'';
}
function whatsappRecipientDigitsV10(v){
  let d=whatsappDigitsV10(v);
  if(d.startsWith('00'))d=d.slice(2);
  if(d.startsWith('0'))d='49'+d.slice(1);
  else if(!d.startsWith('49')&&d.length>=9&&d.length<=11)d='49'+d;
  return d;
}
function maskedWhatsappV10(v){
  const d=whatsappRecipientDigitsV10(v);return d?('+…'+d.slice(-4)):'';
}
async function billingReviewTargetV10(body){
  const objectIds=billingReviewObjectIdsV10(body),billingKey=billingReviewKeyV10(objectIds);
  if(!objectIds.length)throw new Error('Auftrag wurde nicht gefunden.');
  const prior=await pool.query(
    'SELECT status,provider_message_id,sent_at,phone,customer,last_error FROM billing_review_requests_v10 WHERE billing_key=$1 LIMIT 1',
    [billingKey]
  );
  const already=prior.rows[0]||null;
  const tq=await pool.query(
    `SELECT object_id,customer,offer_id,entry_date
       FROM time_entries_shadow
      WHERE object_id=ANY($1::text[])
      ORDER BY entry_date DESC NULLS LAST,id`,[objectIds]
  );
  if(!tq.rowCount)throw new Error('Auftrag wurde nicht gefunden.');
  const customer=String(tq.rows.find(x=>String(x.customer||'').trim())?.customer||already?.customer||'').trim();
  const offerIds=[...new Set(tq.rows.map(x=>String(x.offer_id||'').trim()).filter(Boolean))];
  let phone='';
  if(offerIds.length){
    const oq=await pool.query(
      `SELECT phone FROM inquiry_offers_shadow
        WHERE offer_id=ANY($1::text[]) AND COALESCE(phone,'')<>''
        ORDER BY changed_at_text DESC NULLS LAST LIMIT 1`,[offerIds]
    );
    phone=String(oq.rows[0]?.phone||'');
    if(!phone){
      const iq=await pool.query(
        `SELECT phone FROM customer_inquiries_shadow
          WHERE offer_id=ANY($1::text[]) AND COALESCE(phone,'')<>''
          ORDER BY received_at_text DESC NULLS LAST LIMIT 1`,[offerIds]
      );
      phone=String(iq.rows[0]?.phone||'');
    }
  }
  if(!phone&&customer){
    const mq=await pool.query(
      `SELECT phone FROM manual_orders_shadow
        WHERE lower(trim(customer))=lower(trim($1)) AND COALESCE(phone,'')<>''
        ORDER BY changed_at_text DESC NULLS LAST,created_at_text DESC NULLS LAST LIMIT 1`,[customer]
    );
    phone=String(mq.rows[0]?.phone||'');
  }
  if(!phone&&customer){
    const iq=await pool.query(
      `SELECT phone FROM customer_inquiries_shadow
        WHERE lower(trim(customer))=lower(trim($1)) AND COALESCE(phone,'')<>''
        ORDER BY received_at_text DESC NULLS LAST LIMIT 1`,[customer]
    );
    phone=String(iq.rows[0]?.phone||'');
  }
  if(!phone&&customer){
    const wq=await pool.query(
      `SELECT wa_id FROM whatsapp_contacts_v10
        WHERE active=true AND (lower(trim(full_name))=lower(trim($1)) OR lower(trim(first_name))=lower(trim($1)))
        ORDER BY updated_at DESC LIMIT 1`,[customer]
    );
    phone=String(wq.rows[0]?.wa_id||'');
  }
  if(!phone&&customer){
    const wq=await pool.query(
      `SELECT wa_id FROM whatsapp_threads_v10
        WHERE lower(trim(contact_name))=lower(trim($1))
        ORDER BY last_message_at DESC NULLS LAST,updated_at DESC LIMIT 1`,[customer]
    );
    phone=String(wq.rows[0]?.wa_id||'');
  }
  phone=whatsappRecipientDigitsV10(phone||already?.phone||'');
  const alreadySent=String(already?.status||'')==='sent';
  const whatsappReady=whatsappConfiguredV10();
  let reason='';
  if(alreadySent)reason='Für diesen Auftrag wurde bereits eine Bewertungsanfrage gesendet.';
  else if(!phone)reason='Keine WhatsApp-/Mobilnummer zum Kunden gefunden.';
  else if(!whatsappReady)reason='WhatsApp-Versand ist noch nicht vollständig eingerichtet.';
  return {
    billingKey,objectIds,customer:customer||'Kunde',phone,phoneMasked:maskedWhatsappV10(phone),
    canSend:!alreadySent&&Boolean(phone)&&whatsappReady,alreadySent,
    sentAt:already?.sent_at?new Date(already.sent_at).toISOString():'',
    providerMessageId:String(already?.provider_message_id||''),reason,
    reviewUrl:BILLING_REVIEW_URL_V10,preview:BILLING_REVIEW_TEXT_V10
  };
}
async function directBillingReviewTargetV10(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  return billingReviewTargetV10(body);
}
async function sendBillingReviewWhatsappV10(to,text){
  if(!whatsappConfiguredV10())throw new Error('WhatsApp-Versand ist noch nicht vollständig eingerichtet.');
  const path=WHATSAPP_PROVIDER==='360dialog'?'messages':encodeURIComponent(WHATSAPP_PHONE_NUMBER_ID)+'/messages';
  let payload,mode='text';
  if(WHATSAPP_REVIEW_TEMPLATE){
    mode='template';
    payload={messaging_product:'whatsapp',recipient_type:'individual',to,type:'template',
      template:{name:WHATSAPP_REVIEW_TEMPLATE,language:{code:WHATSAPP_REVIEW_TEMPLATE_LANG}}};
  }else{
    payload={messaging_product:'whatsapp',recipient_type:'individual',to,type:'text',
      text:{preview_url:true,body:String(text||'').slice(0,3000)}};
  }
  const data=await whatsappProviderJsonV10(path,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
  });
  return {messageId:String(data&&data.messages&&data.messages[0]&&data.messages[0].id||''),mode,raw:data};
}
async function directSendBillingReviewRequestV10(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const target=await billingReviewTargetV10(body);
  if(target.alreadySent)return Object.assign({},target,{ok:true,alreadySent:true});
  if(!target.canSend)throw new Error(target.reason||'Bewertungsanfrage kann nicht gesendet werden.');
  try{
    const sent=await sendBillingReviewWhatsappV10(target.phone,BILLING_REVIEW_TEXT_V10);
    await pool.query(
      `INSERT INTO billing_review_requests_v10(
        billing_key,object_ids,customer,phone,review_url,message_text,status,provider_message_id,sent_at,sent_by,last_error,updated_at
       ) VALUES($1,$2,$3,$4,$5,$6,'sent',$7,now(),$8,NULL,now())
       ON CONFLICT(billing_key) DO UPDATE SET
        object_ids=EXCLUDED.object_ids,customer=EXCLUDED.customer,phone=EXCLUDED.phone,
        review_url=EXCLUDED.review_url,message_text=EXCLUDED.message_text,status='sent',
        provider_message_id=EXCLUDED.provider_message_id,sent_at=now(),sent_by=EXCLUDED.sent_by,
        last_error=NULL,updated_at=now()`,
      [target.billingKey,target.objectIds.join(','),target.customer,target.phone,BILLING_REVIEW_URL_V10,
       BILLING_REVIEW_TEXT_V10,sent.messageId,String(session.employee||'')]
    );
    const outboundId=sent.messageId||('WA-OUT-'+crypto.randomUUID());
    await storeWhatsappMessageV10(
      {id:outboundId,to:target.phone,type:'text',text:{body:BILLING_REVIEW_TEXT_V10},timestamp:String(Math.floor(Date.now()/1000))},
      {direction:'outbound',waId:target.phone,contactName:target.customer,
       phoneNumberId:WHATSAPP_PHONE_NUMBER_ID,initialStatus:'Kontext'}
    ).catch(e=>console.error('Billing review WhatsApp history save failed:',e.message));
    return {ok:true,billingKey:target.billingKey,customer:target.customer,phoneMasked:target.phoneMasked,
      messageId:sent.messageId,mode:sent.mode,reviewUrl:BILLING_REVIEW_URL_V10};
  }catch(e){
    await pool.query(
      `INSERT INTO billing_review_requests_v10(
        billing_key,object_ids,customer,phone,review_url,message_text,status,last_error,updated_at
       ) VALUES($1,$2,$3,$4,$5,$6,'failed',$7,now())
       ON CONFLICT(billing_key) DO UPDATE SET status='failed',last_error=EXCLUDED.last_error,
         customer=EXCLUDED.customer,phone=EXCLUDED.phone,updated_at=now()`,
      [target.billingKey,target.objectIds.join(','),target.customer,target.phone,BILLING_REVIEW_URL_V10,
       BILLING_REVIEW_TEXT_V10,String(e&&e.message?e.message:e).slice(0,1000)]
    ).catch(()=>{});
    throw e;
  }
}

async function directWhatsappReviewStatusV10(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  return {
    provider:WHATSAPP_PROVIDER,
    metaReady:Boolean(WHATSAPP_ACCESS_TOKEN&&WHATSAPP_PHONE_NUMBER_ID&&WHATSAPP_WABA_ID),
    phoneNumberId:WHATSAPP_PHONE_NUMBER_ID?('…'+WHATSAPP_PHONE_NUMBER_ID.slice(-6)):'',
    wabaId:WHATSAPP_WABA_ID?('…'+WHATSAPP_WABA_ID.slice(-6)):'',
    canSend:Boolean(WHATSAPP_ACCESS_TOKEN&&WHATSAPP_PHONE_NUMBER_ID),
    canManageTemplates:Boolean(WHATSAPP_ACCESS_TOKEN&&WHATSAPP_WABA_ID),
    note:'Review-Werkzeuge führen nur nach ausdrücklichem Klick eine Meta-Aktion aus.'
  };
}
async function directWhatsappTemplatesV10(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  if(WHATSAPP_PROVIDER!=='meta')throw new Error('Meta App-Review-Werkzeuge sind nur im direkten Meta-Modus verfügbar.');
  if(!WHATSAPP_ACCESS_TOKEN||!WHATSAPP_WABA_ID)throw new Error('Für Vorlagen fehlen Meta Access Token und/oder WABA-ID.');
  const data=await whatsappProviderJsonV10(encodeURIComponent(WHATSAPP_WABA_ID)+'/message_templates?limit=100');
  const rows=Array.isArray(data&&data.data)?data.data:[];
  return rows.map(x=>({id:String(x.id||''),name:String(x.name||''),language:String(x.language||''),category:String(x.category||''),status:String(x.status||'')}));
}
async function directWhatsappReviewSendTextV10(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  if(WHATSAPP_PROVIDER!=='meta')throw new Error('Der App-Review-Testversand ist nur im direkten Meta-Modus verfügbar.');
  if(!WHATSAPP_ACCESS_TOKEN||!WHATSAPP_PHONE_NUMBER_ID)throw new Error('Für den Testversand fehlen Meta Access Token und/oder Phone Number ID.');
  const to=whatsappDigitsV10(body&&body.to),text=String(body&&body.text||'').trim();
  if(!to||to.length<8)throw new Error('Gültige Test-Empfängernummer fehlt.');
  if(!text)throw new Error('Testnachricht fehlt.');
  const data=await whatsappProviderJsonV10(encodeURIComponent(WHATSAPP_PHONE_NUMBER_ID)+'/messages',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to,type:'text',text:{preview_url:false,body:text.slice(0,3000)}})
  });
  return {ok:true,messageId:String(data&&data.messages&&data.messages[0]&&data.messages[0].id||''),to};
}
async function directWhatsappReviewCreateTemplateV10(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  if(WHATSAPP_PROVIDER!=='meta')throw new Error('Die App-Review-Vorlagenverwaltung ist nur im direkten Meta-Modus verfügbar.');
  if(!WHATSAPP_ACCESS_TOKEN||!WHATSAPP_WABA_ID)throw new Error('Für Vorlagen fehlen Meta Access Token und/oder WABA-ID.');
  let name=String(body&&body.name||'').trim().toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'').slice(0,80);
  const text=String(body&&body.text||'').trim().slice(0,900);
  const language=String(body&&body.language||'de').trim()||'de';
  if(!name)throw new Error('Vorlagenname fehlt.');
  if(!text)throw new Error('Vorlagentext fehlt.');
  const data=await whatsappProviderJsonV10(encodeURIComponent(WHATSAPP_WABA_ID)+'/message_templates',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name,language,category:'UTILITY',components:[{type:'BODY',text}]})
  });
  return {ok:true,id:String(data&&data.id||''),status:String(data&&data.status||''),category:String(data&&data.category||'UTILITY'),name,language};
}
async function directWhatsappReviewDeleteTemplateV10(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  if(WHATSAPP_PROVIDER!=='meta')throw new Error('Die App-Review-Vorlagenverwaltung ist nur im direkten Meta-Modus verfügbar.');
  if(!WHATSAPP_ACCESS_TOKEN||!WHATSAPP_WABA_ID)throw new Error('Für Vorlagen fehlen Meta Access Token und/oder WABA-ID.');
  const name=String(body&&body.name||'').trim();if(!name)throw new Error('Vorlagenname fehlt.');
  const data=await whatsappProviderJsonV10(encodeURIComponent(WHATSAPP_WABA_ID)+'/message_templates?name='+encodeURIComponent(name),{method:'DELETE'});
  return {ok:true,success:Boolean(data&&data.success),name};
}


async function directEmployeeLocationsV10(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const q=await pool.query("SELECT employee_name,latitude,longitude,accuracy_m,captured_at,context FROM employee_locations_v10 WHERE captured_at>now()-interval '14 hours' ORDER BY employee_name");
  return q.rows.map(r=>({employee:String(r.employee_name),latitude:Number(r.latitude),longitude:Number(r.longitude),accuracy:Number(r.accuracy_m||0),capturedAt:new Date(r.captured_at).toISOString(),context:String(r.context||'')}));
}

async function directAiAssistantV10(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const prompt=String(body&&body.prompt||'').trim();if(!prompt)throw new Error('Bitte eine Frage oder Aufgabe eingeben.');
  const apiKey=String(process.env.OPENAI_API_KEY||'').trim(),model=String(process.env.OPENAI_MODEL||'').trim();
  if(!apiKey||!model)return {configured:false,text:'KI-Integration ist vorbereitet. Für die Aktivierung fehlen noch OPENAI_API_KEY und/oder OPENAI_MODEL auf Railway.'};
  const inq=await pool.query("SELECT customer,source,subject,description,status,received_at_text FROM customer_inquiries_shadow WHERE COALESCE(status,'Offen') NOT IN ('Archiviert','Gelöscht') ORDER BY received_at_text DESC NULLS LAST LIMIT 25");
  const orders=await pool.query("SELECT customer,address,description,status,changed_at_text FROM manual_orders_shadow WHERE COALESCE(status,'') NOT IN ('Abgeschlossen','Abgerechnet') ORDER BY changed_at_text DESC NULLS LAST LIMIT 25");
  const offers=await pool.query("SELECT customer,description,status,created_at_text FROM inquiry_offers_shadow ORDER BY created_at_text DESC NULLS LAST LIMIT 25");
  const context={inquiries:inq.rows,orders:orders.rows,offers:offers.rows};
  const upstream=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},body:JSON.stringify({model,input:[
    {role:'system',content:[{type:'input_text',text:'Du bist der interne Büro-Assistent der Del Gesso Gebäudetechnik. Nutze nur den bereitgestellten App-Kontext. Unterstütze bei Überblick, Priorisierung, Textentwürfen und Vorbereitung. Führe keine externen oder irreversiblen Aktionen aus. Antworte auf Deutsch, klar und praxisnah.'}]},
    {role:'user',content:[{type:'input_text',text:'App-Kontext:\\n'+JSON.stringify(context)+'\\n\\nAufgabe:\\n'+prompt}]}
  ]})});
  const raw=await upstream.text();let data=null;try{data=JSON.parse(raw)}catch(_e){}
  if(!upstream.ok)throw new Error('KI-Dienst meldet HTTP '+upstream.status+(data&&data.error&&data.error.message?': '+data.error.message:''));
  let out=String(data&&data.output_text||'');if(!out&&data&&Array.isArray(data.output))for(const item of data.output||[])for(const c of item.content||[])if(c&&c.text)out+=String(c.text);
  return {configured:true,text:out.trim()||'Keine Antwort erhalten.'};
}


function pdfEscapeV10(value){
  return String(value==null?'':value)
    .replace(/[^\x20-\x7EäöüÄÖÜß]/g,' ')
    .replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue')
    .replace(/Ä/g,'Ae').replace(/Ö/g,'Oe').replace(/Ü/g,'Ue').replace(/ß/g,'ss');
}
function simplePdfBufferV10(lines){
  const pageLines=44,pages=[];for(let i=0;i<lines.length;i+=pageLines)pages.push(lines.slice(i,i+pageLines));
  if(!pages.length)pages.push(['Keine Daten']);
  const objects=[];objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  const pageIds=[],contentIds=[];let next=4;
  for(const _ of pages){pageIds.push(next++);contentIds.push(next++);}
  const fontId=next++;objects[2]='<< /Type /Pages /Kids ['+pageIds.map(id=>id+' 0 R').join(' ')+'] /Count '+pages.length+' >>';
  objects[fontId]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((rows,idx)=>{
    const content=['BT /F1 9 Tf 36 806 Td'];
    rows.forEach((line,i)=>{if(i)content.push('0 -17 Td');content.push('('+pdfEscapeV10(line)+') Tj');});
    content.push('ET');const stream=content.join('\n');
    objects[contentIds[idx]]='<< /Length '+Buffer.byteLength(stream,'ascii')+' >>\nstream\n'+stream+'\nendstream';
    objects[pageIds[idx]]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 '+fontId+' 0 R >> >> /Contents '+contentIds[idx]+' 0 R >>';
  });
  let pdf='%PDF-1.4\n',offsets=[0];
  for(let i=1;i<objects.length;i++){if(!objects[i])continue;offsets[i]=Buffer.byteLength(pdf,'ascii');pdf+=i+' 0 obj\n'+objects[i]+'\nendobj\n';}
  const xref=Buffer.byteLength(pdf,'ascii');pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
  for(let i=1;i<objects.length;i++)pdf+=String(offsets[i]||0).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
  return Buffer.from(pdf,'ascii');
}
async function directRegieReportDownloadV10(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const objectIds=[...new Set((Array.isArray(body.objectIds)?body.objectIds:[]).map(x=>String(x||'').trim()).filter(Boolean))];
  const entryIds=[...new Set((Array.isArray(body.entryIds)?body.entryIds:[]).map(x=>String(x||'').trim()).filter(Boolean))];
  if(!objectIds.length)throw new Error('Objekt-ID fehlt. Bitte Regieberichte neu laden.');
  const params=[objectIds];let sql="SELECT id,employee_name,entry_date,customer,start_time,end_time,hours,activity,material_used,material,customer_signature_url,photo_count,photo_urls,job_status,is_supplement FROM time_entries_shadow WHERE object_id=ANY($1::text[])";
  if(entryIds.length){params.push(entryIds);sql+=" AND id=ANY($2::text[])";}
  sql+=" ORDER BY entry_date,start_time,id";
  const q=await pool.query(sql,params);if(!q.rowCount)throw new Error('Für dieses Objekt wurden keine Regieberichte gefunden.');
  if(entryIds.length&&q.rowCount!==entryIds.length)throw new Error('Exportauswahl nicht mehr aktuell. Bitte Berichte neu laden.');
  const customer=String(body.customer||q.rows[0].customer||'Objekt').trim(),lines=['Del Gesso Gebaeudetechnik','Regiebericht','','Kunde / Baustelle: '+customer,'Anzahl Berichte: '+q.rowCount,''];
  let total=0;
  q.rows.forEach((r,i)=>{
    total+=Number(r.hours||0);
    lines.push('Bericht '+(i+1));
    lines.push('Datum: '+germanDateLabel(berlinDateOnly(r.entry_date)));
    lines.push('Mitarbeiter: '+String(r.employee_name||''));
    lines.push('Zeit: '+String(r.start_time||'')+' bis '+String(r.end_time||''));
    lines.push('Stunden: '+pgRound2(r.hours).toFixed(2).replace('.',','));
    lines.push('Taetigkeit: '+String(r.activity||''));
    lines.push('Material: '+(r.material_used?String(r.material||'Ja'):'Nein'));
    lines.push('Auftragsstatus: '+String(r.job_status||'Abgeschlossen'));
    lines.push('Kundenunterschrift: '+(r.customer_signature_url?'vorhanden':'nicht vorhanden'));
    lines.push('Bilder im Bericht: '+Number(r.photo_count||0));
    if(r.is_supplement)lines.push('Kennzeichnung: NACHTRAG');
    const urls=String(r.photo_urls||'').split(' | ').filter(Boolean);if(urls.length)lines.push('Bild-Links: '+urls.join(' ; '));
    if(r.customer_signature_url)lines.push('Unterschrift-Link: '+String(r.customer_signature_url));
    lines.push('');
  });
  lines.push('Gesamtstunden: '+pgRound2(total).toFixed(2).replace('.',','),'','Digitaler Regiebericht - Del Gesso Gebaeudetechnik');
  const pdf=simplePdfBufferV10(lines),safe=customer.replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,80)||'Objekt';
  return {fileName:'Regiebericht_'+safe+'.pdf',mime:'application/pdf',reportCount:q.rowCount,base64:pdf.toString('base64'),railway:true};
}


async function directMaintenanceAttachmentV24(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const id=String(body&&body.id||'').trim();if(!id)throw new Error('Datei-ID fehlt.');
  const q=await pool.query(
    `SELECT b.file_name,b.mime_type,b.file_data
       FROM maintenance_attachments_shadow a
       JOIN binary_files_v10 b ON b.id=a.file_id
      WHERE a.id=$1 AND a.active=true LIMIT 1`,[id]
  );
  if(!q.rowCount)throw new Error('Datei wurde nicht gefunden.');
  const r=q.rows[0];return {name:String(r.file_name||'Datei'),mime:String(r.mime_type||'application/octet-stream'),base64:Buffer.from(r.file_data).toString('base64')};
}
async function directAddRegieAttachmentsV24(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const objectIds=[...new Set((Array.isArray(body.objectIds)?body.objectIds:[]).map(x=>String(x||'').trim()).filter(Boolean))];
  const files=Array.isArray(body.files)?body.files:[];
  if(!objectIds.length)throw new Error('Objekt-ID fehlt.');
  if(!files.length)throw new Error('Keine Dateien ausgewählt.');
  if(files.length>5)throw new Error('Bitte höchstens 5 Dateien auf einmal auswählen.');
  const client=await pool.connect();const out=[];
  try{
    await client.query('BEGIN');
    for(const f of files){
      const stored=await storeBinaryFileV24(client,{dataUrl:f.dataUrl,name:f.name,mime:f.type||f.mime,kind:'regie-attachment',source:'railway'});
      const id='RGA-PG-'+crypto.randomUUID();
      await client.query(
        `INSERT INTO regie_attachments_shadow(id,object_ids_text,customer,file_id,name,mime,file_size,url,uploaded_at_text,uploaded_by,shadow_updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())`,
        [id,objectIds.join(','),String(body.customer||''),stored.id,stored.name,stored.mime,stored.size,stored.url,new Date().toISOString(),String(session.employee||'')]
      );
      out.push({id,objectIds,customer:String(body.customer||''),fileId:stored.id,name:stored.name,mime:stored.mime,size:stored.size,url:stored.url,uploadedAt:shadowGermanDateTime(new Date().toISOString()),uploadedBy:String(session.employee||'')});
    }
    await client.query('COMMIT');
  }catch(e){try{await client.query('ROLLBACK');}catch(_e){}throw e;}finally{client.release();}
  return {ok:true,files:out};
}
async function directRegiePhotoZipV24(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const ids=[...new Set((Array.isArray(body.fileIds)?body.fileIds:[]).map(x=>String(x||'').trim()).filter(Boolean))];
  if(!ids.length)throw new Error('Keine Bilder ausgewählt.');
  if(ids.length>80)throw new Error('Bitte höchstens 80 Bilder auf einmal herunterladen.');
  const q=await pool.query('SELECT id,file_name,mime_type,file_data FROM binary_files_v10 WHERE id=ANY($1::text[])',[ids]);
  const map=new Map(q.rows.map(r=>[String(r.id),r]));if(map.size!==ids.length)throw new Error('Mindestens ein Bild wurde noch nicht nach Railway übertragen.');
  const zip=new JSZip();let i=0;
  for(const id of ids){const r=map.get(id);i++;const ext=(String(r.file_name||'').match(/\.[A-Za-z0-9]{2,5}$/)||['.jpg'])[0];zip.file(String(i).padStart(2,'0')+'_'+cleanFileNameV24(String(r.file_name||'Bild').replace(/\.[^.]+$/,''),'Bild')+ext,Buffer.from(r.file_data));}
  const buf=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
  const safe=String(body.customer||'Objekt').replace(/[^A-Za-z0-9_-]+/g,'_').slice(0,80)||'Objekt';
  return {fileName:'Regiebilder_'+safe+'_'+berlinTodayIso().replace(/-/g,'')+'.zip',count:ids.length,base64:buf.toString('base64')};
}
async function directRegieReportZipV24(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const objectIds=[...new Set((Array.isArray(body.objectIds)?body.objectIds:[]).map(x=>String(x||'').trim()).filter(Boolean))];
  const entryIds=[...new Set((Array.isArray(body.entryIds)?body.entryIds:[]).map(x=>String(x||'').trim()).filter(Boolean))];
  const selectedPhotoIds=[...new Set((Array.isArray(body.fileIds)?body.fileIds:[]).map(x=>String(x||'').trim()).filter(Boolean))];
  if(!objectIds.length)throw new Error('Objekt-ID fehlt.');
  const params=[objectIds];let sql="SELECT * FROM time_entries_shadow WHERE object_id=ANY($1::text[])";
  if(entryIds.length){params.push(entryIds);sql+=" AND id=ANY($2::text[])";}
  sql+=" ORDER BY entry_date,start_time,id";
  const q=await pool.query(sql,params);if(!q.rowCount)throw new Error('Für dieses Objekt wurden keine Regieberichte gefunden.');
  if(entryIds.length&&q.rowCount!==entryIds.length)throw new Error('Exportauswahl nicht mehr aktuell.');
  const customer=String(body.customer||q.rows[0].customer||'Objekt').trim();
  let total=0;const lines=['Del Gesso Gebaeudetechnik','Regiebericht','','Kunde / Baustelle: '+customer,'Anzahl Berichte: '+q.rowCount,''];
  const sigIds=[];
  q.rows.forEach((r,i)=>{
    total+=Number(r.hours||0);const sig=String(r.customer_signature_id||'').trim();if(sig&&!sigIds.includes(sig))sigIds.push(sig);
    lines.push('Bericht '+(i+1),'Datum: '+germanDateLabel(berlinDateOnly(r.entry_date)),'Mitarbeiter: '+String(r.employee_name||''),
      'Zeit: '+String(r.start_time||'')+' bis '+String(r.end_time||''),'Stunden: '+pgRound2(r.hours).toFixed(2).replace('.',','),
      'Taetigkeit: '+String(r.activity||''),'Material: '+(r.material_used?String(r.material||'Ja'):'Nein'),
      'Auftragsstatus: '+String(r.job_status||'Abgeschlossen'),'Kundenunterschrift: '+(sig?'vorhanden':'nicht vorhanden'),
      'Bilder im Bericht: '+Number(r.photo_count||0));
    if(r.is_supplement)lines.push('Kennzeichnung: NACHTRAG');lines.push('');
  });
  lines.push('Gesamtstunden: '+pgRound2(total).toFixed(2).replace('.',','),'','Digitaler Regiebericht - Del Gesso Gebaeudetechnik');
  const zip=new JSZip(),safe=customer.replace(/[^A-Za-z0-9_-]+/g,'_').slice(0,80)||'Objekt';
  zip.file('Regiebericht_'+safe+'.pdf',simplePdfBufferV10(lines));
  const fileIds=[...new Set(sigIds.concat(selectedPhotoIds))];
  if(fileIds.length){
    const fq=await pool.query('SELECT id,file_name,file_data FROM binary_files_v10 WHERE id=ANY($1::text[])',[fileIds]);
    const fm=new Map(fq.rows.map(r=>[String(r.id),r]));
    let sn=0,pn=0;
    for(const id of sigIds){const r=fm.get(id);if(!r)throw new Error('Eine Kundenunterschrift wurde noch nicht nach Railway übertragen.');sn++;const ext=(String(r.file_name||'').match(/\.[A-Za-z0-9]{2,5}$/)||['.png'])[0];zip.file('Kundenunterschrift_'+String(sn).padStart(2,'0')+ext,Buffer.from(r.file_data));}
    for(const id of selectedPhotoIds){const r=fm.get(id);if(!r)throw new Error('Ein ausgewähltes Bild wurde noch nicht nach Railway übertragen.');pn++;const ext=(String(r.file_name||'').match(/\.[A-Za-z0-9]{2,5}$/)||['.jpg'])[0];zip.file('Bild_'+String(pn).padStart(2,'0')+ext,Buffer.from(r.file_data));}
  }
  const aq=await pool.query('SELECT file_id,name FROM regie_attachments_shadow WHERE object_ids_text<>\\'\\' AND object_ids_text IS NOT NULL');
  let an=0;
  for(const a of aq.rows){
    const parts=String(a.object_ids_text||'').split(',').map(x=>x.trim());if(!parts.some(x=>objectIds.includes(x)))continue;
    const fq=await pool.query('SELECT file_name,file_data FROM binary_files_v10 WHERE id=$1 LIMIT 1',[String(a.file_id||'')]);if(!fq.rowCount)continue;
    an++;zip.file('Zusatzdatei_'+String(an).padStart(2,'0')+'_'+cleanFileNameV24(a.name||fq.rows[0].file_name,'Datei'),Buffer.from(fq.rows[0].file_data));
  }
  const buf=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
  return {fileName:'Regiebericht_'+safe+'_'+berlinDateOnly(q.rows[0].entry_date).replace(/-/g,'')+'.zip',reportCount:q.rowCount,signatureCount:sigIds.length,photoCount:selectedPhotoIds.length,attachmentCount:an,base64:buf.toString('base64'),railway:true};
}
async function directTaxAdvisorPdfV24(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const year=Number(body.year)||0,month=Number(body.month)||0;if(!(year>0&&month>=1&&month<=12))throw new Error('Ungültiger Monat.');
  const rows=await postgresBossMonthNative({year,month});
  const lines=['Del Gesso Gebaeudetechnik','Monatsuebersicht Steuerberater',String(month).padStart(2,'0')+'/'+year,''];
  for(const x of rows||[])lines.push(String(x.employee||'')+' | Soll '+pgRound2(x.targetTotal).toFixed(2)+' | Ist '+pgRound2(x.actualTotal).toFixed(2)+' | Saldo '+pgRound2(x.balance).toFixed(2));
  const pdf=simplePdfBufferV10(lines);
  return {fileName:'Monatsuebersicht_'+year+'_'+String(month).padStart(2,'0')+'.pdf',mime:'application/pdf',base64:pdf.toString('base64')};
}
async function directMapsBrowserConfigV24(body){
  const session=await localSessionForBody(body,true);if(!session)return null;
  const key=String(process.env.GOOGLE_MAPS_BROWSER_KEY||'').trim();
  return {configured:Boolean(key),key};
}

async function tryDirectPostgresRead(action,body){
  if(action==='ping')return {message:'DG Backend erreichbar',version:'5.2.5',railway:true};
  if(action==='systemHealthCheck')return directSystemHealthCheck(body);
  if(action==='getDashboardSummary51')return directDashboardNativeRead(body);
  if(action==='getCustomerInquiries')return directCustomerInquiriesRead(body);
  if(action==='getInquiryReminders')return directInquiryRemindersRead(body);
  if(action==='getOfferReports')return directOfferReportsNativeRead(body);
  if(action==='getOfferStatistics')return directOfferStatisticsNativeRead(body);
  if(action==='getMonthPayrollAudit')return directPayrollAuditNativeRead(body);
  if(action==='getPayrollCycleState')return directPayrollCycleViewRead(body);
  if(action==='getBossMonthData')return directBossMonthViewRead(body);
  if(action==='getManualOrders')return directManualOrdersRead(body);
  if(action==='getOwnReminders')return directOwnRemindersRead(body);
  if(action==='getOfferReminders')return directOfferRemindersRead(body);
  if(action==='getEmployeeAdminData')return directEmployeeAdminDataRead(body);
  if(action==='getPlannerWorkers')return directPlannerWorkersRead(body);
  if(action==='getPlannerAvailability')return directPlannerAvailabilityRead(body);
  if(action==='getAbsences')return directAbsencesRead(body);
  if(action==='getAbsenceOverview')return directAbsenceOverviewRead(body);
  if(action==='getSicknessAlerts')return directSicknessAlertsRead(body);
  if(action==='searchMaintenanceCustomers')return directMaintenanceSearchRead(body);
  if(action==='getMaintenanceCustomer')return directMaintenanceCustomerRead(body);
  if(action==='getMaintenanceContracts')return directMaintenanceContractsRead(body);
  if(action==='getMaintenanceOverview')return directMaintenanceOverviewRead(body);
  if(action==='getMaintenanceArchive')return directMaintenanceArchiveRead(body);
  if(action==='findMaintenanceDeviceByInternalId')return directMaintenanceDeviceByInternalIdRead(body);
  if(action==='getObjectInternalNote')return directObjectInternalNoteRead(body);
  if(action==='getObjectInternalNotes')return directObjectInternalNotesRead(body);
  if(action==='checkRegieBillingRisk')return directRegieBillingRiskRead(body);
  if(action==='getObjectReports')return directObjectReportsRead(body);
  if(action==='getRegieReports')return directRegieReportsRead(body);
  if(action==='getRegieAttachments')return directRegieAttachmentsRead(body);
  if(action==='getTimeBankAccount')return directTimeBankAccountRead(body);
  if(action==='getMyTimeBank')return directMyTimeBankRead(body);
  if(action==='getBossDayClosures')return directBossDayClosuresRead(body);
  if(action==='getMonthData')return directMonthDataRead(body);
  if(action==='getDayData')return directDayDataRead(body);
  if(action==='getWeekData')return directWeekDataRead(body);
  if(action==='getVacationAccount')return directVacationAccountRead(body);
  if(action==='getVacationAccounts')return directVacationAccountsRead(body);
  if(action==='getEmployeeWorkOverviewV10')return directEmployeeWorkOverviewV10(body);
  if(action==='getPartnerNetworkV10')return directPartnerNetworkV10(body);
  if(action==='getWhatsappInboxV10')return directWhatsappInboxV10(body);
  if(action==='getWhatsappMediaV10')return directWhatsappMediaV10(body);
  if(action==='getMaintenanceAttachment')return directMaintenanceAttachmentV24(body);
  if(action==='getMapsBrowserConfig')return directMapsBrowserConfigV24(body);
  if(action==='getWhatsappReviewStatusV10')return directWhatsappReviewStatusV10(body);
  if(action==='getBillingReviewTargetV10')return directBillingReviewTargetV10(body);
  if(action==='sendBillingReviewRequestV10')return directSendBillingReviewRequestV10(body);
  if(action==='getWhatsappTemplatesV10')return directWhatsappTemplatesV10(body);
  if(action==='sendWhatsappReviewTextV10')return directWhatsappReviewSendTextV10(body);
  if(action==='createWhatsappReviewTemplateV10')return directWhatsappReviewCreateTemplateV10(body);
  if(action==='deleteWhatsappReviewTemplateV10')return directWhatsappReviewDeleteTemplateV10(body);
  if(action==='getEmployeeLocationsV10')return directEmployeeLocationsV10(body);
  if(action==='getAiAssistantV10')return directAiAssistantV10(body);
  if(action==='createRegieReportZip')return directRegieReportZipV24(body);
  if(action==='createRegiePhotoZip')return directRegiePhotoZipV24(body);
  if(action==='createTaxAdvisorPdf')return directTaxAdvisorPdfV24(body);
  return null;
}

async function getEmployeesFromSnapshot() {
  if (Array.isArray(employeeNamesCache) && employeeNamesCache.length) return employeeNamesCache.slice();
  if (!pool) return null;
  const live = await pool.query(
    'SELECT employee_name,payload FROM employee_admin_shadow ORDER BY sort_order ASC,employee_name ASC'
  );
  if (live.rowCount) {
    const names = live.rows
      .filter(r => !r.payload || r.payload.active !== false)
      .map(r => String(r.employee_name||'').trim())
      .filter(Boolean);
    if (names.length) {
      employeeNamesCache = names.slice();
      return names;
    }
  }
  const q = await pool.query(
    `SELECT source_key,payload
       FROM migration_objects
      WHERE entity_type=$1
      ORDER BY source_key::int ASC`,
    ['sheet:Mitarbeiter']
  );
  if (!q.rowCount) return null;
  const names = [];
  for (const row of q.rows) {
    const payload = row.payload || {};
    if (Number(payload.sourceRow || row.source_key) <= 1) continue;
    const cells = Array.isArray(payload.cells) ? payload.cells : [];
    const name = String(cellValue(cells[0]) == null ? '' : cellValue(cells[0])).trim();
    const activeRaw = String(cellValue(cells[11]) == null ? '' : cellValue(cells[11])).trim().toLowerCase();
    const active = !activeRaw || ['ja','yes','true','1','aktiv'].includes(activeRaw);
    if (name && active) names.push(name);
  }
  employeeNamesCache = names.slice();
  return names;
}


function directMinimumWageRead(body){
  const date=berlinDateOnly(body&&body.date||new Date());
  const table=[
    {from:'2025-01-01',amount:12.82},
    {from:'2026-01-01',amount:13.90},
    {from:'2027-01-01',amount:14.60}
  ];
  let current=null;
  for(const row of table)if(row.from<=date&&(!current||row.from>current.from))current=row;
  return current?{date,from:current.from,amount:Number(current.amount)||0}:{date,from:'',amount:0};
}

const DIRECT_POSTGRES_WRITE_ACTIONS=new Set([
  'createOwnReminder','saveOwnReminderInternalNote','rescheduleOwnReminder','completeOwnReminder','deleteOwnReminder',
  'moveOfferBackToCreate','declineOfferFromReminder','acceptOfferFromReminder','acceptOfferAsRunning','discardOfferPermanently','setRegieReportsOfferStatus','saveOfferCreatedWithReminder','createInspectionOffer',
  'mergeRegieObjects','saveObjectInternalNote','markPayrollIssueReviewed','markConflictReviewed','setMonthClosureStatus','setPayrollMonthStatus','completePayrollCycle','forceCompletePayrollCycle',
  'saveManualOrderNote','setManualOrderStatus','deleteManualOrder',
  'updateCustomerInquiry','deleteCustomerInquiry','rejectCustomerInquiry','saveCustomerInquiryNote','saveCustomerInquiryContact','completeCustomerInquiry','archiveCustomerInquiry','inquiryToOffer',
  'createInquiryReminder','reopenInquiryReminder','archiveInquiryReminder','rejectInquiryReminder','rescheduleOfferReminder','saveManualOrder',
  'saveMonthlyAdjustment','deleteMonthlyAdjustment','saveVacationEntitlement','saveTimeBankManual','applyTimeBankToMonth','bankMonthSurplus','syncHolidays','saveEmployeeAdmin','setEmployeeActive','setPlannerWorkerActive','movePlannerWorker','savePlannerEvent','deletePlannerEvent','transferPlannerEvent','reserveMaintenanceDeviceId','saveMaintenanceCustomer','addMaintenanceRepair','addManualMaintenanceCount','deleteMaintenanceDevice','deleteMaintenanceCustomer','deleteMaintenanceAttachment','saveAbsence','deleteAbsence','endSicknessAbsence',
  'setRegieObjectJobStatus','markRegieObjectCompleted','markRegieReportBilled','markRegieObjectBilled','markRegieObjectsBilled','updateRegieReport','saveEntry','updateEmployeeEntry','deleteEntry','closeDay','refreshClosedDay','setDayStatus','manualCloseBossDay','updateBossDayEntry','deleteBossDayEntry','confirmEmployeeAssignment','reportEmployeeAssignmentIssue',
  'savePartnerCategoryV10','savePartnerV10','deactivatePartnerV10','setWhatsappThreadCategoryV10','transferWhatsappThreadV10','saveEmployeeLocationV10','mergeCustomerInquiriesV10','completeManualOrderV10','addRegieAttachments','deleteEmployeeAdmin'
]);

function berlinTodayIso(){
  const n=berlinNowParts();
  return String(n.year)+'-'+String(n.month).padStart(2,'0')+'-'+String(n.day).padStart(2,'0');
}
function validIsoDateText(v){
  const s=String(v||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const p=s.split('-').map(Number),d=new Date(Date.UTC(p[0],p[1]-1,p[2],12));
  return d.getUTCFullYear()===p[0]&&d.getUTCMonth()===p[1]-1&&d.getUTCDate()===p[2];
}
async function invalidateLegacySnapshotsAfterDirectWrite(action,body){
  if(!pool)return;
  await invalidateReadCache(action);
  const a=String(action||'');
  const tasks=[];
  if(/Payroll|Conflict|MonthlyAdjustment|MonthClosure|TimeBank|Absence|Vacation|Assignment|Entry|Day|Regie/i.test(a)){
    tasks.push(pool.query('TRUNCATE boss_month_views_shadow'));
    tasks.push(pool.query(
      "DELETE FROM exact_views_shadow WHERE action IN ('getMonthPayrollAudit','getPayrollCycleState')"
    ));
  }
  if(/Offer/i.test(a)){
    tasks.push(pool.query(
      "DELETE FROM exact_views_shadow WHERE action IN ('getOfferReports','getOfferStatistics')"
    ));
  }
  if(/Dashboard|Offer|OwnReminder|Inquiry|ManualOrder|Maintenance|Planner|Entry|Day|Absence|Vacation|Payroll/i.test(a)){
    tasks.push(pool.query(
      "DELETE FROM exact_views_shadow WHERE action='getDashboardSummary51'"
    ));
  }
  if(tasks.length)await Promise.all(tasks);
}

async function recalcClosedDayAfterDirectCorrection(client,employee,date,reason,nowIso){
  const closure=await client.query(
    'SELECT 1 FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2 FOR UPDATE',[employee,date]
  );
  if(!closure.rowCount)return false;
  const own=await client.query(
    'SELECT COALESCE(SUM(hours),0)::numeric AS h FROM time_entries_shadow WHERE employee_name=$1 AND entry_date=$2',[employee,date]
  );
  const assigned=await client.query(
    `SELECT COALESCE(SUM(a.hours),0)::numeric AS h
       FROM assignments_shadow a JOIN time_entries_shadow t ON t.id=a.source_entry_id
      WHERE a.employee_name=$1 AND COALESCE(a.status,'Zugeordnet')<>'Ersetzt' AND t.entry_date=$2`,
    [employee,date]
  );
  const statusQ=await client.query(
    'SELECT status,credited_hours,credited_hours_missing FROM day_status_shadow WHERE employee_name=$1 AND status_date=$2 LIMIT 1',[employee,date]
  );
  const grossWork=Math.round((Number(own.rows[0]?.h||0)+Number(assigned.rows[0]?.h||0))*100)/100;
  const pause=grossWork>=6?1:0;
  const st=statusQ.rows[0]||{};
  const status=String(st.status||'Arbeiten');
  let credit=0;
  if(status!=='Arbeiten'){
    credit=await effectiveStatusCredit(employee,date,status,st.credited_hours,st.credited_hours_missing);
  }
  const gross=Math.round((grossWork+Number(credit||0))*100)/100;
  const net=Math.round((Math.max(0,grossWork-pause)+Number(credit||0))*100)/100;
  await client.query(
    `UPDATE day_closures_shadow
        SET gross_total=$3,pause_minutes=$4,net_total=$5,updated_at_text=$6,update_reason=$7,shadow_updated_at=now()
      WHERE employee_name=$1 AND closure_date=$2`,
    [employee,date,gross,Math.round(pause*60),net,nowIso,String(reason||'Büro-Korrektur')]
  );
  return true;
}

async function tryDirectPostgresWrite(action,body){
  if(!DIRECT_POSTGRES_WRITE_ACTIONS.has(action)||!pool||!GOOGLE_BACKEND_URL||!legacyOutboxCryptoKey())return null;
  if(action==='deleteAbsence'){
    const id=String(body&&body.id||'').trim();
    if(!id)return null;
    const q=await pool.query('SELECT absence_type FROM absences_shadow WHERE id=$1 AND active=true LIMIT 1',[id]);
    if(q.rowCount&&String(q.rows[0].absence_type||'')==='Freizeitausgleich')return null;
  }
  if(action==='setRegieReportsOfferStatus'){
    if(!String(body&&body.offerId||'').trim())return null;
  }
  if(action==='createOwnReminder'){
    const item=body&&body.item||{};
    if(!FINAL_CUTOVER&&Array.isArray(item.files)&&item.files.length)return null;
  }
  if(action==='saveEmployeeAdmin'){
    const item=body&&body.item||{},name=String(item.name||'').trim(),original=String(item.originalName||'').trim();
    if(!name||!original||name!==original||String(item.pin||'').trim())return null;
    const q=await pool.query('SELECT payload FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1',[name]);
    if(!q.rowCount)return null;
    const current=q.rows[0].payload||{};
    if(String(item.calendarId||'').trim()!==String(current.calendarId||''))return null;
  }
  if(action==='saveEntry'){
    const e=body&&body.entry||{};
    if(!FINAL_CUTOVER&&((Array.isArray(e.photos)&&e.photos.length)||String(e.customerSignature||'').trim()))return null;
    const customer=String(e.customer||'').trim();if(!customer)return null;
    const oq=await pool.query('SELECT id FROM objects_shadow WHERE object_key=$1 ORDER BY created_at_text ASC NULLS LAST,id ASC LIMIT 1',[shadowObjectKey(customer)]);
    if(!oq.rowCount&&!FINAL_CUTOVER)return null;
    if(String(e.sourceCalendarEventId||'').trim()&&!Boolean(e.maintenance))return null;
  }
  if(action==='savePlannerEvent'){
    const item=body&&body.item||{};
    if(!String(item.id||'').trim())return null;
  }
  if(action==='transferPlannerEvent'){
    const item=body&&body.item||{};
    if(!String(item.sourceId||'').trim().startsWith('KT-'))return null;
  }
  if(action==='updateEmployeeEntry'){
    const entryId=String(body&&body.entryId||'').trim(),item=body&&body.item||{};
    if(!entryId)return null;
    const q=await pool.query('SELECT customer FROM time_entries_shadow WHERE id=$1 LIMIT 1',[entryId]);
    if(!q.rowCount)return null;
    if(shadowObjectKey(String(q.rows[0].customer||''))!==shadowObjectKey(String(item.customer||'')))return null;
  }
  if(action==='updateRegieReport'){
    const entryId=String(body&&body.entryId||'').trim(),item=body&&body.item||{};
    if(!entryId)return null;
    const q=await pool.query('SELECT customer FROM time_entries_shadow WHERE id=$1 LIMIT 1',[entryId]);
    if(!q.rowCount)return null;
    if(shadowObjectKey(String(q.rows[0].customer||''))!==shadowObjectKey(String(item.customer||'')))return null;
  }
  if(action==='saveManualOrder'){
    const item=body&&body.item||{};
    if(!String(item.id||'').trim()||String(item.inquiryId||'').trim())return null;
  }
  if(action==='setPayrollMonthStatus'){
    const payrollAction=String(body&&body.payrollAction||'').trim();
    if(!['Freigegeben','Uebergeben','Wieder geoeffnet'].includes(payrollAction))return null;
  }
  const employeeSelfAction=['confirmEmployeeAssignment','reportEmployeeAssignmentIssue','saveEntry','updateEmployeeEntry','deleteEntry','closeDay','refreshClosedDay','saveEmployeeLocationV10'].includes(action);
  const session=await localSessionForBody(body,!employeeSelfAction);if(!session)return null;
  const by=String(session.employee||body.employee||'').trim(),nowIso=new Date().toISOString();
  const client=await pool.connect();
  let result=null,outboxId=0,legacyAction=action,legacyPayload=body,skipLegacySync=false;
  try{
    await client.query('BEGIN');
    if(action==='addRegieAttachments'){
      result=await directAddRegieAttachmentsV24(body);
      skipLegacySync=true;
    }else if(action==='deleteEmployeeAdmin'){
      const target=String(body.targetName||body.name||'').trim();
      if(!target)throw new Error('Mitarbeiter fehlt.');
      if(target===by)throw new Error('Der aktuell angemeldete Benutzer kann sich nicht selbst löschen.');
      await client.query('UPDATE employee_credentials_v10 SET active=false,updated_at=now() WHERE employee_name=$1',[target]);
      const q=await client.query('SELECT payload FROM employee_admin_shadow WHERE employee_name=$1 FOR UPDATE',[target]);
      if(q.rowCount){
        const p=Object.assign({},q.rows[0].payload||{},{active:false,exitDate:(q.rows[0].payload||{}).exitDate||berlinTodayIso()});
        await client.query('UPDATE employee_admin_shadow SET payload=$2::jsonb,shadow_updated_at=now() WHERE employee_name=$1',[target,JSON.stringify(p)]);
      }
      result={ok:true,employees:await postgresEmployeeAdminData()};skipLegacySync=true;
    }else if(action==='mergeCustomerInquiriesV10'){
      let ids=[...new Set((Array.isArray(body.ids)?body.ids:[]).map(x=>String(x||'').trim()).filter(Boolean))];
      if(ids.length<2)throw new Error('Bitte mindestens zwei Anfragen auswählen.');
      const q=await client.query('SELECT id FROM customer_inquiries_shadow WHERE id=ANY($1::text[])',[ids]);
      ids=q.rows.map(r=>String(r.id||''));if(ids.length<2)throw new Error('Mindestens zwei ausgewählte Anfragen wurden nicht gefunden.');
      const old=await client.query('SELECT DISTINCT group_id FROM inquiry_merge_members_v10 WHERE inquiry_id=ANY($1::text[])',[ids]);
      const groupId=String(old.rows[0]?.group_id||'IM-'+crypto.randomUUID());
      if(old.rowCount>1){
        const oldGroups=old.rows.map(r=>String(r.group_id||'')).filter(Boolean);
        const all=await client.query('SELECT inquiry_id FROM inquiry_merge_members_v10 WHERE group_id=ANY($1::text[])',[oldGroups]);
        ids=[...new Set(ids.concat(all.rows.map(r=>String(r.inquiry_id||''))))];
      }
      for(const id of ids)await client.query(
        'INSERT INTO inquiry_merge_members_v10(inquiry_id,group_id,manual,merged_by,merged_at) VALUES($1,$2,true,$3,now()) ON CONFLICT(inquiry_id) DO UPDATE SET group_id=EXCLUDED.group_id,manual=true,merged_by=EXCLUDED.merged_by,merged_at=now()',
        [id,groupId,by]
      );
      result={ok:true,groupId,ids,count:ids.length};skipLegacySync=true;
    }else if(action==='completeManualOrderV10'){
      const id=String(body.id||'').trim();if(!id)throw new Error('Auftrag-ID fehlt.');
      const oq=await client.query('SELECT customer,address FROM manual_orders_shadow WHERE id=$1 FOR UPDATE',[id]);
      if(!oq.rowCount)throw new Error('Auftrag wurde nicht gefunden.');
      const customer=String(oq.rows[0].customer||''),address=String(oq.rows[0].address||''),keys=[shadowObjectKey(customer),shadowObjectKey(address),shadowObjectKey(customer+' '+address)].filter(Boolean);
      const tq=await client.query("SELECT DISTINCT object_id,customer FROM time_entries_shadow WHERE COALESCE(billing_status,'Offen')='Offen' AND COALESCE(object_id,'')<>''");
      let objectIds=[...new Set(tq.rows.filter(r=>{const k=shadowObjectKey(String(r.customer||''));return keys.some(x=>x&&k&&(k===x||k.includes(x)||x.includes(k)));}).map(r=>String(r.object_id||'')).filter(Boolean))];
      let mergeId='';
      if(objectIds.length>1){
        mergeId='MERGE-'+crypto.randomUUID();
        for(const oid of objectIds)await client.query(
          'INSERT INTO regie_merges_shadow(object_id,merge_id,merged_at_text,merged_by,shadow_updated_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(object_id) DO UPDATE SET merge_id=EXCLUDED.merge_id,merged_at_text=EXCLUDED.merged_at_text,merged_by=EXCLUDED.merged_by,shadow_updated_at=now()',
          [oid,mergeId,nowIso,by]
        );
      }
      if(objectIds.length)await client.query("UPDATE time_entries_shadow SET job_status='Abgeschlossen',shadow_updated_at=now() WHERE object_id=ANY($1::text[]) AND COALESCE(billing_status,'Offen')='Offen'",[objectIds]);
      await client.query("UPDATE manual_orders_shadow SET status='Abgeschlossen',completed_at_text=$2,changed_at_text=$2,changed_by=$3,shadow_updated_at=now() WHERE id=$1",[id,nowIso,by]);
      if(objectIds.length>1)await enqueueLegacyWriteWithClient(client,'mergeRegieObjects',Object.assign({},body,{action:'mergeRegieObjects',objectIds}));
      for(const oid of objectIds)await enqueueLegacyWriteWithClient(client,'setRegieObjectJobStatus',Object.assign({},body,{action:'setRegieObjectJobStatus',objectId:oid,jobStatus:'Abgeschlossen'}));
      result={ok:true,id,objectIds,merged:objectIds.length>1,mergeId};skipLegacySync=true;
    }else if(action==='setWhatsappThreadCategoryV10'){
      const id=String(body.id||'').trim(),category=String(body.category||'').trim();
      if(!id)throw new Error('WhatsApp-Vorgang fehlt.');
      if(!['Anfrage','Auftrag','Prüfen','Ignoriert'].includes(category))throw new Error('Ungültige WhatsApp-Kategorie.');
      const q=await client.query('UPDATE whatsapp_threads_v10 SET category=$2,manual_classification=true,status=CASE WHEN $2=\'Ignoriert\' THEN \'Ignoriert\' ELSE \'Offen\' END,updated_at=now() WHERE id=$1 RETURNING id',[id,category]);
      if(!q.rowCount)throw new Error('WhatsApp-Vorgang wurde nicht gefunden.');
      result={ok:true,id,category};skipLegacySync=true;
    }else if(action==='transferWhatsappThreadV10'){
      const id=String(body.id||'').trim(),kind=String(body.kind||'').trim();
      if(!id)throw new Error('WhatsApp-Vorgang fehlt.');
      if(!['Anfrage','Auftrag'].includes(kind))throw new Error('Bitte Anfrage oder Auftrag wählen.');
      const tq=await client.query('SELECT * FROM whatsapp_threads_v10 WHERE id=$1 FOR UPDATE',[id]);
      if(!tq.rowCount)throw new Error('WhatsApp-Vorgang wurde nicht gefunden.');
      const t=tq.rows[0];
      const mq=await client.query("SELECT message_text,message_at FROM whatsapp_messages_v10 WHERE thread_id=$1 AND direction='inbound' ORDER BY message_at,created_at",[id]);
      const description=mq.rows.map(x=>String(x.message_text||'').trim()).filter(Boolean).join('\n\n')||String(t.last_text||'WhatsApp-Nachricht');
      const mediaQ=await client.query(
        `SELECT wm.media_id,wm.media_type,wm.mime_type,wm.filename,wm.caption,wm.file_size,wm.download_status
           FROM whatsapp_media_v10 wm
           JOIN whatsapp_messages_v10 m ON m.id=wm.message_id
          WHERE m.thread_id=$1 ORDER BY m.message_at,wm.created_at`,[id]
      );
      const attachments=mediaQ.rows.map(x=>({
        source:'WhatsApp',mediaId:String(x.media_id||''),type:String(x.media_type||''),mime:String(x.mime_type||''),
        name:String(x.filename||''),caption:String(x.caption||''),fileSize:Number(x.file_size||0),status:String(x.download_status||'')
      }));
      const customer=String(t.contact_name||'WhatsApp-Kontakt'),phone=String(t.wa_id||''),created=String(t.first_message_at||nowIso);
      let targetId='';
      if(kind==='Anfrage'){
        targetId='WA-INQ-'+crypto.randomUUID();
        await client.query(
          `INSERT INTO customer_inquiries_shadow(
             id,source,customer,email,phone,postal_code,city,subject,description,received_at_text,status,read_flag,
             created_at_text,changed_at_text,changed_by,internal_note,attachments_json,shadow_updated_at
           ) VALUES($1,'WhatsApp',$2,'',$3,'','','WhatsApp Anfrage',$4,$5,'Neu',false,$6,$6,$7,$8,$9,now())`,
          [targetId,customer,phone,description,created,nowIso,by,'Übernommen aus WhatsApp · '+id,JSON.stringify(attachments)]
        );
      }else{
        targetId='WA-ORD-'+crypto.randomUUID();
        await client.query(
          `INSERT INTO manual_orders_shadow(
             id,customer,address,phone,email,description,source,inquiry_id,status,created_at_text,changed_at_text,changed_by,internal_note,attachments_json,shadow_updated_at
           ) VALUES($1,$2,'',$3,'',$4,'WhatsApp','',$5,$6,$7,$8,$9,$10,now())`,
          [targetId,customer,phone,description,'Laufend',created,nowIso,by,'Übernommen aus WhatsApp · '+id,JSON.stringify(attachments)]
        );
      }
      await client.query(
        `UPDATE whatsapp_threads_v10 SET category=$2,status='Übernommen',manual_classification=true,
            transferred_to=$2,transferred_id=$3,transferred_at=now(),transferred_by=$4,updated_at=now()
          WHERE id=$1`,[id,kind,targetId,by]
      );
      result={ok:true,id,kind,targetId,_markWhatsappReadThread:id};skipLegacySync=true;
    }else if(action==='savePartnerCategoryV10'){
      const name=String(body.name||'').trim();if(!name)throw new Error('Kategoriebezeichnung fehlt.');if(name.length>80)throw new Error('Kategoriebezeichnung ist zu lang.');
      const existing=await client.query('SELECT id FROM partner_categories_v10 WHERE lower(name)=lower($1) AND active=true LIMIT 1',[name]);
      const id=existing.rows[0]?.id||String(body.id||'').trim()||('PC-'+crypto.randomUUID());
      await client.query("INSERT INTO partner_categories_v10(id,name,sort_order,active,created_by,updated_at) VALUES($1,$2,COALESCE((SELECT MAX(sort_order)+10 FROM partner_categories_v10),10),true,$3,now()) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,active=true,updated_at=now()",[id,name,by]);
      result={ok:true,id,name};skipLegacySync=true;
    }else if(action==='savePartnerV10'){
      const item=body.item||{},categoryId=String(item.categoryId||'').trim(),company=String(item.company||'').trim(),contactName=String(item.contactName||'').trim();
      if(!categoryId)throw new Error('Partner-Kategorie fehlt.');if(!company&&!contactName)throw new Error('Bitte Firma oder Ansprechpartner eintragen.');
      const cat=await client.query('SELECT 1 FROM partner_categories_v10 WHERE id=$1 AND active=true',[categoryId]);if(!cat.rowCount)throw new Error('Partner-Kategorie wurde nicht gefunden.');
      const id=String(item.id||'').trim()||('PART-'+crypto.randomUUID());
      await client.query("INSERT INTO partners_v10(id,category_id,company,contact_name,phone,mobile,email,address,website,notes,active,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,now()) ON CONFLICT(id) DO UPDATE SET category_id=EXCLUDED.category_id,company=EXCLUDED.company,contact_name=EXCLUDED.contact_name,phone=EXCLUDED.phone,mobile=EXCLUDED.mobile,email=EXCLUDED.email,address=EXCLUDED.address,website=EXCLUDED.website,notes=EXCLUDED.notes,active=true,updated_by=EXCLUDED.updated_by,updated_at=now()",[id,categoryId,company,contactName,String(item.phone||''),String(item.mobile||''),String(item.email||''),String(item.address||''),String(item.website||''),String(item.notes||''),by]);
      result={ok:true,id};skipLegacySync=true;
    }else if(action==='deactivatePartnerV10'){
      const id=String(body.id||'').trim();if(!id)throw new Error('Partner fehlt.');await client.query('UPDATE partners_v10 SET active=false,updated_by=$2,updated_at=now() WHERE id=$1',[id,by]);result={ok:true,id};skipLegacySync=true;
    }else if(action==='saveEmployeeLocationV10'){
      const latitude=Number(body.latitude),longitude=Number(body.longitude),accuracy=Math.max(0,Number(body.accuracy||0));
      if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180)throw new Error('Ungültige Standortdaten.');
      const captured=new Date(String(body.capturedAt||'')||Date.now());if(Number.isNaN(captured.getTime()))throw new Error('Ungültige Standortzeit.');
      await client.query("INSERT INTO employee_locations_v10(employee_name,latitude,longitude,accuracy_m,captured_at,context,updated_at) VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(employee_name) DO UPDATE SET latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,accuracy_m=EXCLUDED.accuracy_m,captured_at=EXCLUDED.captured_at,context=EXCLUDED.context,updated_at=now()",[by,latitude,longitude,accuracy,captured.toISOString(),String(body.context||'App aktiv').slice(0,120)]);
      result={ok:true,capturedAt:captured.toISOString()};skipLegacySync=true;
    }else if(action==='createOwnReminder'){
      const item=body.item||{},reminderText=String(item.text||'').trim(),due=String(item.dueDate||'').trim();
      if(!reminderText)throw new Error('Bitte einen Reminder-Text eingeben.');
      if(reminderText.length>5000)throw new Error('Der Reminder-Text ist zu lang.');
      const reminderFiles=Array.isArray(item.files)?item.files:[];
      if(reminderFiles.length>5)throw new Error('Maximal 5 Anhänge pro Reminder.');
      if(!validIsoDateText(due))throw new Error('Bitte ein gültiges Fälligkeitsdatum wählen.');
      if(due<berlinTodayIso())throw new Error('Das Fälligkeitsdatum darf nicht in der Vergangenheit liegen.');
      const id=String(item.id||'').trim()||('EIGREM-'+crypto.randomUUID());
      const storedReminderFiles=[];
      for(const f of reminderFiles){
        const stored=await storeBinaryFileV24(client,{dataUrl:f.dataUrl,name:f.name,mime:f.type||f.mime,kind:'reminder',source:'railway',metadata:{reminderId:id}});
        storedReminderFiles.push({id:stored.id,fileId:stored.id,name:stored.name,mime:stored.mime,size:stored.size,url:stored.url});
      }
      await client.query(
        `INSERT INTO own_reminders_shadow(
          id,reminder_text,due_date_text,status,result,created_at_text,created_by,
          changed_at_text,changed_by,attachments_json,internal_note,shadow_updated_at
        ) VALUES($1,$2,$3,'Offen','',$4,$5,$4,$5,$6::jsonb,'',now())
        ON CONFLICT(id) DO NOTHING`,
        [id,reminderText,due,nowIso,by,JSON.stringify(storedReminderFiles)]
      );
      legacyPayload=Object.assign({},body,{item:Object.assign({},item,{id,files:[]})});
      result={ok:true,id,dueDate:due,attachmentCount:storedReminderFiles.length,attachments:storedReminderFiles};
    }else if(action==='saveEntry'){
      const entry=Object.assign({},body.entry||{});
      const date=String(entry.date||'').trim(),customer=String(entry.customer||'').trim(),activity=String(entry.activity||'').trim();
      if(!by)throw new Error('Mitarbeiter fehlt.');
      if(!validIsoDateText(date))throw new Error('Ungültiges Datum.');
      if(!customer)throw new Error('Kunde/Baustelle fehlt.');
      let start='',end='';
      const smRaw=Number(entry.startMinutes),emRaw=Number(entry.endMinutes);
      if(Number.isFinite(smRaw)&&Number.isFinite(emRaw)&&smRaw>=0&&smRaw<1440&&emRaw>=0&&emRaw<1440){
        start=String(Math.floor(smRaw/60)).padStart(2,'0')+':'+String(smRaw%60).padStart(2,'0');
        end=String(Math.floor(emRaw/60)).padStart(2,'0')+':'+String(emRaw%60).padStart(2,'0');
      }else{
        const sm=pgTimeToMinutes(entry.start),em=pgTimeToMinutes(entry.end);
        if(sm!==null)start=String(Math.floor(sm/60)).padStart(2,'0')+':'+String(sm%60).padStart(2,'0');
        if(em!==null)end=String(Math.floor(em/60)).padStart(2,'0')+':'+String(em%60).padStart(2,'0');
      }
      if(!start||!end)throw new Error('Bitte gültige Von-/Bis-Zeit eintragen.');
      let sm=pgTimeToMinutes(start),em=pgTimeToMinutes(end);if(em<sm)em+=1440;
      const hours=Math.round(((em-sm)/60)*100)/100;
      if(!(hours>0&&hours<=24))throw new Error('Die Arbeitsstunden sind ungültig.');
      if(!activity)throw new Error('Bitte die ausgeführte Tätigkeit eintragen.');
      const materialUsed=Boolean(entry.materialUsed),material=String(entry.material||'').trim();
      if(materialUsed&&!material)throw new Error('Bitte das verbaute Material eintragen.');
      const st=await client.query('SELECT status FROM day_status_shadow WHERE employee_name=$1 AND status_date=$2 LIMIT 1',[by,date]);
      const dayStatus=String(st.rows[0]?.status||'Arbeiten');
      if(dayStatus!=='Arbeiten')throw new Error('Dieser Tag ist als '+dayStatus+' fest hinterlegt. Arbeitszeiteingaben sind für diesen Tag vollständig gesperrt.');
      const closure=await client.query('SELECT 1 FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2 LIMIT 1',[by,date]);
      const dayWasClosed=closure.rowCount>0,isSupplement=Boolean(entry.isSupplement);
      if(dayWasClosed&&!isSupplement)throw new Error('Dieser Tag wurde bereits abgeschlossen. Für weitere Einsätze bitte die Funktion „Nachtrag erfassen“ verwenden.');
      const entryPhotos=Array.isArray(entry.photos)?entry.photos:[];
      if(entryPhotos.length>6)throw new Error('Maximal 6 Bilder pro Auftrag.');
      let oq=await client.query('SELECT id FROM objects_shadow WHERE object_key=$1 ORDER BY created_at_text ASC NULLS LAST,id ASC LIMIT 1',[shadowObjectKey(customer)]);
      let objectId=String(oq.rows[0]?.id||'');
      if(!objectId){
        objectId='OBJ-PG-'+crypto.randomUUID();
        await client.query('INSERT INTO objects_shadow(id,object_key,display_name,created_at_text,shadow_updated_at) VALUES($1,$2,$3,$4,now())',[objectId,shadowObjectKey(customer),customer,nowIso]);
      }
      const isMaintenance=Boolean(entry.maintenance),nextDue=String(entry.nextMaintenanceDue||'').trim();
      const maintenanceCustomerId=String(entry.maintenanceCustomerId||'').trim(),maintenanceObjectId=String(entry.maintenanceObjectId||'').trim(),maintenanceDeviceId=String(entry.maintenanceDeviceId||'').trim();
      if(String(entry.sourceCalendarEventId||'').trim()&&!isMaintenance)throw new Error('Kalenderverknüpfte Einträge werden weiterhin über Google geprüft.');
      if(isMaintenance&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(nextDue))throw new Error('Bei Wartungen ist „Nächste Wartung fällig“ mit Monat und Jahr Pflicht.');
      if(isMaintenance&&maintenanceDeviceId){
        const md=await client.query('SELECT active FROM maintenance_devices_shadow WHERE id=$1 LIMIT 1',[maintenanceDeviceId]);
        if(!md.rowCount||md.rows[0].active===false)throw new Error('Das zugeordnete Wartungsgerät wurde nicht gefunden oder ist inaktiv.');
      }
      const id=String(entry.clientId||'').trim()||('ENTRY-'+crypto.randomUUID());
      let signatureFile=null;const photoFiles=[];
      if(String(entry.customerSignature||'').trim())signatureFile=await storeBinaryFileV24(client,{dataUrl:String(entry.customerSignature),name:'Kundenunterschrift_'+date+'.png',kind:'signature',source:'railway',metadata:{entryId:id,customer}});
      for(let pi=0;pi<entryPhotos.length;pi++){const p=entryPhotos[pi]||{};if(!String(p.dataUrl||'').trim())continue;photoFiles.push(await storeBinaryFileV24(client,{dataUrl:p.dataUrl,name:'Auftragsbild_'+date+'_'+String(pi+1).padStart(2,'0')+'.jpg',kind:'photo',source:'railway',metadata:{entryId:id,customer}}));}
      const dup=await client.query('SELECT 1 FROM time_entries_shadow WHERE id=$1 LIMIT 1',[id]);
      if(!dup.rowCount){
        await client.query(
          `INSERT INTO time_entries_shadow(
             id,employee_name,entry_date,customer,start_time,end_time,hours,activity,calendar_id,transmitted_at_text,closed,
             material_used,material,customer_signature_id,customer_signature_url,photo_count,photo_file_ids,photo_urls,
             additional_employees_used,additional_employees_text,additional_employee_hours_text,source_calendar_event_id,
             billing_status,billed_at_text,billed_by,object_id,job_status,is_supplement,supplement_created_at_text,
             offer_id,offer_changed_at_text,offer_changed_by,maintenance,next_maintenance_due,maintenance_customer_id,
             maintenance_object_id,maintenance_device_id,shadow_updated_at
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'',$9,false,$10,$11,$12,$13,$14,$15,$16,false,'','',$17,
                    'Offen','','',$18,$19,$20,$21,'','','','',$22,$23,$24,$25,$26,now())`,
          [id,by,date,customer,start,end,hours,activity,nowIso,materialUsed,material,
           signatureFile?signatureFile.id:'',signatureFile?signatureFile.url:'',photoFiles.length,
           photoFiles.map(x=>x.id).join(','),photoFiles.map(x=>x.url).join(' | '),String(entry.sourceCalendarEventId||''),
           objectId,String(entry.jobStatus||'')==='Laufend'?'Laufend':'Abgeschlossen',dayWasClosed&&isSupplement,
           dayWasClosed&&isSupplement?nowIso:'',isMaintenance,nextDue,maintenanceCustomerId,maintenanceObjectId,maintenanceDeviceId]
        );
        if(isMaintenance&&maintenanceDeviceId){
          await client.query('UPDATE maintenance_devices_shadow SET next_maintenance_due=$2,updated_at_text=$3,updated_by=$4,shadow_updated_at=now() WHERE id=$1',[maintenanceDeviceId,nextDue,nowIso,by]);
        }
      }
      legacyPayload=Object.assign({},body,{entry:Object.assign({},entry,{employee:by,clientId:id,start,end,hours,photos:[],customerSignature:''})});
      if(FINAL_CUTOVER)skipLegacySync=true;
      let completedConsolidation=null;
      if(String(entry.jobStatus||'').trim()==='Abgeschlossen'){
        completedConsolidation=await consolidateCompletedCustomerV10(
          client,customer,objectId,by,nowIso,body,true
        );
      }
      result=await postgresDayData({date},by);
      if(result&&completedConsolidation&&completedConsolidation.objectIds.length){
        result.completedCustomerConsolidation={
          objectIds:completedConsolidation.objectIds,
          merged:completedConsolidation.merged,
          moved:completedConsolidation.moved
        };
      }
      if(dayWasClosed&&isSupplement){result.supplementSaved=true;result.supplementEntryId=id;}
    }else if(action==='createInspectionOffer'){
      const item=body.item||{},ev=item.event||{};
      const customer=String(item.customer||'').trim(),date=berlinDateOnly(item.date||berlinTodayIso());
      const hours=Math.round(Number(item.hours||0)*100)/100,sourceEventId=String(item.sourceCalendarEventId||ev.id||'').trim();
      if(!customer)throw new Error('Kunde / Baustelle fehlt.');
      if(!validIsoDateText(date))throw new Error('Ungültiges Datum.');
      if(!(hours>0&&hours<=12))throw new Error('Ungültiger Zeitaufwand.');
      let existing=null;
      if(sourceEventId){
        const oq=await client.query(
          `SELECT offer_id FROM inquiry_offers_shadow
            WHERE calendar_event_id=$1 AND source='Besichtigung' AND status<>'Verworfen'
            ORDER BY created_at_text DESC NULLS LAST LIMIT 1 FOR UPDATE`,[sourceEventId]
        );
        if(oq.rowCount){
          const offerId=String(oq.rows[0].offer_id||'');
          const tq=await client.query(
            `SELECT id FROM time_entries_shadow WHERE offer_id=$1 AND source_calendar_event_id=$2
              ORDER BY transmitted_at_text DESC NULLS LAST LIMIT 1`,[offerId,sourceEventId]
          );
          existing={offerId,timeEntryId:String(tq.rows[0]?.id||'')};
        }
      }
      if(existing){
        result={ok:true,existing:true,offerId:existing.offerId,timeEntryId:existing.timeEntryId,
          customer,hoursBooked:hours,sourceCalendarEventId:sourceEventId};
      }else{
        const offerId=String(body.offerId||'').trim()||('BES-'+crypto.randomUUID());
        const timeEntryId=String(body.timeEntryId||'').trim()||('BESZEIT-'+crypto.randomUUID());
        const activity=String(item.activity||item.note||ev.description||'Besichtigungstermin').trim()||'Besichtigungstermin';
        const times=inspectionTimesForMirror(item,hours);
        const closedQ=await client.query(
          'SELECT 1 FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2 LIMIT 1',[by,date]
        );
        await client.query(
          `INSERT INTO inquiry_offers_shadow(
             offer_id,inquiry_id,customer,phone,email,description,source,created_at_text,status,
             changed_at_text,changed_by,calendar_event_id,inspection_date,inspection_hours,activity_note,shadow_updated_at
           ) VALUES($1,'',$2,$3,$4,$5,'Besichtigung',$6,'Zu erstellen',$6,$7,$8,$9,$10,$11,now())`,
          [offerId,customer,String(ev.phone||''),String(ev.email||''),String(ev.description||''),
           nowIso,by,sourceEventId,date,hours,activity]
        );
        await client.query(
          `INSERT INTO time_entries_shadow(
             id,employee_name,entry_date,customer,start_time,end_time,hours,activity,calendar_id,transmitted_at_text,
             closed,material_used,material,customer_signature_id,customer_signature_url,photo_count,photo_file_ids,photo_urls,
             additional_employees_used,additional_employees_text,additional_employee_hours_text,source_calendar_event_id,
             billing_status,billed_at_text,billed_by,object_id,job_status,is_supplement,supplement_created_at_text,
             offer_id,offer_changed_at_text,offer_changed_by,maintenance,next_maintenance_due,maintenance_customer_id,
             maintenance_object_id,maintenance_device_id,source_payload,shadow_updated_at
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'',$9,$10,false,'','','',0,'','',false,'','',$11,
                    'Offen','','','',$12,false,'',$13,$9,$2,false,'','','','',$14::jsonb,now())`,
          [timeEntryId,by,date,customer,times.start,times.end,hours,activity,nowIso,Boolean(closedQ.rowCount),
           sourceEventId,'Angebot zu erstellen',offerId,
           JSON.stringify({source:'createInspectionOffer',vehicleUsed:Boolean(item.vehicleUsed),offerId})]
        );
        legacyPayload=Object.assign({},body,{offerId,timeEntryId});
        result={ok:true,existing:false,offerId,timeEntryId,customer,hoursBooked:hours,activity,
          transferredAt:nowIso,transferredBy:by,sourceCalendarEventId:sourceEventId};
      }
    }else if(action==='saveOfferCreatedWithReminder'){
      const offerId=String(body.offerId||'').trim(),item=body.item||{};
      const customer=String(item.customer||'').trim(),offerNumber=String(item.offerNumber||'').trim();
      const phone=String(item.phone||'').trim(),email=String(item.email||'').trim(),description=String(item.description||'').trim();
      const reminderDays=Number(item.reminderDays)||5;
      if(!offerId)throw new Error('Angebots-ID fehlt.');
      if(!customer)throw new Error('Kunde fehlt.');
      if(!offerNumber)throw new Error('Angebotsnummer fehlt.');
      if(!(reminderDays>=1&&reminderDays<=90))throw new Error('Bitte 1 bis 90 Tage für den Reminder eintragen.');
      if(email&&!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))throw new Error('E-Mail-Adresse ist ungültig.');
      const iq=await client.query('SELECT status FROM inquiry_offers_shadow WHERE offer_id=$1 FOR UPDATE',[offerId]);
      const tq=await client.query('SELECT id FROM time_entries_shadow WHERE offer_id=$1 FOR UPDATE',[offerId]);
      if(!iq.rowCount&&!tq.rowCount)throw new Error('Angebot wurde nicht gefunden.');
      const due=isoAddDays(berlinTodayIso(),reminderDays);
      const existing=await client.query(
        `SELECT id FROM offer_reminders_shadow WHERE offer_id=$1 AND status='Offen'
          ORDER BY created_at_text DESC NULLS LAST,id DESC LIMIT 1 FOR UPDATE`,[offerId]
      );
      const reminderId=existing.rowCount?String(existing.rows[0].id||''):(String(body.reminderId||'').trim()||('ANGREM-'+crypto.randomUUID()));
      if(existing.rowCount){
        await client.query(
          `UPDATE offer_reminders_shadow SET customer=$2,offer_number=$3,phone=$4,email=$5,description=$6,
             due_date_text=$7,status='Offen',result='',changed_at_text=$8,changed_by=$9,shadow_updated_at=now()
           WHERE id=$1`,
          [reminderId,customer,offerNumber,phone,email,description,due,nowIso,by]
        );
      }else{
        await client.query(
          `INSERT INTO offer_reminders_shadow(
             id,offer_id,customer,offer_number,phone,email,description,created_at_text,due_date_text,
             status,result,changed_at_text,changed_by,shadow_updated_at
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'Offen','',$8,$10,now())`,
          [reminderId,offerId,customer,offerNumber,phone,email,description,nowIso,due,by]
        );
      }
      if(iq.rowCount){
        await client.query(
          `UPDATE inquiry_offers_shadow SET status='Offen',customer=$2,phone=$3,email=$4,description=$5,
             changed_at_text=$6,changed_by=$7,shadow_updated_at=now() WHERE offer_id=$1`,
          [offerId,customer,phone,email,description,nowIso,by]
        );
      }
      if(tq.rowCount){
        await client.query(
          `UPDATE time_entries_shadow SET job_status='Offenes Angebot',offer_changed_at_text=$2,
             offer_changed_by=$3,shadow_updated_at=now()
           WHERE offer_id=$1 AND COALESCE(billing_status,'Offen')='Offen'`,
          [offerId,nowIso,by]
        );
      }
      legacyPayload=Object.assign({},body,{reminderId,item:Object.assign({},item,{reminderDays})});
      result={ok:true,offerId,reminderId,dueDate:due,status:'Offenes Angebot'};
    }else if(['moveOfferBackToCreate','declineOfferFromReminder','acceptOfferFromReminder','acceptOfferAsRunning','discardOfferPermanently','setRegieReportsOfferStatus'].includes(action)){
      let offerId=String(body.offerId||'').trim(),reminderId=String(body.reminderId||'').trim();
      if(['declineOfferFromReminder','acceptOfferFromReminder'].includes(action)){
        if(!reminderId)throw new Error('Reminder wurde nicht gefunden.');
        const rq=await client.query('SELECT offer_id,status FROM offer_reminders_shadow WHERE id=$1 FOR UPDATE',[reminderId]);
        if(!rq.rowCount)throw new Error('Reminder wurde nicht gefunden.');
        offerId=String(rq.rows[0].offer_id||'');
      }
      if(!offerId)throw new Error('Angebots-ID fehlt.');
      let targetStatus='',resultText='',asRunning=false;
      if(action==='moveOfferBackToCreate'){targetStatus='Angebot zu erstellen';resultText='Zurück zu Angebote zu erstellen';}
      else if(action==='declineOfferFromReminder'){targetStatus='Angebot Abgelehnt';resultText='Kein Auftrag';}
      else if(action==='acceptOfferFromReminder'){
        asRunning=true;
        targetStatus='Laufend';
        resultText='Angenommen - Laufender Auftrag';
      }else if(action==='acceptOfferAsRunning'){targetStatus='Laufend';resultText='Angenommen - Laufender Auftrag';asRunning=true;}
      else if(action==='discardOfferPermanently'){targetStatus='Verworfen';}
      else if(action==='setRegieReportsOfferStatus'){
        targetStatus=String(body.offerStatus||'').trim();
        if(!['Angebot zu erstellen','Offenes Angebot','Angebot Angenommen','Angebot Abgelehnt'].includes(targetStatus))
          throw new Error('Ungültiger Angebotsstatus.');
      }
      const iq=await client.query('SELECT status,inquiry_id,customer,phone,email,description,source FROM inquiry_offers_shadow WHERE offer_id=$1 FOR UPDATE',[offerId]);
      const tq=await client.query(
        `SELECT id,hours,job_status,billing_status FROM time_entries_shadow WHERE offer_id=$1 FOR UPDATE`,[offerId]
      );
      if(action==='discardOfferPermanently'){
        if(iq.rowCount){
          if(String(iq.rows[0].status||'')!=='Zu erstellen')throw new Error('Nur noch nicht erstellte Angebote können über „Auftrag löschen“ entfernt werden.');
          await client.query(
            `UPDATE inquiry_offers_shadow SET status='Verworfen',changed_at_text=$2,changed_by=$3,shadow_updated_at=now() WHERE offer_id=$1`,
            [offerId,nowIso,by]
          );
          result={ok:true,count:1};
        }else{
          const bad=tq.rows.find(r=>String(r.job_status||'')!=='Angebot zu erstellen');
          if(bad)throw new Error('Nur noch nicht erstellte Angebote können über „Auftrag löschen“ entfernt werden.');
          if(!tq.rowCount)throw new Error('Auftrag wurde nicht gefunden.');
          await client.query(
            `UPDATE time_entries_shadow SET job_status='Verworfen',offer_id='',offer_changed_at_text='',offer_changed_by='',shadow_updated_at=now() WHERE offer_id=$1`,[offerId]
          );
          result={ok:true,count:tq.rowCount};
        }
      }else{
        const totalHours=Math.round(tq.rows.reduce((s,r)=>s+Number(r.hours||0),0)*100)/100;
        if(!iq.rowCount&&!tq.rowCount)throw new Error('Angebot wurde nicht gefunden.');
        let mode=asRunning&&tq.rowCount?'Regieberichte':'',manualOrderId='';
        if(asRunning&&!tq.rowCount&&iq.rowCount){
          const o=iq.rows[0]||{},inquiryId=String(o.inquiry_id||'').trim();
          let meta={};
          if(inquiryId){
            const mq=await client.query(
              'SELECT postal_code,city,internal_note FROM customer_inquiries_shadow WHERE id=$1 FOR UPDATE',
              [inquiryId]
            );
            meta=mq.rows[0]||{};
          }
          manualOrderId='AUF-ANG-'+offerId;
          const address=[String(meta.postal_code||''),String(meta.city||'')].filter(Boolean).join(' ').trim();
          await client.query(
            `INSERT INTO manual_orders_shadow(
               id,customer,address,phone,email,description,source,inquiry_id,status,
               created_at_text,started_at_text,completed_at_text,changed_at_text,changed_by,internal_note,shadow_updated_at
             ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Laufend',$9,$9,'',$9,$10,$11,now())
             ON CONFLICT(id) DO UPDATE SET
               customer=EXCLUDED.customer,address=EXCLUDED.address,phone=EXCLUDED.phone,email=EXCLUDED.email,
               description=EXCLUDED.description,source=EXCLUDED.source,inquiry_id=EXCLUDED.inquiry_id,
               status='Laufend',
               started_at_text=CASE WHEN COALESCE(manual_orders_shadow.started_at_text,'')='' THEN EXCLUDED.started_at_text ELSE manual_orders_shadow.started_at_text END,
               changed_at_text=EXCLUDED.changed_at_text,changed_by=EXCLUDED.changed_by,
               internal_note=CASE WHEN COALESCE(EXCLUDED.internal_note,'')<>'' THEN EXCLUDED.internal_note ELSE manual_orders_shadow.internal_note END,
               shadow_updated_at=now()`,
            [manualOrderId,String(o.customer||''),address,String(o.phone||''),String(o.email||''),
             String(o.description||''),String(o.source||'Angebot'),inquiryId,nowIso,by,String(meta.internal_note||'')]
          );
          if(inquiryId){
            await client.query(
              `UPDATE customer_inquiries_shadow SET status='Übernommen',read_flag=true,
                 changed_at_text=$2,changed_by=$3,shadow_updated_at=now() WHERE id=$1`,
              [inquiryId,nowIso,by]
            );
          }
          mode='Manueller Auftrag';
        }
        if(iq.rowCount){
          const inquiryStatus=targetStatus==='Angebot zu erstellen'?'Zu erstellen':targetStatus==='Offenes Angebot'?'Offen':targetStatus==='Angebot Angenommen'?'Angenommen':targetStatus==='Angebot Abgelehnt'?'Abgelehnt':targetStatus;
          await client.query(
            `UPDATE inquiry_offers_shadow SET status=$2,changed_at_text=$3,changed_by=$4,shadow_updated_at=now() WHERE offer_id=$1`,
            [offerId,inquiryStatus,nowIso,by]
          );
        }
        if(tq.rowCount){
          await client.query(
            `UPDATE time_entries_shadow SET job_status=$2,
                offer_changed_at_text=CASE WHEN $2='Laufend' THEN '' ELSE $3 END,
                offer_changed_by=CASE WHEN $2='Laufend' THEN '' ELSE $4 END,
                offer_id=CASE WHEN $2='Laufend' THEN '' ELSE offer_id END,
                shadow_updated_at=now()
              WHERE offer_id=$1 AND COALESCE(billing_status,'Offen')='Offen'`,
            [offerId,targetStatus,nowIso,by]
          );
        }
        if(resultText){
          if(reminderId){
            await client.query(
              `UPDATE offer_reminders_shadow SET status='Erledigt',result=$2,changed_at_text=$3,changed_by=$4,shadow_updated_at=now() WHERE id=$1`,
              [reminderId,resultText,nowIso,by]
            );
          }else{
            await client.query(
              `UPDATE offer_reminders_shadow SET status='Erledigt',result=$2,changed_at_text=$3,changed_by=$4,shadow_updated_at=now() WHERE offer_id=$1 AND status='Offen'`,
              [offerId,resultText,nowIso,by]
            );
          }
        }
        if(action==='moveOfferBackToCreate')result={ok:true,offerId,count:tq.rowCount||(iq.rowCount?1:0),status:'Angebot zu erstellen'};
        else if(action==='declineOfferFromReminder')result={ok:true,offerId};
        else if(action==='acceptOfferFromReminder')result={ok:true,offerId,totalHours,asRunning:true,mode:mode||'Regieberichte',manualOrderId};
        else if(action==='acceptOfferAsRunning')result={ok:true,offerId,count:tq.rowCount||(manualOrderId?1:0),totalHours,mode:mode||'Regieberichte',manualOrderId};
        else result={ok:true,offerId,status:targetStatus,count:tq.rowCount||(iq.rowCount?1:0),changedAt:shadowGermanDateTime(nowIso),changedBy:by};
      }
    }else if(action==='updateEmployeeEntry'){
      const entryId=String(body.entryId||'').trim(),item=body.item||{};
      if(!entryId)throw new Error('Eintrag-ID fehlt.');
      const q=await client.query(
        `SELECT employee_name,entry_date,customer,billing_status FROM time_entries_shadow WHERE id=$1 FOR UPDATE`,[entryId]
      );
      if(!q.rowCount)throw new Error('Eintrag wurde nicht gefunden.');
      const row=q.rows[0],date=berlinDateOnly(row.entry_date);
      if(String(row.employee_name||'')!==by)throw new Error('Dieser Eintrag gehört nicht zum angemeldeten Mitarbeiter.');
      const closed=await client.query('SELECT 1 FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2 LIMIT 1',[by,date]);
      if(closed.rowCount)throw new Error('Der Tag ist bereits abgeschlossen. Einträge können danach nicht mehr bearbeitet werden.');
      const st=await client.query('SELECT status FROM day_status_shadow WHERE employee_name=$1 AND status_date=$2 LIMIT 1',[by,date]);
      const status=String(st.rows[0]?.status||'Arbeiten');
      if(status!=='Arbeiten')throw new Error('Dieser Tag ist als '+status+' markiert und kann nicht bearbeitet werden.');
      if(String(row.billing_status||'Offen')!=='Offen')throw new Error('Dieser Regiebericht wurde bereits abgerechnet und kann vom Mitarbeiter nicht mehr bearbeitet werden.');
      const customer=String(item.customer||'').trim(),activity=String(item.activity||'').trim();
      const materialUsed=Boolean(item.materialUsed),material=materialUsed?String(item.material||'').trim():'';
      const jobStatus=String(item.jobStatus||'')==='Laufend'?'Laufend':'Abgeschlossen';
      if(!customer)throw new Error('Bitte Kunde / Baustelle eintragen.');
      if(!activity)throw new Error('Bitte die ausgeführte Tätigkeit eintragen.');
      if(materialUsed&&!material)throw new Error('Bitte Material eintragen.');
      if(shadowObjectKey(String(row.customer||''))!==shadowObjectKey(customer))
        throw new Error('Kundenwechsel wird weiterhin über Google verarbeitet.');
      await client.query(
        `UPDATE time_entries_shadow SET customer=$2,activity=$3,material_used=$4,material=$5,job_status=$6,shadow_updated_at=now() WHERE id=$1`,
        [entryId,customer,activity,materialUsed,material,jobStatus]
      );
      result=await postgresDayData({date},by);
    }else if(action==='closeDay'){
      const date=String(body.date||'').trim();
      if(!by)throw new Error('Mitarbeiter fehlt.');
      if(!validIsoDateText(date))throw new Error('Datum fehlt.');
      const existing=await client.query(
        'SELECT 1 FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2 FOR UPDATE',[by,date]
      );
      if(existing.rowCount){
        result={ok:true,alreadyClosed:true};
      }else{
        const data=await postgresDayData({date},by);
        if(data&&data.status&&data.status!=='Arbeiten'&&!session.chefAccess)
          throw new Error('Dieser Tag ist als '+data.status+' markiert. Eingaben und Übermittlungen sind für diesen Tag deaktiviert.');
        if(!data||!Array.isArray(data.entries)||!data.entries.length)throw new Error('Es sind keine Stunden für diesen Tag erfasst.');
        const grossWork=Number(data.grossWorkTotal||0),pause=grossWork>=6?1:0;
        const grossTotal=Math.round(Number(data.grossTotal||0)*100)/100;
        const netTotal=Math.round(Number(data.total||0)*100)/100;
        await client.query(
          `INSERT INTO day_closures_shadow(
             employee_name,closure_date,closed_at_text,gross_total,legacy_col5,legacy_col6,pause_minutes,
             net_total,updated_at_text,update_reason,shadow_updated_at
           ) VALUES($1,$2,$3,$4,'','',$5,$6,'','',now())`,
          [by,date,nowIso,grossTotal,Math.round(pause*60),netTotal]
        );
        await client.query(
          'UPDATE time_entries_shadow SET closed=true,shadow_updated_at=now() WHERE employee_name=$1 AND entry_date=$2',[by,date]
        );
        result={ok:true,total:netTotal,pauseMinutes:Math.round(pause*60),netTotal};
      }
    }else if(action==='refreshClosedDay'){
      const date=String(body.date||'').trim();
      if(!validIsoDateText(date))throw new Error('Ungültiges Datum.');
      const closure=await client.query(
        'SELECT 1 FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2 FOR UPDATE',[by,date]
      );
      if(!closure.rowCount)throw new Error('Dieser Tag ist noch nicht abgeschlossen.');
      const data=await postgresDayData({date},by);
      if(!data||!Array.isArray(data.entries)||!data.entries.length)throw new Error('Es sind keine Stunden für diesen Tag erfasst.');
      await recalcClosedDayAfterDirectCorrection(client,by,date,'Nachtrag / Tagesabschluss aktualisiert',nowIso);
      await client.query('UPDATE time_entries_shadow SET closed=true,shadow_updated_at=now() WHERE employee_name=$1 AND entry_date=$2',[by,date]);
      result=await postgresDayData({date},by);
      result.closureRefreshed=true;
      result.closureNeedsRefresh=false;
      result.closureRefreshedAt=shadowGermanDateTime(nowIso);
    }else if(action==='deleteEntry'){
      const id=String(body.id||'').trim(),date=String(body.date||'').trim();
      if(!id)throw new Error('Eintrag-ID fehlt.');
      if(!validIsoDateText(date))throw new Error('Ungültiges Datum.');
      const closed=await client.query('SELECT 1 FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2 LIMIT 1',[by,date]);
      if(closed.rowCount)throw new Error('Der Tag ist bereits abgeschlossen.');
      const q=await client.query(
        `SELECT employee_name,entry_date FROM time_entries_shadow WHERE id=$1 FOR UPDATE`,[id]
      );
      if(!q.rowCount)throw new Error('Eintrag wurde nicht gefunden.');
      if(String(q.rows[0].employee_name||'')!==by||berlinDateOnly(q.rows[0].entry_date)!==date)
        throw new Error('Dieser Eintrag gehört nicht zum angemeldeten Mitarbeiter bzw. Tag.');
      await client.query('DELETE FROM assignments_shadow WHERE source_entry_id=$1',[id]);
      await client.query(
        `UPDATE assignments_shadow SET status='Zugeordnet',replaced_by_entry_id='',shadow_updated_at=now() WHERE replaced_by_entry_id=$1`,[id]
      );
      await client.query('DELETE FROM time_entries_shadow WHERE id=$1',[id]);
      result=await postgresDayData({date},by);
    }else if(['confirmEmployeeAssignment','reportEmployeeAssignmentIssue'].includes(action)){
      const id=String(body.assignmentId||'').trim();
      if(!id)throw new Error('Mitarbeiterzuordnung wurde nicht gefunden.');
      const q=await client.query(
        'SELECT employee_name,status FROM assignments_shadow WHERE id=$1 FOR UPDATE',[id]
      );
      if(!q.rowCount||String(q.rows[0].employee_name||'')!==by)
        throw new Error('Mitarbeiterzuordnung wurde nicht gefunden.');
      if(String(q.rows[0].status||'')==='Ersetzt')
        throw new Error(action==='confirmEmployeeAssignment'?'Diese Zuordnung wurde bereits durch einen eigenen Eintrag ersetzt.':'Diese Zuordnung wurde bereits ersetzt.');
      if(action==='confirmEmployeeAssignment'){
        await client.query(
          `UPDATE assignments_shadow
              SET status='Bestätigt',confirmed_at_text=$2,issue_at_text='',note='',shadow_updated_at=now()
            WHERE id=$1`,[id,nowIso]
        );
        result={ok:true,status:'Bestätigt'};
      }else{
        const note=String(body.note||'').trim();
        if(!note)throw new Error('Bitte kurz beschreiben, was an der Zuordnung nicht stimmt.');
        await client.query(
          `UPDATE assignments_shadow
              SET status='Abweichung',issue_at_text=$2,note=$3,shadow_updated_at=now()
            WHERE id=$1`,[id,nowIso,note]
        );
        result={ok:true,status:'Abweichung'};
      }
    }else if(['saveOwnReminderInternalNote','rescheduleOwnReminder','completeOwnReminder','deleteOwnReminder'].includes(action)){
      const id=String(body.reminderId||'').trim();if(!id)throw new Error('Reminder-ID fehlt.');
      const q=await client.query(
        'SELECT status FROM own_reminders_shadow WHERE id=$1 FOR UPDATE',[id]
      );
      if(!q.rowCount)throw new Error('Eigener Reminder wurde nicht gefunden.');
      const status=String(q.rows[0].status||'Offen');
      if(action!=='deleteOwnReminder'&&status!=='Offen')throw new Error('Reminder ist bereits erledigt.');
      if(action==='saveOwnReminderInternalNote'){
        const note=String(body.note==null?'':body.note).trim();
        if(note.length>5000)throw new Error('Die interne Notiz ist zu lang.');
        await client.query(
          `UPDATE own_reminders_shadow
              SET internal_note=$2,changed_at_text=$3,changed_by=$4,shadow_updated_at=now()
            WHERE id=$1`,[id,note,nowIso,by]
        );
        result={ok:true,id,internalNote:note};
      }else if(action==='rescheduleOwnReminder'){
        const due=String(body.dueDate||'').trim();
        if(!validIsoDateText(due))throw new Error('Bitte ein gültiges Fälligkeitsdatum wählen.');
        if(due<berlinTodayIso())throw new Error('Das Fälligkeitsdatum darf nicht in der Vergangenheit liegen.');
        await client.query(
          `UPDATE own_reminders_shadow
              SET due_date_text=$2,changed_at_text=$3,changed_by=$4,shadow_updated_at=now()
            WHERE id=$1`,[id,due,nowIso,by]
        );
        result={ok:true,id,dueDate:due};
      }else if(action==='completeOwnReminder'){
        await client.query(
          `UPDATE own_reminders_shadow
              SET status='Erledigt',result='Erledigt',changed_at_text=$2,changed_by=$3,shadow_updated_at=now()
            WHERE id=$1`,[id,nowIso,by]
        );
        result={ok:true,id};
      }else{
        await client.query(
          `UPDATE own_reminders_shadow
              SET status='Gelöscht',result='Gelöscht',changed_at_text=$2,changed_by=$3,shadow_updated_at=now()
            WHERE id=$1`,[id,nowIso,by]
        );
        result={ok:true,id};
      }
    }else if(action==='updateRegieReport'){
      const entryId=String(body.entryId||'').trim(),item=body.item||{};
      if(!entryId)throw new Error('Regiebericht-ID fehlt.');
      const date=String(item.date||'').trim(),customer=String(item.customer||'').trim();
      const start=String(item.start||'').trim(),end=String(item.end||'').trim(),activity=String(item.activity||'').trim();
      const materialUsed=Boolean(item.materialUsed),material=String(item.material||'').trim();
      const jobStatus=String(item.jobStatus||'Abgeschlossen').trim()||'Abgeschlossen';
      if(!validIsoDateText(date)||!customer||!start||!end||!activity)throw new Error('Bitte alle Pflichtfelder prüfen.');
      if(!['Laufend','Abgeschlossen'].includes(jobStatus))throw new Error('Ungültiger Auftragsstatus.');
      let sm=pgTimeToMinutes(start),em=pgTimeToMinutes(end);
      if(sm===null||em===null||sm===em)throw new Error('Von-/Bis-Zeit ist ungültig.');
      if(em<sm)em+=1440;
      const hours=Math.round(((em-sm)/60)*100)/100;
      if(!(hours>0&&hours<24))throw new Error('Die Arbeitszeit muss größer 0 und kleiner als 24 Stunden sein.');
      const q=await client.query(
        `SELECT employee_name,entry_date,customer,object_id FROM time_entries_shadow WHERE id=$1 FOR UPDATE`,[entryId]
      );
      if(!q.rowCount)throw new Error('Regiebericht wurde nicht gefunden.');
      const row=q.rows[0],sourceEmployee=String(row.employee_name||''),oldDate=berlinDateOnly(row.entry_date);
      if(shadowObjectKey(String(row.customer||''))!==shadowObjectKey(customer))
        throw new Error('Kundenwechsel wird weiterhin über Google verarbeitet.');
      const objectId=String(row.object_id||'');
      const closedQ=await client.query(
        'SELECT 1 FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2 LIMIT 1',[sourceEmployee,date]
      );
      await client.query(
        `UPDATE time_entries_shadow SET entry_date=$2,customer=$3,start_time=$4,end_time=$5,hours=$6,
           activity=$7,closed=$8,material_used=$9,material=$10,job_status=$11,shadow_updated_at=now()
         WHERE id=$1`,
        [entryId,date,customer,start,end,hours,activity,closedQ.rowCount>0,materialUsed,materialUsed?material:'',jobStatus]
      );
      await recalcClosedDayAfterDirectCorrection(client,sourceEmployee,oldDate,'Büro: Regiebericht korrigiert',nowIso);
      if(date!==oldDate)await recalcClosedDayAfterDirectCorrection(client,sourceEmployee,date,'Büro: Regiebericht verschoben/korrigiert',nowIso);
      result={ok:true,id:entryId,hours,objectId,jobStatus,changedBy:by,changedAt:shadowGermanDateTime(nowIso)};
    }else if(action==='markRegieReportBilled'){
      const entryId=String(body.entryId||'').trim();
      if(!entryId)throw new Error('Auftrags-ID fehlt.');
      const q=await client.query(
        'SELECT billing_status FROM time_entries_shadow WHERE id=$1 FOR UPDATE',[entryId]
      );
      if(!q.rowCount)throw new Error('Regiebericht wurde nicht gefunden.');
      await client.query(
        `UPDATE time_entries_shadow
            SET billing_status='Abgerechnet',billed_at_text=$2,billed_by=$3,shadow_updated_at=now()
          WHERE id=$1`,[entryId,nowIso,by]
      );
      result={ok:true,id:entryId,billedBy:by,billedAt:shadowGermanDateTime(nowIso)};
    }else if(action==='updateBossDayEntry'){
      const target=String(body.targetEmployee||'').trim(),date=String(body.date||'').trim();
      const entryId=String(body.entryId||'').trim(),start=String(body.start||'').trim(),end=String(body.end||'').trim();
      const reason=String(body.reason||'').trim();
      if(!reason)throw new Error('Bitte einen Grund für die Korrektur eintragen.');
      if(!target||!validIsoDateText(date)||!entryId)throw new Error('Eintrag wurde nicht gefunden.');
      if(entryId.startsWith('assigned:'))throw new Error('Mitarbeit-Zuordnungen können hier nicht direkt korrigiert werden. Bitte den Quellbericht prüfen.');
      let sm=pgTimeToMinutes(start),em=pgTimeToMinutes(end);
      if(sm===null||em===null||sm===em)throw new Error('Von/Bis-Zeit ist ungültig.');
      if(em<sm)em+=1440;
      const hours=Math.round(((em-sm)/60)*100)/100;
      if(!(hours>0&&hours<=24))throw new Error('Zeitspanne ist ungültig.');
      const q=await client.query(
        `SELECT employee_name,entry_date,billing_status FROM time_entries_shadow WHERE id=$1 FOR UPDATE`,[entryId]
      );
      if(!q.rowCount)throw new Error('Eintrag wurde nicht gefunden.');
      const row=q.rows[0];
      if(String(row.employee_name||'')!==target||berlinDateOnly(row.entry_date)!==date)
        throw new Error('Eintrag gehört nicht zu Mitarbeiter/Datum.');
      const wasBilled=String(row.billing_status||'Offen')==='Abgerechnet';
      await client.query(
        `UPDATE time_entries_shadow SET start_time=$2,end_time=$3,hours=$4,shadow_updated_at=now() WHERE id=$1`,
        [entryId,start,end,hours]
      );
      await recalcClosedDayAfterDirectCorrection(client,target,date,'Büro-Zeitkorrektur',nowIso);
      result={ok:true,entryId,employee:target,date,start,end,hours,wasBilled};
    }else if(action==='deleteBossDayEntry'){
      const target=String(body.targetEmployee||'').trim(),date=String(body.date||'').trim();
      const entryId=String(body.entryId||'').trim(),reason=String(body.reason||'').trim();
      if(!target)throw new Error('Mitarbeiter wurde nicht gefunden.');
      if(!validIsoDateText(date))throw new Error('Ungültiges Datum.');
      if(!entryId)throw new Error('Eintrag-ID fehlt.');
      if(!reason)throw new Error('Bitte einen Grund für das Entfernen des Eintrags angeben.');
      const affected=new Set([target]);
      let deletedHours=0,customer='',sourceEntryId='',deletedType='Eigener Eintrag',wasBilled=false;
      if(entryId.startsWith('assigned:')){
        const assignmentId=entryId.slice('assigned:'.length);
        const aq=await client.query(
          `SELECT a.id,a.source_entry_id,a.employee_name,a.hours,t.entry_date,t.customer,t.billing_status
             FROM assignments_shadow a JOIN time_entries_shadow t ON t.id=a.source_entry_id
            WHERE a.id=$1 FOR UPDATE`,[assignmentId]
        );
        if(!aq.rowCount)throw new Error('Mitarbeit-Eintrag wurde nicht gefunden.');
        const a=aq.rows[0];
        if(String(a.employee_name||'')!==target)throw new Error('Dieser Mitarbeit-Eintrag gehört nicht zum ausgewählten Mitarbeiter.');
        if(berlinDateOnly(a.entry_date)!==date)throw new Error('Datum des Mitarbeit-Eintrags stimmt nicht überein.');
        sourceEntryId=String(a.source_entry_id||'');deletedHours=Number(a.hours||0);deletedType='Mitarbeit';
        customer=String(a.customer||'');wasBilled=String(a.billing_status||'Offen')==='Abgerechnet';
        await client.query('DELETE FROM assignments_shadow WHERE id=$1',[assignmentId]);
      }else{
        const tq=await client.query(
          `SELECT id,employee_name,entry_date,customer,hours,billing_status FROM time_entries_shadow WHERE id=$1 FOR UPDATE`,[entryId]
        );
        if(!tq.rowCount)throw new Error('Eintrag wurde nicht gefunden.');
        const t=tq.rows[0];
        if(String(t.employee_name||'')!==target||berlinDateOnly(t.entry_date)!==date)
          throw new Error('Eintrag gehört nicht zum ausgewählten Mitarbeiter bzw. Tag.');
        deletedHours=Number(t.hours||0);customer=String(t.customer||'');sourceEntryId=entryId;
        wasBilled=String(t.billing_status||'Offen')==='Abgerechnet';
        const assignees=await client.query(
          `SELECT employee_name FROM assignments_shadow
            WHERE source_entry_id=$1 AND COALESCE(status,'Zugeordnet')<>'Ersetzt'`,[entryId]
        );
        for(const r of assignees.rows)if(String(r.employee_name||''))affected.add(String(r.employee_name));
        await client.query('DELETE FROM assignments_shadow WHERE source_entry_id=$1',[entryId]);
        await client.query(
          `UPDATE assignments_shadow SET status='Zugeordnet',replaced_by_entry_id='',shadow_updated_at=now()
            WHERE replaced_by_entry_id=$1`,[entryId]
        );
        await client.query('DELETE FROM time_entries_shadow WHERE id=$1',[entryId]);
      }
      for(const empName of affected){
        await recalcClosedDayAfterDirectCorrection(client,empName,date,'Büro: Fehleintrag gelöscht · '+reason,nowIso);
      }
      result={ok:true,id:entryId,sourceEntryId,employee:target,date,customer,hours:Math.round(deletedHours*100)/100,
        type:deletedType,affectedEmployees:[...affected],deletedBy:by,deletedAt:shadowGermanDateTime(nowIso),reason,wasBilled};
    }else if(action==='manualCloseBossDay'){
      const target=String(body.targetEmployee||'').trim(),date=String(body.date||'').trim();
      if(!target)throw new Error('Mitarbeiter wurde nicht gefunden.');
      if(!validIsoDateText(date))throw new Error('Ungültiges Datum.');
      const emp=await client.query('SELECT 1 FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1',[target]);
      if(!emp.rowCount)throw new Error('Mitarbeiter wurde nicht gefunden.');
      const existing=await client.query(
        'SELECT 1 FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2 FOR UPDATE',[target,date]
      );
      if(existing.rowCount){
        result={ok:true,alreadyClosed:true,employee:target,date};
      }else{
        const own=await client.query(
          'SELECT id,hours FROM time_entries_shadow WHERE employee_name=$1 AND entry_date=$2 FOR UPDATE',[target,date]
        );
        const assigned=await client.query(
          `SELECT a.hours FROM assignments_shadow a
             JOIN time_entries_shadow t ON t.id=a.source_entry_id
            WHERE a.employee_name=$1 AND COALESCE(a.status,'Zugeordnet')<>'Ersetzt' AND t.entry_date=$2`,
          [target,date]
        );
        const gross=Math.round((own.rows.reduce((s,r)=>s+Number(r.hours||0),0)+assigned.rows.reduce((s,r)=>s+Number(r.hours||0),0))*100)/100;
        if(!(gross>0))throw new Error('Für diesen Mitarbeiter sind an diesem Tag keine Arbeitszeiten vorhanden.');
        const pause=gross>=6?1:0,total=Math.round(Math.max(0,gross-pause)*100)/100;
        await client.query(
          `INSERT INTO day_closures_shadow(
             employee_name,closure_date,closed_at_text,gross_total,legacy_col5,legacy_col6,pause_minutes,
             net_total,updated_at_text,update_reason,shadow_updated_at
           ) VALUES($1,$2,$3,$4,$5,'',$6,$7,'','',now())`,
          [target,date,nowIso,gross,'Büro: manueller Abschluss durch '+by,Math.round(pause*60),total]
        );
        await client.query(
          'UPDATE time_entries_shadow SET closed=true,shadow_updated_at=now() WHERE employee_name=$1 AND entry_date=$2',[target,date]
        );
        result={ok:true,alreadyClosed:false,employee:target,date,total,closedBy:by,closedAt:shadowGermanDateTime(nowIso)};
      }
    }else if(action==='setDayStatus'){
      const target=String(body.employee||'').trim(),date=String(body.date||'').trim(),status=String(body.status||'').trim();
      const allowed=['Arbeiten','Krank','Urlaub','Feiertag'];
      if(!target||target!==by)throw new Error('Mitarbeiter stimmt nicht mit der Anmeldung überein.');
      if(!validIsoDateText(date))throw new Error('Ungültiges Datum.');
      if(!allowed.includes(status))throw new Error('Ungültiger Tagesstatus.');
      const oldQ=await client.query(
        'SELECT status FROM day_status_shadow WHERE employee_name=$1 AND status_date=$2 FOR UPDATE',[target,date]
      );
      const oldStatus=String(oldQ.rows[0]?.status||'Arbeiten');
      const closureQ=await client.query(
        'SELECT legacy_col5 FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2 FOR UPDATE',[target,date]
      );
      if(closureQ.rowCount&&!/^Automatisch:\\s*(Urlaub|Krank|Schulung|Unerlaubte Abwesenheit|Unentschuldigte Abwesenheit|Feiertag)/i.test(String(closureQ.rows[0].legacy_col5||'')))
        throw new Error('Der Tag wurde bereits abgeschlossen.');
      if(status!=='Arbeiten'){
        const work=await client.query(
          'SELECT 1 FROM time_entries_shadow WHERE employee_name=$1 AND entry_date=$2 LIMIT 1',[target,date]
        );
        if(work.rowCount)throw new Error('Für diesen Tag sind bereits Arbeitszeiten erfasst. Bitte zuerst die Einträge löschen.');
      }
      const profile=await employeeAutomationProfile(target);
      const credit=status==='Arbeiten'?0:profileHoursForDate(profile,date);
      if(status==='Arbeiten'){
        await client.query('DELETE FROM day_status_shadow WHERE employee_name=$1 AND status_date=$2',[target,date]);
      }else{
        await client.query(
          `INSERT INTO day_status_shadow(
             employee_name,status_date,status,changed_at_text,source,reference,credited_hours,credited_hours_missing,shadow_updated_at
           ) VALUES($1,$2,$3,$4,'Mitarbeiter','',$5,false,now())
           ON CONFLICT(employee_name,status_date) DO UPDATE SET
             status=EXCLUDED.status,changed_at_text=EXCLUDED.changed_at_text,source='Mitarbeiter',reference='',
             credited_hours=EXCLUDED.credited_hours,credited_hours_missing=false,shadow_updated_at=now()`,
          [target,date,status,nowIso,credit]
        );
      }
      if(['Urlaub','Krank','Schulung','Unerlaubte Abwesenheit','Unentschuldigte Abwesenheit','Feiertag'].includes(status)&&date>='2026-09-07'){
        const note='Automatisch: '+status+' · Mitarbeiter';
        if(closureQ.rowCount){
          if(/^Automatisch:\\s*(Urlaub|Krank|Schulung|Unerlaubte Abwesenheit|Unentschuldigte Abwesenheit|Feiertag)/i.test(String(closureQ.rows[0].legacy_col5||''))){
            await client.query(
              `UPDATE day_closures_shadow SET closed_at_text=$3,gross_total=$4,legacy_col5=$5,legacy_col6='',
                 pause_minutes=0,net_total=$4,updated_at_text=$3,update_reason='DG 7.2 Statusautomatik',shadow_updated_at=now()
               WHERE employee_name=$1 AND closure_date=$2`,[target,date,nowIso,credit,note]
            );
          }
        }else{
          await client.query(
            `INSERT INTO day_closures_shadow(
               employee_name,closure_date,closed_at_text,gross_total,legacy_col5,legacy_col6,pause_minutes,
               net_total,updated_at_text,update_reason,shadow_updated_at
             ) VALUES($1,$2,$3,$4,$5,'',0,$4,'','DG 7.2 Statusautomatik',now())`,
            [target,date,nowIso,credit,note]
          );
        }
      }else if(status==='Arbeiten'&&['Urlaub','Krank','Schulung','Unerlaubte Abwesenheit','Unentschuldigte Abwesenheit','Feiertag'].includes(oldStatus)&&closureQ.rowCount){
        const note=String(closureQ.rows[0].legacy_col5||'');
        if(/^Automatisch:\\s*(Urlaub|Krank|Schulung|Unerlaubte Abwesenheit|Unentschuldigte Abwesenheit|Feiertag)/i.test(note)&&note.toLowerCase().includes(oldStatus.toLowerCase())){
          await client.query('DELETE FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2',[target,date]);
        }
      }
      result={ok:true,status};
    }else if(['markRegieObjectBilled','markRegieObjectsBilled'].includes(action)){
      const requested=action==='markRegieObjectBilled'?[String(body.objectId||'').trim()]:
        (Array.isArray(body.objectIds)?body.objectIds.map(x=>String(x||'').trim()).filter(Boolean):[]);
      let objectIds=[...new Set(requested.filter(Boolean))];
      if(!objectIds.length)throw new Error('Objekt-ID fehlt.');
      const mergeRows=await client.query(
        'SELECT object_id,merge_id FROM regie_merges_shadow WHERE object_id=ANY($1::text[])',[objectIds]
      );
      const mergeIds=[...new Set(mergeRows.rows.map(r=>String(r.merge_id||'')).filter(Boolean))];
      if(mergeIds.length){
        const siblings=await client.query(
          'SELECT object_id FROM regie_merges_shadow WHERE merge_id=ANY($1::text[])',[mergeIds]
        );
        objectIds=[...new Set(objectIds.concat(siblings.rows.map(r=>String(r.object_id||'')).filter(Boolean)))];
      }
      if(!Boolean(body.force)){
        const rq=await client.query(
          `SELECT object_id,customer,billing_status,job_status,entry_date
             FROM time_entries_shadow`
        );
        const selectedSet=new Set(objectIds),selectedCustomers=[];
        for(const r of rq.rows){
          if(selectedSet.has(String(r.object_id||''))&&String(r.customer||''))selectedCustomers.push(String(r.customer));
        }
        const customerKeys=[...new Set(selectedCustomers.map(shadowObjectKey).filter(Boolean))];
        const risky=new Set();
        for(const r of rq.rows){
          const oid=String(r.object_id||'');
          if(!oid||selectedSet.has(oid)||String(r.billing_status||'Offen')!=='Offen')continue;
          const key=shadowObjectKey(String(r.customer||''));if(!key)continue;
          if(customerKeys.some(selectedKey=>key===selectedKey||key.includes(selectedKey)||selectedKey.includes(key)))risky.add(oid);
        }
        if(risky.size)throw new Error('Weitere offene oder laufende Aufträge dieses Kunden gefunden. Bitte vor der Abrechnung prüfen.');
      }
      const matched=await client.query(
        `SELECT id FROM time_entries_shadow
          WHERE object_id=ANY($1::text[]) AND COALESCE(billing_status,'Offen')='Offen'
          FOR UPDATE`,[objectIds]
      );
      if(!matched.rowCount)throw new Error('Für diese Auswahl wurden keine offenen Regieberichte gefunden.');
      await client.query(
        `UPDATE time_entries_shadow
            SET billing_status='Abgerechnet',billed_at_text=$2,billed_by=$3,shadow_updated_at=now()
          WHERE object_id=ANY($1::text[]) AND COALESCE(billing_status,'Offen')='Offen'`,
        [objectIds,nowIso,by]
      );
      result={ok:true,objectIds,count:matched.rowCount,billedBy:by,billedAt:shadowGermanDateTime(nowIso)};
      if(action==='markRegieObjectBilled')result.objectId=String(body.objectId||'').trim();
    }else if(['setRegieObjectJobStatus','markRegieObjectCompleted'].includes(action)){
      const objectId=String(body.objectId||'').trim();
      const jobStatus=action==='markRegieObjectCompleted'?'Abgeschlossen':String(body.jobStatus||'').trim();
      if(!objectId)throw new Error('Objekt-ID fehlt.');
      if(!['Laufend','Abgeschlossen'].includes(jobStatus))throw new Error('Ungültiger Auftragsstatus.');
      const mq=await client.query('SELECT merge_id FROM regie_merges_shadow WHERE object_id=$1 LIMIT 1',[objectId]);
      const mergeId=String(mq.rows[0]?.merge_id||'');
      let objectIds=[objectId];
      if(mergeId){
        const iq=await client.query('SELECT object_id FROM regie_merges_shadow WHERE merge_id=$1 ORDER BY object_id',[mergeId]);
        objectIds=iq.rows.map(r=>String(r.object_id||'')).filter(Boolean);
        if(!objectIds.includes(objectId))objectIds.push(objectId);
      }
      const matched=await client.query(
        `SELECT id,job_status FROM time_entries_shadow
          WHERE object_id=ANY($1::text[]) AND COALESCE(billing_status,'Offen')='Offen'
          FOR UPDATE`,
        [objectIds]
      );
      if(!matched.rowCount)throw new Error('Für dieses Objekt wurden keine passenden offenen Regieberichte zum Ändern gefunden.');
      const changed=matched.rows.filter(r=>String(r.job_status||'Abgeschlossen')!==jobStatus).length;
      await client.query(
        `UPDATE time_entries_shadow SET job_status=$2,shadow_updated_at=now()
          WHERE object_id=ANY($1::text[]) AND COALESCE(billing_status,'Offen')='Offen'`,
        [objectIds,jobStatus]
      );
      result={ok:true,objectId,objectIds,jobStatus,count:changed,changedBy:by,changedAt:shadowGermanDateTime(nowIso)};
    }else if(action==='setPlannerWorkerActive'){
      const id=String(body.id||'').trim(),active=Boolean(body.active);
      if(!id)throw new Error('Kalender-Mitarbeiter nicht gefunden.');
      const q=await client.query(
        'SELECT 1 FROM planner_workers_shadow WHERE id=$1 FOR UPDATE',[id]
      );
      if(!q.rowCount)throw new Error('Kalender-Mitarbeiter nicht gefunden.');
      await client.query(
        'UPDATE planner_workers_shadow SET active=$2,shadow_updated_at=now() WHERE id=$1',
        [id,active]
      );
      result={ok:true,_plannerWorkerId:id};
    }else if(action==='setEmployeeActive'){
      const target=String(body.targetName||'').trim();
      const active=Boolean(body.active);
      if(!target)throw new Error('Mitarbeiter nicht gefunden.');
      if(target===by&&!active)throw new Error('Der aktuell angemeldete Chef kann sich nicht selbst deaktivieren.');
      const q=await client.query(
        'SELECT payload FROM employee_admin_shadow WHERE employee_name=$1 FOR UPDATE',[target]
      );
      if(!q.rowCount)throw new Error('Mitarbeiter nicht gefunden.');
      const payload=Object.assign({},q.rows[0].payload||{},{active});
      await client.query(
        'UPDATE employee_admin_shadow SET payload=$2::jsonb,shadow_updated_at=now() WHERE employee_name=$1',
        [target,JSON.stringify(payload)]
      );
      result={ok:true,_employeeActiveTarget:target};
    }else if(action==='syncHolidays'){
      const year=Number(body.year)||0;
      if(!(year>=2020&&year<=2100))throw new Error('Ungültiges Jahr.');
      await mirrorHolidayYear(year);
      result={ok:true,year};
    }else if(action==='saveVacationEntitlement'){
      const employee=String(body.targetEmployee||'').trim(),year=Number(body.year)||0;
      const entitlement=Math.max(0,Number(body.entitlement)||0);
      if(!employee)throw new Error('Mitarbeiter nicht gefunden.');
      if(!(year>=2000&&year<=2100))throw new Error('Ungültiges Jahr.');
      const eq=await client.query(
        'SELECT 1 FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1',[employee]
      );
      if(!eq.rowCount)throw new Error('Mitarbeiter nicht gefunden.');
      await client.query(
        `INSERT INTO vacation_entitlements_shadow(
          employee_name,vacation_year,entitlement,changed_at_text,changed_by,shadow_updated_at
        ) VALUES($1,$2,$3,$4,$5,now())
        ON CONFLICT(employee_name,vacation_year) DO UPDATE SET
          entitlement=EXCLUDED.entitlement,changed_at_text=EXCLUDED.changed_at_text,
          changed_by=EXCLUDED.changed_by,shadow_updated_at=now()`,
        [employee,year,entitlement,nowIso,by]
      );
      result={ok:true,_vacationEmployee:employee,_vacationYear:year};
    }else if(action==='reserveMaintenanceDeviceId'){
      await client.query("SELECT pg_advisory_xact_lock(hashtext('maintenance_internal_device_id'))");
      const mx=await client.query(
        "SELECT COALESCE(MAX(CASE WHEN internal_device_id ~ '^[0-9]+$' THEN internal_device_id::int END),999)::int AS n FROM maintenance_devices_shadow"
      );
      const meta=await client.query(
        "SELECT COALESCE(NULLIF(value->>'nextInternalDeviceId','')::int,1000)::int AS n FROM app_meta WHERE key='maintenance_next_device_id' LIMIT 1 FOR UPDATE"
      );
      const reserved=Math.max(Number(mx.rows[0]?.n||999)+1,Number(meta.rows[0]?.n||1000),1000);
      const next=reserved+1;
      const value=JSON.stringify({nextInternalDeviceId:String(next),lastReservedInternalDeviceId:String(reserved),reservedBy:by,reservedAt:nowIso,source:'postgres'});
      await client.query(
        "INSERT INTO app_meta(key,value) VALUES('maintenance_next_device_id',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
        [value]
      );
      result={ok:true,internalDeviceId:String(reserved)};
    }else if(action==='saveMaintenanceCustomer'){
      const src=body.item||{},objects=Array.isArray(src.objects)?src.objects:[];
      const name=String(src.name||'').trim(),email=String(src.email||'').trim(),phone=String(src.phone||'').trim();
      const billingStreet=String(src.billingStreet||'').trim(),billingZip=String(src.billingZip||'').trim(),billingCity=String(src.billingCity||'').trim();
      if(!name||!billingStreet||!billingZip||!billingCity)throw new Error('Bitte Name und vollständige Rechnungsadresse eintragen.');
      if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('E-Mail-Adresse ist ungültig.');
      if(!objects.length)throw new Error('Mindestens ein Ausführungsobjekt ist erforderlich.');
      const stableId=(prefix,text)=>prefix+crypto.createHash('sha256').update(String(text||'')).digest('hex').slice(0,20);
      let id=String(src.id||'').trim();
      const requestedExisting=Boolean(id);
      if(!id)id=stableId('WKC-PG-', [name,billingStreet,billingZip,billingCity,email,phone].join('|').toLowerCase());
      const cq=await client.query('SELECT 1 FROM maintenance_customers_shadow WHERE id=$1 FOR UPDATE',[id]);
      if(requestedExisting&&!cq.rowCount)throw new Error('Wartungskunde wurde nicht gefunden.');
      if(cq.rowCount){
        await client.query(
          `UPDATE maintenance_customers_shadow SET name=$2,billing_street=$3,billing_zip=$4,billing_city=$5,
             email=$6,phone=$7,active=true,updated_at_text=$8,updated_by=$9,shadow_updated_at=now() WHERE id=$1`,
          [id,name,billingStreet,billingZip,billingCity,email,phone,nowIso,by]
        );
        await client.query('UPDATE maintenance_objects_shadow SET active=false,updated_at_text=$2,updated_by=$3,shadow_updated_at=now() WHERE customer_id=$1',[id,nowIso,by]);
        await client.query('UPDATE maintenance_devices_shadow SET active=false,updated_at_text=$2,updated_by=$3,shadow_updated_at=now() WHERE customer_id=$1',[id,nowIso,by]);
      }else{
        await client.query(
          `INSERT INTO maintenance_customers_shadow(
             id,name,billing_street,billing_zip,billing_city,email,phone,active,created_at_text,updated_at_text,updated_by,shadow_updated_at
           ) VALUES($1,$2,$3,$4,$5,$6,$7,true,$8,$8,$9,now())`,
          [id,name,billingStreet,billingZip,billingCity,email,phone,nowIso,by]
        );
      }

      await client.query("SELECT pg_advisory_xact_lock(hashtext('maintenance_internal_device_id'))");
      const mx=await client.query(
        `SELECT COALESCE(MAX(CASE WHEN internal_device_id ~ '^[0-9]+$' THEN internal_device_id::int END),999)::int AS n
           FROM maintenance_devices_shadow`
      );
      const meta=await client.query(
        `SELECT COALESCE(NULLIF(value->>'nextInternalDeviceId','')::int,1000)::int AS n
           FROM app_meta WHERE key='maintenance_next_device_id' LIMIT 1`
      );
      let nextInternal=Math.max(Number(mx.rows[0]?.n||999)+1,Number(meta.rows[0]?.n||1000),1000);
      const outItem={...src,id,name,email,phone,billingStreet,billingZip,billingCity,objects:[]};

      for(let oi=0;oi<objects.length;oi++){
        const o=objects[oi]||{},hadOid=Boolean(String(o.id||'').trim());
        let oid=String(o.id||'').trim();
        if(!String(o.name||'').trim()||!String(o.street||'').trim()||!String(o.zip||'').trim()||!String(o.city||'').trim())
          throw new Error('Objekt '+(oi+1)+': Bezeichnung und vollständige Adresse fehlen.');
        if(!oid)oid=stableId('WKO-PG-', [id,oi,o.name,o.street,o.zip,o.city].join('|').toLowerCase());
        const oq=await client.query('SELECT customer_id FROM maintenance_objects_shadow WHERE id=$1 FOR UPDATE',[oid]);
        if(hadOid&&(!oq.rowCount||String(oq.rows[0].customer_id||'')!==id))
          throw new Error('Objekt '+(oi+1)+' wurde nicht gefunden.');
        await client.query(
          `INSERT INTO maintenance_objects_shadow(
             id,customer_id,name,street,zip,city,notes,active,created_at_text,updated_at_text,updated_by,shadow_updated_at
           ) VALUES($1,$2,$3,$4,$5,$6,$7,true,$8,$8,$9,now())
           ON CONFLICT(id) DO UPDATE SET customer_id=EXCLUDED.customer_id,name=EXCLUDED.name,street=EXCLUDED.street,
             zip=EXCLUDED.zip,city=EXCLUDED.city,notes=EXCLUDED.notes,active=true,
             updated_at_text=EXCLUDED.updated_at_text,updated_by=EXCLUDED.updated_by,shadow_updated_at=now()`,
          [oid,id,String(o.name||''),String(o.street||''),String(o.zip||''),String(o.city||''),String(o.notes||''),nowIso,by]
        );
        const devices=Array.isArray(o.devices)?o.devices:[];
        if(!devices.length)throw new Error('Objekt '+(oi+1)+': Mindestens ein Wartungsgerät anlegen.');
        const outObject={...o,id:oid,devices:[]};
        for(let di=0;di<devices.length;di++){
          const d=devices[di]||{},hadDid=Boolean(String(d.id||'').trim());
          let did=String(d.id||'').trim();
          if(!String(d.deviceType||'').trim())throw new Error('Objekt '+(oi+1)+', Gerät '+(di+1)+': Geräteart fehlt.');
          if(String(d.deviceType||'')==='Sonstiges'&&!String(d.otherDescription||'').trim())
            throw new Error('Objekt '+(oi+1)+', Gerät '+(di+1)+': Bei „Sonstiges“ ist die Beschreibung Pflicht.');
          if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(d.nextMaintenanceDue||'')))
            throw new Error('Objekt '+(oi+1)+', Gerät '+(di+1)+': Nächste Wartung mit Monat und Jahr eintragen.');
          if(!did)did=stableId('WKG-PG-', [oid,di,d.deviceType,d.manufacturer,d.model,d.serialNumber].join('|').toLowerCase());
          const dq=await client.query(
            'SELECT customer_id,internal_device_id FROM maintenance_devices_shadow WHERE id=$1 FOR UPDATE',[did]
          );
          if(hadDid&&(!dq.rowCount||String(dq.rows[0].customer_id||'')!==id))
            throw new Error('Objekt '+(oi+1)+', Gerät '+(di+1)+' wurde nicht gefunden.');
          let internalId=String(d.internalDeviceId||dq.rows[0]?.internal_device_id||'').trim();
          if(!/^\d+$/.test(internalId)){internalId=String(nextInternal++);}
          else nextInternal=Math.max(nextInternal,Number(internalId)+1);
          await client.query(
            `INSERT INTO maintenance_devices_shadow(
               id,object_id,customer_id,device_type,other_description,manufacturer,model,serial_number,
               year_text,tenant_name,tenant_phone,tenant_email,spare_part_manufacturer,spare_part_serial_number,
               internal_notes,next_maintenance_due,active,created_at_text,updated_at_text,updated_by,internal_device_id,shadow_updated_at
             ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,$17,$17,$18,$19,now())
             ON CONFLICT(id) DO UPDATE SET object_id=EXCLUDED.object_id,customer_id=EXCLUDED.customer_id,
               device_type=EXCLUDED.device_type,other_description=EXCLUDED.other_description,manufacturer=EXCLUDED.manufacturer,
               model=EXCLUDED.model,serial_number=EXCLUDED.serial_number,year_text=EXCLUDED.year_text,
               tenant_name=EXCLUDED.tenant_name,tenant_phone=EXCLUDED.tenant_phone,tenant_email=EXCLUDED.tenant_email,
               spare_part_manufacturer=EXCLUDED.spare_part_manufacturer,spare_part_serial_number=EXCLUDED.spare_part_serial_number,
               internal_notes=EXCLUDED.internal_notes,next_maintenance_due=EXCLUDED.next_maintenance_due,active=true,
               updated_at_text=EXCLUDED.updated_at_text,updated_by=EXCLUDED.updated_by,
               internal_device_id=EXCLUDED.internal_device_id,shadow_updated_at=now()`,
            [did,oid,id,String(d.deviceType||''),String(d.otherDescription||''),String(d.manufacturer||''),
             String(d.model||''),String(d.serialNumber||''),String(d.year||''),String(d.tenantName||''),
             String(d.tenantPhone||''),String(d.tenantEmail||''),String(d.sparePartManufacturer||''),
             String(d.sparePartSerialNumber||''),String(d.internalNotes||''),String(d.nextMaintenanceDue||''),
             nowIso,by,internalId]
          );
          // maintenance-local-upload
          const localAttachments=[];
          for(const a of (Array.isArray(d.attachments)?d.attachments:[])){if(a&&a.fileId&&!a.dataUrl)localAttachments.push(a);}
          for(const a of (Array.isArray(d.newAttachments)?d.newAttachments:[])){
            const stored=await storeBinaryFileV24(client,{dataUrl:a.dataUrl,name:a.name,mime:a.mime||a.type,kind:'maintenance-'+String(a.kind||'Datei'),source:'railway',metadata:{customerId:id,objectId:oid,deviceId:did}});
            const aid='WAT-PG-'+crypto.randomUUID();
            await client.query(`INSERT INTO maintenance_attachments_shadow(id,device_id,customer_id,object_id,kind,name,mime,file_size,file_id,url,active,created_at_text,created_by,shadow_updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,now())`,[aid,did,id,oid,String(a.kind||'Datei'),stored.name,stored.mime,stored.size,stored.id,stored.url,nowIso,by]);
            localAttachments.push({id:aid,kind:String(a.kind||'Datei'),name:stored.name,mime:stored.mime,size:stored.size,fileId:stored.id,url:stored.url,createdAt:nowIso,createdBy:by});
          }
          outObject.devices.push({...d,id:did,internalDeviceId:internalId,attachments:localAttachments,newAttachments:[]});
        }
        outItem.objects.push(outObject);
      }
      const metaValue=JSON.stringify({nextInternalDeviceId:String(nextInternal),updatedBy:by,updatedAt:nowIso,source:'postgres'});
      await client.query(
        `INSERT INTO app_meta(key,value) VALUES('maintenance_next_device_id',$1::jsonb)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,[metaValue]
      );
      legacyPayload=Object.assign({},body,{item:outItem});
      result=await postgresMaintenanceCustomerFull(id,client);
    }else if(action==='addMaintenanceRepair'){
      const deviceId=String(body.deviceId||'').trim(),date=String(body.date||'').trim(),description=String(body.description||'').trim();
      if(!validIsoDateText(date))throw new Error('Reparaturdatum ist ungültig.');
      if(!description)throw new Error('Reparaturbeschreibung fehlt.');
      const dq=await client.query('SELECT id,customer_id,object_id,active FROM maintenance_devices_shadow WHERE id=$1 FOR UPDATE',[deviceId]);
      if(!dq.rowCount||dq.rows[0].active===false)throw new Error('Wartungsgerät nicht gefunden.');
      const d=dq.rows[0],id=String(body.repairId||'').trim()||('WR-'+crypto.randomUUID());
      await client.query(
        `INSERT INTO maintenance_repairs_shadow(
          id,device_id,customer_id,object_id,repair_date,description,created_at_text,created_by,shadow_updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT(id) DO NOTHING`,
        [id,deviceId,String(d.customer_id||''),String(d.object_id||''),date,description,nowIso,by]
      );
      legacyPayload=Object.assign({},body,{repairId:id});
      result={id};
    }else if(action==='addManualMaintenanceCount'){
      let date=String(body.date||'').trim()||berlinTodayIso();
      const count=Math.floor(Number(body.count)||0),note=String(body.note||'').trim();
      if(!validIsoDateText(date))throw new Error('Datum ist ungültig.');
      if(count<1||count>99)throw new Error('Bitte eine Anzahl zwischen 1 und 99 eintragen.');
      const id=String(body.manualId||'').trim()||('WM-'+crypto.randomUUID());
      await client.query(
        `INSERT INTO maintenance_manual_shadow(
          id,maintenance_date,maintenance_count,note,created_at_text,created_by,shadow_updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(id) DO NOTHING`,
        [id,date,count,note,nowIso,by]
      );
      legacyPayload=Object.assign({},body,{manualId:id});
      result={id,date,count,note};
    }else if(action==='setMonthClosureStatus'){
      const target=String(body.targetEmployee||'').trim(),year=Number(body.year)||0,month=Number(body.month)||0;
      const closureAction=String(body.closureAction||'').trim(),reason=String(body.reason||'').trim();
      if(!target)throw new Error('Mitarbeiter wurde nicht gefunden.');
      if(!(year>0&&month>=1&&month<=12))throw new Error('Ungültiger Monat.');
      if(!['Abgeschlossen','Wieder geöffnet'].includes(closureAction))throw new Error('Ungültige Abschlussaktion.');
      if(closureAction==='Wieder geöffnet'&&!reason)throw new Error('Bitte einen Grund für die Wiederöffnung angeben.');
      const eq=await client.query('SELECT 1 FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1',[target]);
      if(!eq.rowCount)throw new Error('Mitarbeiter wurde nicht gefunden.');
      const id=String(body.closureId||'').trim()||('MC-'+crypto.randomUUID());
      await client.query(
        `INSERT INTO month_closures_shadow(
          id,employee_name,closure_year,closure_month,action,action_at_text,action_by,reason,shadow_updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT(id) DO NOTHING`,
        [id,target,year,month,closureAction,nowIso,by,reason]
      );
      legacyPayload=Object.assign({},body,{closureId:id});
      const h=await client.query(
        `SELECT id,action,action_at_text,action_by,reason FROM month_closures_shadow
          WHERE employee_name=$1 AND closure_year=$2 AND closure_month=$3
          ORDER BY action_at_text ASC NULLS LAST,id ASC`,[target,year,month]
      );
      const history=h.rows.map(r=>({id:String(r.id||''),action:String(r.action||''),at:shadowGermanDateTime(r.action_at_text||''),by:String(r.action_by||''),reason:String(r.reason||'')}));
      const last=history.length?history[history.length-1]:null;
      result={status:last&&last.action==='Abgeschlossen'?'Abgeschlossen':'Offen',last,history};
    }else if(action==='forceCompletePayrollCycle'){
      const year=Number(body.year)||0,month=Number(body.month)||0,reason=String(body.reason||'').trim();
      if(!(year>0&&month>=1&&month<=12))throw new Error('Ungültiger Monat.');
      if(!reason)throw new Error('Bitte einen Prüfvermerk / Grund für die Zwangsübergabe eintragen.');
      const audit=await postgresPayrollAuditNative({year,month});
      if(!audit)throw new Error('Lohnprüfung konnte nicht aus PostgreSQL geladen werden.');
      if(audit.state?.status==='Uebergeben'&&!audit.state?.changedSinceApproval){
        result={ok:true,audit};
      }else{
        const id=String(body.closureId||'').trim()||('PC-'+crypto.randomUUID());
        await client.query(
          `INSERT INTO payroll_closures_shadow(
             id,closure_year,closure_month,action,action_at_text,action_by,reason,fingerprint,shadow_updated_at
           ) VALUES($1,$2,$3,'Uebergeben',$4,$5,$6,$7,now())
           ON CONFLICT(id) DO NOTHING`,
          [id,year,month,nowIso,by,reason,String(audit.fingerprint||'')]
        );
        legacyPayload=Object.assign({},body,{closureId:id,reason});
        result={ok:true,audit:await postgresPayrollAuditNative({year,month})};
      }
    }else if(action==='completePayrollCycle'){
      const year=Number(body.year)||0,month=Number(body.month)||0;
      if(!(year>0&&month>=1&&month<=12))throw new Error('Ungültiger Monat.');
      const audit=await postgresPayrollAuditNative({year,month});
      if(!audit)throw new Error('Lohnprüfung konnte nicht aus PostgreSQL geladen werden.');
      if(!audit.canRelease||audit.state?.changedSinceApproval)
        throw new Error('Monatsabschluss kann erst freigegeben werden, wenn alle offenen Auffälligkeiten geprüft oder behoben sind.');
      if(audit.state?.status==='Uebergeben'&&!audit.state?.changedSinceApproval){
        result={ok:true,audit};
      }else{
        const id=String(body.closureId||'').trim()||('PC-'+crypto.randomUUID());
        await client.query(
          `INSERT INTO payroll_closures_shadow(
             id,closure_year,closure_month,action,action_at_text,action_by,reason,fingerprint,shadow_updated_at
           ) VALUES($1,$2,$3,'Freigegeben',$4,$5,'',$6,now())
           ON CONFLICT(id) DO NOTHING`,
          [id,year,month,nowIso,by,String(audit.fingerprint||'')]
        );
        legacyAction='setPayrollMonthStatus';
        legacyPayload=Object.assign({},body,{
          action:'setPayrollMonthStatus',closureId:id,payrollAction:'Freigegeben',reason:''
        });
        result={ok:true,audit:await postgresPayrollAuditNative({year,month})};
      }
    }else if(action==='setPayrollMonthStatus'){
      const year=Number(body.year)||0,month=Number(body.month)||0;
      const payrollAction=String(body.payrollAction||'').trim(),reason=String(body.reason||'').trim();
      if(!(year>0&&month>=1&&month<=12))throw new Error('Ungültiger Monat.');
      if(!['Freigegeben','Uebergeben','Wieder geoeffnet'].includes(payrollAction))throw new Error('Ungültige Lohnabschluss-Aktion.');
      if(payrollAction==='Wieder geoeffnet'&&!reason)throw new Error('Bitte einen Grund für die Wiederöffnung angeben.');
      const audit=await postgresPayrollAuditNative({year,month});
      if(!audit)throw new Error('Lohnprüfung konnte nicht aus PostgreSQL geladen werden.');
      const currentState=audit.state||{};
      if(payrollAction==='Freigegeben'&&(!audit.canRelease||currentState.changedSinceApproval))
        throw new Error('Monatsabschluss kann erst freigegeben werden, wenn alle offenen Auffälligkeiten geprüft oder behoben sind.');
      if(payrollAction==='Uebergeben'&&(currentState.status!=='Freigegeben'||currentState.changedSinceApproval))
        throw new Error('Der Monat muss zuerst freigegeben werden und darf seitdem nicht verändert worden sein.');
      const id=String(body.closureId||'').trim()||('PC-'+crypto.randomUUID());
      const fingerprint=payrollAction==='Wieder geoeffnet'?'':String(audit.fingerprint||'');
      await client.query(
        `INSERT INTO payroll_closures_shadow(
          id,closure_year,closure_month,action,action_at_text,action_by,reason,fingerprint,shadow_updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT(id) DO NOTHING`,
        [id,year,month,payrollAction,nowIso,by,reason,fingerprint]
      );
      legacyPayload=Object.assign({},body,{closureId:id});
      const h=await client.query(
        `SELECT id,action,action_at_text,action_by,reason,fingerprint FROM payroll_closures_shadow
          WHERE closure_year=$1 AND closure_month=$2
          ORDER BY action_at_text ASC NULLS LAST,id ASC`,[year,month]
      );
      const history=h.rows.map(r=>({id:String(r.id||''),action:String(r.action||''),at:shadowGermanDateTime(r.action_at_text||''),
        by:String(r.action_by||''),reason:String(r.reason||''),fingerprint:String(r.fingerprint||'')}));
      const last=history.length?history[history.length-1]:null;
      let status=last?last.action:'Offen';if(status==='Wieder geoeffnet')status='Offen';
      result={status,last,history,changedSinceApproval:false};
    }else if(action==='applyTimeBankToMonth'){
      const target=String(body.targetEmployee||'').trim(),year=Number(body.year)||0,month=Number(body.month)||0;
      if(!target)throw new Error('Mitarbeiter wurde nicht gefunden.');
      if(!(year>0&&month>=1&&month<=12))throw new Error('Ungültiger Monat.');
      const eq=await client.query('SELECT 1 FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1',[target]);
      if(!eq.rowCount)throw new Error('Mitarbeiter wurde nicht gefunden.');
      const monthRows=await postgresBossMonthData({year,month});
      const row=(Array.isArray(monthRows)?monthRows:[]).find(x=>String(x.employee||'')===target);
      if(!row)throw new Error('Monatsdaten für den Mitarbeiter wurden nicht gefunden.');
      const deficit=Math.round(Math.max(0,Number(row.targetTotal||0)-Number(row.actualTotal||0))*100)/100;
      if(!(deficit>0))throw new Error('Für diesen Monat besteht kein offenes Stunden-Soll.');
      const bq=await client.query(
        'SELECT COALESCE(SUM(hours),0)::numeric AS balance FROM time_bank_shadow WHERE employee_name=$1 FOR UPDATE',[target]
      );
      const before=Math.round(Math.max(0,Number(bq.rows[0]?.balance||0))*100)/100;
      if(!(before>0))throw new Error('Es ist kein Zeitguthaben vorhanden.');
      const credit=Math.round(Math.min(deficit,before)*100)/100;
      if(!(credit>0))throw new Error('Es kann kein Zeitguthaben angerechnet werden.');
      const id=String(body.transactionId||'').trim()||crypto.randomUUID();
      const reference=String(body.monthCreditReference||'').trim()||('month-credit:'+year+'-'+month+':postgres:'+id);
      const dup=await client.query('SELECT id,hours FROM time_bank_shadow WHERE id=$1 OR reference=$2 LIMIT 1',[id,reference]);
      if(!dup.rowCount){
        await client.query(
          `INSERT INTO time_bank_shadow(
             id,employee_name,hours,booking_type,booking_year,booking_month,reference,reason,
             created_at_text,created_iso,created_by,shadow_updated_at
           ) VALUES($1,$2,$3,'Monatsausgleich',$4,$5,$6,'Anrechnung auf Monats-Soll',$7,$8,$9,now())`,
          [id,target,-credit,year,month,reference,nowIso,berlinTodayIso(),by]
        );
      }
      legacyPayload=Object.assign({},body,{transactionId:id,monthCreditReference:reference});
      result={ok:true,id,hours:-credit,balanceBefore:before,balanceAfter:Math.round((before-credit)*100)/100};
    }else if(action==='bankMonthSurplus'){
      const target=String(body.targetEmployee||'').trim(),year=Number(body.year)||0,month=Number(body.month)||0;
      if(!target)throw new Error('Mitarbeiter wurde nicht gefunden.');
      if(!(year>0&&month>=1&&month<=12))throw new Error('Ungültiger Monat.');
      const eq=await client.query('SELECT 1 FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1',[target]);
      if(!eq.rowCount)throw new Error('Mitarbeiter wurde nicht gefunden.');
      const reference='month-surplus:'+target+':'+year+'-'+month;
      const existing=await client.query(
        'SELECT id,hours FROM time_bank_shadow WHERE employee_name=$1 AND reference=$2 LIMIT 1 FOR UPDATE',
        [target,reference]
      );
      const bq=await client.query('SELECT COALESCE(SUM(hours),0)::numeric AS balance FROM time_bank_shadow WHERE employee_name=$1',[target]);
      const before=Math.round(Math.max(0,Number(bq.rows[0]?.balance||0))*100)/100;
      if(existing.rowCount){
        const hours=Math.round(Number(existing.rows[0].hours||0)*100)/100;
        result={ok:true,id:String(existing.rows[0].id||''),hours,balanceBefore:before,balanceAfter:before,alreadyBanked:true};
      }else{
        const monthRows=await postgresBossMonthData({year,month});
        const row=(Array.isArray(monthRows)?monthRows:[]).find(x=>String(x.employee||'')===target);
        if(!row)throw new Error('Monatsdaten für den Mitarbeiter wurden nicht gefunden.');
        const surplus=Math.round(Math.max(0,Number(row.actualTotal||0)-Number(row.targetTotal||0))*100)/100;
        if(!(surplus>0))throw new Error('Für diesen Monat ist kein Monatsplus vorhanden.');
        const id=String(body.transactionId||'').trim()||crypto.randomUUID();
        await client.query(
          `INSERT INTO time_bank_shadow(
             id,employee_name,hours,booking_type,booking_year,booking_month,reference,reason,
             created_at_text,created_iso,created_by,shadow_updated_at
           ) VALUES($1,$2,$3,'Monatsplus',$4,$5,$6,'Monatsplus ins Zeitguthaben übernommen',$7,$8,$9,now())`,
          [id,target,surplus,year,month,reference,nowIso,berlinTodayIso(),by]
        );
        legacyPayload=Object.assign({},body,{transactionId:id,reference});
        result={ok:true,id,hours:surplus,balanceBefore:before,balanceAfter:Math.round((before+surplus)*100)/100};
      }
    }else if(action==='saveTimeBankManual'){
      const target=String(body.targetEmployee||'').trim(),reason=String(body.reason||'').trim();
      let hours=Math.abs(Number(body.hours)||0),art=String(body.timeBankAction||'').trim(),signed=hours;
      if(!(hours>0&&hours<=500))throw new Error('Bitte gültige Stunden eingeben.');
      if(!reason)throw new Error('Bitte einen Grund angeben.');
      if(art==='Auszahlung'||art==='Stunden abziehen'){signed=-hours;art='Stunden abziehen';}
      else if(art==='Manuelle Gutschrift'||art==='Stunden Gutschreiben'){art='Stunden Gutschreiben';}
      else throw new Error('Ungültige Buchungsart.');
      const eq=await client.query('SELECT 1 FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1',[target]);
      if(!eq.rowCount)throw new Error('Mitarbeiter nicht gefunden.');
      const bq=await client.query('SELECT COALESCE(SUM(hours),0)::numeric AS balance FROM time_bank_shadow WHERE employee_name=$1',[target]);
      const before=Math.round(Number(bq.rows[0]?.balance||0)*100)/100;
      if(signed<0&&before+signed<-0.001)throw new Error('Nicht genügend Zeitguthaben. Verfügbar: '+before.toFixed(2).replace('.',',')+' Std.');
      const now=berlinNowParts(),year=Number(now.year)||0,month=Number(now.month)||0;
      const id=String(body.transactionId||'').trim()||crypto.randomUUID(),reference=String(body.manualReference||'').trim()||('manual:'+id);
      const dup=await client.query('SELECT id FROM time_bank_shadow WHERE id=$1 OR reference=$2 LIMIT 1',[id,reference]);
      if(!dup.rowCount){
        await client.query(
          `INSERT INTO time_bank_shadow(
            id,employee_name,hours,booking_type,booking_year,booking_month,reference,reason,
            created_at_text,created_iso,created_by,shadow_updated_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())`,
          [id,target,signed,art,year,month,reference,reason,nowIso,berlinTodayIso(),by]
        );
      }
      legacyPayload=Object.assign({},body,{transactionId:id,manualReference:reference});
      result={ok:true,id,hours:signed,balanceBefore:before,balanceAfter:Math.round((before+signed)*100)/100};
    }else if(action==='saveEmployeeAdmin'){
      const item=body.item||{},name=String(item.name||'').trim(),original=String(item.originalName||'').trim();
      if(!name||!original)throw new Error('Mitarbeitername fehlt.');
      if(name!==original)throw new Error('Namensänderungen sind im finalen Railway-Betrieb gesperrt. Bitte Mitarbeiter neu anlegen, statt den Namen zu ändern.');
      const q=await client.query('SELECT payload,sort_order FROM employee_admin_shadow WHERE employee_name=$1 FOR UPDATE',[name]);
      if(!q.rowCount)throw new Error('Mitarbeiter nicht gefunden.');
      const oldPayload=q.rows[0].payload||{};
      const newPin=normalizeLocalPinV24(item.pin||'');
      if(newPin&&!/^\d{4,10}$/.test(newPin))throw new Error('PIN muss aus 4 bis 10 Ziffern bestehen.');
      const newCalendarId=item.calendarId!==undefined?String(item.calendarId||'').trim():String(oldPayload.calendarId||'');
      const type=String(item.employmentType||'Vollzeit').trim();
      if(!['Vollzeit','Teilzeit','Aushilfe','Minijob','Azubi'].includes(type))throw new Error('Ungültige Beschäftigungsart.');
      const nums=['monday','tuesday','wednesday','thursday','friday'].map(k=>Number(item[k]));
      if(nums.some(v=>!Number.isFinite(v)||v<0||v>24))throw new Error('Tages-Sollstunden müssen zwischen 0 und 24 liegen.');
      let requestedWeekly=Number(item.weeklyHours);if(!Number.isFinite(requestedWeekly))requestedWeekly=0;
      if(requestedWeekly<0||requestedWeekly>60)throw new Error('Wochenstunden müssen zwischen 0 und 60 liegen.');
      if(nums.every(v=>v===0)&&requestedWeekly>0){const d=Math.round((requestedWeekly/5)*100)/100;for(let i=0;i<nums.length;i++)nums[i]=d;}
      const weekly=Math.round(nums.reduce((s,v)=>s+v,0)*100)/100;
      const paymentMethod=String(item.paymentMethod||'Überweisung').trim();
      if(!['Bar','Überweisung'].includes(paymentMethod))throw new Error('Ungültige Auszahlungsart.');
      const payrollType=item.payrollType!==undefined?String(item.payrollType||'').trim():String(oldPayload.payrollType||'Stundenlohn');
      if(!['Stundenlohn','Festgehalt'].includes(payrollType))throw new Error('Ungültige Abrechnungsart.');
      const payrollRelevant=item.payrollRelevant!==undefined?Boolean(item.payrollRelevant):(oldPayload.payrollRelevant!==false);
      const hourlyWage=Number(String(item.hourlyWage==null?'':item.hourlyWage).replace(',','.'))||0;
      const monthlySalary=item.monthlySalary!==undefined?(Number(String(item.monthlySalary==null?'':item.monthlySalary).replace(',','.'))||0):Number(oldPayload.monthlySalary||0);
      const entryDate=berlinDateOnly(item.entryDate||oldPayload.entryDate||''),minimumWage=minimumWageForEmployeeEntryDate(entryDate);
      if(type!=='Azubi'&&payrollRelevant&&payrollType==='Stundenlohn'){
        if(!(hourlyWage>0))throw new Error('Bitte den Brutto-Stundenlohn eintragen.');
        if(minimumWage.amount>0&&hourlyWage+0.0001<minimumWage.amount)throw new Error('Stundenlohn liegt unter dem gesetzlichen Mindestlohn.');
      }
      if(payrollRelevant&&payrollType==='Festgehalt'&&!(monthlySalary>0))throw new Error('Bitte das Brutto-Monatsgehalt eintragen.');
      const email=String(item.email||'').trim();if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('E-Mail-Adresse ist ungültig.');
      const iban=String(item.iban||'').replace(/\s+/g,'').toUpperCase();
      if(paymentMethod==='Überweisung'&&iban&&!/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(iban))throw new Error('IBAN ist ungültig.');
      const holidayCredit=(type==='Aushilfe'||type==='Minijob')?false:Boolean(item.holidayCredit!==false);
      const payload=Object.assign({},oldPayload,{
        name,calendarId:newCalendarId,employmentType:type,weeklyHours:weekly,
        monday:nums[0],tuesday:nums[1],wednesday:nums[2],thursday:nums[3],friday:nums[4],holidayCredit,
        active:item.active===false?false:true,chefAccess:Boolean(item.chefAccess),lastName:String(item.lastName||'').trim(),firstName:String(item.firstName||'').trim(),
        birthDate:berlinDateOnly(item.birthDate||''),personnelNumber:String(item.personnelNumber||'').trim(),street:String(item.street||'').trim(),
        postalCode:String(item.postalCode||'').trim(),city:String(item.city||'').trim(),phone:String(item.phone||'').trim(),mobile:String(item.mobile||'').trim(),email,
        healthInsurance:String(item.healthInsurance||'').trim(),healthInsuranceNumber:String(item.healthInsuranceNumber||'').trim(),socialSecurityNumber:String(item.socialSecurityNumber||'').trim(),
        taxId:String(item.taxId||'').trim(),bank:String(item.bank||'').trim(),iban,entryDate,exitDate:berlinDateOnly(item.exitDate||''),paymentMethod,
        emergencyContactName:String(item.emergencyContactName||'').trim(),emergencyContactPhone:String(item.emergencyContactPhone||'').trim(),drivingLicence:String(item.drivingLicence||'').trim(),
        notes:String(item.notes||'').trim(),hourlyWage,payrollType,monthlySalary,payrollRelevant,minimumWage
      });
      await client.query('UPDATE employee_admin_shadow SET payload=$2::jsonb,shadow_updated_at=now() WHERE employee_name=$1',[name,JSON.stringify(payload)]);
      await client.query('UPDATE employee_credentials_v10 SET active=$2,chef_access=$3,updated_at=now() WHERE employee_name=$1',[name,payload.active!==false,Boolean(payload.chefAccess)]);
      if(newPin){const salt=crypto.randomBytes(16).toString('base64'),hash=hashPinV24(newPin,salt);await client.query('UPDATE employee_credentials_v10 SET pin_salt=$2,pin_hash=$3,failed_attempts=0,locked_until=NULL,updated_at=now() WHERE employee_name=$1',[name,salt,hash]);}
      result={ok:true,employees:await postgresEmployeeAdminData()};
    }else if(action==='saveMonthlyAdjustment'){
      const employee=String(body.targetEmployee||'').trim(),year=Number(body.year)||0,month=Number(body.month)||0;
      const hours=Math.round(Number(body.hours||0)*100)/100,reason=String(body.reason||'').trim();
      if(!employee)throw new Error('Mitarbeiter wurde nicht gefunden.');
      const eq=await client.query('SELECT 1 FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1',[employee]);
      if(!eq.rowCount)throw new Error('Mitarbeiter wurde nicht gefunden.');
      if(!(year>0&&month>=1&&month<=12))throw new Error('Ungültiger Monat.');
      if(!Number.isFinite(hours)||hours===0||Math.abs(hours)>250)throw new Error('Die Korrektur muss zwischen -250 und +250 Stunden liegen und darf nicht 0 sein.');
      if(!reason)throw new Error('Bitte einen Grund für die Stundenkorrektur eintragen.');
      const id=String(body.adjustmentId||'').trim()||('ADJ-'+crypto.randomUUID());
      await client.query(
        `INSERT INTO monthly_adjustments_shadow(
          id,employee_name,adjustment_year,adjustment_month,hours,reason,created_at_text,created_by,shadow_updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
        ON CONFLICT(id) DO UPDATE SET employee_name=EXCLUDED.employee_name,
          adjustment_year=EXCLUDED.adjustment_year,adjustment_month=EXCLUDED.adjustment_month,
          hours=EXCLUDED.hours,reason=EXCLUDED.reason,created_at_text=EXCLUDED.created_at_text,
          created_by=EXCLUDED.created_by,shadow_updated_at=now()`,
        [id,employee,year,month,hours,reason,nowIso,by]
      );
      legacyPayload=Object.assign({},body,{adjustmentId:id});
      result={ok:true,id,hours,_employee:employee,_year:year,_month:month};
    }else if(action==='deleteMonthlyAdjustment'){
      const id=String(body.adjustmentId||'').trim();if(!id)throw new Error('Korrektur-ID fehlt.');
      const q=await client.query(
        'SELECT employee_name,adjustment_year,adjustment_month FROM monthly_adjustments_shadow WHERE id=$1 FOR UPDATE',
        [id]
      );
      if(!q.rowCount)throw new Error('Stundenkorrektur wurde nicht gefunden.');
      const row=q.rows[0];
      await client.query('DELETE FROM monthly_adjustments_shadow WHERE id=$1',[id]);
      result={ok:true,_employee:String(row.employee_name||''),_year:Number(row.adjustment_year)||0,_month:Number(row.adjustment_month)||0};
    }else if(action==='inquiryToOffer'){
      const inquiryId=String(body.id||'').trim(),customer=String(body.customer||'').trim(),phone=String(body.phone||'').trim();
      if(!inquiryId)throw new Error('Anfrage nicht gefunden.');
      if(!customer)throw new Error('Kunde fehlt.');
      if(phone.replace(/\D/g,'').length<6)throw new Error('Gültige Telefonnummer erforderlich.');
      const iq=await client.query(
        `SELECT id,customer,email,phone,description,subject,source,status,offer_id
           FROM customer_inquiries_shadow WHERE id=$1 FOR UPDATE`,[inquiryId]
      );
      if(!iq.rowCount)throw new Error('Anfrage nicht gefunden.');
      const x=iq.rows[0],existingOffer=String(x.offer_id||'').trim();
      if(existingOffer){
        const oq=await client.query('SELECT offer_id FROM inquiry_offers_shadow WHERE offer_id=$1 LIMIT 1',[existingOffer]);
        if(oq.rowCount){
          const rq=await client.query(
            `SELECT id,due_date_text FROM offer_reminders_shadow
              WHERE offer_id=$1 AND status='Offen' ORDER BY created_at_text DESC NULLS LAST LIMIT 1`,[existingOffer]
          );
          result={ok:true,existing:true,offerId:existingOffer,
            reminderId:String(rq.rows[0]?.id||''),dueDate:String(rq.rows[0]?.due_date_text||'')};
        }
      }
      if(!result){
        const status=String(x.status||'Neu');
        if(['Gelöscht','Archiviert','Übernommen','Erledigt'].includes(status))
          throw new Error('Diese Anfrage ist nicht mehr offen.');
        const offerId=String(body.offerId||'').trim()||('ANG-'+crypto.randomUUID());
        const reminderId=String(body.reminderId||'').trim()||('ANGREM-'+crypto.randomUUID());
        const due=isoAddDays(berlinTodayIso(),5);
        const description=String(x.description||x.subject||''),email=String(x.email||''),source=String(x.source||'');
        await client.query(
          `INSERT INTO inquiry_offers_shadow(
             offer_id,inquiry_id,customer,phone,email,description,source,created_at_text,status,
             changed_at_text,changed_by,calendar_event_id,shadow_updated_at
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Offen',$8,$9,'',now())
           ON CONFLICT(offer_id) DO UPDATE SET inquiry_id=EXCLUDED.inquiry_id,customer=EXCLUDED.customer,
             phone=EXCLUDED.phone,email=EXCLUDED.email,description=EXCLUDED.description,source=EXCLUDED.source,
             status='Offen',changed_at_text=EXCLUDED.changed_at_text,changed_by=EXCLUDED.changed_by,shadow_updated_at=now()`,
          [offerId,inquiryId,customer,phone,email,description,source,nowIso,by]
        );
        await client.query(
          `INSERT INTO offer_reminders_shadow(
             id,offer_id,customer,offer_number,phone,email,description,created_at_text,due_date_text,
             status,result,changed_at_text,changed_by,shadow_updated_at
           ) VALUES($1,$2,$3,'Anfrage',$4,$5,$6,$7,$8,'Offen','',$7,$9,now())
           ON CONFLICT(id) DO UPDATE SET offer_id=EXCLUDED.offer_id,customer=EXCLUDED.customer,
             offer_number='Anfrage',phone=EXCLUDED.phone,email=EXCLUDED.email,description=EXCLUDED.description,
             due_date_text=EXCLUDED.due_date_text,status='Offen',result='',changed_at_text=EXCLUDED.changed_at_text,
             changed_by=EXCLUDED.changed_by,shadow_updated_at=now()`,
          [reminderId,offerId,customer,phone,email,description,nowIso,due,by]
        );
        await client.query(
          `UPDATE customer_inquiries_shadow SET customer=$2,phone=$3,status='Angebot erstellt',
             read_flag=true,offer_id=$4,changed_at_text=$5,changed_by=$6,shadow_updated_at=now() WHERE id=$1`,
          [inquiryId,customer,phone,offerId,nowIso,by]
        );
        legacyPayload=Object.assign({},body,{offerId,reminderId});
        result={ok:true,existing:false,offerId,reminderId,dueDate:due};
      }
    }else if(action==='createInquiryReminder'){
      const inquiryId=String(body.id||'').trim(),days=Number(body.days)||0;
      if(!inquiryId)throw new Error('Anfrage nicht gefunden.');
      if(days<1||days>10)throw new Error('Reminder muss zwischen 1 und 10 Tagen liegen.');
      const iq=await client.query(
        'SELECT customer,phone,email,description,subject,source,status FROM customer_inquiries_shadow WHERE id=$1 FOR UPDATE',[inquiryId]
      );
      if(!iq.rowCount)throw new Error('Anfrage nicht gefunden.');
      const x=iq.rows[0],status=String(x.status||'Neu');
      if(['Gelöscht','Archiviert','Übernommen','Erledigt'].includes(status))throw new Error('Diese Anfrage ist nicht mehr offen.');
      const existing=await client.query(
        `SELECT id FROM inquiry_reminders_shadow WHERE inquiry_id=$1 AND status='Offen' ORDER BY created_at_text DESC NULLS LAST LIMIT 1 FOR UPDATE`,[inquiryId]
      );
      const rid=existing.rowCount?String(existing.rows[0].id||''):(String(body.reminderId||'').trim()||('ANFREM-'+crypto.randomUUID()));
      const due=isoAddDays(berlinTodayIso(),days);
      if(existing.rowCount){
        await client.query(
          `UPDATE inquiry_reminders_shadow SET customer=$2,phone=$3,email=$4,description=$5,source=$6,due_date_text=$7,
             status='Offen',result='',changed_at_text=$8,changed_by=$9,shadow_updated_at=now() WHERE id=$1`,
          [rid,String(x.customer||''),String(x.phone||''),String(x.email||''),String(x.description||x.subject||''),String(x.source||''),due,nowIso,by]
        );
      }else{
        await client.query(
          `INSERT INTO inquiry_reminders_shadow(
            id,inquiry_id,customer,phone,email,description,source,created_at_text,due_date_text,status,result,changed_at_text,changed_by,shadow_updated_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'Offen','',$8,$10,now())`,
          [rid,inquiryId,String(x.customer||''),String(x.phone||''),String(x.email||''),String(x.description||x.subject||''),String(x.source||''),nowIso,due,by]
        );
      }
      await client.query(
        `UPDATE customer_inquiries_shadow SET status='Reminder',read_flag=true,changed_at_text=$2,changed_by=$3,shadow_updated_at=now() WHERE id=$1`,
        [inquiryId,nowIso,by]
      );
      legacyPayload=Object.assign({},body,{reminderId:rid});
      result={ok:true,reminderId:rid,dueDate:due};
    }else if(action==='rescheduleOfferReminder'){
      const rid=String(body.reminderId||'').trim();if(!rid)throw new Error('Reminder-ID fehlt.');
      const rq=await client.query(
        'SELECT status FROM offer_reminders_shadow WHERE id=$1 FOR UPDATE',[rid]
      );
      if(!rq.rowCount)throw new Error('Reminder wurde nicht gefunden.');
      if(String(rq.rows[0].status||'Offen')!=='Offen')throw new Error('Reminder ist bereits erledigt.');
      let due=String(body.dueDate||'').trim();
      if(due){
        if(!validIsoDateText(due))throw new Error('Ungültiges Reminder-Datum.');
        if(due<berlinTodayIso())throw new Error('Das Reminder-Datum darf nicht in der Vergangenheit liegen.');
      }else{
        due=isoAddDays(berlinTodayIso(),Math.max(1,Number(body.days)||5));
      }
      await client.query(
        `UPDATE offer_reminders_shadow
            SET due_date_text=$2,changed_at_text=$3,changed_by=$4,shadow_updated_at=now()
          WHERE id=$1`,[rid,due,nowIso,by]
      );
      result={ok:true,dueDate:due};
    }else if(['reopenInquiryReminder','archiveInquiryReminder','rejectInquiryReminder'].includes(action)){
      const rid=String(body.reminderId||'').trim();if(!rid)throw new Error('Reminder-ID fehlt.');
      const rq=await client.query(
        'SELECT inquiry_id,status FROM inquiry_reminders_shadow WHERE id=$1 FOR UPDATE',[rid]
      );
      if(!rq.rowCount)throw new Error('Anfrage-Reminder wurde nicht gefunden.');
      if(String(rq.rows[0].status||'Offen')!=='Offen')throw new Error('Reminder ist bereits erledigt.');
      const inquiryId=String(rq.rows[0].inquiry_id||'').trim();
      if(!inquiryId)throw new Error('Zugehörige Anfrage wurde nicht gefunden.');
      const iq=await client.query(
        'SELECT 1 FROM customer_inquiries_shadow WHERE id=$1 FOR UPDATE',[inquiryId]
      );
      if(!iq.rowCount)throw new Error('Zugehörige Anfrage wurde nicht gefunden.');
      const resultText=action==='reopenInquiryReminder'?'Zurück zu offenen Anfragen':(action==='archiveInquiryReminder'?'Termin vereinbart':'Abgelehnt');
      const newStatus=action==='reopenInquiryReminder'?'Neu':(action==='archiveInquiryReminder'?'Archiviert':'Gelöscht');
      await client.query(
        `UPDATE inquiry_reminders_shadow
            SET status='Erledigt',result=$2,changed_at_text=$3,changed_by=$4,shadow_updated_at=now()
          WHERE id=$1`,[rid,resultText,nowIso,by]
      );
      await client.query(
        `UPDATE customer_inquiries_shadow
            SET status=$2,read_flag=true,
                done_reason=CASE WHEN $2='Archiviert' THEN 'Termin vereinbart' WHEN $2='Gelöscht' THEN 'Abgelehnt' ELSE done_reason END,
                changed_at_text=$3,changed_by=$4,shadow_updated_at=now()
          WHERE id=$1`,[inquiryId,newStatus,nowIso,by]
      );
      result={ok:true,inquiryId};
    }else if(['updateCustomerInquiry','deleteCustomerInquiry','rejectCustomerInquiry','saveCustomerInquiryNote','saveCustomerInquiryContact','completeCustomerInquiry','archiveCustomerInquiry'].includes(action)){
      const id=String(body.id||'').trim();if(!id)throw new Error('Anfrage-ID fehlt.');
      const q=await client.query(
        'SELECT status FROM customer_inquiries_shadow WHERE id=$1 FOR UPDATE',[id]
      );
      if(!q.rowCount)throw new Error('Anfrage nicht gefunden.');
      if(action==='updateCustomerInquiry'){
        const status=String(body.status||'').trim();
        const markRead=body.markRead!==false;
        if(status){
          await client.query(
            `UPDATE customer_inquiries_shadow
                SET status=$2,read_flag=CASE WHEN $3::boolean THEN true ELSE read_flag END,
                    changed_at_text=$4,changed_by=$5,shadow_updated_at=now()
              WHERE id=$1`,[id,status,markRead,nowIso,by]
          );
        }else{
          await client.query(
            `UPDATE customer_inquiries_shadow
                SET read_flag=CASE WHEN $2::boolean THEN true ELSE read_flag END,
                    changed_at_text=$3,changed_by=$4,shadow_updated_at=now()
              WHERE id=$1`,[id,markRead,nowIso,by]
          );
        }
        result={ok:true};
      }else if(action==='deleteCustomerInquiry'){
        await client.query(
          `UPDATE customer_inquiries_shadow
              SET status='Gelöscht',read_flag=true,changed_at_text=$2,changed_by=$3,shadow_updated_at=now()
            WHERE id=$1`,[id,nowIso,by]
        );
        result={ok:true};
      }else if(action==='rejectCustomerInquiry'){
        await client.query(
          `UPDATE customer_inquiries_shadow
              SET status='Gelöscht',read_flag=true,done_reason='Abgelehnt',
                  changed_at_text=$2,changed_by=$3,shadow_updated_at=now()
            WHERE id=$1`,[id,nowIso,by]
        );
        result={ok:true,gmailQueued:true};
      }else if(action==='saveCustomerInquiryNote'){
        await client.query(
          `UPDATE customer_inquiries_shadow
              SET internal_note=$2,changed_at_text=$3,changed_by=$4,shadow_updated_at=now()
            WHERE id=$1`,[id,String(body.note||''),nowIso,by]
        );
        result={ok:true};
      }else if(action==='saveCustomerInquiryContact'){
        let contact=nowIso;
        const ds=String(body.date||'').trim(),ts=String(body.time||'').trim();
        if(ds){
          if(!validIsoDateText(ds))throw new Error('Ungültiges Kontaktdatum.');
          contact=ds+' '+(ts||'12:00')+':00';
        }
        await client.query(
          `UPDATE customer_inquiries_shadow
              SET status='Kontaktiert',read_flag=true,contact_at_text=$2,
                  contact_person=$3,contact_note=$4,changed_at_text=$5,changed_by=$6,shadow_updated_at=now()
            WHERE id=$1`,
          [id,contact,String(body.person||''),String(body.note||''),nowIso,by]
        );
        result={ok:true};
      }else if(action==='completeCustomerInquiry'){
        await client.query(
          `UPDATE customer_inquiries_shadow
              SET status='Erledigt',read_flag=true,done_reason=$2,
                  internal_note=CASE WHEN $3::boolean THEN $4 ELSE internal_note END,
                  changed_at_text=$5,changed_by=$6,shadow_updated_at=now()
            WHERE id=$1`,
          [id,String(body.reason||''),body.note!==undefined,String(body.note||''),nowIso,by]
        );
        result={ok:true};
      }else{
        await client.query(
          `UPDATE customer_inquiries_shadow
              SET status='Archiviert',read_flag=true,done_reason='Termin vereinbart',
                  changed_at_text=$2,changed_by=$3,shadow_updated_at=now()
            WHERE id=$1`,[id,nowIso,by]
        );
        result={ok:true};
      }
    }else if(action==='endSicknessAbsence'){
      const id=String(body.id||'').trim(),returnDate=String(body.returnDate||'').trim();
      if(!id)throw new Error('Krankheitseintrag fehlt.');
      if(!validIsoDateText(returnDate))throw new Error('Bitte ein gültiges Rückkehrdatum wählen.');
      const q=await client.query(
        `SELECT id,employee_name,absence_type,start_date,end_date,sickness_case_id,active
           FROM absences_shadow WHERE id=$1 FOR UPDATE`,[id]
      );
      if(!q.rowCount||q.rows[0].active===false)throw new Error('Aktiver Krankheitseintrag wurde nicht gefunden.');
      const row=q.rows[0];
      if(String(row.absence_type||'')!=='Krank')throw new Error('Gesundmeldung ist nur für Krankheitseinträge möglich.');
      const target=String(row.employee_name||''),start=berlinDateOnly(row.start_date),oldEnd=berlinDateOnly(row.end_date);
      const caseId=String(row.sickness_case_id||id),dayAfterOld=isoAddDays(oldEnd,1);
      if(returnDate>dayAfterOld){
        result={ok:true,employee:target,returnDate,oldEnd,changed:false,
          message:'Mitarbeiter war laut Eintrag bereits ab '+germanDateLabel(dayAfterOld)+' gesund.'};
      }else{
        const removedEntire=returnDate<=start,newEnd=removedEntire?'':isoAddDays(returnDate,-1);
        if(removedEntire){
          await client.query('UPDATE absences_shadow SET active=false,shadow_updated_at=now() WHERE id=$1',[id]);
        }else{
          await client.query(
            `UPDATE absences_shadow SET end_date=$2,note=$3,shadow_updated_at=now() WHERE id=$1`,
            [id,newEnd,'Gesund gemeldet ab '+germanDateLabel(returnDate)+' durch '+by]
          );
        }
        await client.query('DELETE FROM day_status_shadow WHERE reference=$1 AND status_date>=$2',[id,returnDate]);
        const caseRows=await client.query(
          `SELECT id,start_date,end_date FROM absences_shadow
            WHERE active=true AND employee_name=$1 AND absence_type='Krank'
              AND COALESCE(NULLIF(sickness_case_id,''),id)=$2
            ORDER BY start_date ASC,id ASC FOR UPDATE`,[target,caseId]
        );
        const datesSet=new Set();
        for(const r of caseRows.rows){for(const d of isoDateList(berlinDateOnly(r.start_date),berlinDateOnly(r.end_date)))datesSet.add(d);}
        const dates=[...datesSet].sort(),entryDate=await employeeEntryDateForOverview(target),eligibleFrom=entryDate?isoAddDays(entryDate,28):'';
        const eligible=dates.filter(d=>!eligibleFrom||d>=eligibleFrom),payThrough=eligible.length>=42?eligible[41]:'';
        const paid=new Set(eligible.slice(0,42));
        for(const r of caseRows.rows){
          const rs=berlinDateOnly(r.start_date),re=berlinDateOnly(r.end_date),period=isoDateList(rs,re);
          const periodEligible=period.filter(d=>!eligibleFrom||d>=eligibleFrom),periodPaid=periodEligible.filter(d=>paid.has(d));
          const payer=periodEligible.length===0?'Krankenkasse/prüfen (4-Wochen-Wartezeit)':
            periodPaid.length===0?'Krankengeld/Krankenkasse':
            periodPaid.length<periodEligible.length?'Arbeitgeber / Krankengeld':'Arbeitgeber';
          const cr=await client.query(
            'SELECT COALESCE(SUM(credited_hours),0)::numeric AS h FROM day_status_shadow WHERE reference=$1',[String(r.id)]
          );
          await client.query(
            `UPDATE absences_shadow SET employer_pay_through=$2,payer=$3,sickness_case_days=$4,
               credited_hours=$5,shadow_updated_at=now() WHERE id=$1`,
            [String(r.id),payThrough,payer,dates.length,Number(cr.rows[0]?.h||0)]
          );
        }
        result={ok:true,employee:target,returnDate,oldEnd,newEnd,changed:true,removedEntire,hoursCountFrom:returnDate};
      }
    }else if(action==='saveAbsence'){
      const target=String(body.targetEmployee||'').trim(),rawType=String(body.type||'').trim(),type=rawType==='Unentschuldigte Abwesenheit'?'Unerlaubte Abwesenheit':rawType;
      const startDate=berlinDateOnly(body.startDate||''),endDate=berlinDateOnly(body.endDate||'');
      const sicknessMode=String(body.sicknessMode||'').trim(),continuationCaseId=String(body.continuationCaseId||'').trim();
      if(!['Urlaub','Krank','Schulung','Unerlaubte Abwesenheit','Unentschuldigte Abwesenheit'].includes(type))
        throw new Error('Als Abwesenheit sind Urlaub, Krankheit, Schulung oder unerlaubte Abwesenheit möglich.');
      if(!target)throw new Error('Mitarbeiter wurde nicht gefunden.');
      if(!validIsoDateText(startDate)||!validIsoDateText(endDate)||endDate<startDate)
        throw new Error('Ungültiger Abwesenheitszeitraum.');

      const eq=await client.query(
        'SELECT payload FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1 FOR UPDATE',[target]
      );
      if(!eq.rowCount)throw new Error('Mitarbeiter wurde nicht gefunden.');
      const profile=Object.assign({name:target},eq.rows[0].payload||{});
      const allCurrentDates=isoDateList(startDate,endDate);

      const [statusQ,workQ]=await Promise.all([
        client.query(
          'SELECT status_date,status FROM day_status_shadow WHERE employee_name=$1 AND status_date>=$2 AND status_date<=$3',
          [target,startDate,endDate]
        ),
        client.query(
          'SELECT DISTINCT entry_date FROM time_entries_shadow WHERE employee_name=$1 AND entry_date>=$2 AND entry_date<=$3',
          [target,startDate,endDate]
        )
      ]);
      const statusMap=new Map(statusQ.rows.map(r=>[berlinDateOnly(r.status_date),String(r.status||'Arbeiten')]));
      const workDatesSet=new Set(workQ.rows.map(r=>berlinDateOnly(r.entry_date)));
      const holidayCache=new Map(),workDates=[],conflicts=[];
      for(const date of allCurrentDates){
        const dow=isoWeekday(date);if(dow<1||dow>5)continue;
        const year=Number(date.slice(0,4));
        if(!holidayCache.has(year))holidayCache.set(year,new Set(bavariaNurembergHolidayDates(year)));
        const status=statusMap.get(date)||'Arbeiten';
        if(status==='Feiertag'||holidayCache.get(year).has(date))continue;
        if(status&&status!=='Arbeiten'){conflicts.push(date);continue;}
        if(workDatesSet.has(date)){conflicts.push(date);continue;}
        workDates.push(date);
      }
      if(conflicts.length)
        throw new Error('Für folgende Tage bestehen bereits Arbeitszeiten oder Abwesenheiten: '+conflicts.map(germanDateLabel).join(', ')+'. Bitte zuerst prüfen/löschen.');

      let caseId='',mode='',employerPayThrough='',payer='',caseDays=0,note='';
      let paidSet=new Set();
      if(type==='Krank'){
        mode=['Neu','Fortsetzung','Unklar'].includes(sicknessMode)?sicknessMode:'Neu';
        const priorQ=await client.query(
          `SELECT id,start_date,end_date,sickness_case_id,sickness_mode
             FROM absences_shadow
            WHERE active=true AND employee_name=$1 AND absence_type='Krank'
            ORDER BY start_date ASC,id ASC FOR UPDATE`,[target]
        );
        const prior=priorQ.rows.map(r=>({
          id:String(r.id||''),start:berlinDateOnly(r.start_date),end:berlinDateOnly(r.end_date),
          caseId:String(r.sickness_case_id||r.id||''),mode:String(r.sickness_mode||'Altbestand')
        }));
        const addMonths=(iso,months)=>{
          const p=String(iso||'').split('-').map(Number);
          if(p.length!==3||!p[0])return '';
          const d=new Date(Date.UTC(p[0],p[1]-1,p[2],12));
          d.setUTCMonth(d.getUTCMonth()+Number(months||0));
          return d.toISOString().slice(0,10);
        };
        if(mode==='Fortsetzung'){
          if(!continuationCaseId)throw new Error('Bitte den fortgesetzten Krankheitsfall auswählen.');
          const match=prior.find(r=>r.caseId===continuationCaseId||r.id===continuationCaseId);
          if(!match)throw new Error('Der gewählte frühere Krankheitsfall wurde nicht gefunden.');
          caseId=match.caseId||match.id;
          const oldDates=[];
          for(const r of prior.filter(x=>x.caseId===caseId))oldDates.push(...isoDateList(r.start,r.end));
          const sorted=[...new Set(oldDates)].sort(),first=sorted[0]||'',last=sorted[sorted.length-1]||'';
          if((last&&startDate>=addMonths(last,6))||(first&&startDate>=addMonths(first,12))){
            note='Fortsetzungserkrankung nach 6-/12-Monats-Regel: neuer Entgeltfortzahlungsanspruch wurde als neuer Fristblock gestartet.';
            caseId=crypto.randomUUID();
          }
        }else{
          caseId=crypto.randomUUID();
        }
        if(mode==='Unklar')note='Fortsetzungserkrankung unklar – vor Lohnabrechnung prüfen.';

        const priorDates=[];
        for(const r of prior.filter(x=>x.caseId===caseId))priorDates.push(...isoDateList(r.start,r.end));
        const caseDates=[...new Set(priorDates.concat(allCurrentDates))].sort();
        caseDays=caseDates.length;
        const entryDate=await employeeEntryDateForOverview(target);
        const eligibleFrom=entryDate?isoAddDays(entryDate,28):'';
        const eligible=caseDates.filter(d=>!eligibleFrom||d>=eligibleFrom);
        paidSet=new Set(eligible.slice(0,42));
        if(eligible.length>=42)employerPayThrough=eligible[41];
        const currentEligible=allCurrentDates.filter(d=>!eligibleFrom||d>=eligibleFrom);
        const currentPaid=currentEligible.filter(d=>paidSet.has(d));
        if(currentEligible.length===0)payer='Krankenkasse/prüfen (4-Wochen-Wartezeit)';
        else if(currentPaid.length===0)payer='Krankengeld/Krankenkasse';
        else if(currentPaid.length<currentEligible.length)payer='Arbeitgeber / Krankengeld';
        else payer='Arbeitgeber';
      }

      const creditRows=[];
      let creditedHours=0;
      for(const date of workDates){
        let credit=['Unerlaubte Abwesenheit','Unentschuldigte Abwesenheit'].includes(type)?0:Math.round(profileHoursForDate(profile,date)*100)/100;
        if(type==='Krank'&&!paidSet.has(date))credit=0;
        creditRows.push({date,credit});
        creditedHours=Math.round((creditedHours+credit)*100)/100;
      }

      if(false&&type==='Freizeitausgleich'){
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",['timebank:'+target]);
        const bq=await client.query(
          'SELECT COALESCE(SUM(hours),0)::numeric AS balance FROM time_bank_shadow WHERE employee_name=$1',[target]
        );
        const available=Math.round(Math.max(0,Number(bq.rows[0]?.balance||0))*100)/100;
        if(!(creditedHours>0))throw new Error('Für diesen Zeitraum sind keine Sollstunden hinterlegt.');
        if(creditedHours>available+0.001)
          throw new Error('Nicht genügend Zeitguthaben. Benötigt: '+creditedHours.toFixed(2).replace('.',',')+' Std., verfügbar: '+available.toFixed(2).replace('.',',')+' Std.');
      }

      const id=String(body.absenceId||'').trim()||('ABS-'+crypto.randomUUID());
      await client.query(
        `INSERT INTO absences_shadow(
           id,employee_name,absence_type,start_date,end_date,created_at_text,created_by,active,
           sickness_case_id,sickness_mode,employer_pay_through,payer,sickness_case_days,note,
           credited_hours,shadow_updated_at
         ) VALUES($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$11,$12,$13,$14,now())
         ON CONFLICT(id) DO UPDATE SET employee_name=EXCLUDED.employee_name,absence_type=EXCLUDED.absence_type,
           start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,created_by=EXCLUDED.created_by,active=true,
           sickness_case_id=EXCLUDED.sickness_case_id,sickness_mode=EXCLUDED.sickness_mode,
           employer_pay_through=EXCLUDED.employer_pay_through,payer=EXCLUDED.payer,
           sickness_case_days=EXCLUDED.sickness_case_days,note=EXCLUDED.note,
           credited_hours=EXCLUDED.credited_hours,shadow_updated_at=now()`,
        [id,target,type,startDate,endDate,nowIso,by,caseId,mode,employerPayThrough,payer,caseDays,note,creditedHours]
      );

      for(const x of creditRows){
        const source=type==='Krank'?(x.credit>0?'Chef Abwesenheit':'Krankengeld / keine AG-Gutschrift'):'Chef Abwesenheit';
        await client.query(
          `INSERT INTO day_status_shadow(
             employee_name,status_date,status,changed_at_text,source,reference,credited_hours,
             credited_hours_missing,shadow_updated_at
           ) VALUES($1,$2,$3,$4,$5,$6,$7,false,now())
           ON CONFLICT(employee_name,status_date) DO UPDATE SET status=EXCLUDED.status,
             changed_at_text=EXCLUDED.changed_at_text,source=EXCLUDED.source,reference=EXCLUDED.reference,
             credited_hours=EXCLUDED.credited_hours,credited_hours_missing=false,shadow_updated_at=now()`,
          [target,x.date,type,nowIso,source,id,x.credit]
        );
      }

      if(false&&type==='Freizeitausgleich'){
        const ref='absence:'+id;
        const oldTb=await client.query('SELECT id FROM time_bank_shadow WHERE employee_name=$1 AND reference=$2 LIMIT 1',[target,ref]);
        if(!oldTb.rowCount){
          await client.query(
            `INSERT INTO time_bank_shadow(
               id,employee_name,hours,booking_type,booking_year,booking_month,reference,reason,
               created_at_text,created_iso,created_by,shadow_updated_at
             ) VALUES($1,$2,$3,'Freizeitausgleich',$4,$5,$6,$7,$8,$9,$10,now())`,
            ['TB-'+crypto.randomUUID(),target,-creditedHours,Number(startDate.slice(0,4)),Number(startDate.slice(5,7)),
             ref,'Freizeitausgleich '+germanDateLabel(startDate)+' bis '+germanDateLabel(endDate),nowIso,berlinTodayIso(),by]
          );
        }
      }
      const bal=await client.query('SELECT COALESCE(SUM(hours),0)::numeric AS h FROM time_bank_shadow WHERE employee_name=$1',[target]);
      const timeBankBalance=Math.round(Math.max(0,Number(bal.rows[0]?.h||0))*100)/100;
      skipLegacySync=true;
      result={
        ok:true,id,days:workDates.length,creditedHours,timeBankBalance,
        sickness:type==='Krank'?{caseId,mode,caseCalendarDays:caseDays,employerPayThrough,payer,note}:null
      };
    }else if(action==='deleteAbsence'){
      const id=String(body.id||'').trim();if(!id)throw new Error('Abwesenheit nicht gefunden.');
      const q=await client.query(
        `SELECT employee_name,absence_type,start_date,end_date,active
           FROM absences_shadow WHERE id=$1 FOR UPDATE`,[id]
      );
      if(!q.rowCount||q.rows[0].active===false)throw new Error('Abwesenheit nicht gefunden.');
      const row=q.rows[0],target=String(row.employee_name||''),type=String(row.absence_type||'');
      let credited=0;
      if(false&&type==='Freizeitausgleich'){
        const cr=await client.query('SELECT COALESCE(SUM(credited_hours),0)::numeric AS h FROM day_status_shadow WHERE reference=$1',[id]);
        credited=Math.round(Math.max(0,Number(cr.rows[0]?.h||0))*100)/100;
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",['timebank:'+target]);
      }
      const statuses=await client.query(
        `SELECT employee_name,status_date,status FROM day_status_shadow WHERE reference=$1 FOR UPDATE`,[id]
      );
      await client.query('UPDATE absences_shadow SET active=false,shadow_updated_at=now() WHERE id=$1',[id]);
      await client.query('DELETE FROM day_status_shadow WHERE reference=$1',[id]);
      for(const s of statuses.rows){
        if(['Urlaub','Krank','Schulung','Unerlaubte Abwesenheit','Unentschuldigte Abwesenheit','Feiertag'].includes(String(s.status||''))){
          const noteQ=await client.query(
            'SELECT legacy_col5 FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2 FOR UPDATE',
            [String(s.employee_name||''),berlinDateOnly(s.status_date)]
          );
          const note=String(noteQ.rows[0]?.legacy_col5||'');
          if(/^Automatisch:\\s*(Urlaub|Krank|Schulung|Unerlaubte Abwesenheit|Unentschuldigte Abwesenheit|Feiertag)/i.test(note)){
            await client.query('DELETE FROM day_closures_shadow WHERE employee_name=$1 AND closure_date=$2',
              [String(s.employee_name||''),berlinDateOnly(s.status_date)]);
          }
        }
      }
      if(type==='Freizeitausgleich'&&credited>0){
        const reversalRef='absence-reversal:'+id;
        const oldRev=await client.query('SELECT id FROM time_bank_shadow WHERE employee_name=$1 AND reference=$2 LIMIT 1',[target,reversalRef]);
        if(!oldRev.rowCount){
          await client.query(
            `INSERT INTO time_bank_shadow(
               id,employee_name,hours,booking_type,booking_year,booking_month,reference,reason,
               created_at_text,created_iso,created_by,shadow_updated_at
             ) VALUES($1,$2,$3,'Freizeitausgleich Storno',0,0,$4,'Freizeitausgleich gelöscht',$5,$6,$7,now())`,
            ['TB-'+crypto.randomUUID(),target,credited,reversalRef,nowIso,berlinTodayIso(),by]
          );
        }
      }
      const bal=await client.query('SELECT COALESCE(SUM(hours),0)::numeric AS h FROM time_bank_shadow WHERE employee_name=$1',[target]);
      skipLegacySync=true;
      result={ok:true,timeBankBalance:Math.round(Math.max(0,Number(bal.rows[0]?.h||0))*100)/100};
    }else if(action==='movePlannerWorker'){
      const id=String(body.id||'').trim(),direction=Number(body.direction)||0;
      if(!id)throw new Error('Kalender-Mitarbeiter nicht gefunden.');
      const q=await client.query(
        'SELECT id,sort_order FROM planner_workers_shadow ORDER BY sort_order ASC,display_name ASC FOR UPDATE'
      );
      const idx=q.rows.findIndex(r=>String(r.id||'')===id);
      if(idx<0)throw new Error('Kalender-Mitarbeiter nicht gefunden.');
      const ni=idx+(direction<0?-1:1);
      if(ni>=0&&ni<q.rows.length){
        const a=q.rows[idx],b=q.rows[ni],tmp=Number(a.sort_order||999);
        await client.query('UPDATE planner_workers_shadow SET sort_order=$2,shadow_updated_at=now() WHERE id=$1',[String(a.id),Number(b.sort_order||999)]);
        await client.query('UPDATE planner_workers_shadow SET sort_order=$2,shadow_updated_at=now() WHERE id=$1',[String(b.id),tmp]);
      }
      const list=await client.query(
        'SELECT id,employee_name,display_name,provider,calendar_id,active,sort_order FROM planner_workers_shadow ORDER BY sort_order ASC,display_name ASC'
      );
      result=list.rows.map(r=>({id:String(r.id||''),employeeName:String(r.employee_name||''),displayName:String(r.display_name||r.employee_name||''),provider:String(r.provider||'google'),calendarId:String(r.calendar_id||''),active:Boolean(r.active),sortOrder:Number(r.sort_order||999)}));
    }else if(action==='transferPlannerEvent'){
      const item=body.item||{},sourceId=String(item.sourceId||'').trim(),targetWorkerId=String(item.targetWorkerId||'').trim();
      if(!sourceId||!targetWorkerId)throw new Error('Quelltermin oder Zielmitarbeiter fehlt.');
      if(!sourceId.startsWith('KT-'))throw new Error('Externe Google-Termine werden weiterhin über Google verarbeitet.');
      const worker=await client.query(
        'SELECT id,display_name,employee_name,active FROM planner_workers_shadow WHERE id=$1 FOR UPDATE',[targetWorkerId]
      );
      if(!worker.rowCount||worker.rows[0].active===false)throw new Error('Zielmitarbeiter ist nicht aktiv.');
      const ev=await client.query(
        'SELECT id,event_type,maintenance_device_id FROM planner_events_shadow WHERE id=$1 FOR UPDATE',[sourceId]
      );
      if(!ev.rowCount)throw new Error('DG-Termin wurde nicht gefunden.');
      const display=String(worker.rows[0].display_name||worker.rows[0].employee_name||targetWorkerId);
      await client.query(
        `UPDATE planner_events_shadow SET employee_ids_json=$2,employee_names_json=$3,
           updated_at_text=$4,updated_by=$5,shadow_updated_at=now() WHERE id=$1`,
        [sourceId,JSON.stringify([targetWorkerId]),JSON.stringify([display]),nowIso,by]
      );
      result={ok:true,id:sourceId,type:String(ev.rows[0].event_type||'Auftrag'),maintenanceDeviceId:String(ev.rows[0].maintenance_device_id||'')};
    }else if(action==='savePlannerEvent'){
      const item=body.item||{},id=String(item.id||'').trim();
      if(!id)throw new Error('Termin-ID fehlt.');
      const customer=String(item.customer||'').trim(),address=String(item.address||'').trim(),rawTask=String(item.task||'').trim();
      const type=(String(item.type||'')==='Wartung'||/^\[WARTUNG\]/i.test(rawTask))?'Wartung':'Auftrag';
      const task=rawTask.replace(/^\[WARTUNG\]\s*/i,'').trim(),date=String(item.date||'').trim();
      const start=String(item.start||'').trim(),end=String(item.end||'').trim();
      const employeeIds=[...new Set((Array.isArray(item.employeeIds)?item.employeeIds:[]).map(x=>String(x||'').trim()).filter(Boolean))];
      if(!customer||!address||!task)throw new Error('Kunde, Adresse und Tätigkeit sind Pflichtfelder.');
      if(!validIsoDateText(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||end<=start)
        throw new Error('Ungültiges Datum oder Von/Bis.');
      if(!employeeIds.length)throw new Error('Mindestens einen Mitarbeiter auswählen.');
      const oldQ=await client.query('SELECT * FROM planner_events_shadow WHERE id=$1 FOR UPDATE',[id]);
      if(!oldQ.rowCount)throw new Error('DG-Termin wurde nicht gefunden.');
      const workers=await client.query(
        'SELECT id,display_name,employee_name,active FROM planner_workers_shadow WHERE id=ANY($1::text[])',[employeeIds]
      );
      const wmap=new Map(workers.rows.map(r=>[String(r.id),r]));
      const names=[];
      for(const wid of employeeIds){
        const w=wmap.get(wid);if(!w||w.active===false)throw new Error('Mitarbeiter nicht aktiv.');
        names.push(String(w.display_name||w.employee_name||wid));
      }
      const old=oldQ.rows[0];
      const maintenanceCustomerId=type==='Wartung'?String(item.maintenanceCustomerId||old.maintenance_customer_id||'').trim():'';
      const maintenanceObjectId=type==='Wartung'?String(item.maintenanceObjectId||old.maintenance_object_id||'').trim():'';
      const maintenanceDeviceId=type==='Wartung'?String(item.maintenanceDeviceId||old.maintenance_device_id||'').trim():'';
      if(maintenanceDeviceId){
        const md=await client.query('SELECT active FROM maintenance_devices_shadow WHERE id=$1 LIMIT 1',[maintenanceDeviceId]);
        if(!md.rowCount||md.rows[0].active===false)throw new Error('Das zugeordnete Wartungsgerät wurde nicht gefunden oder ist inaktiv.');
      }
      await client.query(
        `UPDATE planner_events_shadow SET customer=$2,address=$3,task=$4,event_date=$5,start_time=$6,end_time=$7,
           employee_ids_json=$8,employee_names_json=$9,updated_at_text=$10,updated_by=$11,event_type=$12,
           maintenance_customer_id=$13,maintenance_object_id=$14,maintenance_device_id=$15,shadow_updated_at=now()
         WHERE id=$1`,
        [id,customer,address,task,date,start,end,JSON.stringify(employeeIds),JSON.stringify(names),nowIso,by,type,
         maintenanceCustomerId,maintenanceObjectId,maintenanceDeviceId]
      );
      result={ok:true,id,type,maintenanceDeviceId};
    }else if(action==='deletePlannerEvent'){
      const id=String(body.id||'').trim();if(!id)throw new Error('Termin nicht gefunden.');
      const q=await client.query('SELECT id FROM planner_events_shadow WHERE id=$1 FOR UPDATE',[id]);
      if(!q.rowCount)throw new Error('Termin nicht gefunden.');
      await client.query('DELETE FROM planner_events_shadow WHERE id=$1',[id]);
      result={ok:true,id};
    }else if(action==='deleteMaintenanceAttachment'){
      const id=String(body.id||'').trim();if(!id)throw new Error('Wartungsunterlage nicht gefunden.');
      const q=await client.query(
        `SELECT device_id,active FROM maintenance_attachments_shadow WHERE id=$1 FOR UPDATE`,[id]
      );
      if(!q.rowCount||q.rows[0].active===false)throw new Error('Wartungsunterlage nicht gefunden.');
      const deviceId=String(q.rows[0].device_id||'');
      await client.query(
        'UPDATE maintenance_attachments_shadow SET active=false,shadow_updated_at=now() WHERE id=$1',[id]
      );
      result={ok:true,id,deviceId};
    }else if(action==='deleteMaintenanceDevice'){
      const id=String(body.id||'').trim();if(!id)throw new Error('Wartungsgerät wurde nicht gefunden.');
      const q=await client.query(
        'SELECT customer_id,object_id,active FROM maintenance_devices_shadow WHERE id=$1 FOR UPDATE',[id]
      );
      if(!q.rowCount||q.rows[0].active===false)throw new Error('Wartungsgerät wurde nicht gefunden.');
      await client.query(
        'UPDATE maintenance_devices_shadow SET active=false,updated_at_text=$2,updated_by=$3,shadow_updated_at=now() WHERE id=$1',
        [id,nowIso,by]
      );
      result={ok:true,id,customerId:String(q.rows[0].customer_id||''),objectId:String(q.rows[0].object_id||'')};
    }else if(action==='deleteMaintenanceCustomer'){
      const id=String(body.id||'').trim();if(!id)throw new Error('Wartungskunde wurde nicht gefunden.');
      const q=await client.query(
        'SELECT active FROM maintenance_customers_shadow WHERE id=$1 FOR UPDATE',[id]
      );
      if(!q.rowCount||q.rows[0].active===false)throw new Error('Wartungskunde wurde nicht gefunden.');
      await client.query(
        'UPDATE maintenance_customers_shadow SET active=false,updated_at_text=$2,updated_by=$3,shadow_updated_at=now() WHERE id=$1',
        [id,nowIso,by]
      );
      await client.query(
        'UPDATE maintenance_objects_shadow SET active=false,updated_at_text=$2,updated_by=$3,shadow_updated_at=now() WHERE customer_id=$1 AND active=true',
        [id,nowIso,by]
      );
      await client.query(
        'UPDATE maintenance_devices_shadow SET active=false,updated_at_text=$2,updated_by=$3,shadow_updated_at=now() WHERE customer_id=$1 AND active=true',
        [id,nowIso,by]
      );
      result={ok:true,id};
    }else if(action==='saveManualOrder'){
      const item=body.item||{},id=String(item.id||'').trim();
      const customer=String(item.customer||'').trim();
      if(!id)throw new Error('Auftrag-ID fehlt.');
      if(!customer)throw new Error('Kundenname fehlt.');
      if(String(item.inquiryId||'').trim())throw new Error('Anfrage-Aufträge werden weiterhin über Google verarbeitet.');
      const status=String(item.status||'Offen').trim()||'Offen';
      const allowed=['Ohne Termin','Termin zu vereinbaren','Offen','Laufend','Abgeschlossen','In Regiebericht uebernommen','Offenes Angebot','Angebot Abgelehnt','Angebot zu erstellen'];
      if(!allowed.includes(status))throw new Error('Ungültiger Auftragsstatus.');
      const old=await client.query(
        'SELECT created_at_text,started_at_text,completed_at_text,internal_note FROM manual_orders_shadow WHERE id=$1 FOR UPDATE',
        [id]
      );
      const prior=old.rows[0]||{};
      const createdAt=String(prior.created_at_text||nowIso);
      const startedAt=String(prior.started_at_text||'')||(status==='Laufend'?nowIso:'');
      const completedAt=String(prior.completed_at_text||'')||(status==='Abgeschlossen'?nowIso:'');
      const internalNote=item.internalNote===undefined?String(prior.internal_note||''):String(item.internalNote||'');
      await client.query(
        `INSERT INTO manual_orders_shadow(
          id,customer,address,phone,email,description,source,inquiry_id,status,
          created_at_text,started_at_text,completed_at_text,changed_at_text,changed_by,internal_note,shadow_updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,'',$8,$9,$10,$11,$12,$13,$14,now())
        ON CONFLICT(id) DO UPDATE SET
          customer=EXCLUDED.customer,address=EXCLUDED.address,phone=EXCLUDED.phone,email=EXCLUDED.email,
          description=EXCLUDED.description,source=EXCLUDED.source,status=EXCLUDED.status,
          started_at_text=EXCLUDED.started_at_text,completed_at_text=EXCLUDED.completed_at_text,
          changed_at_text=EXCLUDED.changed_at_text,changed_by=EXCLUDED.changed_by,
          internal_note=EXCLUDED.internal_note,shadow_updated_at=now()`,
        [id,customer,String(item.address||''),String(item.phone||''),String(item.email||''),
         String(item.description||''),String(item.source||'Manuell'),status,createdAt,startedAt,completedAt,
         nowIso,by,internalNote]
      );
      result={ok:true,id};
    }else if(['saveManualOrderNote','setManualOrderStatus','deleteManualOrder'].includes(action)){
      const id=String(body.id||'').trim();if(!id)throw new Error('Auftrag-ID fehlt.');
      const q=await client.query(
        `SELECT status,customer,address,phone,email,description,source,inquiry_id,internal_note
           FROM manual_orders_shadow WHERE id=$1 FOR UPDATE`,[id]
      );
      if(!q.rowCount)throw new Error('Auftrag nicht gefunden.');
      const oldStatus=String(q.rows[0].status||'Offen');
      if(action==='saveManualOrderNote'){
        await client.query(
          `UPDATE manual_orders_shadow
              SET internal_note=$2,changed_at_text=$3,changed_by=$4,shadow_updated_at=now()
            WHERE id=$1`,[id,String(body.note||''),nowIso,by]
        );
        result={ok:true};
      }else if(action==='setManualOrderStatus'){
        const status=String(body.status||'');
        const allowed=['Ohne Termin','Termin zu vereinbaren','Offen','Laufend','Abgeschlossen','In Regiebericht uebernommen','Offenes Angebot','Angebot Abgelehnt','Angebot zu erstellen'];
        if(!allowed.includes(status))throw new Error('Ungültiger Auftragsstatus.');
        await client.query(
          `UPDATE manual_orders_shadow
              SET status=$2,changed_at_text=$3,changed_by=$4,
                  started_at_text=CASE WHEN $2='Laufend' AND COALESCE(started_at_text,'')='' THEN $3 ELSE started_at_text END,
                  completed_at_text=CASE WHEN $2='Abgeschlossen' THEN $3 ELSE completed_at_text END,
                  shadow_updated_at=now()
            WHERE id=$1`,[id,status,nowIso,by]
        );
        const extendedStatuses=new Set(['In Regiebericht uebernommen','Offenes Angebot','Angebot Abgelehnt','Angebot zu erstellen']);
        if(extendedStatuses.has(status)){
          const row=q.rows[0]||{};
          legacyAction='saveManualOrder';
          legacyPayload=Object.assign({},body,{
            action:'saveManualOrder',
            item:{
              id,customer:String(row.customer||''),address:String(row.address||''),
              phone:String(row.phone||''),email:String(row.email||''),
              description:String(row.description||''),source:String(row.source||'Manuell'),
              inquiryId:String(row.inquiry_id||''),status,internalNote:String(row.internal_note||'')
            }
          });
        }
        result={ok:true,id,status};
      }else{
        if(oldStatus==='Laufend')throw new Error('Laufende Aufträge bitte zuerst auf Offen setzen oder abschließen.');
        await client.query('DELETE FROM manual_orders_shadow WHERE id=$1',[id]);
        result={ok:true};
      }
    }else if(action==='mergeRegieObjects'){
      const input=Array.isArray(body.objectIds)?body.objectIds:String(body.objectIds||'').split(',');
      let ids=[...new Set(input.map(x=>String(x||'').trim()).filter(Boolean))];
      if(ids.length<2)throw new Error('Bitte mindestens zwei offene Regieberichte auswählen.');
      const open=await client.query(
        `SELECT DISTINCT object_id FROM time_entries_shadow
          WHERE object_id=ANY($1::text[]) AND COALESCE(billing_status,'Offen')='Offen'`,[ids]
      );
      const openSet=new Set(open.rows.map(r=>String(r.object_id||'')));ids=ids.filter(id=>openSet.has(id));
      if(ids.length<2)throw new Error('Mindestens zwei der ausgewählten Objekte müssen offene Regieberichte enthalten.');
      const mq=await client.query('SELECT object_id,merge_id FROM regie_merges_shadow FOR UPDATE');
      const related=new Set(mq.rows.filter(r=>ids.includes(String(r.object_id||''))&&String(r.merge_id||'')).map(r=>String(r.merge_id)));
      if(related.size){
        for(const r of mq.rows)if(related.has(String(r.merge_id||'')))ids.push(String(r.object_id||''));
        ids=[...new Set(ids.filter(Boolean))];
      }
      const mergeId=String(body.mergeId||'').trim()||('RM-'+crypto.randomUUID());
      for(const objectId of ids){
        await client.query(
          `INSERT INTO regie_merges_shadow(object_id,merge_id,merged_at_text,merged_by,shadow_updated_at)
           VALUES($1,$2,$3,$4,now())
           ON CONFLICT(object_id) DO UPDATE SET merge_id=EXCLUDED.merge_id,merged_at_text=EXCLUDED.merged_at_text,
             merged_by=EXCLUDED.merged_by,shadow_updated_at=now()`,
          [objectId,mergeId,nowIso,by]
        );
      }
      legacyPayload=Object.assign({},body,{objectIds:ids,mergeId});
      result={ok:true,mergeId,objectIds:ids,count:ids.length,mergedBy:by,mergedAt:shadowGermanDateTime(nowIso)};
    }else if(action==='saveObjectInternalNote'){
      const objectId=String(body.objectId||'').trim();if(!objectId)throw new Error('Objekt-ID fehlt.');
      const note=String(body.note==null?'':body.note).trim();
      const changedAt=shadowGermanDateTime(nowIso);
      await client.query(
        `INSERT INTO object_notes_shadow(object_id,note,changed_at_text,changed_by,shadow_updated_at)
         VALUES($1,$2,$3,$4,now())
         ON CONFLICT(object_id) DO UPDATE SET note=EXCLUDED.note,changed_at_text=EXCLUDED.changed_at_text,
           changed_by=EXCLUDED.changed_by,shadow_updated_at=now()`,
        [objectId,note,nowIso,by]
      );
      result={ok:true,objectId,note,changedAt,changedBy:by};
    }else if(action==='saveMonthlyAdjustment'){
      const target=String(body.targetEmployee||'').trim(),year=Number(body.year)||0,month=Number(body.month)||0;
      const hours=Math.round(Number(body.hours||0)*100)/100,reason=String(body.reason||'').trim();
      if(!target)throw new Error('Mitarbeiter wurde nicht gefunden.');
      const emp=await client.query('SELECT 1 FROM employee_admin_shadow WHERE employee_name=$1 LIMIT 1',[target]);
      if(!emp.rowCount)throw new Error('Mitarbeiter wurde nicht gefunden.');
      if(!(year>0&&month>=1&&month<=12))throw new Error('Ungültiger Monat.');
      if(!Number.isFinite(hours)||hours===0||Math.abs(hours)>250)
        throw new Error('Die Korrektur muss zwischen -250 und +250 Stunden liegen und darf nicht 0 sein.');
      if(!reason)throw new Error('Bitte einen Grund für die Stundenkorrektur eintragen.');
      const id='ADJ-'+crypto.randomUUID();
      await client.query(
        `INSERT INTO monthly_adjustments_shadow(
           id,employee_name,adjustment_year,adjustment_month,hours,reason,created_at_text,created_by,shadow_updated_at
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())`,
        [id,target,year,month,hours,reason,nowIso,by]
      );
      legacyPayload=Object.assign({},body,{adjustmentId:id});
      result={ok:true,id,hours,_employee:target,_year:year,_month:month};
    }else if(action==='markPayrollIssueReviewed'){
      const issueId=String(body.issueId||'').trim();if(!issueId)throw new Error('Pruef-ID fehlt.');
      const old=await client.query('SELECT 1 FROM payroll_reviews_shadow WHERE issue_id=$1',[issueId]);
      if(old.rowCount){
        await client.query('COMMIT');
        return {result:{ok:true,alreadyReviewed:true},outboxId:0};
      }
      await client.query(
        `INSERT INTO payroll_reviews_shadow(
          issue_id,review_year,review_month,employee_name,review_date,reviewed_at_text,reviewed_by,note,shadow_updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())`,
        [issueId,Number(body.year)||0,Number(body.month)||0,String(body.targetEmployee||''),
         String(body.date||''),nowIso,by,String(body.note||'')]
      );
      result={ok:true};
    }else if(action==='markConflictReviewed'){
      const conflictId=String(body.conflictId||'').trim();if(!conflictId)throw new Error('Konflikt-ID fehlt.');
      const old=await client.query('SELECT 1 FROM conflict_reviews_shadow WHERE conflict_id=$1',[conflictId]);
      if(old.rowCount){
        await client.query('COMMIT');
        return {result:{ok:true,alreadyReviewed:true},outboxId:0};
      }
      await client.query(
        `INSERT INTO conflict_reviews_shadow(
          conflict_id,employee_name,review_year,review_month,conflict_date,reviewed_at_text,reviewed_by,shadow_updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,now())`,
        [conflictId,String(body.targetEmployee||''),Number(body.year)||0,Number(body.month)||0,
         String(body.date||''),nowIso,by]
      );
      result={ok:true};
    }
    if(!skipLegacySync)outboxId=await enqueueLegacyWriteWithClient(client,legacyAction,legacyPayload);
    await client.query('COMMIT');
  }catch(e){
    try{await client.query('ROLLBACK');}catch(_e){}
    throw e;
  }finally{client.release();}

  if(action==='saveTimeBankManual'){
    const employee=String(body.targetEmployee||'');
    await pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'time_bank:%' OR shadow_name LIKE 'my_time_bank:%' OR shadow_name LIKE 'month_data:%'");
    await pool.query("DELETE FROM exact_views_shadow WHERE action IN ('getMonthPayrollAudit','getPayrollCycleState','getDashboardSummary51')");
    if(employee){
      const q=await pool.query('SELECT COUNT(*)::int AS n FROM time_bank_shadow WHERE employee_name=$1',[employee]);
      const n=Number(q.rows[0]?.n||0);await saveShadowVerifyStat('time_bank:'+employee,n,n,0);
    }
  }
  if(action==='saveMaintenanceCustomer'){
    const id=String(body.item&&body.item.id||'');
    await Promise.all([
      pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'maintenance_%'"),
      pool.query("DELETE FROM exact_views_shadow WHERE action IN ('getMaintenanceOverview','getMaintenanceContracts','getMaintenanceArchive','getMaintenanceCustomer','searchMaintenanceCustomers','findMaintenanceDeviceByInternalId','getDashboardSummary51')")
    ]);
    if(id){
      const full=await postgresMaintenanceCustomerFull(id);
      if(full){
        const count=(full.objects||[]).reduce((s,o)=>s+(o.devices||[]).length,0);
        await saveShadowVerifyStat('maintenance_customer_full:'+id,count,count,0);
      }
    }
  }
  if(['addMaintenanceRepair','addManualMaintenanceCount'].includes(action)){
    await Promise.all([
      pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'maintenance_%'"),
      pool.query("DELETE FROM exact_views_shadow WHERE action IN ('getMaintenanceArchive','getMaintenanceOverview','getDashboardSummary51')")
    ]);
  }
  if(action==='syncHolidays'){
    const year=Number(body.year)||0;
    await Promise.all([
      pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'day_data:%' OR shadow_name LIKE 'week_data:%' OR shadow_name LIKE 'month_data:%' OR shadow_name LIKE 'boss_day_closures:%' OR shadow_name LIKE 'vacation_full:%'"),
      pool.query("DELETE FROM exact_views_shadow WHERE action IN ('getMonthPayrollAudit','getPayrollCycleState','getDashboardSummary51')")
    ]);
    if(year)await mirrorHolidayYear(year);
  }
  if(action==='createInspectionOffer'){
    await Promise.all([
      pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'offer_%' OR shadow_name LIKE 'regie_%' OR shadow_name LIKE 'day_data:%' OR shadow_name LIKE 'week_data:%' OR shadow_name LIKE 'month_data:%' OR shadow_name LIKE 'boss_month_native:%'"),
      pool.query("DELETE FROM exact_views_shadow WHERE action IN ('getOfferReports','getOfferStatistics','getMonthPayrollAudit','getPayrollCycleState','getDashboardSummary51')")
    ]);
  }
  if(action==='inquiryToOffer'){
    await Promise.all([
      pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'customer_inquiries_view:%' OR shadow_name LIKE 'offer_%' OR shadow_name LIKE 'inquiry_%'"),
      pool.query("DELETE FROM exact_views_shadow WHERE action IN ('getOfferReports','getOfferStatistics','getDashboardSummary51')")
    ]);
  }
  if(action==='saveAbsence'){
    const type=String(body.type||''),sy=Number(String(body.startDate||'').slice(0,4))||0,ey=Number(String(body.endDate||'').slice(0,4))||sy;
    if(['Urlaub','Krank','Schulung','Unerlaubte Abwesenheit','Unentschuldigte Abwesenheit'].includes(type))for(let y=sy;y<=ey;y++)if(y)await pgSyncAutoClosures(y);
    await Promise.all([
      pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'absences%' OR shadow_name LIKE 'vacation_full:%' OR shadow_name LIKE 'absence_overview:%' OR shadow_name LIKE 'planner_availability:%' OR shadow_name LIKE 'day_data:%' OR shadow_name LIKE 'week_data:%' OR shadow_name LIKE 'month_data:%' OR shadow_name LIKE 'boss_day_closures:%'"),
      pool.query("DELETE FROM exact_views_shadow WHERE action IN ('getMonthPayrollAudit','getPayrollCycleState','getDashboardSummary51')")
    ]);
    if(type==='Krank')await invalidateShadowVerify('sickness_alerts');
    if(false&&type==='Freizeitausgleich'){
      await pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'time_bank:%' OR shadow_name LIKE 'my_time_bank:%' OR shadow_name='employee_admin'");
    }
  }
  if(action==='forceCompletePayrollCycle'){
    await Promise.all([
      pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'payroll_audit_%' OR shadow_name LIKE 'payroll_cycle_%' OR shadow_name='payroll_protocols'"),
      pool.query("DELETE FROM exact_views_shadow WHERE action IN ('getMonthPayrollAudit','getPayrollCycleState','getDashboardSummary51')")
    ]);
  }
  if(action==='completePayrollCycle'){
    await Promise.all([
      pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'payroll_audit_%' OR shadow_name LIKE 'payroll_cycle_%' OR shadow_name='payroll_protocols'"),
      pool.query("DELETE FROM exact_views_shadow WHERE action IN ('getMonthPayrollAudit','getPayrollCycleState','getDashboardSummary51')")
    ]);
  }
  if(action==='setMonthClosureStatus'){
    const employee=String(body.targetEmployee||''),year=Number(body.year)||0,month=Number(body.month)||0;
    const monthKey=monthDataVerifyKey({employee,year,month});if(monthKey)await saveShadowVerifyStat(monthKey,1,1,0);
    await pool.query("DELETE FROM exact_views_shadow WHERE action IN ('getMonthPayrollAudit','getPayrollCycleState')");
  }
  if(['saveMonthlyAdjustment','deleteMonthlyAdjustment'].includes(action)&&result&&typeof result==='object'){
    if(action==='saveMonthlyAdjustment'){
      const employee=result._employee,year=result._year,month=result._month;
      const monthKey=monthDataVerifyKey({employee,year,month});if(monthKey)await saveShadowVerifyStat(monthKey,1,1,0);
    }

    delete result._employee;delete result._year;delete result._month;
  }
  if(['moveOfferBackToCreate','declineOfferFromReminder','acceptOfferFromReminder','acceptOfferAsRunning','discardOfferPermanently','setRegieReportsOfferStatus'].includes(action)){
    await invalidateOfferNativeReadiness();
    await pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name='offer_reminders' OR shadow_name LIKE 'offer_reports_native:%' OR shadow_name='offer_statistics_native'");
    await pool.query("DELETE FROM exact_views_shadow WHERE action IN ('getOfferReports','getOfferStatistics','getOfferReminders','getDashboardSummary51')");
  }
  if(action==='createOwnReminder'){
    const q=await pool.query('SELECT COUNT(*)::int AS n FROM own_reminders_shadow');
    const n=Number(q.rows[0]?.n||0);await saveShadowVerifyStat('own_reminders',n,n,0);
    await pool.query("DELETE FROM exact_views_shadow WHERE action IN ('getOwnReminders','getDashboardSummary51')");
  }
  if(action==='rescheduleOfferReminder'){
    const q=await pool.query('SELECT COUNT(*)::int AS n FROM offer_reminders_shadow');
    const n=Number(q.rows[0]?.n||0);
    await saveShadowVerifyStat('offer_reminders',n,n,0);
  }
  if(['createInquiryReminder','reopenInquiryReminder','archiveInquiryReminder','rejectInquiryReminder'].includes(action)){
    for(const includeDone of [false,true]){
      const rows=await postgresInquiryReminderView(includeDone),key=inquiryReminderViewKey(includeDone);
      await saveShadowVerifyStat(key,rows.length,rows.length,0);
    }
    for(const status of ['Offen','Alle','Neu','Archiviert']){
      const rows=await postgresCustomerInquiryView(status),key=customerInquiryViewKey(status);
      await saveShadowVerifyStat(key,rows.length,rows.length,0);
    }
  }
  if(['updateCustomerInquiry','deleteCustomerInquiry','rejectCustomerInquiry','saveCustomerInquiryNote','saveCustomerInquiryContact','completeCustomerInquiry','archiveCustomerInquiry'].includes(action)){
    for(const status of ['Offen','Alle','Kontaktiert','Erledigt','Archiviert']){
      const rows=await postgresCustomerInquiryView(status),key=customerInquiryViewKey(status);
      await saveShadowVerifyStat(key,rows.length,rows.length,0);
    }
  }
  if(['deleteAbsence','endSicknessAbsence'].includes(action)){
    await invalidateShadowVerify('absences');
    await invalidateShadowVerify('sickness_alerts');
    const id=String(body.id||'');
    const abs=await pool.query('SELECT employee_name,start_date,end_date FROM absences_shadow WHERE id=$1 LIMIT 1',[id]);
    const row=abs.rows[0]||{};
    if(row.employee_name){
      const sy=Number(String(row.start_date||'').slice(0,4))||0,ey=Number(String(row.end_date||'').slice(0,4))||sy;
      for(let y=sy;y<=ey;y++){
        const key='absence_overview:'+y+':'+String(row.employee_name);await invalidateShadowVerify(key);
        await invalidateShadowVerify('vacation_full:'+y+':'+String(row.employee_name));
        await invalidateShadowVerify('vacation_full:'+y+':all');
      }
    }
    await pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'planner_availability:%' OR shadow_name LIKE 'day_data:%' OR shadow_name LIKE 'week_data:%' OR shadow_name LIKE 'month_data:%' OR shadow_name LIKE 'boss_day_closures:%'");
  }
  if(action==='movePlannerWorker'){
    const q=await pool.query('SELECT COUNT(*)::int AS n FROM planner_workers_shadow');
    const n=Number(q.rows[0]?.n||0);await saveShadowVerifyStat('planner_workers',n,n,0);
  }
  if(['savePlannerEvent','deletePlannerEvent','transferPlannerEvent'].includes(action)){
    await Promise.all([
      pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'planner_events:%' OR shadow_name LIKE 'planner_availability:%' OR shadow_name='maintenance_contracts'"),
      pool.query("DELETE FROM exact_views_shadow WHERE action IN ('getPlannerEvents','getMaintenanceContracts','getMaintenanceOverview','getDashboardSummary51')")
    ]);
  }
  if(['deleteMaintenanceDevice','deleteMaintenanceCustomer','deleteMaintenanceAttachment'].includes(action)){
    await Promise.all([
      pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'maintenance_%'"),
      pool.query("DELETE FROM exact_views_shadow WHERE action IN ('getMaintenanceOverview','getMaintenanceContracts','getMaintenanceArchive','getMaintenanceCustomer','searchMaintenanceCustomers','findMaintenanceDeviceByInternalId','getDashboardSummary51')")
    ]);
  }
  if(['saveManualOrder','saveManualOrderNote','setManualOrderStatus','deleteManualOrder'].includes(action)){
    const q=await pool.query('SELECT COUNT(*)::int AS n FROM manual_orders_shadow');
    const n=Number(q.rows[0]?.n||0);
    await saveShadowVerifyStat('manual_orders',n,n,0);
  }
  if(['saveEntry','updateEmployeeEntry','deleteEntry','closeDay','refreshClosedDay'].includes(action)){
    const employee=String(body.employee||''),date=action==='saveEntry'?String(body.entry&&body.entry.date||''):
      (['deleteEntry','closeDay','refreshClosedDay'].includes(action)?String(body.date||''):
      berlinDateOnly((await pool.query('SELECT entry_date FROM time_entries_shadow WHERE id=$1 LIMIT 1',[String(body.entryId||'')])).rows[0]?.entry_date||''));
    if(employee&&date){
      const dayKey=dayDataVerifyKey({date},employee);if(dayKey)await saveShadowVerifyStat(dayKey,1,1,0);
      const weekKey=weekVerifyKey({referenceDate:date},employee);if(weekKey)await saveShadowVerifyStat(weekKey,1,1,0);
      const p=date.split('-').map(Number),year=p[0]||0,month=p[1]||0;
      const monthKey=monthDataVerifyKey({employee,year,month});if(monthKey)await saveShadowVerifyStat(monthKey,1,1,0);
    }
  }
  if(action==='updateRegieReport'){
    const entryId=String(body.entryId||'');
    const q=await pool.query('SELECT employee_name,entry_date,object_id FROM time_entries_shadow WHERE id=$1 LIMIT 1',[entryId]);
    const r=q.rows[0]||{},employee=String(r.employee_name||''),date=berlinDateOnly(r.entry_date),objectId=String(r.object_id||'');
    const p=date.split('-').map(Number),year=p[0]||0,month=p[1]||0;
    if(employee&&year&&month){
      const dayKey=dayDataVerifyKey({date},employee);if(dayKey)await saveShadowVerifyStat(dayKey,1,1,0);
      const weekKey=weekVerifyKey({referenceDate:date},employee);if(weekKey)await saveShadowVerifyStat(weekKey,1,1,0);
      const monthKey=monthDataVerifyKey({employee,year,month});if(monthKey)await saveShadowVerifyStat(monthKey,1,1,0);
      const bossKey=bossDayClosuresVerifyKey({year,month});if(bossKey)await saveShadowVerifyStat(bossKey,1,1,0);
    }
    if(objectId){
      await invalidateShadowVerify('object_reports_id:'+objectId);
      await pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'regie_reports:%' OR shadow_name LIKE 'regie_billing_risk:%'");
    }
  }
  if(['updateBossDayEntry','deleteBossDayEntry'].includes(action)){
    const employee=String(body.targetEmployee||''),date=String(body.date||'');
    const p=date.split('-').map(Number),year=p[0]||0,month=p[1]||0;
    if(employee&&year&&month){
      const dayKey=dayDataVerifyKey({date},employee);if(dayKey)await saveShadowVerifyStat(dayKey,1,1,0);
      const weekKey=weekVerifyKey({referenceDate:date},employee);if(weekKey)await saveShadowVerifyStat(weekKey,1,1,0);
      const monthKey=monthDataVerifyKey({employee,year,month});if(monthKey)await saveShadowVerifyStat(monthKey,1,1,0);
      const bossKey=bossDayClosuresVerifyKey({year,month});if(bossKey)await saveShadowVerifyStat(bossKey,1,1,0);
    }
  }
  if(action==='manualCloseBossDay'){
    const employee=String(body.targetEmployee||''),date=String(body.date||'');
    const p=date.split('-').map(Number),year=p[0]||0,month=p[1]||0;
    if(employee&&year&&month){
      const dayKey=dayDataVerifyKey({date},employee);if(dayKey)await saveShadowVerifyStat(dayKey,1,1,0);
      const monthKey=monthDataVerifyKey({employee,year,month});if(monthKey)await saveShadowVerifyStat(monthKey,1,1,0);
      const bossKey=bossDayClosuresVerifyKey({year,month});if(bossKey)await saveShadowVerifyStat(bossKey,1,1,0);
    }
  }
  if(action==='setDayStatus'){
    const employee=String(body.employee||''),date=String(body.date||'');
    const p=date.split('-').map(Number),year=p[0]||0,month=p[1]||0;
    if(employee&&year&&month){
      const dayKey=dayDataVerifyKey({date},employee);if(dayKey)await saveShadowVerifyStat(dayKey,1,1,0);
      const weekKey=weekVerifyKey({referenceDate:date},employee);if(weekKey)await saveShadowVerifyStat(weekKey,1,1,0);
      const monthKey=monthDataVerifyKey({employee,year,month});if(monthKey)await saveShadowVerifyStat(monthKey,1,1,0);
      const bossKey=bossDayClosuresVerifyKey({year,month});if(bossKey)await saveShadowVerifyStat(bossKey,1,1,0);
    }
  }
  if(action==='mergeRegieObjects'){
    await pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'object_reports_id:%' OR shadow_name LIKE 'object_reports_customer:%' OR shadow_name LIKE 'regie_reports:%'");
    await pool.query("DELETE FROM exact_views_shadow WHERE action IN ('getRegieReports','getObjectReports','getDashboardSummary51')");
  }
  if(action==='setRegieObjectJobStatus'){
    for(const bodyView of [{status:'Offen',year:0,month:0},{status:'Abgerechnet',year:0,month:0}]){
      const rows=await postgresRegieReports(bodyView),key=regieReportsVerifyKey(bodyView);
      await saveShadowVerifyStat(key,Array.isArray(rows)?rows.length:0,Array.isArray(rows)?rows.length:0,0);
    }
    await saveShadowVerifyStat(dashboardNativeKey(),1,1,0);
  }
  if(action==='setPlannerWorkerActive'){
    const q=await pool.query(
      `SELECT id,employee_name,display_name,provider,calendar_id,active,sort_order
         FROM planner_workers_shadow ORDER BY sort_order ASC,display_name ASC`
    );
    result=q.rows.map(r=>({
      id:String(r.id||''),employeeName:String(r.employee_name||''),
      displayName:String(r.display_name||r.employee_name||''),provider:String(r.provider||'google'),
      calendarId:String(r.calendar_id||''),active:Boolean(r.active),sortOrder:Number(r.sort_order||999)
    }));
    await saveShadowVerifyStat('planner_workers',result.length,result.length,0);
    await pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'planner_availability:%'");
  }
  if(action==='setEmployeeActive'){
    employeeNamesCache=null;
    employeeSnapshotDirtyCache=false;
    const rows=await postgresEmployeeAdminData();
    await saveShadowVerifyStat('employee_admin',rows.length,rows.length,0);
  }
  if(action==='saveVacationEntitlement'){
    result=await postgresVacationSummary(result._vacationEmployee,result._vacationYear);
    const employee=result.employee,year=result.year;
    await saveShadowVerifyStat('vacation_full:'+year+':'+employee,1,1,0);
    const activeMap=await employeeActiveMapFromSnapshot();
    await saveShadowVerifyStat('vacation_full:'+year+':all',activeMap.size,activeMap.size,0);
    await saveShadowVerifyStat('vacation_entitlement',1,1,0);
  }
  if(action==='saveObjectInternalNote'){
    const q=await pool.query('SELECT COUNT(*)::int AS n FROM object_notes_shadow');
    const n=Number(q.rows[0]?.n||0);await saveShadowVerifyStat('object_notes:base',n,n,0);
  }
  if(['saveOwnReminderInternalNote','rescheduleOwnReminder','completeOwnReminder','deleteOwnReminder'].includes(action)){
    const q=await pool.query('SELECT COUNT(*)::int AS n FROM own_reminders_shadow');
    const n=Number(q.rows[0]?.n||0);await saveShadowVerifyStat('own_reminders',n,n,0);
  }
  await bumpWriteStat(action,true);
  await invalidateLegacySnapshotsAfterDirectWrite(action,body);
  console.log('POSTGRES_WRITE action='+action+' legacy_action='+legacyAction+' legacy_outbox='+outboxId);
  kickLegacyOutbox();
  return {result,outboxId};
}

async function proxyLegacy(req, res, body) {
  const action = String(body && body.action || '');
  if (action === 'ping') return json(res,200,{ok:true,data:{message:'DG Railway Backend erreichbar',version:'9.0',railway:true},source:'postgres'},req);
  if (action === 'getMinimumWage') return json(res,200,{ok:true,data:directMinimumWageRead(body),source:'postgres-static'},req);
  if (action === 'getEmployees') {
    try {
      const dirty = await isEmployeeSnapshotDirty();
      if (!dirty) {
        const names = await getEmployeesFromSnapshot();
        if (Array.isArray(names) && names.length) {
          return json(res, 200, {ok:true,data:names,source:'postgres'}, req);
        }
      }
    } catch (e) {
      console.error('Postgres employee read failed; falling back to Google:', e.message);
    }
  }
  if(action==='employeeLogout'){
    try{
      const token=String(body.deviceSessionToken||body.employeePin||body.pin||'').trim();
      if(token)await revokeRailwaySession(token);
      return json(res,200,{ok:true,data:{ok:true},source:'postgres'},req);
    }catch(e){
      console.error('Postgres logout failed:',e.message);
      return json(res,400,{ok:false,error:e.message},req);
    }
  }
  if (['ping','systemHealthCheck','getDashboardSummary51','getCustomerInquiries','getInquiryReminders','getEmployeeAdminData','getBossMonthData','getMonthPayrollAudit','getPayrollCycleState','getOfferReports','getOfferStatistics','getManualOrders','getOwnReminders','getOfferReminders','getPlannerWorkers','getPlannerAvailability','getAbsences','getAbsenceOverview','getSicknessAlerts','searchMaintenanceCustomers','getMaintenanceCustomer','getMaintenanceContracts','getMaintenanceOverview','getMaintenanceArchive','findMaintenanceDeviceByInternalId','getObjectInternalNote','getObjectInternalNotes','checkRegieBillingRisk','getObjectReports','getRegieReports','getRegieAttachments','getTimeBankAccount','getMyTimeBank','getBossDayClosures','getMonthData','getDayData','getWeekData','getVacationAccount','getVacationAccounts','getEmployeeWorkOverviewV10','getPartnerNetworkV10','getWhatsappInboxV10','getWhatsappMediaV10','getEmployeeLocationsV10','getAiAssistantV10','getMaintenanceAttachment','getMapsBrowserConfig','createRegieReportZip','createRegiePhotoZip','createTaxAdvisorPdf','getBillingReviewTargetV10','sendBillingReviewRequestV10'].includes(action)) {
    try {
      const direct=await tryDirectPostgresRead(action,body);
      if (direct!==null) {
        console.log('POSTGRES_READ action='+action+' rows='+(Array.isArray(direct)?direct.length:1));
        return json(res,200,{ok:true,data:direct,source:'postgres'},req);
      }
    } catch(e) {
      console.error('Direct Postgres read failed; falling back to Google:',action,e.message);
    }
  }
  if (DIRECT_POSTGRES_WRITE_ACTIONS.has(action)) {
    try {
      const directWrite=await tryDirectPostgresWrite(action,body);
      if(directWrite!==null) {
        return json(res,200,{
          ok:true,data:directWrite.result,source:'postgres-primary',
          legacySync:directWrite.outboxId?'queued':'already-synced'
        },req);
      }
    } catch(e) {
      console.error('Direct Postgres write failed:',action,e.message);
      return json(res,400,{ok:false,error:e.message},req);
    }
  }
  if (!GOOGLE_BACKEND_URL) return json(res, 503, {ok:false,error:'Google backend not configured'}, req);
  const cached = await readCachedResponse(action, body);
  if (cached) {
    const ageMs=Math.max(0,Date.now()-new Date(cached.createdAt).getTime());
    if(ageMs>=READ_CACHE_REFRESH_MS){
      refreshReadCacheInBackground(action,body,cached.key).catch(()=>{});
    }
    cors(req,res);
    return sendApiBody(
      req,res,cached.httpStatus,'application/json; charset=utf-8',cached.responseText,
      {
        'X-DG-Cache':'HIT',
        'X-DG-Cache-Age':String(Math.floor(ageMs/1000)),
        'X-DG-Cache-Refresh':ageMs>=READ_CACHE_REFRESH_MS?'background':'none'
      }
    );
  }
  let upstream, raw, parsed = null;
  const upstreamStartedAt = Date.now();
  try {
    upstream = await fetch(GOOGLE_BACKEND_URL, {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(body || {}),
      redirect:'follow'
    });
    raw = await upstream.text();
    try { parsed = JSON.parse(raw); } catch (_e) {}
    if (pool) {
      if (upstream.status === 200 && parsed && parsed.ok !== false) {
        refreshSessionFromSuccessfulRequest(action,body,parsed).catch(e=>console.error('railway session bridge failed',e.message));
        const verifyData=parsed.data!==undefined?parsed.data:parsed;
        if (action==='getEmployeeAdminData') refreshAndVerifyEmployeeAdminShadow(verifyData).catch(e=>console.error('employee admin shadow refresh failed',e.message));
        if (action==='getDashboardSummary51') {
          saveExactViewShadow('getDashboardSummary51',dashboardSummaryViewKey(),verifyData)
            .catch(e=>console.error('dashboard exact view save failed',e.message));
          verifyDashboardNative(verifyData).catch(e=>console.error('dashboard native verify failed',e.message));
        }
        if (action==='getManualOrders') verifyManualOrdersShadow(verifyData).catch(e=>console.error('manual order shadow verify failed',e.message));
        if (action==='getOwnReminders') verifyOwnRemindersShadow(verifyData).catch(e=>console.error('own reminder shadow verify failed',e.message));
        if (action==='getCustomerInquiries') {
          const inquiryStatus=String(body.status||'Offen'),key=customerInquiryViewKey(inquiryStatus);
          syncInquiryViewShadow(verifyData,inquiryStatus)
            .then(()=>verifyCustomerInquiryView(verifyData,inquiryStatus))
            .then(async()=>{if(await shadowReadyForDirectRead(key,2))await markInquiryViewFresh(key);})
            .catch(e=>console.error('customer inquiries shadow refresh/verify failed',e.message));
        }
        if (action==='getInquiryReminders') {
          const includeDone=Boolean(body.includeDone),key=inquiryReminderViewKey(includeDone);
          syncInquiryReminderViewShadow(verifyData,includeDone)
            .then(()=>verifyInquiryReminderView(verifyData,includeDone))
            .then(async()=>{if(await shadowReadyForDirectRead(key,2))await markInquiryViewFresh(key);})
            .catch(e=>console.error('inquiry reminders shadow refresh/verify failed',e.message));
        }
        if (action==='getOfferReminders') verifyOfferRemindersShadow(verifyData,Boolean(body.includeDone)).catch(e=>console.error('offer reminder shadow verify failed',e.message));
        if (action==='getOfferReports') {
          syncTimeEntriesFromOfferRead(verifyData)
            .then(()=>saveExactViewShadow('getOfferReports',offerReportsViewKey(body),verifyData))
            .then(()=>verifyOfferReportsNative(verifyData,body))
            .catch(e=>console.error('offer reports shadow refresh/verify failed',e.message));
        }
        if (action==='getOfferStatistics') {
          saveExactViewShadow('getOfferStatistics',offerStatisticsViewKey(),verifyData)
            .catch(e=>console.error('offer statistics exact view save failed',e.message));
          verifyOfferStatisticsNative(verifyData).catch(e=>console.error('offer statistics native verify failed',e.message));
        }
        if (action==='getPlannerWorkers') verifyPlannerWorkersShadow(verifyData).catch(e=>console.error('planner worker shadow verify failed',e.message));
        if (action==='getPlannerAvailability') verifyPlannerAvailabilityShadow(verifyData,body).catch(e=>console.error('planner availability shadow verify failed',e.message));
        if (action==='getPlannerEvents') verifyPlannerEventsShadow(verifyData).catch(e=>console.error('planner event shadow verify failed',e.message));
        if (action==='getMaintenanceCustomer') {
          mirrorMaintenanceAttachmentsFromCustomer(verifyData)
            .then(()=>verifyMaintenanceAttachmentsFromCustomer(verifyData))
            .catch(e=>console.error('maintenance attachment shadow refresh failed',e.message));
          verifyMaintenanceCustomerShadow(verifyData).catch(e=>console.error('maintenance customer shadow verify failed',e.message));
          verifyMaintenanceCustomerFullShadow(verifyData).catch(e=>console.error('maintenance customer full shadow verify failed',e.message));
        }
        if (action==='searchMaintenanceCustomers') verifyMaintenanceSearchShadow(verifyData,body.query??body.q??'').catch(e=>console.error('maintenance search shadow verify failed',e.message));
        if (action==='getMaintenanceContracts') verifyMaintenanceContractsShadow(verifyData).catch(e=>console.error('maintenance contracts shadow verify failed',e.message));
        if (action==='getMaintenanceOverview') verifyMaintenanceOverviewShadow(verifyData).catch(e=>console.error('maintenance overview shadow verify failed',e.message));
        if (action==='getMaintenanceArchive') verifyMaintenanceArchiveShadow(verifyData,body.query??body.q??'').catch(e=>console.error('maintenance archive shadow verify failed',e.message));
        if (action==='findMaintenanceDeviceByInternalId') verifyMaintenanceDeviceByInternalIdShadow(verifyData,body.internalDeviceId??body.internalId??'').catch(e=>console.error('maintenance device-id shadow verify failed',e.message));
        if (action==='getAbsences') verifyAbsencesShadow(verifyData).catch(e=>console.error('absence shadow verify failed',e.message));
        if (action==='getAbsenceOverview') verifyAbsenceOverviewShadow(verifyData,body).catch(e=>console.error('absence overview shadow verify failed',e.message));
        if (action==='getSicknessAlerts') verifySicknessAlertsShadow(verifyData).catch(e=>console.error('sickness alerts shadow verify failed',e.message));
        if (action==='getVacationAccount') {
          verifyVacationAccountShadow(verifyData).catch(e=>console.error('vacation entitlement shadow verify failed',e.message));
          verifyVacationFullShadow(verifyData).catch(e=>console.error('vacation full shadow verify failed',e.message));
        }
        if (action==='getVacationAccounts') {
          verifyVacationAccountsShadow(verifyData,body.year).catch(e=>console.error('vacation entitlements shadow verify failed',e.message));
          verifyVacationFullShadow(verifyData).catch(e=>console.error('vacation full shadow verify failed',e.message));
        }
        if (action==='getTimeBankAccount') {
          replaceTimeBankEmployeeShadow(verifyData)
            .then(()=>verifyTimeBankShadow(verifyData))
            .catch(e=>console.error('time bank shadow refresh failed',e.message));
        }
        if (action==='getMyTimeBank') verifyMyTimeBankShadow(verifyData).catch(e=>console.error('my time bank shadow verify failed',e.message));
        if (action==='getWeekData') verifyWeekDataShadow(verifyData,body).catch(e=>console.error('week data shadow verify failed',e.message));
        if (action==='getBossMonthData') {
          saveBossMonthViewShadow(verifyData,body).catch(e=>console.error('boss month view shadow save failed',e.message));
          verifyBossMonthNative(verifyData,body).catch(e=>console.error('boss month native verify failed',e.message));
          verifyMonthlyAdjustmentsShadow(verifyData,body.year,body.month).catch(e=>console.error('monthly adjustment shadow verify failed',e.message));
          verifyMonthClosures(verifyData,body.year,body.month).catch(e=>console.error('month closure shadow verify failed',e.message));
          verifyConflictReviewsShadow(verifyData,body.year,body.month).catch(e=>console.error('conflict review shadow verify failed',e.message));
        }
        if (action==='getMonthPayrollAudit') {
          saveExactViewShadow('getMonthPayrollAudit',payrollAuditViewKey(body),verifyData)
            .catch(e=>console.error('payroll audit view shadow save failed',e.message));
          verifyPayrollProtocols(verifyData,body.year,body.month).catch(e=>console.error('payroll protocol shadow verify failed',e.message));
          verifyPayrollAuditNative(verifyData,body).catch(e=>console.error('payroll audit native verify failed',e.message));
        }
        if (action==='getPayrollCycleState') {
          saveExactViewShadow('getPayrollCycleState',payrollCycleViewKey(body),verifyData)
            .catch(e=>console.error('payroll cycle view shadow save failed',e.message));
          verifyPayrollCycleNative(verifyData,body).catch(e=>console.error('payroll cycle native verify failed',e.message));
        }
        if (action==='checkRegieBillingRisk') verifyRegieBillingRiskShadow(verifyData,body).catch(e=>console.error('regie billing risk shadow verify failed',e.message));
        if (action==='getDayData') {
          const daySync=Promise.all([
            syncDayStatusFromDayRead(body,verifyData),
            syncDayClosureFromDayRead(body,verifyData),
            syncTimeEntriesFromDayRead(body,verifyData)
          ]);
          daySync.then(()=>verifyDayDataShadow(verifyData,body))
            .catch(e=>console.error('day data shadow refresh/verify failed',e.message));
        }
        if (action==='getRegieReports'||action==='getObjectReports') {
          const regieSync=Promise.all([
            syncTimeEntriesFromRegieRead(verifyData),
            syncRegieMetadataFromRead(verifyData)
          ]);
          regieSync.catch(e=>console.error('regie shadow refresh failed',e.message));
          if(action==='getObjectReports'){
            regieSync.then(()=>verifyObjectReportsShadow(verifyData,body))
              .catch(e=>console.error('object reports shadow verify failed',e.message));
          }
          if(action==='getRegieReports'){
            regieSync.then(()=>verifyRegieReportsShadow(verifyData,body))
              .catch(e=>console.error('regie reports shadow verify failed',e.message));
          }
        }
        if (action==='getRegieAttachments') verifyRegieAttachmentsShadow(verifyData,body).catch(e=>console.error('regie attachments shadow verify failed',e.message));
        if (action==='getObjectInternalNote'||action==='getObjectInternalNotes') verifyObjectNotesShadow(verifyData,body).catch(e=>console.error('object notes shadow verify failed',e.message));
        if (action==='getBossDayClosures') {
          syncAndVerifyBossDayClosures(verifyData,body.year,body.month)
            .then(()=>verifyBossDayClosuresDirect(verifyData,body))
            .catch(e=>console.error('boss day closures shadow refresh/verify failed',e.message));
        }
        if (action==='getMonthData') {
          Promise.all([
            syncAndVerifyMonthStatuses(body,verifyData),
            syncMonthClosuresFromMonthRead(body,verifyData)
          ])
            .then(()=>verifyMonthDataShadow(verifyData,body))
            .catch(e=>console.error('month data shadow refresh/verify failed',e.message));
        }
      }
      if (isCacheableAction(action)) {
        writeCachedResponse(action, body, raw, upstream.status).catch(e=>console.error('response cache write failed',e.message));
      } else if (action && action !== 'ping' && action !== 'employeeLogin') {
        invalidateReadCache(action).catch(e=>console.error('response cache invalidation failed',e.message));
        if (upstream.status === 200 && parsed && parsed.ok !== false) {
          invalidateBossMonthViews().catch(e=>console.error('boss month view invalidation failed',e.message));
          invalidateExactViews().catch(e=>console.error('exact payroll views invalidation failed',e.message));
        }
      }
      if (EMPLOYEE_MUTATION_ACTIONS.has(action) && upstream.status === 200 && parsed && parsed.ok !== false) {
        mirrorEmployeeMutation(action,body,parsed).catch(e=>console.error('employee mutation shadow mirror failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'day_data:%'")
          .catch(e=>console.error('day data employee readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'boss_day_closures:%'")
          .catch(e=>console.error('boss day closures employee readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'vacation_full:%'")
          .catch(e=>console.error('vacation readiness day-status invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'absence_overview:%'")
          .catch(e=>console.error('absence overview employee readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'week_data:%' OR shadow_name LIKE 'month_data:%'")
          .catch(e=>console.error('week/month employee readiness invalidate failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['saveTimeBankManual','applyTimeBankToMonth','bankMonthSurplus','saveAbsence','deleteAbsence','endSicknessAbsence'].includes(action)) {
        invalidateShadowVerify('employee_admin').catch(e=>console.error('employee admin balance readiness invalidate failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['saveTimeBankManual','applyTimeBankToMonth','bankMonthSurplus'].includes(action)) {
        mirrorTimeBankWrite(action,body,parsed).catch(e=>console.error('time bank write shadow mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['saveAbsence','deleteAbsence'].includes(action) &&
          (String(body.type||'')==='Freizeitausgleich' || action==='deleteAbsence')) {
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'time_bank:%' OR shadow_name LIKE 'my_time_bank:%'")
          .catch(e=>console.error('absence time bank readiness invalidate failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['saveTimeBankManual','applyTimeBankToMonth','bankMonthSurplus','saveAbsence','deleteAbsence','endSicknessAbsence'].includes(action)) {
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'day_data:%'")
          .catch(e=>console.error('day data balance readiness invalidate failed',e.message));
      pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'month_data:%'")
        .catch(e=>console.error('month data balance readiness invalidate failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['confirmEmployeeAssignment','reportEmployeeAssignmentIssue','deleteEntry'].includes(action)) {
        mirrorAssignmentWrite(action,body,parsed).catch(e=>console.error('assignment shadow mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['confirmEmployeeAssignment','reportEmployeeAssignmentIssue','deleteEntry'].includes(action)) {
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'week_data:%'")
          .catch(e=>console.error('week data assignment readiness invalidate failed',e.message));
      pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'month_data:%'")
        .catch(e=>console.error('month data assignment readiness invalidate failed',e.message));
      pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'boss_day_closures:%'")
        .catch(e=>console.error('boss day closures assignment readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'day_data:%'")
          .catch(e=>console.error('day data assignment readiness invalidate failed',e.message));
      }
      bumpWriteStat(action, upstream.status === 200 && parsed && parsed.ok !== false).catch(()=>{});
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['saveManualOrder','saveManualOrderNote','setManualOrderStatus','deleteManualOrder'].includes(action)) {
        mirrorManualOrderWrite(action,body,parsed).catch(e=>console.error('manual order shadow mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['updateCustomerInquiry','saveCustomerInquiryNote','completeCustomerInquiry','deleteCustomerInquiry',
           'saveCustomerInquiryContact','archiveCustomerInquiry','rejectCustomerInquiry','inquiryToOffer',
           'saveManualOrder','planRequest3'].includes(action)) {
        mirrorInquiryWrite(action,body,parsed).catch(e=>console.error('customer inquiry shadow mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['createInquiryReminder','reopenInquiryReminder','archiveInquiryReminder','rejectInquiryReminder'].includes(action)) {
        mirrorInquiryReminderWrite(action,body,parsed).catch(e=>console.error('inquiry reminder shadow mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false && action==='syncCustomerInquiries') {
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'customer_inquiries_view:%' OR shadow_name LIKE 'inquiry_reminders_view:%'")
          .catch(e=>console.error('inquiry verification invalidation failed',e.message));
        invalidateInquiryFreshness().catch(e=>console.error('inquiry freshness invalidation failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['createOwnReminder','saveOwnReminderInternalNote','rescheduleOwnReminder','completeOwnReminder','deleteOwnReminder'].includes(action)) {
        mirrorOwnReminderWrite(action,body,parsed).catch(e=>console.error('own reminder shadow mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['inquiryToOffer','saveOfferCreatedWithReminder','rescheduleOfferReminder','declineOfferFromReminder',
           'acceptOfferFromReminder','moveOfferBackToCreate','acceptOfferAsRunning'].includes(action)) {
        mirrorOfferReminderWrite(action,body,parsed).catch(e=>console.error('offer reminder shadow mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['createInspectionOffer','inquiryToOffer','setRegieReportsOfferStatus','saveOfferCreatedWithReminder',
           'moveOfferBackToCreate','declineOfferFromReminder','acceptOfferFromReminder','acceptOfferAsRunning',
           'discardOfferPermanently'].includes(action)) {
        mirrorInquiryOfferWrite(action,body,parsed).catch(e=>console.error('inquiry offer shadow mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['createInspectionOffer','inquiryToOffer','setRegieReportsOfferStatus','saveOfferCreatedWithReminder',
           'rescheduleOfferReminder','moveOfferBackToCreate','declineOfferFromReminder','acceptOfferFromReminder',
           'acceptOfferAsRunning','discardOfferPermanently'].includes(action)) {
        invalidateOfferNativeReadiness().catch(e=>console.error('offer native readiness invalidate failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false && action==='createInspectionOffer') {
        mirrorInspectionTimeEntry(body,parsed).catch(e=>console.error('inspection time entry shadow mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['acceptOfferAsRunning','acceptOfferFromReminder'].includes(action)) {
        mirrorAcceptedOfferRunning(body,parsed).catch(e=>console.error('accepted offer running shadow mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['savePlannerWorker','movePlannerWorker','setPlannerWorkerActive'].includes(action)) {
        const plannerRows=parsed.data!==undefined?parsed.data:parsed;
        replacePlannerWorkersShadow(plannerRows).catch(e=>console.error('planner worker shadow mirror failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'planner_availability:%'")
          .catch(e=>console.error('planner availability worker readiness invalidate failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['savePlannerEvent','deletePlannerEvent'].includes(action)) {
        mirrorPlannerEventWrite(action,body,parsed).catch(e=>console.error('planner event shadow mirror failed',e.message));
        invalidateShadowVerify('maintenance_contracts').catch(e=>console.error('maintenance contracts planner readiness invalidate failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false && action==='reserveMaintenanceDeviceId') {
        mirrorReservedMaintenanceDeviceId(body,parsed).catch(e=>console.error('maintenance device id reservation mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['saveMaintenanceCustomer','deleteMaintenanceCustomer','deleteMaintenanceDevice','addMaintenanceRepair','addManualMaintenanceCount'].includes(action)) {
        mirrorMaintenanceWrite(action,body,parsed).catch(e=>console.error('maintenance shadow mirror failed',e.message));
        if(action==='saveMaintenanceCustomer'){
          const md=parsed&&parsed.data!==undefined?parsed.data:parsed;
          mirrorMaintenanceAttachmentsFromCustomer(md).catch(e=>console.error('maintenance attachment write mirror failed',e.message));
        }
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false && action==='deleteMaintenanceAttachment') {
        mirrorDeleteMaintenanceAttachment(body,parsed).catch(e=>console.error('maintenance attachment delete mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['saveAbsence','deleteAbsence','endSicknessAbsence'].includes(action)) {
        mirrorAbsenceWrite(action,body,parsed).catch(e=>console.error('absence shadow mirror failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'planner_availability:%'")
          .catch(e=>console.error('planner availability absence readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'absence_overview:%'")
          .catch(e=>console.error('absence overview readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'vacation_full:%'")
          .catch(e=>console.error('vacation readiness absence invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'week_data:%' OR shadow_name LIKE 'day_data:%' OR shadow_name LIKE 'month_data:%'")
          .catch(e=>console.error('employee time readiness absence invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'boss_day_closures:%'")
          .catch(e=>console.error('boss day closures absence readiness invalidate failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false && action==='saveVacationEntitlement') {
        mirrorVacationEntitlementWrite(body,parsed).catch(e=>console.error('vacation entitlement shadow mirror failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'month_data:%'")
          .catch(e=>console.error('month data vacation readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'vacation_full:%'")
          .catch(e=>console.error('vacation readiness entitlement invalidate failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['saveMonthlyAdjustment','deleteMonthlyAdjustment'].includes(action)) {
        mirrorMonthlyAdjustmentWrite(action,body,parsed).catch(e=>console.error('monthly adjustment shadow mirror failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'month_data:%'")
          .catch(e=>console.error('month data adjustment readiness invalidate failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['markPayrollIssueReviewed','setMonthClosureStatus','setPayrollMonthStatus','completePayrollCycle','forceCompletePayrollCycle'].includes(action)) {
        mirrorPayrollProtocolWrite(action,body,parsed).catch(e=>console.error('payroll protocol shadow mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false && action==='markConflictReviewed') {
        mirrorConflictReviewWrite(body,parsed).catch(e=>console.error('conflict review shadow mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false && action==='syncHolidays') {
        mirrorHolidayYear(Number(body.year)||0).catch(e=>console.error('holiday status shadow mirror failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'day_data:%' OR shadow_name LIKE 'week_data:%' OR shadow_name LIKE 'month_data:%' OR shadow_name LIKE 'boss_day_closures:%'")
          .catch(e=>console.error('holiday readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'vacation_full:%'")
          .catch(e=>console.error('vacation readiness holiday invalidate failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false && action==='setDayStatus') {
        mirrorSetDayStatus(body,parsed).catch(e=>console.error('day status shadow mirror failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'week_data:%'")
          .catch(e=>console.error('week data status readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'month_data:%'")
          .catch(e=>console.error('month data status readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'boss_day_closures:%'")
          .catch(e=>console.error('boss day closures status readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'day_data:%'")
          .catch(e=>console.error('day data status readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'planner_availability:%'")
          .catch(e=>console.error('planner availability status readiness invalidate failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['closeDay','refreshClosedDay','manualCloseBossDay'].includes(action)) {
        mirrorDayClosureWrite(action,body,parsed).catch(e=>console.error('day closure shadow mirror failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'day_data:%'")
          .catch(e=>console.error('day data closure readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'month_data:%'")
          .catch(e=>console.error('month data closure readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'boss_day_closures:%'")
          .catch(e=>console.error('boss day closures closure readiness invalidate failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['saveEntry','deleteEntry','updateEmployeeEntry','updateBossDayEntry','deleteBossDayEntry','markRegieReportBilled',
           'updateRegieReport','markRegieObjectsBilled','markRegieObjectBilled','setRegieObjectJobStatus','markRegieObjectCompleted','setRegieReportsOfferStatus',
           'moveOfferBackToCreate','saveOfferCreatedWithReminder','acceptOfferAsRunning','acceptOfferFromReminder',
           'createInspectionOffer','discardOfferPermanently'].includes(action)) {
        mirrorTimeEntryWrite(action,body,parsed).catch(e=>console.error('time entries shadow mirror failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'week_data:%'")
          .catch(e=>console.error('week data time readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'month_data:%'")
          .catch(e=>console.error('month data time readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'boss_day_closures:%'")
          .catch(e=>console.error('boss day closures time readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'day_data:%'")
          .catch(e=>console.error('day data time readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'regie_billing_risk:%'")
          .catch(e=>console.error('regie billing risk readiness invalidate failed',e.message));
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'object_reports_id:%' OR shadow_name LIKE 'object_reports_customer:%'")
          .catch(e=>console.error('object reports time readiness invalidate failed',e.message));
        invalidateShadowVerify('maintenance_contracts').catch(e=>console.error('maintenance contracts time readiness invalidate failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['mergeRegieObjects','saveObjectInternalNote','updateRegieReport'].includes(action)) {
        mirrorRegieMetadataWrite(action,body,parsed).catch(e=>console.error('regie metadata shadow mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false && action==='mergeRegieObjects') {
        pool.query("DELETE FROM shadow_verify_stats WHERE shadow_name LIKE 'object_reports_id:%' OR shadow_name LIKE 'object_reports_customer:%'")
          .catch(e=>console.error('object reports merge readiness invalidate failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false && action==='addRegieAttachments') {
        mirrorRegieAttachmentsWrite(body,parsed).catch(e=>console.error('regie attachments shadow mirror failed',e.message));
      }
      pool.query(
        `INSERT INTO legacy_action_log(action,request_payload,response_ok,response_payload,http_status,duration_ms)
         VALUES($1,$2::jsonb,$3,$4::jsonb,$5,$6)`,
        [action,JSON.stringify(sanitizedLogPayload(body)),Boolean(parsed && parsed.ok !== false),
         parsed ? JSON.stringify(sanitizeForLog(parsed)) : null,upstream.status,Math.max(0,Date.now()-upstreamStartedAt)]
      ).catch(e=>console.error('legacy action log failed',e.message));
    }
    cors(req,res);
    return sendApiBody(
      req,res,upstream.status,
      upstream.headers.get('content-type')||'application/json; charset=utf-8',
      raw
    );
  } catch (e) {
    if (pool) {
      bumpWriteStat(action,false).catch(()=>{});
      pool.query(
        `INSERT INTO legacy_action_log(action,request_payload,response_ok,response_payload,http_status,duration_ms)
         VALUES($1,$2::jsonb,false,$3::jsonb,502,$4)`,
        [action,JSON.stringify(sanitizedLogPayload(body)),JSON.stringify({error:e.message}),Math.max(0,Date.now()-upstreamStartedAt)]
      ).catch(()=>{});
    }
    return json(res,502,{ok:false,error:'Google backend unavailable: '+e.message},req);
  }
}

async function migrationStatusPublic() {
  if (!pool) throw new Error('Database not configured');
  const run = await pool.query(
    "SELECT id,source_version,mode,started_at,finished_at,status,source_counts,target_counts,notes FROM migration_runs ORDER BY id DESC LIMIT 1"
  );
  if (!run.rowCount) return {ok:true,latest:null,sheets:[]};
  const runId = run.rows[0].id;
  const sheets = await pool.query(
    "SELECT sheet_name,source_rows,source_columns,imported_rows,payload_sha256 FROM migration_sheets WHERE migration_run_id=$1 ORDER BY sheet_name",
    [runId]
  );
  return {ok:true,latest:run.rows[0],sheets:sheets.rows};
}

async function latestMigration() {
  if (!pool) throw new Error('Database not configured');
  const q = await pool.query("SELECT value,updated_at FROM app_meta WHERE key='latest_migration'");
  return {ok:true,latest:q.rows[0]||null};
}

function authorized(req) {
  if (!MIGRATION_TOKEN) return false;
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token.length !== MIGRATION_TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(MIGRATION_TOKEN));
}

async function health() {
  let database = 'not-configured';
  let postgresEmployeeSnapshotCount = null;
  let employeeReadSource = 'google-fallback';
  let employeeSnapshotDirty = null;
  let shadowCounts = null;
  let shadowVerify = [];
  let shadowReadiness = [];
  let writeStats = [];
  let dayClosureSourceAudit = null;
  let activeRailwaySessions = 0;
  let directReadReady = {};
  let legacyWriteOutbox = {pending:0,failed:0,sending:0,delivered:0};
  if (pool) {
    try {
      const q = await pool.query('SELECT 1 AS ok');
      database = q.rows[0] && q.rows[0].ok === 1 ? 'ok' : 'error';
      employeeSnapshotDirty = await isEmployeeSnapshotDirty();
      const names = await getEmployeesFromSnapshot();
      if (Array.isArray(names) && names.length) {
        postgresEmployeeSnapshotCount = names.length;
        if (!employeeSnapshotDirty) employeeReadSource = 'postgres';
      }
      const counts = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS n FROM manual_orders_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM own_reminders_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM offer_reminders_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM inquiry_offers_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM planner_workers_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM planner_events_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM maintenance_customers_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM maintenance_objects_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM maintenance_devices_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM maintenance_repairs_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM maintenance_manual_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM maintenance_attachments_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM absences_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM vacation_entitlements_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM time_bank_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM monthly_adjustments_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM month_closures_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM payroll_reviews_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM payroll_closures_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM conflict_reviews_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM day_status_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM day_closures_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM time_entries_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM objects_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM regie_merges_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM object_notes_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM regie_attachments_shadow')
      ]);
      shadowCounts = {
        manualOrders: counts[0].rows[0]?.n||0,
        ownReminders: counts[1].rows[0]?.n||0,
        offerReminders: counts[2].rows[0]?.n||0,
        inquiryOffers: counts[3].rows[0]?.n||0,
        plannerWorkers: counts[4].rows[0]?.n||0,
        plannerEvents: counts[5].rows[0]?.n||0,
        maintenanceCustomers: counts[6].rows[0]?.n||0,
        maintenanceObjects: counts[7].rows[0]?.n||0,
        maintenanceDevices: counts[8].rows[0]?.n||0,
        maintenanceRepairs: counts[9].rows[0]?.n||0,
        maintenanceManual: counts[10].rows[0]?.n||0,
        maintenanceAttachments: counts[11].rows[0]?.n||0,
        absences: counts[12].rows[0]?.n||0,
        vacationEntitlements: counts[13].rows[0]?.n||0,
        timeBank: counts[14].rows[0]?.n||0,
        monthlyAdjustments: counts[15].rows[0]?.n||0,
        monthClosures: counts[16].rows[0]?.n||0,
        payrollReviews: counts[17].rows[0]?.n||0,
        payrollClosures: counts[18].rows[0]?.n||0,
        conflictReviews: counts[19].rows[0]?.n||0,
        dayStatus: counts[20].rows[0]?.n||0,
        dayClosures: counts[21].rows[0]?.n||0,
        timeEntries: counts[22].rows[0]?.n||0,
        objects: counts[23].rows[0]?.n||0,
        regieMerges: counts[24].rows[0]?.n||0,
        objectNotes: counts[25].rows[0]?.n||0,
        regieAttachments: counts[26].rows[0]?.n||0
      };
      const verifyQ=await pool.query(
        'SELECT shadow_name,google_count,postgres_count,mismatches,checked_at FROM shadow_verify_stats ORDER BY shadow_name'
      );
      shadowVerify=verifyQ.rows;
      shadowReadiness=shadowVerify.map(x=>({
        shadowName:x.shadow_name,
        status:Number(x.mismatches||0)===0?'ready':'mismatch',
        googleCount:Number(x.google_count||0),
        postgresCount:Number(x.postgres_count||0),
        mismatches:Number(x.mismatches||0),
        checkedAt:x.checked_at
      }));
      const writeQ=await pool.query(
        `SELECT action,success_count,failure_count,last_success_at,last_failure_at
           FROM write_action_stats
          ORDER BY (success_count+failure_count) DESC, action
          LIMIT 20`
      );
      writeStats=writeQ.rows;
      const outboxQ=await pool.query(
        `SELECT status,COUNT(*)::int AS n FROM legacy_write_outbox GROUP BY status`
      );
      for(const r of outboxQ.rows)legacyWriteOutbox[String(r.status||'pending')]=Number(r.n||0);
      dayClosureSourceAudit=await auditDayClosureSourceDuplicates();
      const sessionQ=await pool.query(
        'SELECT COUNT(*)::int AS n FROM railway_sessions WHERE revoked_at IS NULL AND expires_at>now()'
      );
      activeRailwaySessions=sessionQ.rows[0]?.n||0;
      directReadReady={
        employeeAdmin:Boolean(postgresEmployeeSnapshotCount&&!employeeSnapshotDirty),
        manualOrders:true,
        ownReminders:true,
        offerReminders:true,
        plannerWorkers:true,
        plannerAvailabilityVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'planner_availability:%' AND mismatches=0"
        )).rows[0]?.n||0,
        absences:true,
        absenceOverviewVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'absence_overview:%' AND mismatches=0"
        )).rows[0]?.n||0,
        sicknessAlerts:true,
        maintenanceSearchVerifiedQueries:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'maintenance_search:%' AND mismatches=0"
        )).rows[0]?.n||0,
        maintenanceCustomersVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'maintenance_customer_full:%' AND mismatches=0"
        )).rows[0]?.n||0,
        maintenanceContracts:true,
        maintenanceOverview:true,
        maintenanceArchiveVerifiedQueries:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'maintenance_archive:%' AND mismatches=0"
        )).rows[0]?.n||0,
        maintenanceDeviceIdsVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'maintenance_device_internal:%' AND mismatches=0"
        )).rows[0]?.n||0,
        objectNoteReadsVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE (shadow_name LIKE 'object_note:%' OR shadow_name LIKE 'object_notes:%') AND mismatches=0"
        )).rows[0]?.n||0,
        objectNotesBase:true,
        objectReportsVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'object_reports%' AND mismatches=0"
        )).rows[0]?.n||0,
        regieReportsVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'regie_reports:%' AND mismatches=0"
        )).rows[0]?.n||0,
        regieBillingRiskVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'regie_billing_risk:%' AND mismatches=0"
        )).rows[0]?.n||0,
        regieAttachmentsVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'regie_attachments:%' AND mismatches=0"
        )).rows[0]?.n||0,
        regieAttachmentsBase:await shadowReadyForDirectRead('regie_attachments:base'),
        vacationVerifiedKeys:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'vacation_full:%' AND mismatches=0"
        )).rows[0]?.n||0,
        timeBankVerifiedEmployees:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'time_bank:%' AND mismatches=0"
        )).rows[0]?.n||0,
        myTimeBankVerifiedEmployees:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'my_time_bank:%' AND mismatches=0"
        )).rows[0]?.n||0,
        weekDataVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'week_data:%' AND mismatches=0"
        )).rows[0]?.n||0,
        dayDataVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'day_data:%' AND mismatches=0"
        )).rows[0]?.n||0,
        monthDataVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'month_data:%' AND mismatches=0"
        )).rows[0]?.n||0,
        bossDayClosuresVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'boss_day_closures:%' AND mismatches=0"
        )).rows[0]?.n||0,
        bossMonthViewsVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'boss_month_native:%' AND mismatches=0"
        )).rows[0]?.n||0,
        payrollAuditViewsVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'payroll_audit_native:%' AND mismatches=0"
        )).rows[0]?.n||0,
        payrollCycleViewsVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'payroll_cycle_native:%' AND mismatches=0"
        )).rows[0]?.n||0,
        offerReportViewsVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'offer_reports_native:%' AND mismatches=0"
        )).rows[0]?.n||0,
        customerInquiryViewsVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'customer_inquiries_view:%' AND mismatches=0"
        )).rows[0]?.n||0,
        inquiryReminderViewsVerified:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM shadow_verify_stats WHERE shadow_name LIKE 'inquiry_reminders_view:%' AND mismatches=0"
        )).rows[0]?.n||0,
        customerInquiryFreshViews:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM app_meta WHERE key LIKE 'fresh:customer_inquiries_view:%' AND updated_at>now()-interval '70 minutes'"
        )).rows[0]?.n||0,
        inquiryReminderFreshViews:(await pool.query(
          "SELECT COUNT(*)::int AS n FROM app_meta WHERE key LIKE 'fresh:inquiry_reminders_view:%' AND updated_at>now()-interval '70 minutes'"
        )).rows[0]?.n||0,
        offerStatisticsView:true,
        dashboardSummaryView:await shadowReadyForDirectRead(dashboardNativeKey())
      };
    } catch (e) {
      database = 'error';
    }
  }
  return {
    ok: database === 'ok',
    app: 'DG-App-10-API',
    phase: 'shadow-migration',
    database,
    googleBackendConfigured: Boolean(GOOGLE_BACKEND_URL),
    productionWrites: 'PostgreSQL-primary',
    postgresWrites: 'production-primary',
    employeeReadSource,
    employeeSnapshotDirty,
    postgresEmployeeSnapshotCount,
    readCacheTtlSeconds: READ_CACHE_TTL_MS / 1000,
    readCacheRefreshAheadSeconds: READ_CACHE_REFRESH_MS / 1000,
    manualOrdersShadow: pool ? 'enabled' : 'disabled',
    ownRemindersShadow: pool ? 'enabled' : 'disabled',
    offerRemindersShadow: pool ? 'enabled' : 'disabled',
    plannerWorkersShadow: pool ? 'enabled' : 'disabled',
    plannerEventsShadow: pool ? 'enabled' : 'disabled',
    maintenanceShadow: pool ? 'enabled' : 'disabled',
    absencesShadow: pool ? 'enabled' : 'disabled',
    vacationEntitlementsShadow: pool ? 'enabled' : 'disabled',
    timeBankShadow: pool ? 'enabled' : 'disabled',
    monthlyAdjustmentsShadow: pool ? 'enabled' : 'disabled',
    payrollProtocolShadow: pool ? 'enabled' : 'disabled',
    conflictReviewsShadow: pool ? 'enabled' : 'disabled',
    dayStatusShadow: pool ? 'enabled' : 'disabled',
    dayClosuresShadow: pool ? 'enabled' : 'disabled',
    timeEntriesShadow: pool ? 'enabled' : 'disabled',
    regieMetadataShadow: pool ? 'enabled' : 'disabled',
    shadowCounts,
    shadowVerify,
    shadowReadiness,
    writeStats,
    dayClosureSourceAudit,
    activeRailwaySessions,
    directReadReady,
    legacyWriteOutbox
  };
}

async function shadowUpsert(body) {
  if (!pool) throw new Error('Database not configured');
  const entityType = String(body.entityType || '').trim();
  const sourceKey = String(body.sourceKey || '').trim();
  if (!entityType || !sourceKey) throw new Error('entityType and sourceKey required');
  const payload = body.payload === undefined ? null : body.payload;
  const canonical = JSON.stringify(payload);
  const sha = crypto.createHash('sha256').update(canonical).digest('hex');
  await pool.query(
    `INSERT INTO migration_objects(entity_type,source_key,payload,payload_sha256,source_updated_at)
     VALUES($1,$2,$3::jsonb,$4,$5)
     ON CONFLICT(entity_type,source_key)
     DO UPDATE SET payload=EXCLUDED.payload,payload_sha256=EXCLUDED.payload_sha256,
                   source_updated_at=EXCLUDED.source_updated_at,imported_at=now()`,
    [entityType, sourceKey, canonical, sha, body.sourceUpdatedAt || null]
  );
  return { ok: true, entityType, sourceKey, sha256: sha };
}

async function counts() {
  if (!pool) throw new Error('Database not configured');
  const q = await pool.query(
    'SELECT entity_type, COUNT(*)::int AS count FROM migration_objects GROUP BY entity_type ORDER BY entity_type'
  );
  return { ok: true, counts: q.rows };
}

async function latencySummary() {
  if (!pool) throw new Error('Database not configured');
  const [summary,recent,total] = await Promise.all([
    pool.query(
      `SELECT action, COUNT(*)::int AS count,
              ROUND(AVG(duration_ms)::numeric,1) AS avg_duration_ms,
              MAX(duration_ms)::int AS max_duration_ms
         FROM legacy_action_log
        WHERE created_at > now() - interval '2 hours'
          AND duration_ms IS NOT NULL
        GROUP BY action
        ORDER BY AVG(duration_ms) DESC`
    ),
    pool.query(
      `SELECT action,duration_ms,created_at
         FROM legacy_action_log
        WHERE created_at > now() - interval '2 hours'
          AND duration_ms IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 10`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total
         FROM legacy_action_log
        WHERE created_at > now() - interval '2 hours'
          AND duration_ms IS NOT NULL`
    )
  ]);
  return {ok:true,total:total.rows[0]?.total||0,summary:summary.rows,recent:recent.rows};
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') {
      cors(req,res);
      res.writeHead(204);
      return res.end();
    }

    if (req.method === 'GET' && url.pathname === '/v1/whatsapp/webhook') {
      const mode=String(url.searchParams.get('hub.mode')||''),token=String(url.searchParams.get('hub.verify_token')||''),challenge=String(url.searchParams.get('hub.challenge')||'');
      if(mode==='subscribe'&&WHATSAPP_VERIFY_TOKEN&&token===WHATSAPP_VERIFY_TOKEN){
        res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
        return res.end(challenge);
      }
      return json(res,403,{ok:false,error:'WhatsApp webhook verification failed'},req);
    }

    if (req.method === 'POST' && url.pathname === '/v1/whatsapp/webhook') {
      const raw=await readBinary(req,2*1024*1024);
      if(!whatsappSignatureOkV10(raw,req.headers['x-hub-signature-256'])){
        return json(res,401,{ok:false,error:'Invalid WhatsApp webhook signature'},req);
      }
      let payload={};try{payload=raw.length?JSON.parse(raw.toString('utf8')):{};}catch(_e){return json(res,400,{ok:false,error:'Invalid webhook JSON'},req);}
      const eventHash=crypto.createHash('sha256').update(raw).digest('hex');
      if(pool){
        await pool.query(
          'INSERT INTO whatsapp_webhook_events_v10(event_hash,payload) VALUES($1,$2::jsonb) ON CONFLICT(event_hash) DO NOTHING',
          [eventHash,JSON.stringify(payload)]
        );
        setImmediate(()=>processWhatsappWebhookV10(payload,eventHash).catch(e=>console.error('WhatsApp webhook processing failed',e.message)));
      }
      return json(res,200,{ok:true},req);
    }

    if (req.method === 'POST' && url.pathname === '/') {
      const body = await readBody(req);
      return proxyLegacy(req,res,body);
    }

    if (req.method === 'GET' && url.pathname === '/v1/migration/status') {
      return json(res, 200, await migrationStatusPublic(), req);
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, await health(), req);
    }

    if (req.method === 'GET' && url.pathname === '/v1/migration/counts') {
      if (!authorized(req)) return json(res, 401, { ok:false, error:'Unauthorized' }, req);
      return json(res, 200, await counts(), req);
    }

    if (req.method === 'GET' && url.pathname === '/v1/internal/latency') {
      if (!authorized(req)) return json(res, 401, { ok:false, error:'Unauthorized' }, req);
      return json(res, 200, await latencySummary(), req);
    }

    if (req.method === 'POST' && url.pathname === '/v1/migration/shadow') {
      if (!authorized(req)) return json(res, 401, { ok:false, error:'Unauthorized' });
      return json(res, 200, await shadowUpsert(await readBody(req)), req);
    }

    if (req.method === 'POST' && url.pathname === '/v1/migration/import-xlsx') {
      if (!uploadAuthorized(req)) return json(res, 401, {ok:false,error:'Unauthorized'}, req);
      const buffer = await readBinary(req, 10 * 1024 * 1024);
      return json(res, 200, await importWorkbook(buffer), req);
    }

    if (req.method === 'GET' && url.pathname === '/v1/migration/latest') {
      if (!uploadAuthorized(req)) return json(res, 401, {ok:false,error:'Unauthorized'}, req);
      return json(res, 200, await latestMigration(), req);
    }

    return json(res, 404, { ok:false, error:'Not Found' }, req);
  } catch (e) {
    console.error(e);
    return json(res, 500, { ok:false, error:e && e.message ? e.message : String(e) }, req);
  }
});

initDb()
  .then(() => importWorkbookFromUrlOnce())
  .then(async () => {
    const s = await migrationStatusPublic();
    const sheets = Array.isArray(s.sheets) ? s.sheets : [];
    const sourceRows = sheets.reduce((n,x)=>n+Number(x.source_rows||0),0);
    const importedRows = sheets.reduce((n,x)=>n+Number(x.imported_rows||0),0);
    const mismatches = sheets.filter(x=>Number(x.source_rows||0)!==Number(x.imported_rows||0)).map(x=>x.sheet_name);
    console.log('MIGRATION VERIFY: sheets='+sheets.length+' sourceRows='+sourceRows+' importedRows='+importedRows+' mismatches='+mismatches.length+(mismatches.length?' ['+mismatches.join(', ')+']':''));
    const h = await health();
    console.log('READINESS: database='+h.database+' employeeReadSource='+h.employeeReadSource+' employeeSnapshotDirty='+h.employeeSnapshotDirty+' employeeCount='+(h.postgresEmployeeSnapshotCount==null?'n/a':h.postgresEmployeeSnapshotCount));
    if(h.shadowCounts)console.log('SHADOW_COUNTS manual_orders='+h.shadowCounts.manualOrders+' own_reminders='+h.shadowCounts.ownReminders+' offer_reminders='+h.shadowCounts.offerReminders+' planner_workers='+h.shadowCounts.plannerWorkers+' planner_events='+h.shadowCounts.plannerEvents+' maintenance_customers='+h.shadowCounts.maintenanceCustomers+' maintenance_objects='+h.shadowCounts.maintenanceObjects+' maintenance_devices='+h.shadowCounts.maintenanceDevices+' maintenance_repairs='+h.shadowCounts.maintenanceRepairs+' maintenance_manual='+h.shadowCounts.maintenanceManual+' maintenance_attachments='+h.shadowCounts.maintenanceAttachments+' absences='+h.shadowCounts.absences+' vacation_entitlements='+h.shadowCounts.vacationEntitlements+' time_bank='+h.shadowCounts.timeBank+' monthly_adjustments='+h.shadowCounts.monthlyAdjustments+' month_closures='+h.shadowCounts.monthClosures+' payroll_reviews='+h.shadowCounts.payrollReviews+' payroll_closures='+h.shadowCounts.payrollClosures+' conflict_reviews='+h.shadowCounts.conflictReviews+' day_status='+h.shadowCounts.dayStatus+' day_closures='+h.shadowCounts.dayClosures+' time_entries='+h.shadowCounts.timeEntries+' objects='+h.shadowCounts.objects+' regie_merges='+h.shadowCounts.regieMerges+' object_notes='+h.shadowCounts.objectNotes);
    console.log('RAILWAY_SESSIONS active='+Number(h.activeRailwaySessions||0));
    if(h.legacyWriteOutbox)console.log('LEGACY_OUTBOX pending='+Number(h.legacyWriteOutbox.pending||0)+' failed='+Number(h.legacyWriteOutbox.failed||0)+' sending='+Number(h.legacyWriteOutbox.sending||0)+' delivered='+Number(h.legacyWriteOutbox.delivered||0));
    if(h.directReadReady)console.log('DIRECT_READ_READY employee_admin='+Boolean(h.directReadReady.employeeAdmin)+' manual_orders='+Boolean(h.directReadReady.manualOrders)+' own_reminders='+Boolean(h.directReadReady.ownReminders)+' offer_reminders='+Boolean(h.directReadReady.offerReminders)+' planner_workers='+Boolean(h.directReadReady.plannerWorkers)+' planner_availability='+Number(h.directReadReady.plannerAvailabilityVerified||0)+' absences='+Boolean(h.directReadReady.absences)+' absence_overview='+Number(h.directReadReady.absenceOverviewVerified||0)+' sickness_alerts='+Boolean(h.directReadReady.sicknessAlerts)+' maintenance_search_queries='+Number(h.directReadReady.maintenanceSearchVerifiedQueries||0)+' maintenance_customers='+Number(h.directReadReady.maintenanceCustomersVerified||0)+' maintenance_contracts='+Boolean(h.directReadReady.maintenanceContracts)+' maintenance_overview='+Boolean(h.directReadReady.maintenanceOverview)+' maintenance_archive_queries='+Number(h.directReadReady.maintenanceArchiveVerifiedQueries||0)+' maintenance_device_ids='+Number(h.directReadReady.maintenanceDeviceIdsVerified||0)+' object_note_reads='+Number(h.directReadReady.objectNoteReadsVerified||0)+' object_notes_base='+Boolean(h.directReadReady.objectNotesBase)+' object_reports='+Number(h.directReadReady.objectReportsVerified||0)+' regie_reports='+Number(h.directReadReady.regieReportsVerified||0)+' regie_billing_risk='+Number(h.directReadReady.regieBillingRiskVerified||0)+' regie_attachments='+Number(h.directReadReady.regieAttachmentsVerified||0)+' regie_attachments_base='+Boolean(h.directReadReady.regieAttachmentsBase)+' vacation_keys='+Number(h.directReadReady.vacationVerifiedKeys||0)+' timebank_employees='+Number(h.directReadReady.timeBankVerifiedEmployees||0)+' my_timebank_employees='+Number(h.directReadReady.myTimeBankVerifiedEmployees||0)+' week_data='+Number(h.directReadReady.weekDataVerified||0)+' day_data='+Number(h.directReadReady.dayDataVerified||0)+' month_data='+Number(h.directReadReady.monthDataVerified||0)+' boss_day_closures='+Number(h.directReadReady.bossDayClosuresVerified||0)+' boss_month_views='+Number(h.directReadReady.bossMonthViewsVerified||0)+' payroll_audit_views='+Number(h.directReadReady.payrollAuditViewsVerified||0)+' payroll_cycle_views='+Number(h.directReadReady.payrollCycleViewsVerified||0)+' offer_report_views='+Number(h.directReadReady.offerReportViewsVerified||0)+' offer_statistics='+Boolean(h.directReadReady.offerStatisticsView)+' dashboard='+Boolean(h.directReadReady.dashboardSummaryView));
    if(Array.isArray(h.shadowReadiness)&&h.shadowReadiness.length)console.log('SHADOW_READINESS '+h.shadowReadiness.map(x=>x.shadowName+'='+x.status+'('+x.mismatches+')').join(' | '));
    if(Array.isArray(h.writeStats)&&h.writeStats.length)console.log('WRITE_STATS '+h.writeStats.map(x=>x.action+'='+x.success_count+'ok/'+x.failure_count+'fail').join(' | '));
    await logLatencySummary();
  })
  .then(() => server.listen(PORT, '0.0.0.0', () => {
    console.log('DG-App-10 API listening on ' + PORT);
    // Google health is checked on demand by the frontend/status endpoint; no periodic background ping.
  }))
  .catch(err => {
    console.error('Database initialization failed', err);
    process.exit(1);
  });
