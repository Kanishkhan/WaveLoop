import { allowMethods, ok, query } from '../_lib/http.js';
import { rpc } from '../_lib/db.js';
import { scopeParam } from '../_lib/validate.js';

// GET /api/stats?scope=all|real|sim → totals, qualified vs the 500 target, referral counts.
export default async function stats(req, res) {
  allowMethods(req, 'GET');
  ok(res, await rpc('wl_stats', { scope: scopeParam(query(req, 'scope')) }));
}
