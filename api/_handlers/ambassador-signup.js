import { allowMethods, ok, readBody } from '../_lib/http.js';
import { rpc } from '../_lib/db.js';
import { validateAmbassador } from '../_lib/validate.js';

// POST /api/ambassador-signup {name, email, college} → open sign-up, returns the ambassador's code.
export default async function ambassadorSignup(req, res) {
  allowMethods(req, 'POST');
  const input = validateAmbassador(readBody(req));
  ok(res, await rpc('wl_ambassador_signup', input));
}
