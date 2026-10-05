import { allowMethods, ok, query } from '../_lib/http.js';
import { rpc } from '../_lib/db.js';
import { intParam, scopeParam } from '../_lib/validate.js';

// GET /api/leaderboard?limit=10&scope=all|real|sim → ambassadors ranked by verified 2027 sign-ups only.
export default async function leaderboard(req, res) {
  allowMethods(req, 'GET');
  const limit = intParam(query(req, 'limit'), { min: 1, max: 50, fallback: 10, key: 'limit' });
  const scope = scopeParam(query(req, 'scope'));
  ok(res, await rpc('wl_leaderboard', { limit, scope }));
}
