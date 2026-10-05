import { allowMethods, fail, ok, query } from '../_lib/http.js';
import { rpc } from '../_lib/db.js';
import { requireCode } from '../_lib/validate.js';

// GET /api/ambassador-stats?code=AMB-… → verified sign-ups, rank and milestones for one ambassador.
export default async function ambassadorStats(req, res) {
  allowMethods(req, 'GET');
  const code = requireCode(query(req, 'code'));
  const result = await rpc('wl_ambassador_stats', { code });
  if (!result.ok) return fail(res, 404, 'not_found', 'No ambassador with that code.');
  ok(res, result);
}
