'use strict';

const http = require('http');
const crypto = require('crypto');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL || '';
const GOOGLE_BACKEND_URL = process.env.GOOGLE_BACKEND_URL || '';
const MIGRATION_TOKEN = process.env.MIGRATION_TOKEN || '';

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

function json(res, status, body) {
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

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, await health());
    }

    if (req.method === 'GET' && url.pathname === '/v1/migration/counts') {
      if (!authorized(req)) return json(res, 401, { ok:false, error:'Unauthorized' });
      return json(res, 200, await counts());
    }

    if (req.method === 'POST' && url.pathname === '/v1/migration/shadow') {
      if (!authorized(req)) return json(res, 401, { ok:false, error:'Unauthorized' });
      return json(res, 200, await shadowUpsert(await readBody(req)));
    }

    return json(res, 404, { ok:false, error:'Not Found' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { ok:false, error:e && e.message ? e.message : String(e) });
  }
});

initDb()
  .then(() => server.listen(PORT, '0.0.0.0', () => console.log('DG-App-10 API listening on ' + PORT)))
  .catch(err => {
    console.error('Database initialization failed', err);
    process.exit(1);
  });
