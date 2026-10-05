import { allowMethods, ok, readBody } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';
import { generateMessage } from '../_lib/copy.js';
import { validateCopyRequest } from '../_lib/validate.js';

// POST /api/copy-generate (admin) {language: en|ta|te, tone, college, ambassador_name, channel?, link?}
// → { message, source: "llm" | "template" }. Never fails just because the LLM is down.
export default async function copyGenerate(req, res) {
  allowMethods(req, 'POST');
  requireAdmin(req);
  const input = validateCopyRequest(readBody(req));
  ok(res, { language: input.language, ...(await generateMessage(input)) });
}
