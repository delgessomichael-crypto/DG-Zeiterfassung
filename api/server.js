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

async function initDb() {
  if (!pool) return;
  await pool.query(schema);
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
  if (pool) {
    try {
      const q = await pool.query('SELECT 1 AS ok');
      database = q.rows[0] && q.rows[0].ok === 1 ? 'ok' : 'error';
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
    postgresWrites: 'migration-shadow-only'
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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') {
      cors(req,res);
      res.writeHead(204);
      return res.end();
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, await health(), req);
    }

    if (req.method === 'GET' && url.pathname === '/v1/migration/counts') {
      if (!authorized(req)) return json(res, 401, { ok:false, error:'Unauthorized' }, req);
      return json(res, 200, await counts(), req);
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
  .then(() => server.listen(PORT, '0.0.0.0', () => console.log('DG-App-10 API listening on ' + PORT)))
  .catch(err => {
    console.error('Database initialization failed', err);
    process.exit(1);
  });
