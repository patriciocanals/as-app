// Servidor local completo: archivos estáticos + la MISMA API que usa Netlify, guardando en .data/store.json
//   node dev-server.mjs            (puerto 8080)     PORT=9000 INVITE_CODE=secreto node dev-server.mjs
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from './netlify/lib/core.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8080;
const file = process.env.DATA_FILE || path.join(root, '.data', 'store.json');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

let db = {};
if (existsSync(file)) { try { db = JSON.parse(await readFile(file, 'utf8')); } catch { db = {}; } }
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(async () => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(db)); });
  return writing;
};
const storage = {
  get: async (k) => (k in db ? structuredClone(db[k]) : null),
  set: async (k, v) => { db[k] = structuredClone(v); await persist(); },
  delete: async (k) => { delete db[k]; await persist(); },
};
const api = createApi(storage, { inviteCode: process.env.INVITE_CODE || '' });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    let raw = '';
    for await (const c of req) raw += c;
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { /* cuerpo no JSON */ }
    const r = await api({ method: req.method, path: url.pathname, headers: req.headers, body });
    res.writeHead(r.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(r.json));
    return;
  }
  let p = path.normalize(decodeURIComponent(url.pathname));
  if (p.endsWith('/')) p += 'index.html';
  const full = path.join(root, p);
  if (!full.startsWith(root) || /[\\/](\.data|netlify|tests|node_modules)[\\/]/.test(full)) { res.writeHead(404); res.end('404'); return; }
  try {
    const buf = await readFile(full);
    res.writeHead(200, { 'content-type': mime[path.extname(full)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('404'); }
}).listen(port, () => console.log(`http://localhost:${port}  (datos en ${path.relative(root, file)})`));
