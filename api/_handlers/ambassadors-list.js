import { allowMethods, ok, query } from '../_lib/http.js';
import { rpc } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { scopeParam } from '../_lib/validate.js';

// GET /api/ambassadors-list?scope=… (admin) → every ambassador with contact email and verified count.
export default async function ambassadorsList(req, res) {
  allowMethods(req, 'GET');
  requireAdmin(req);
  ok(res, await rpc('wl_ambassadors_list', { scope: scopeParam(query(req, 'scope')) }));
}
