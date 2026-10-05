import { allowMethods, send } from '../_lib/http.js';
import { dbConfigured, rpc } from '../_lib/db.js';

// GET /api/health → { ok: true, status: "ok", ... } when the API and database are reachable.
export default async function health(req, res) {
  allowMethods(req, 'GET', 'HEAD');
  const checks = {
    db: 'not_configured',
    llm: process.env.LLM_API_KEY ? 'configured' : 'fallback_templates',
    admin: process.env.ADMIN_PASSCODE ? 'configured' : 'missing',
  };
  if (dbConfigured()) {
    try {
      await rpc('wl_health');
      checks.db = 'ok';
    } catch (err) {
      checks.db = err.code || 'error';
    }
  }
  const healthy = checks.db === 'ok';
  send(res, healthy ? 200 : 503, { ok: healthy, status: healthy ? 'ok' : 'degraded', checks, time: new Date().toISOString() });
}
