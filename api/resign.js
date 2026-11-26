import {
  FINISHED_ROOM_TTL,
  isValidRoomCode,
  loadGame,
  normalizeRoomCode,
  resolveSeat,
  snapshot,
} from '../lib/chessRoom.js';
import {
  assertMethod,
  getPlayerToken,
  handleError,
  HttpError,
  readJsonBody,
  sendJson,
} from '../lib/http.js';
import { compareAndSetRoom, getRoom } from '../lib/store.js';

export default async function handler(req, res) {
  try {
    assertMethod(req, 'POST');
    const token = getPlayerToken(req);
    const body = await readJsonBody(req);
    const roomCode = normalizeRoomCode(body?.roomCode);

    if (!isValidRoomCode(roomCode) || !token) {
      throw new HttpError(401, 'Entre em uma sala primeiro.');
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const found = await getRoom(roomCode);
      if (!found) {
        throw new HttpError(404, 'Sala não encontrada ou expirada.');
      }

      const color = resolveSeat(found.room, token);
      if (!color) {
        throw new HttpError(403, 'Acesso negado a esta sala.');
      }

      const game = loadGame(found.room);
      if (found.room.result || game.isGameOver() || !found.room.whiteTokenHash || !found.room.blackTokenHash) {
        return sendJson(res, 200, { state: snapshot(found.room, game) });
      }

      const nextRoom = {
        ...found.room,
        version: found.room.version + 1,
        result: `${color === 'w' ? 'Pretas' : 'Brancas'} venceram por desistência.`,
      };

      const saved = await compareAndSetRoom(roomCode, found.raw, nextRoom, FINISHED_ROOM_TTL);
      if (saved) {
        return sendJson(res, 200, { state: snapshot(nextRoom, game) });
      }
    }

    throw new HttpError(409, 'Conflito ao desistir. Tente novamente.');
  } catch (err) {
    return handleError(res, err);
  }
}
