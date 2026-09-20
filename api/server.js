'use strict';

const http = require('http');
const crypto = require('crypto');
const zlib = require('zlib');
const { Pool } = require('pg');
const XLSX = require('xlsx');

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL || '';
const GOOGLE_BACKEND_URL = process.env.GOOGLE_BACKEND_URL || '';
const MIGRATION_TOKEN = process.env.MIGRATION_TOKEN || '';
const MIGRATION_UPLOAD_KEY = process.env.MIGRATION_UPLOAD_KEY || '';
const WEB_ORIGIN = process.env.WEB_ORIGIN || 'https://dg-app-10-web-production.up.railway.app';
const MIGRATION_XLSX_URL = process.env.MIGRATION_XLSX_URL || '';

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

async function cleanupInternalData() {
  if (!pool) return;
  await pool.query("DELETE FROM response_cache WHERE created_at < now() - interval '24 hours'");
  await pool.query("DELETE FROM legacy_action_log WHERE created_at < now() - interval '30 days'");
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

async function initDb() {
  if (!pool) return;
  await pool.query(schema);
  await cleanupInternalData();
  await loadGooglePingCache();
  await initManualOrdersShadow();
  await initOwnRemindersShadow();
  await initOfferRemindersShadow();
  await initPlannerWorkersShadow();
  await initPlannerEventsShadow();
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

  const pingTimer = setInterval(() => {
    refreshGooglePing().catch(e => console.error('scheduled Google ping failed', e.message));
  }, GOOGLE_PING_REFRESH_MS);
  if (typeof pingTimer.unref === 'function') pingTimer.unref();
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
    if (size > 2 * 1024 * 1024) throw new Error('Payload too large');
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
  if (/ManualOrder/i.test(a)) groups.add('manualOrders');
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
  if (action==='saveOfferCreatedWithReminder') {
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
    const result=body.asRunning?'Angenommen - Laufender Auftrag':'Angenommen - Archiv';
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
    await pool.query(
      `UPDATE offer_reminders_shadow SET status='Erledigt',result='Angenommen - Laufender Auftrag',
        changed_at_text=$2,changed_by=$3,shadow_updated_at=now()
        WHERE offer_id=$1 AND status='Offen'`,
      [String(body.offerId||''),now,String(body.employee||'')]
    );
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
  const seen=new Set();
  for(const r of rows){
    const id=normalizeShadowText(r&&r.id);if(!id){mismatches++;continue;}
    seen.add(id);const p=pg.get(id);if(!p){mismatches++;continue;}
    const pairs=[
      [r.customer,p.customer],[r.address,p.address],[r.phone,p.phone],[r.email,p.email],
      [r.description,p.description],[r.source,p.source],[r.inquiryId,p.inquiry_id],
      [r.status,p.status],[r.internalNote,p.internal_note]
    ];
    if(pairs.some(([a,b])=>normalizeShadowText(a)!==normalizeShadowText(b)))mismatches++;
  }
  for(const id of pg.keys())if(!seen.has(id))mismatches++;
  console.log('SHADOW_VERIFY manual_orders google='+rows.length+' postgres='+pg.size+' mismatches='+mismatches);
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

async function getEmployeesFromSnapshot() {
  if (Array.isArray(employeeNamesCache) && employeeNamesCache.length) return employeeNamesCache.slice();
  if (!pool) return null;
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

async function proxyLegacy(req, res, body) {
  const action = String(body && body.action || '');
  if (action === 'ping') return handlePing(req,res);
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
        const verifyData=parsed.data!==undefined?parsed.data:parsed;
        if (action==='getManualOrders') verifyManualOrdersShadow(verifyData).catch(e=>console.error('manual order shadow verify failed',e.message));
        if (action==='getOwnReminders') verifyOwnRemindersShadow(verifyData).catch(e=>console.error('own reminder shadow verify failed',e.message));
        if (action==='getOfferReminders') verifyOfferRemindersShadow(verifyData,Boolean(body.includeDone)).catch(e=>console.error('offer reminder shadow verify failed',e.message));
        if (action==='getPlannerWorkers') verifyPlannerWorkersShadow(verifyData).catch(e=>console.error('planner worker shadow verify failed',e.message));
        if (action==='getPlannerEvents') verifyPlannerEventsShadow(verifyData).catch(e=>console.error('planner event shadow verify failed',e.message));
      }
      if (isCacheableAction(action)) {
        writeCachedResponse(action, body, raw, upstream.status).catch(e=>console.error('response cache write failed',e.message));
      } else if (action && action !== 'ping' && action !== 'employeeLogin') {
        invalidateReadCache(action).catch(e=>console.error('response cache invalidation failed',e.message));
      }
      if (EMPLOYEE_MUTATION_ACTIONS.has(action) && upstream.status === 200 && parsed && parsed.ok !== false) {
        markEmployeeSnapshotDirty(action).catch(e=>console.error('employee snapshot dirty flag failed',e.message));
      }
      bumpWriteStat(action, upstream.status === 200 && parsed && parsed.ok !== false).catch(()=>{});
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['saveManualOrder','saveManualOrderNote','setManualOrderStatus','deleteManualOrder'].includes(action)) {
        mirrorManualOrderWrite(action,body,parsed).catch(e=>console.error('manual order shadow mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['createOwnReminder','saveOwnReminderInternalNote','rescheduleOwnReminder','completeOwnReminder','deleteOwnReminder'].includes(action)) {
        mirrorOwnReminderWrite(action,body,parsed).catch(e=>console.error('own reminder shadow mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['saveOfferCreatedWithReminder','rescheduleOfferReminder','declineOfferFromReminder','acceptOfferFromReminder','moveOfferBackToCreate','acceptOfferAsRunning'].includes(action)) {
        mirrorOfferReminderWrite(action,body,parsed).catch(e=>console.error('offer reminder shadow mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['savePlannerWorker','movePlannerWorker','setPlannerWorkerActive'].includes(action)) {
        const plannerRows=parsed.data!==undefined?parsed.data:parsed;
        replacePlannerWorkersShadow(plannerRows).catch(e=>console.error('planner worker shadow mirror failed',e.message));
      }
      if (upstream.status === 200 && parsed && parsed.ok !== false &&
          ['savePlannerEvent','deletePlannerEvent'].includes(action)) {
        mirrorPlannerEventWrite(action,body,parsed).catch(e=>console.error('planner event shadow mirror failed',e.message));
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
  let writeStats = [];
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
        pool.query('SELECT COUNT(*)::int AS n FROM planner_workers_shadow'),
        pool.query('SELECT COUNT(*)::int AS n FROM planner_events_shadow')
      ]);
      shadowCounts = {
        manualOrders: counts[0].rows[0]?.n||0,
        ownReminders: counts[1].rows[0]?.n||0,
        offerReminders: counts[2].rows[0]?.n||0,
        plannerWorkers: counts[3].rows[0]?.n||0,
        plannerEvents: counts[4].rows[0]?.n||0
      };
      const verifyQ=await pool.query(
        'SELECT shadow_name,google_count,postgres_count,mismatches,checked_at FROM shadow_verify_stats ORDER BY shadow_name'
      );
      shadowVerify=verifyQ.rows;
      const writeQ=await pool.query(
        `SELECT action,success_count,failure_count,last_success_at,last_failure_at
           FROM write_action_stats
          ORDER BY (success_count+failure_count) DESC, action
          LIMIT 20`
      );
      writeStats=writeQ.rows;
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
    productionWrites: 'Google-GS-9.0',
    postgresWrites: 'migration-shadow-plus-read-cache',
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
    shadowCounts,
    shadowVerify,
    writeStats
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
    if(h.shadowCounts)console.log('SHADOW_COUNTS manual_orders='+h.shadowCounts.manualOrders+' own_reminders='+h.shadowCounts.ownReminders+' offer_reminders='+h.shadowCounts.offerReminders+' planner_workers='+h.shadowCounts.plannerWorkers+' planner_events='+h.shadowCounts.plannerEvents);
    if(Array.isArray(h.writeStats)&&h.writeStats.length)console.log('WRITE_STATS '+h.writeStats.map(x=>x.action+'='+x.success_count+'ok/'+x.failure_count+'fail').join(' | '));
    await logLatencySummary();
  })
  .then(() => server.listen(PORT, '0.0.0.0', () => {
    console.log('DG-App-10 API listening on ' + PORT);
    if (!googlePingFresh()) {
      setTimeout(() => refreshGooglePing().catch(e => console.error('startup Google ping failed', e.message)), 0);
    }
  }))
  .catch(err => {
    console.error('Database initialization failed', err);
    process.exit(1);
  });
