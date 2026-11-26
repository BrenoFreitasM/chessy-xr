import {
  ACTIVE_ROOM_TTL,
  JOIN_LIMIT,
  JOIN_WINDOW_SECONDS,
  generateToken,
  hashToken,
  isValidRoomCode,
  loadGame,
  normalizeRoomCode,
  snapshot,
  verifyPassword,
} from '../lib/chessRoom.js';
import { assertMethod, getClientIp, handleError, HttpError, readJsonBody, sendJson } from '../lib/http.js';
import { checkRateLimit, compareAndSetRoom, getRoom } from '../lib/store.js';

export default async function handler(req, res) {
  try {
    assertMethod(req, 'POST');
    const ip = getClientIp(req);
    const allowed = await checkRateLimit(`join:${ip}`, JOIN_LIMIT, JOIN_WINDOW_SECONDS);
    if (!allowed) {
      throw new HttpError(429, 'Muitas tentativas. Aguarde um minuto.');
    }

    const { roomCode: rawCode, password } = await readJsonBody(req);
    const roomCode = normalizeRoomCode(rawCode);
    if (!isValidRoomCode(roomCode)) {
      throw new HttpError(401, 'Código ou senha incorretos.');
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const found = await getRoom(roomCode);
      if (!found || !verifyPassword(password, found.room)) {
        throw new HttpError(401, 'Código ou senha incorretos.');
      }
      if (found.room.blackTokenHash || found.room.result) {
        throw new HttpError(409, 'Sala indisponível.');
      }

      const blackToken = generateToken();
      const nextRoom = {
        ...found.room,
        version: found.room.version + 1,
        blackTokenHash: hashToken(blackToken),
      };

      const saved = await compareAndSetRoom(roomCode, found.raw, nextRoom, ACTIVE_ROOM_TTL);
      if (saved) {
        const game = loadGame(nextRoom);
        return sendJson(res, 200, {
          roomCode,
          color: 'b',
          token: blackToken,
          state: snapshot(nextRoom, game),
        });
      }
    }

    throw new HttpError(409, 'Conflito ao entrar na sala. Tente novamente.');
  } catch (err) {
    return handleError(res, err);
  }
}
