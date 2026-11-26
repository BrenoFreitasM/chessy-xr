import { randomBytes } from 'node:crypto';
import { Chess } from 'chess.js';
import {
  ACTIVE_ROOM_TTL,
  generateRoomCode,
  generateToken,
  hashPassword,
  hashToken,
  snapshot,
  validPassword,
} from '../lib/chessRoom.js';
import { assertMethod, handleError, HttpError, readJsonBody, sendJson } from '../lib/http.js';
import { createRoomIfAbsent } from '../lib/store.js';

export default async function handler(req, res) {
  try {
    assertMethod(req, 'POST');
    const { password } = await readJsonBody(req);
    if (!validPassword(password)) {
      throw new HttpError(400, 'A senha deve ter de 8 a 128 caracteres.');
    }

    const saltHex = randomBytes(16).toString('hex');
    const passwordHashHex = hashPassword(password, saltHex);
    const whiteToken = generateToken();
    const game = new Chess();

    const roomData = {
      version: 1,
      pgn: '',
      whiteTokenHash: hashToken(whiteToken),
      blackTokenHash: null,
      result: null,
      saltHex,
      passwordHashHex,
    };

    let roomCode = '';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateRoomCode();
      const created = await createRoomIfAbsent(candidate, roomData, ACTIVE_ROOM_TTL);
      if (created) {
        roomCode = candidate;
        break;
      }
    }

    if (!roomCode) {
      throw new HttpError(503, 'Não foi possível gerar uma sala agora. Tente novamente.');
    }

    return sendJson(res, 201, {
      roomCode,
      color: 'w',
      token: whiteToken,
      state: snapshot(roomData, game),
    });
  } catch (err) {
    return handleError(res, err);
  }
}
