export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(data));
}

export function assertMethod(req, expected) {
  if (req.method !== expected) {
    throw new HttpError(405, `Método ${req.method} não permitido.`);
  }
}

export async function readJsonBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      if (!req.body.trim()) return {};
      try {
        return JSON.parse(req.body);
      } catch {
        throw new HttpError(400, 'JSON inválido.');
      }
    }
    if (req.body && typeof req.body === 'object') return req.body;
    return {};
  }

  const chunks = [];
  let total = 0;
  const maxBytes = 16 * 1024;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new HttpError(413, 'Requisição muito grande.');
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function getPlayerToken(req) {
  const token = req.headers['x-player-token'];
  return typeof token === 'string' ? token.trim() : '';
}

export function getQueryParam(req, name) {
  const url = new URL(req.url || '/', 'http://localhost');
  return url.searchParams.get(name);
}

export function handleError(res, err) {
  if (err instanceof HttpError) {
    return sendJson(res, err.statusCode, { error: err.message });
  }
  console.error('[chessy-xr api error]', err);
  return sendJson(res, 500, { error: 'Erro interno do servidor.' });
}
