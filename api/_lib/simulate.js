// Builds the 7-day campaign replay from the growth-plan assumptions.
// Output is deterministic for a given seed + run date, and always totals exactly:
//   619 sign-ups, 516 qualified (2027) final-years.
// Every row is generic ("Sim Student 0042", "Sample Engineering College 03") and is
// inserted with is_simulated = true by wl_sim_seed.

export const PLAN = {
  label: 'Model output from our assumptions, not campaign results',
  budget_inr: 2000,
  target_qualified: 500,
  days: 7,
  // channel: [qualified, not qualified]
  channels: {
    ambassador: [197, 39],
    referral: [111, 22],
    community: [105, 21],
    social: [81, 16],
    direct: [22, 5],
  },
  // How each channel's volume spreads across Day 1..7 (referrals compound late, communities spike early).
  dayWeights: {
    ambassador: [10, 14, 16, 16, 15, 15, 14],
    referral: [2, 8, 13, 17, 19, 20, 21],
    community: [16, 15, 14, 13, 13, 14, 15],
    social: [8, 12, 14, 15, 16, 17, 18],
    direct: [1, 1, 1, 1, 1, 1, 1],
  },
};

const SOURCE_LABEL = {
  ambassador: 'Campus ambassador',
  referral: 'Referral',
  community: 'Telegram / community',
  social: 'LinkedIn / Instagram',
  direct: 'Direct',
};

// Sign-ups by IST hour 08:00–23:59; evenings after class are busiest.
const HOUR_WEIGHTS = [2, 3, 4, 4, 5, 5, 4, 4, 5, 6, 7, 8, 9, 10, 9, 6];
const IST_OFFSET_MIN = 330;
const AMBASSADOR_COUNT = 12;
const AMBASSADOR_WEIGHTS = [18, 15, 13, 11, 10, 9, 7, 6, 4, 3, 2, 2];
const COLLEGE_COUNT = 12;
const GOALS = ['Build a first AI project', 'Improve my resume', 'Prepare for interviews', 'Learn by shipping'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(rand, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

// Largest-remainder split of n across weights, so per-channel totals stay exact.
function apportion(n, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (n * w) / total);
  const out = raw.map(Math.floor);
  let left = n - out.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).slice(0, left).forEach(([, i]) => out[i]++);
  return out;
}

// IST calendar date of `now`, as a UTC-midnight Date.
function istToday(now) {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60000);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
}

const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const pad = (n, w) => String(n).padStart(w, '0');

export function buildSimulation({ now = new Date(), seed = 2027 } = {}) {
  const rand = mulberry32(seed);
  const today = istToday(now);
  const dayStart = (d) => today - (PLAN.days - d) * 86400000 - IST_OFFSET_MIN * 60000; // d = 0..6, Day 7 = yesterday
  const usedMinutes = new Set();

  // Unique-minute timestamp on IST day `d` at or after `minMinuteOfDay`.
  function stamp(d, minMinuteOfDay = 8 * 60) {
    const base = dayStart(d);
    for (let attempt = 0; attempt < 60; attempt++) {
      const hour = 8 + pickWeighted(rand, HOUR_WEIGHTS);
      const minute = hour * 60 + Math.floor(rand() * 60);
      if (minute < minMinuteOfDay) continue;
      const key = base / 60000 + minute;
      if (!usedMinutes.has(key)) {
        usedMinutes.add(key);
        return base + minute * 60000 + Math.floor(rand() * 60) * 1000;
      }
    }
    for (let minute = minMinuteOfDay; minute < 24 * 60; minute++) {
      const key = base / 60000 + minute;
      if (!usedMinutes.has(key)) {
        usedMinutes.add(key);
        return base + minute * 60000 + Math.floor(rand() * 60) * 1000;
      }
    }
    throw new Error(`No free minute left on simulated day ${d + 1}`);
  }

  const college = (i) => `Sample Engineering College ${pad(i + 1, 2)}`;

  // Ambassadors join the day before launch.
  const ambassadors = Array.from({ length: AMBASSADOR_COUNT }, (_, i) => ({
    name: `Sim Ambassador ${pad(i + 1, 2)}`,
    email: `sim-ambassador-${pad(i + 1, 2)}@sim.waveloop.invalid`,
    college: college(i % COLLEGE_COUNT),
    code: `SIM-AMB${pad(i + 1, 2)}`,
    created_at: dayStart(-1) + (17 * 60 + i * 7) * 60000 + 12000,
  }));

  // Decide each row's channel, qualification and day — exact counts first, randomness second.
  const slots = [];
  for (const [channel, [qualified, notQualified]] of Object.entries(PLAN.channels)) {
    const qDays = apportion(qualified, PLAN.dayWeights[channel]);
    const nDays = apportion(notQualified, PLAN.dayWeights[channel]);
    qDays.forEach((n, d) => { for (let k = 0; k < n; k++) slots.push({ channel, qualified: true, day: d }); });
    nDays.forEach((n, d) => { for (let k = 0; k < n; k++) slots.push({ channel, qualified: false, day: d }); });
  }

  // Non-referral rows are timestamped first so referral rows always have earlier people to credit.
  for (const s of slots) if (s.channel !== 'referral') s.at = stamp(s.day);
  for (const s of slots) if (s.channel === 'referral') s.at = stamp(s.day, s.day === 0 ? 12 * 60 : 8 * 60);
  slots.sort((a, b) => a.at - b.at);

  const registrations = [];
  const sharers = []; // registrants who actively share their link (about 1 in 4)
  slots.forEach((s, i) => {
    const n = i + 1;
    const ambIndex = pickWeighted(rand, AMBASSADOR_WEIGHTS);
    const row = {
      name: `Sim Student ${pad(n, 4)}`,
      email: `sim-student-${pad(n, 4)}@sim.waveloop.invalid`,
      college: s.channel === 'ambassador' ? ambassadors[ambIndex].college : college(Math.floor(rand() * COLLEGE_COUNT)),
      branch: ['CSE', 'CSE', 'CSE', 'CSE', 'IT', 'IT', 'ECE', 'ECE', 'ECE', 'Other'][Math.floor(rand() * 10)],
      graduation_year: s.qualified ? 2027 : rand() < 0.8 ? 2026 : null,
      goal: GOALS[Math.floor(rand() * GOALS.length)],
      channel: s.channel,
      referral_source: SOURCE_LABEL[s.channel],
      referred_by_code: null,
      own_referral_code: `SIM-S${pad(n, 4)}`,
      created_at: new Date(s.at).toISOString(),
    };
    if (s.channel === 'ambassador') row.referred_by_code = ambassadors[ambIndex].code;
    if (s.channel === 'referral') {
      const pool = sharers.length ? sharers : registrations;
      if (!pool.length) throw new Error('Referral row has no earlier registrant to credit');
      // Earlier sharers have had longer to share, so they get more weight.
      const idx = Math.floor(Math.pow(rand(), 1.6) * pool.length);
      row.referred_by_code = pool[idx].own_referral_code;
    }
    registrations.push(row);
    if (s.qualified && rand() < 0.25) sharers.push(row);
  });

  ambassadors.forEach((a) => (a.created_at = new Date(a.created_at).toISOString()));

  return {
    seed,
    window_start: isoDate(today - PLAN.days * 86400000),
    window_end: isoDate(today - 86400000),
    params: {
      label: PLAN.label,
      budget_inr: PLAN.budget_inr,
      target_qualified: PLAN.target_qualified,
      channels: PLAN.channels,
      day_weights: PLAN.dayWeights,
      timezone: 'Asia/Kolkata',
    },
    ambassadors,
    registrations,
  };
}
