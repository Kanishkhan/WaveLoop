// Single Vercel function that serves every /api/<name> endpoint.
// Each endpoint lives in its own small module under api/_handlers/ (underscore folders are not
// deployed as separate functions), which keeps the deployment inside the Hobby plan's function cap.
import { HttpError, fail } from './_lib/http.js';
import adminLogin from './_handlers/admin-login.js';
import adminOverview from './_handlers/admin-overview.js';
import ambassadorSignup from './_handlers/ambassador-signup.js';
import ambassadorStats from './_handlers/ambassador-stats.js';
import ambassadorsList from './_handlers/ambassadors-list.js';
import channelBreakdown from './_handlers/channel-breakdown.js';
import copyGenerate from './_handlers/copy-generate.js';
import dailySeries from './_handlers/daily-series.js';
import getRegistration from './_handlers/get-registration.js';
import health from './_handlers/health.js';
import leaderboard from './_handlers/leaderboard.js';
import referralProgress from './_handlers/referral-progress.js';
import register from './_handlers/register.js';
import simulateRun from './_handlers/simulate-run.js';
import stats from './_handlers/stats.js';

export const routes = {
  'admin-login': adminLogin,
  'admin-overview': adminOverview,
  'ambassador-signup': ambassadorSignup,
  'ambassador-stats': ambassadorStats,
  'ambassadors-list': ambassadorsList,
  'channel-breakdown': channelBreakdown,
  'copy-generate': copyGenerate,
  'daily-series': dailySeries,
  'get-registration': getRegistration,
  health,
  leaderboard,
  'referral-progress': referralProgress,
  register,
  'simulate-run': simulateRun,
  stats,
};

export default async function handler(req, res) {
  const name = String(req.query?.route ?? '').toLowerCase();
  const route = Object.hasOwn(routes, name) ? routes[name] : null;
  if (!route) return fail(res, 404, 'not_found', `Unknown endpoint /api/${name}.`);
  try {
    await route(req, res);
  } catch (err) {
    if (err instanceof HttpError) return fail(res, err.status, err.code, err.message, err.fields);
    console.error(`[api/${name}]`, err);
    fail(res, 500, 'internal_error', 'Something went wrong on our side. Please try again.');
  }
}
