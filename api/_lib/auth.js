// Single-passcode admin auth. admin-login trades ADMIN_PASSCODE for a signed, expiring token;
// changing the passcode invalidates every token issued with the old one. No user accounts.
import crypto from 'node:crypto';
import { HttpError } from './http.js';

const TTL_MS = 12 * 60 * 60 * 1000;

function secret() {
  const pass = process.env.ADMIN_PASSCODE;
  if (!pass) throw new HttpError(503, 'admin_not_configured', 'ADMIN_PASSCODE is not set on the server.');
  return pass;
}

const sign = (payload) => crypto.createHmac('sha256', secret()).update(`waveloop-admin.${payload}`).digest('base64url');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function checkPasscode(candidate) {
  return safeEqual(candidate, secret());
}

export function issueToken() {
  const exp = Date.now() + TTL_MS;
  return { token: `${exp}.${sign(exp)}`, expires_at: new Date(exp).toISOString() };
}

export function requireAdmin(req) {
  const header = req.headers?.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const [exp, sig] = token.split('.');
  const valid = exp && sig && Number(exp) > Date.now() && safeEqual(sig, sign(exp));
  if (!valid) throw new HttpError(401, 'unauthorized', 'Admin passcode required. Log in to the command center again.');
}
