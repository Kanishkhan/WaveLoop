import { allowMethods, ok, query } from '../_lib/http.js';
import { rpc } from '../_lib/db.js';
import { scopeParam } from '../_lib/validate.js';

// GET /api/channel-breakdown?scope=… → sign-ups and qualified sign-ups per attribution channel.
export default async function channelBreakdown(req, res) {
  allowMethods(req, 'GET');
  ok(res, await rpc('wl_channel_breakdown', { scope: scopeParam(query(req, 'scope')) }));
}
