import { allowMethods, fail, ok, query } from '../_lib/http.js';
import { rpc } from '../_lib/db.js';
import { requireCode } from '../_lib/validate.js';

// GET /api/get-registration?code=ABC-12345 → public registration summary (no email).
export default async function getRegistration(req, res) {
  allowMethods(req, 'GET');
  const code = requireCode(query(req, 'code'));
  const result = await rpc('wl_get_registration', { code });
  if (!result.ok) return fail(res, 404, 'not_found', 'No registration with that referral code.');
  ok(res, result);
}
