import { allowMethods, ok, query } from '../_lib/http.js';
import { rpc } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { intParam, scopeParam } from '../_lib/validate.js';

// GET /api/admin-overview?scope=…&recent=25 (admin) → everything the command center renders, in one call.
export default async function adminOverview(req, res) {
  allowMethods(req, 'GET');
  requireAdmin(req);
  const scope = scopeParam(query(req, 'scope'));
  const recent_limit = intParam(query(req, 'recent'), { min: 1, max: 200, fallback: 25, key: 'recent' });
  ok(res, await rpc('wl_admin_overview', { scope, recent_limit }));
}
