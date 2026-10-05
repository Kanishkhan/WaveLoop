// Local dev server: serves the static site and runs /api/* through the same handler Vercel uses.
//   npm run dev            → http://localhost:3000
// Reads .env.local / .env if present. If SUPABASE_URL is not set it starts an in-process
// Postgres (PGlite, data in .localdb/) and applies db/001_waveloop.sql, so no cloud account is
// needed to try the full flow. Set WAVELOOP_DB=memory for a throwaway database.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const file of ['.env.local', '.env']) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

if (!process.env.SUPABASE_URL) {
  const { PGlite } = await import('@electric-sql/pglite');
  const memory = process.env.WAVELOOP_DB === 'memory';
  const db = new PGlite(memory ? undefined : path.join(root, '.localdb'));
  await db.exec(fs.readFileSync(path.join(root, 'db', '001_waveloop.sql'), 'utf8'));
  globalThis.__WAVELOOP_DB__ = {
    async rpc(fn, payload) {
      if (!/^wl_[a-z_]+$/.test(fn)) throw new Error(`Bad function name ${fn}`);
      const { rows } = await db.query(`select public.${fn}($1::jsonb) as r`, [JSON.stringify(payload ?? {})]);
      return rows[0].r;
    },
  };
  console.log(`[dev] Local Postgres (PGlite, ${memory ? 'in-memory' : '.localdb/'}) with db/001_waveloop.sql applied`);
} else {
  console.log(`[dev] Using Supabase at ${process.env.SUPABASE_URL}`);
}
if (!process.env.ADMIN_PASSCODE) console.log('[dev] ADMIN_PASSCODE is not set — the command center login will be refused.');
console.log(`[dev] LLM: ${process.env.LLM_API_KEY ? 'LLM_API_KEY set' : 'no LLM_API_KEY → template fallback'}`);

const { default: apiHandler } = await import(pathToFileURL(path.join(root, 'api', '[route].js')).href);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/markdown',
};
const PUBLIC = new Set(['.html', '.css', '.js', '.svg', '.png', '.ico']);

function vercelResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
    return res;
  };
  return res;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const started = Date.now();

  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    req.query = { ...Object.fromEntries(url.searchParams), route: url.pathname.slice(5).replace(/\/+$/, '') };
    req.body = raw;
    if (raw && /json/.test(req.headers['content-type'] || '')) {
      try { req.body = JSON.parse(raw); } catch {}
    }
    await apiHandler(req, vercelResponse(res));
    console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`);
    return;
  }

  let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
  if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
  const inside = file.startsWith(root + path.sep) && !file.includes(`${path.sep}node_modules${path.sep}`) &&
    !file.includes(`${path.sep}.localdb`) && !file.includes(`${path.sep}api${path.sep}`);
  if (!inside || !PUBLIC.has(path.extname(file)) || !fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`[dev] WaveLoop on http://localhost:${port}  (command center: /admin.html)`));
