// Database access = one call per Postgres function defined in db/001_waveloop.sql.
// Production: Supabase REST (POST /rest/v1/rpc/<fn>) with the service-role key, server-side only.
// Local dev: scripts/dev-server.js installs an in-process Postgres (PGlite) as globalThis.__WAVELOOP_DB__.
import { HttpError } from './http.js';

export function dbConfigured() {
  return Boolean(globalThis.__WAVELOOP_DB__ || (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY));
}

export async function rpc(fn, payload = {}) {
  if (globalThis.__WAVELOOP_DB__) return globalThis.__WAVELOOP_DB__.rpc(fn, payload);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new HttpError(503, 'db_not_configured', 'Database is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.');
  }

  const headers = { apikey: key, 'Content-Type': 'application/json' };
  // Legacy service_role keys are JWTs and go in Authorization too; new sb_secret_ keys must not.
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;

  let response;
  try {
    response = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p: payload }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error(`[db] ${fn} network error`, err);
    throw new HttpError(503, 'db_unreachable', 'Could not reach the database. Try again in a moment.');
  }

  const text = await response.text();
  if (!response.ok) {
    console.error(`[db] ${fn} failed`, response.status, text);
    if (text.includes('23505')) throw new HttpError(409, 'conflict', 'That record already exists.');
    if (text.includes('23514') || text.includes('22P02')) throw new HttpError(400, 'invalid_input', 'The database rejected one of the values.');
    if (response.status === 404 || text.includes('PGRST202')) {
      throw new HttpError(503, 'db_not_migrated', 'Database functions are missing. Run db/001_waveloop.sql in Supabase.');
    }
    throw new HttpError(502, 'db_error', 'The database returned an error.');
  }
  return text ? JSON.parse(text) : null;
}
