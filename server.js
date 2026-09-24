'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;

const FILES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/version9.html', 'version9.html'],
  ['/app-5.0.css', 'app-5.0.css'],
  ['/core-9.0-final.js', 'core-9.0-final.js'],
  ['/employee-controls-10.0.js', 'employee-controls-10.0.js'],
  ['/inspection-quick-10.0.js', 'inspection-quick-10.0.js'],
  ['/customerflow-9.0-final.js', 'customerflow-9.0-final.js'],
  ['/payroll-9.0-final.js', 'payroll-9.0-final.js'],
  ['/ui-9.0-final.js', 'ui-9.0-final.js'],
  ['/railway-cutover-10.0.js', 'railway-cutover-10.0.js'],
  ['/manifest.json', 'manifest.json'],
  ['/sw-9.0-final.js', 'sw-9.0-final.js'],
  ['/dg_icon_192.png', 'dg_icon_192.png'],
  ['/dg_icon_512.png', 'dg_icon_512.png']
]);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png'
};

const cache = new Map();

function load(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const abs = path.join(ROOT, rel);
  const body = fs.readFileSync(abs);
  const type = TYPES[path.extname(rel)] || 'application/octet-stream';
  const hash = crypto.createHash('sha1').update(body).digest('hex');
  const compressible = /^(text\/|application\/(javascript|json))/.test(type);
  const item = {
    body,
    type,
    variants: {
      identity: { body, etag: '"' + hash + '-id"' }
    }
  };
  if (compressible && body.length >= 1024) {
    const gzip = zlib.gzipSync(body, { level: 6 });
    const br = zlib.brotliCompressSync(body, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 }
    });
    item.variants.gzip = { body: gzip, etag: '"' + hash + '-gz"', encoding: 'gzip' };
    item.variants.br = { body: br, etag: '"' + hash + '-br"', encoding: 'br' };
  }
  cache.set(rel, item);
  return item;
}

function chooseVariant(file, acceptEncoding) {
  const a = String(acceptEncoding || '').toLowerCase();
  if (file.variants.br && /(^|[,\s])br([,\s]|$)/.test(a)) return file.variants.br;
  if (file.variants.gzip && /(^|[,\s])gzip([,\s]|$)/.test(a)) return file.variants.gzip;
  return file.variants.identity;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...headers
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/health') {
    return send(res, 200, JSON.stringify({
      ok: true,
      app: 'DG-App-10',
      phase: 'final-cutover',
      frontend: '10.0',
      backend: 'Railway'
    }), {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { 'Allow': 'GET, HEAD' });
  }

  const rel = FILES.get(url.pathname);
  if (!rel) return send(res, 404, 'Not Found', { 'Cache-Control': 'no-store' });

  try {
    const file = load(rel);
    const variant = chooseVariant(file, req.headers['accept-encoding']);
    const isHtml = rel.endsWith('.html');
    const isServiceWorker = rel === 'sw-9.0-final.js';
    const cacheControl = isHtml || isServiceWorker
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=31536000, immutable';

    const commonHeaders = {
      'Cache-Control': cacheControl,
      'ETag': variant.etag,
      'Vary': 'Accept-Encoding',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    };
    if (variant.encoding) commonHeaders['Content-Encoding'] = variant.encoding;

    if (req.headers['if-none-match'] === variant.etag) {
      res.writeHead(304, commonHeaders);
      return res.end();
    }

    res.writeHead(200, {
      'Content-Type': file.type,
      'Content-Length': variant.body.length,
      ...commonHeaders
    });
    if (req.method === 'HEAD') return res.end();
    res.end(variant.body);
  } catch (err) {
    console.error(err);
    send(res, 500, 'Internal Server Error', { 'Cache-Control': 'no-store' });
  }
});

for (const rel of new Set(FILES.values())) {
  try { load(rel); } catch (e) { console.error('Preload failed for', rel, e.message); }
}

server.listen(PORT, '0.0.0.0', () => {
  const core = cache.get('core-9.0-final.js');
  const coreInfo = core && core.variants.br
    ? ' core=' + core.body.length + 'B br=' + core.variants.br.body.length + 'B gzip=' + core.variants.gzip.body.length + 'B'
    : '';
  console.log('DG-App-10 listening on port ' + PORT + ' compression=br,gzip' + coreInfo);
});
