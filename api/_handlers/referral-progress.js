import { allowMethods, fail, ok, query } from '../_lib/http.js';
import { rpc } from '../_lib/db.js';
import { requireCode } from '../_lib/validate.js';

// GET /api/referral-progress?code=… → verified referrals and 1/3/5 milestones (student or ambassador code).
export default async function referralProgress(req, res) {
  allowMethods(req, 'GET');
  const code = requireCode(query(req, 'code'));
  const result = await rpc('wl_referral_progress', { code });
  if (!result.ok) return fail(res, 404, 'not_found', 'That referral code does not exist.');
  ok(res, result);
}
