'use strict';

const http = require('http');
const crypto = require('crypto');
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
  const cleanupTimer = setInterval(() => {
    cleanupInternalData().catch(e => console.error('internal cleanup failed', e.message));
  }, 6 * 60 * 60 * 1000);
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

  const latencyTimer = setInterval(() => {
    logLatencySummary().catch(e => console.error('latency summary failed', e.message));
  }, 5 * 60 * 1000);
  if (typeof latencyTimer.unref === 'function') latencyTimer.unref();

  const pingTimer = setInterval(() => {
    refreshGooglePing().catch(e => console.error('scheduled Google ping failed', e.message));
  }, GOOGLE_PING_TTL_MS);
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

function json(res, status, body, req) {
  if (req) cors(req, res);
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': data.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(data);
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
  'getAbsences',
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
  'getPlannerWorkers',
  'getPlannerAvailability',
  'getPlannerEvents',
  'getObjectReports',
  'checkRegieBillingRisk'
]);

const READ_CACHE_TTL_MS = 60 * 60 * 1000;
const GOOGLE_PING_TTL_MS = 60 * 60 * 1000;
let googlePingCache = null;

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
         JSON.stringify(parsed), upstream.status, Math.max(0,Date.now()-startedAt)]
      )
    ]);
  }
  return value;
}

function sendGooglePingCache(req,res,value) {
  cors(req,res);
  res.writeHead(Number(value.httpStatus||200),{
    'Content-Type':value.contentType||'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'X-DG-Ping-Cache':'HIT',
    'X-DG-Ping-Age':String(Math.max(0,Math.floor((Date.now()-new Date(value.checkedAt).getTime())/1000))),
    'X-Content-Type-Options':'nosniff'
  });
  return res.end(value.raw);
}

async function handlePing(req,res) {
  if (googlePingFresh()) return sendGooglePingCache(req,res,googlePingCache);
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

async function isEmployeeSnapshotDirty() {
  if (!pool) return true;
  const q = await pool.query("SELECT value FROM app_meta WHERE key='employee_snapshot_dirty'");
  if (!q.rowCount) return false;
  const v = q.rows[0].value;
  return v === true || (v && v.dirty === true);
}

async function markEmployeeSnapshotDirty(action) {
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

function sanitizedLogPayload(body) {
  const clone = Object.assign({}, body || {});
  for (const key of Object.keys(clone)) {
    if (SENSITIVE_REQUEST_FIELDS.has(key) && clone[key] !== undefined) clone[key] = '[redacted]';
  }
  return clone;
}

function isCacheableAction(action) {
  return CACHEABLE_ACTIONS.has(action);
}

function shouldBypassReadCache(body) {
  return Boolean(body && body.force);
}

async function readCachedResponse(action, body) {
  if (!pool || !isCacheableAction(action) || shouldBypassReadCache(body)) return null;
  const payload = normalizedCachePayload(body);
  const key = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const q = await pool.query(
    "SELECT response_text,http_status,created_at FROM response_cache WHERE cache_key=$1 AND created_at > now() - interval '1 hour'",
    [key]
  );
  if (!q.rowCount) return null;
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

async function invalidateReadCache() {
  if (!pool) return;
  await pool.query('TRUNCATE response_cache');
}


function cellValue(cell) {
  return cell && Object.prototype.hasOwnProperty.call(cell, 'v') ? cell.v : null;
}

async function getEmployeesFromSnapshot() {
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
    cors(req,res);
    res.writeHead(cached.httpStatus,{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store',
      'X-DG-Cache':'HIT',
      'X-DG-Cache-Age':String(Math.max(0,Math.floor((Date.now()-new Date(cached.createdAt).getTime())/1000))),
      'X-Content-Type-Options':'nosniff'
    });
    return res.end(cached.responseText);
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
      if (isCacheableAction(action)) {
        writeCachedResponse(action, body, raw, upstream.status).catch(e=>console.error('response cache write failed',e.message));
      } else if (action && action !== 'ping' && action !== 'employeeLogin') {
        invalidateReadCache().catch(e=>console.error('response cache invalidation failed',e.message));
      }
      if (EMPLOYEE_MUTATION_ACTIONS.has(action) && upstream.status === 200 && parsed && parsed.ok !== false) {
        markEmployeeSnapshotDirty(action).catch(e=>console.error('employee snapshot dirty flag failed',e.message));
      }
      pool.query(
        `INSERT INTO legacy_action_log(action,request_payload,response_ok,response_payload,http_status,duration_ms)
         VALUES($1,$2::jsonb,$3,$4::jsonb,$5,$6)`,
        [action,JSON.stringify(sanitizedLogPayload(body)),Boolean(parsed && parsed.ok !== false),
         parsed ? JSON.stringify(parsed) : null,upstream.status,Math.max(0,Date.now()-upstreamStartedAt)]
      ).catch(e=>console.error('legacy action log failed',e.message));
    }
    cors(req,res);
    res.writeHead(upstream.status,{
      'Content-Type':upstream.headers.get('content-type')||'application/json; charset=utf-8',
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff'
    });
    return res.end(raw);
  } catch (e) {
    if (pool) {
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
    readCacheTtlSeconds: READ_CACHE_TTL_MS / 1000
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
