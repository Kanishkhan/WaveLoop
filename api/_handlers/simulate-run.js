import { HttpError, allowMethods, ok, readBody } from '../_lib/http.js';
import { rpc } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { PLAN, buildSimulation } from '../_lib/simulate.js';
import { intParam } from '../_lib/validate.js';

// GET  /api/simulate-run (admin)               → current simulated totals + last run
// POST /api/simulate-run {action:"run", seed?} → wipe old simulated rows, seed the 7-day replay
// POST /api/simulate-run {action:"reset"}      → delete every is_simulated row
export default async function simulateRun(req, res) {
  allowMethods(req, 'GET', 'POST');
  requireAdmin(req);
  if (req.method === 'GET') return ok(res, { label: PLAN.label, ...(await rpc('wl_sim_status')) });

  const body = readBody(req);
  const action = String(body.action ?? 'run');
  if (action === 'reset') return ok(res, { label: PLAN.label, ...(await rpc('wl_sim_reset')) });
  if (action !== 'run') throw new HttpError(400, 'validation_error', 'action must be "run" or "reset".', { action: 'Invalid action.' });

  const seed = intParam(body.seed, { min: 1, max: 2147483647, fallback: 2027, key: 'seed' });
  const result = await rpc('wl_sim_seed', buildSimulation({ seed }));
  const t = result.totals;
  const expectedByChannel = Object.fromEntries(Object.entries(PLAN.channels).map(([c, [q]]) => [c, q]));
  const matches_plan = t.total === 619 && t.qualified === 516 &&
    Object.entries(expectedByChannel).every(([c, q]) => t.qualified_by_channel[c] === q);
  ok(res, {
    label: PLAN.label,
    matches_plan,
    expected: { total: 619, qualified: 516, qualified_by_channel: expectedByChannel },
    ...result,
  });
}
