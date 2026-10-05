import { allowMethods, fail, ok, readBody } from '../_lib/http.js';
import { checkPasscode, issueToken } from '../_lib/auth.js';

// POST /api/admin-login {passcode} → short-lived bearer token for the command center.
export default async function adminLogin(req, res) {
  allowMethods(req, 'POST');
  const passcode = String(readBody(req).passcode ?? '');
  if (!passcode) return fail(res, 400, 'validation_error', 'Enter the admin passcode.', { passcode: 'Required.' });
  if (!checkPasscode(passcode)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return fail(res, 401, 'invalid_passcode', 'That passcode is not correct.');
  }
  ok(res, issueToken());
}
