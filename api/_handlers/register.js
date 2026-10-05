import { allowMethods, ok, readBody } from '../_lib/http.js';
import { rpc } from '../_lib/db.js';
import { validateRegistration } from '../_lib/validate.js';

// POST /api/register → registration + personal referral code + live referral progress.
// A valid ?ref= code credits the referrer; only qualified (2027) sign-ups count toward rewards.
export default async function register(req, res) {
  allowMethods(req, 'POST');
  const input = validateRegistration(readBody(req));
  ok(res, await rpc('wl_register', input));
}
