import {
  isValidRoomCode,
  normalizeRoomCode,
  resolveSeat,
  snapshot,
} from '../lib/chessRoom.js';
import {
  assertMethod,
  getPlayerToken,
  getQueryParam,
  handleError,
  HttpError,
  sendJson,
} from '../lib/http.js';
import { getRoom } from '../lib/store.js';

export default async function handler(req, res) {
  try {
    assertMethod(req, 'GET');
    const roomCode = normalizeRoomCode(getQueryParam(req, 'roomCode'));
    const token = getPlayerToken(req);

    if (!isValidRoomCode(roomCode) || !token) {
      throw new HttpError(401, 'Sessão inválida.');
    }

    const found = await getRoom(roomCode);
    if (!found) {
      throw new HttpError(404, 'Sala não encontrada ou expirada.');
    }

    const color = resolveSeat(found.room, token);
    if (!color) {
      throw new HttpError(403, 'Acesso negado a esta sala.');
    }

    const clientVersion = Number(getQueryParam(req, 'v'));
    if (Number.isInteger(clientVersion) && clientVersion === found.room.version) {
      return sendJson(res, 200, {
        unchanged: true,
        version: found.room.version,
      });
    }

    return sendJson(res, 200, {
      unchanged: false,
      version: found.room.version,
      color,
      state: snapshot(found.room),
    });
  } catch (err) {
    return handleError(res, err);
  }
}
