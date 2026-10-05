// Input validation. Each validator returns a clean value or throws a 400 with per-field messages.
import { HttpError } from './http.js';

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,23}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f<>]/;

export const BRANCHES = ['CSE', 'IT', 'ECE', 'Other'];
export const SCOPES = ['all', 'real', 'sim'];

// Self-reported "How did you hear about this?" answers (and ?src= values) → attribution channel.
const CHANNEL_MAP = [
  [/ambassador|campus/i, 'ambassador'],
  [/referr?al|friend/i, 'referral'],
  [/telegram|community|placement|whatsapp/i, 'community'],
  [/linkedin|instagram|social|creator|youtube/i, 'social'],
];
export function channelFromSource(...sources) {
  for (const s of sources) {
    if (!s) continue;
    for (const [re, channel] of CHANNEL_MAP) if (re.test(s)) return channel;
  }
  return 'direct';
}

function text(body, key, { min = 1, max, required = true, label = key }, errors) {
  const raw = body[key];
  const v = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : raw == null ? '' : String(raw).trim();
  if (!v) {
    if (required) errors[key] = `${label} is required.`;
    return '';
  }
  if (v.length < min) errors[key] = `${label} must be at least ${min} characters.`;
  else if (v.length > max) errors[key] = `${label} must be at most ${max} characters.`;
  else if (CONTROL_RE.test(v)) errors[key] = `${label} contains characters that are not allowed.`;
  return v;
}

function email(body, errors) {
  const v = String(body.email ?? '').trim().toLowerCase();
  if (!v) errors.email = 'Email is required.';
  else if (v.length > 254 || !EMAIL_RE.test(v)) errors.email = 'Enter a valid email address.';
  return v;
}

export function referralCode(value, errors, key = 'referred_by_code') {
  const v = String(value ?? '').trim().toUpperCase();
  if (!v) return '';
  if (!CODE_RE.test(v)) errors[key] = 'Referral codes look like PRANA-9K2Q1 (letters, numbers and dashes).';
  return v;
}

function done(value, errors) {
  if (Object.keys(errors).length) {
    throw new HttpError(400, 'validation_error', 'Some fields need attention.', errors);
  }
  return value;
}

export function validateRegistration(body) {
  const errors = {};
  const name = text(body, 'name', { min: 2, max: 80, label: 'Name' }, errors);
  const mail = email(body, errors);
  const college = text(body, 'college', { min: 2, max: 120, label: 'College' }, errors);

  const branch = String(body.branch ?? '').trim();
  const branchMatch = BRANCHES.find((b) => b.toLowerCase() === branch.toLowerCase());
  if (!branchMatch) errors.branch = 'Branch must be CSE, IT, ECE or Other.';

  // The form offers 2027 / 2026 / Other. "Other" is stored as null (never qualified).
  const yearRaw = String(body.graduation_year ?? body.year ?? '').trim();
  let graduation_year = null;
  if (!yearRaw) errors.graduation_year = 'Graduation year is required.';
  else if (/^other$/i.test(yearRaw)) graduation_year = null;
  else if (/^\d{4}$/.test(yearRaw) && +yearRaw >= 2020 && +yearRaw <= 2035) graduation_year = +yearRaw;
  else errors.graduation_year = 'Graduation year must be a year between 2020 and 2035, or "Other".';

  const goal = text(body, 'goal', { max: 80, required: false, label: 'Goal' }, errors);
  const referral_source = text(body, 'referral_source', { max: 60, required: false, label: 'Source' }, errors);
  const utm = text(body, 'src', { max: 40, required: false, label: 'Source tag' }, errors);
  const referred_by_code = referralCode(body.referred_by_code ?? body.referredBy, errors);

  return done({
    name, email: mail, college, branch: branchMatch, graduation_year, goal,
    referral_source: referral_source || utm || 'Direct',
    channel: channelFromSource(utm, referral_source),
    referred_by_code,
  }, errors);
}

export function validateAmbassador(body) {
  const errors = {};
  const name = text(body, 'name', { min: 2, max: 80, label: 'Name' }, errors);
  const mail = email(body, errors);
  const college = text(body, 'college', { min: 2, max: 120, label: 'College' }, errors);
  return done({ name, email: mail, college }, errors);
}

export function requireCode(value, key = 'code') {
  const errors = {};
  const code = referralCode(value, errors, key);
  if (!code && !errors[key]) errors[key] = 'A referral code is required.';
  return done(code, errors);
}

export function scopeParam(value) {
  const v = String(value ?? 'all').toLowerCase();
  if (!SCOPES.includes(v)) throw new HttpError(400, 'validation_error', 'scope must be all, real or sim.', { scope: 'Invalid scope.' });
  return v;
}

export function intParam(value, { min, max, fallback, key }) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, 'validation_error', `${key} must be a whole number from ${min} to ${max}.`, { [key]: 'Out of range.' });
  }
  return n;
}

export function validateCopyRequest(body) {
  const errors = {};
  const language = String(body.language ?? 'en').toLowerCase();
  if (!['en', 'ta', 'te'].includes(language)) errors.language = 'Language must be en, ta or te.';
  const tone = String(body.tone ?? 'direct').toLowerCase();
  if (!['direct', 'peer', 'urgency'].includes(tone)) errors.tone = 'Tone must be direct, peer or urgency.';
  const college = text(body, 'college', { min: 2, max: 80, label: 'College' }, errors);
  const ambassador_name = text(body, 'ambassador_name', { min: 2, max: 60, label: 'Ambassador name' }, errors);
  const channel = text(body, 'channel', { max: 40, required: false, label: 'Channel' }, errors) || 'Campus ambassador';
  const link = text(body, 'link', { max: 200, required: false, label: 'Link' }, errors);
  if (link && !/^https?:\/\/\S+$/i.test(link)) errors.link = 'Link must start with http:// or https://';
  return done({ language, tone, college, ambassador_name, channel, link }, errors);
}
