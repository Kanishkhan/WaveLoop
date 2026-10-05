// Small response/request helpers shared by every /api handler.
// Every error uses one shape: { ok: false, error: { code, message, fields? } }.

export class HttpError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).json(body);
}

export function ok(res, body = {}) {
  send(res, 200, { ok: true, ...body });
}

export function fail(res, status, code, message, fields) {
  send(res, status, { ok: false, error: { code, message, ...(fields ? { fields } : {}) } });
}

export function allowMethods(req, ...methods) {
  if (!methods.includes(req.method)) {
    throw new HttpError(405, 'method_not_allowed', `Use ${methods.join(' or ')} for this endpoint.`);
  }
}

// Vercel parses JSON bodies for us; the local dev server and odd clients may hand us a string.
export function readBody(req) {
  const body = req.body;
  if (body == null || body === '') return {};
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  try {
    const parsed = JSON.parse(Buffer.isBuffer(body) ? body.toString('utf8') : body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}
  throw new HttpError(400, 'invalid_json', 'Request body must be a JSON object.');
}

export function query(req, name) {
  const v = req.query?.[name];
  return Array.isArray(v) ? v[0] : v;
}
