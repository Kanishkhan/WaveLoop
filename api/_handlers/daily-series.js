import { allowMethods, ok, query } from '../_lib/http.js';
import { rpc } from '../_lib/db.js';
import { scopeParam } from '../_lib/validate.js';

// GET /api/daily-series?scope=… → per-day and cumulative sign-ups (IST days).
export default async function dailySeries(req, res) {
  allowMethods(req, 'GET');
  ok(res, await rpc('wl_daily_series', { scope: scopeParam(query(req, 'scope')) }));
}
