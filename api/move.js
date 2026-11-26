import {
  ACTIVE_ROOM_TTL,
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

    const from = String(body?.from || '');
    const to = String(body?.to || '');
    const promotion = String(body?.promotion || 'q').toLowerCase();
    if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to) || !/^[qrbn]$/.test(promotion)) {
      throw new HttpError(400, 'Jogada inválida.');
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
      if (!found.room.whiteTokenHash || !found.room.blackTokenHash || found.room.result || game.isGameOver()) {
        throw new HttpError(409, 'Partida indisponível.');
      }

      if (game.turn() !== color) {
        throw new HttpError(409, 'Aguarde sua vez.');
      }

      try {
        game.move({ from, to, promotion });
      } catch {
        throw new HttpError(400, 'Movimento ilegal.');
      }

      const nextRoom = {
        ...found.room,
        version: found.room.version + 1,
        pgn: game.pgn(),
      };
      const ttl = game.isGameOver() ? FINISHED_ROOM_TTL : ACTIVE_ROOM_TTL;
      const saved = await compareAndSetRoom(roomCode, found.raw, nextRoom, ttl);
      if (saved) {
        return sendJson(res, 200, { state: snapshot(nextRoom, game) });
      }
    }

    throw new HttpError(409, 'Conflito ao registrar o movimento. Tente novamente.');
  } catch (err) {
    return handleError(res, err);
  }
}
