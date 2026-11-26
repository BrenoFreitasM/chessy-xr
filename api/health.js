import { assertMethod, handleError, sendJson } from '../lib/http.js';
import { getStoreInfo } from '../lib/store.js';

export default async function handler(req, res) {
  try {
    assertMethod(req, 'GET');
    const info = getStoreInfo();
    return sendJson(res, 200, { ok: true, storage: info.mode });
  } catch (err) {
    return handleError(res, err);
  }
}
