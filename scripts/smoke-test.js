// End-to-end API checks for the "done means" list.
//   npm run dev                         (in one terminal, with ADMIN_PASSCODE set)
//   ADMIN_PASSCODE=... npm test         (in another)
// BASE_URL defaults to http://localhost:3000. Against a deployed URL only /api/health is checked,
// unless you pass --allow-writes (that would add test rows to the real database).
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE);
const writes = local || process.argv.includes('--allow-writes');
const PASS = process.env.ADMIN_PASSCODE;

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
};

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
}

const run = Date.now().toString(36);
const student = (n, extra) => ({
  name: `Smoke Test ${n}`, email: `smoke-${run}-${n}@example.com`, college: 'Smoke Test College',
  branch: 'CSE', graduation_year: '2027', goal: 'Build a first AI project', referral_source: 'Direct', ...extra,
});

console.log(`WaveLoop smoke test → ${BASE}\n`);

console.log('(e) health');
const health = await call('health');
check('/api/health returns ok', health.status === 200 && health.data?.status === 'ok', JSON.stringify(health.data));

if (!writes) {
  console.log('\nRemote URL: skipping write tests (pass --allow-writes to run them).');
  process.exit(failures ? 1 : 0);
}

console.log('\nValidation');
const bad = await call('register', { method: 'POST', body: { name: 'x', email: 'nope', branch: 'Mech' } });
check('invalid registration → 400 validation_error with fields', bad.status === 400 && bad.data?.error?.code === 'validation_error' && bad.data.error.fields?.email, JSON.stringify(bad.data?.error?.fields));
const noAuth = await call('admin-overview');
check('admin endpoint without passcode → 401', noAuth.status === 401 && noAuth.data?.error?.code === 'unauthorized');
const wrong = await call('admin-login', { method: 'POST', body: { passcode: 'definitely-wrong' } });
check('wrong passcode → 401', wrong.status === 401);

console.log('\n(a) ?ref= credits the referrer');
const amb = await call('ambassador-signup', { method: 'POST', body: { name: `Smoke Ambassador ${run}`, email: `smoke-amb-${run}@example.com`, college: 'Smoke Test College' } });
const ambCode = amb.data?.ambassador?.code;
check('ambassador open sign-up returns a code', amb.status === 200 && /^AMB-/.test(ambCode || ''), ambCode);

const s1 = await call('register', { method: 'POST', body: student(1, { referred_by_code: ambCode.toLowerCase(), src: 'Campus ambassador' }) });
const s1Code = s1.data?.registration?.own_referral_code;
check('registration returns personal referral code', !!s1Code, s1Code);
check('new registrant starts at 0/5 real progress', s1.data?.progress?.verified === 0 && s1.data.progress.goal === 5);
check('ambassador ref credited, channel = ambassador', s1.data?.referral?.status === 'credited' && s1.data.registration.channel === 'ambassador');

const s2 = await call('register', { method: 'POST', body: student(2, { referred_by_code: s1Code, src: 'Referral' }) });
check('student ref credited, channel = referral', s2.data?.referral?.status === 'credited' && s2.data.registration.channel === 'referral');
const s3 = await call('register', { method: 'POST', body: student(3, { referred_by_code: s1Code, graduation_year: '2026' }) });
check('2026 sign-up is recorded but does not count', s3.data?.referral?.status === 'credited' && s3.data.referral.counts_toward_rewards === false);
const p1 = await call(`referral-progress?code=${s1Code}`);
check('referrer progress = 1 verified, 1 not qualified, milestone 1 unlocked',
  p1.data?.progress?.verified === 1 && p1.data.progress.not_qualified === 1 && p1.data.progress.milestones[0].unlocked && !p1.data.progress.milestones[1].unlocked,
  JSON.stringify(p1.data?.progress));
const dup = await call('register', { method: 'POST', body: student(1) });
check('re-registering same email returns the same code', dup.data?.existing === true && dup.data.registration.own_referral_code === s1Code);
const unknown = await call('register', { method: 'POST', body: student(4, { referred_by_code: 'NOPE-00000' }) });
check('unknown ref code → no credit, still registered', unknown.data?.referral?.status === 'unknown_code' && unknown.data.registration.referred_by_code === null);
const gr = await call(`get-registration?code=${s1Code}`);
check('get-registration returns no email', gr.status === 200 && !JSON.stringify(gr.data).includes('@example.com'));

console.log('\n(b) leaderboard reflects new verified sign-ups (pages poll every 12 s)');
const before = (await call('leaderboard?limit=50&scope=real')).data.rows.find((r) => r.code === ambCode)?.verified ?? 0;
const t0 = Date.now();
await call('register', { method: 'POST', body: student(5, { referred_by_code: ambCode }) });
await call('register', { method: 'POST', body: student(6, { referred_by_code: ambCode, graduation_year: 'Other' }) });
const after = (await call('leaderboard?limit=50&scope=real')).data.rows.find((r) => r.code === ambCode)?.verified ?? 0;
check('verified count +1 for the qualified sign-up only (non-2027 ignored)', after === before + 1, `${before} → ${after} in ${Date.now() - t0} ms`);
const ambStats = await call(`ambassador-stats?code=${ambCode}`);
check('ambassador-stats agrees', ambStats.data?.ambassador?.verified === after);

if (!PASS) {
  console.log('\nADMIN_PASSCODE not set: skipping (c) simulation and (d) message writer.');
  process.exit(failures ? 1 : 0);
}
const token = (await call('admin-login', { method: 'POST', body: { passcode: PASS } })).data?.token;
check('admin login', !!token);

console.log('\n(c) simulation');
const sim = await call('simulate-run', { method: 'POST', body: { action: 'run' }, token });
const t = sim.data?.totals || {};
check('exactly 619 total', t.total === 619, String(t.total));
check('exactly 516 qualified', t.qualified === 516, String(t.qualified));
const want = { ambassador: 197, referral: 111, community: 105, social: 81, direct: 22 };
check('qualified by channel 197/111/105/81/22', Object.entries(want).every(([c, n]) => t.qualified_by_channel?.[c] === n), JSON.stringify(t.qualified_by_channel));
check('never two sign-ups in the same minute', t.max_signups_in_one_minute === 1, `max per minute = ${t.max_signups_in_one_minute}`);
const istToday = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const istStartOfToday = Date.parse(`${istToday}T00:00:00+05:30`);
const yesterday = new Date(istStartOfToday - 86400000 + 330 * 60000).toISOString().slice(0, 10);
check('every timestamp is in the past (before today IST)', Date.parse(t.last_signup_at) < istStartOfToday, `last = ${t.last_signup_at}`);
check('Day 7 ends yesterday', sim.data?.run?.window_end === yesterday, `${sim.data?.run?.window_start} → ${sim.data?.run?.window_end}`);
const series = await call('daily-series?scope=sim');
check('7 IST days, cumulative ends at 619 / 516', series.data.days.length === 7 && series.data.days.at(-1).cum_total === 619 && series.data.days.at(-1).cum_qualified === 516,
  series.data.days.map((d) => `${d.day.slice(5)}:${d.total}`).join(' '));
const simLb = await call('leaderboard?scope=sim');
check('simulated leaderboard rows are flagged', simLb.data.rows.length > 0 && simLb.data.rows.every((r) => r.is_simulated));
const realStats = await call('stats?scope=real');
check('real-only stats exclude simulation', realStats.data.includes_simulated === false && realStats.data.total < 619);
const rerun = await call('simulate-run', { method: 'POST', body: { action: 'run' }, token });
check('re-running replaces (still 619, not 1238)', rerun.data?.totals?.total === 619);

console.log('\n(d) message writer');
for (const language of ['en', 'ta', 'te']) {
  const r = await call('copy-generate', { method: 'POST', token, body: { language, tone: 'peer', college: 'Sample Engineering College 03', ambassador_name: 'Priya' } });
  const script = { en: /[a-z]/i, ta: /[஀-௿]/, te: /[ఀ-౿]/ }[language];
  check(`${language}: message returned (${r.data?.source}${r.data?.fallback_reason ? `: ${r.data.fallback_reason}` : ''})`,
    r.status === 200 && script.test(r.data?.message || '') && r.data.message.includes('Priya'), (r.data?.message || '').split('\n')[0]);
}
const badCopy = await call('copy-generate', { method: 'POST', token, body: { language: 'hi', college: '', ambassador_name: '' } });
check('copy-generate validates input', badCopy.status === 400 && badCopy.data.error.fields.language);

if (process.argv.includes('--reset-sim')) {
  const reset = await call('simulate-run', { method: 'POST', body: { action: 'reset' }, token });
  check('reset removes simulated rows', reset.data?.deleted_registrations === 619);
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
