'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;

const FILES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/version9.html', 'version9.html'],
  ['/app-5.0.css', 'app-5.0.css'],
  ['/core-9.0-final.js', 'core-9.0-final.js'],
  ['/customerflow-9.0-final.js', 'customerflow-9.0-final.js'],
  ['/payroll-9.0-final.js', 'payroll-9.0-final.js'],
  ['/ui-9.0-final.js', 'ui-9.0-final.js'],
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
  const etag = '"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
  const item = { body, etag, type: TYPES[path.extname(rel)] || 'application/octet-stream' };
  cache.set(rel, item);
  return item;
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
      phase: 'railway-mirror',
      frontend: '9.0-final',
      backend: 'Google-GS-9.0'
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
    if (req.headers['if-none-match'] === file.etag) {
      res.writeHead(304, { 'ETag': file.etag });
      return res.end();
    }

    const isHtml = rel.endsWith('.html');
    const isServiceWorker = rel === 'sw-9.0-final.js';
    const cacheControl = isHtml || isServiceWorker
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=31536000, immutable';

    res.writeHead(200, {
      'Content-Type': file.type,
      'Content-Length': file.body.length,
      'Cache-Control': cacheControl,
      'ETag': file.etag,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    if (req.method === 'HEAD') return res.end();
    res.end(file.body);
  } catch (err) {
    console.error(err);
    send(res, 500, 'Internal Server Error', { 'Cache-Control': 'no-store' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('DG-App-10 listening on port ' + PORT);
});
