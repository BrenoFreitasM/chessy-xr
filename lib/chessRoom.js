import { Chess } from 'chess.js';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const ACTIVE_ROOM_TTL = 60 * 60 * 6; // 6 horas
export const FINISHED_ROOM_TTL = 60 * 30; // 30 minutos
export const JOIN_LIMIT = 12;
export const JOIN_WINDOW_SECONDS = 60;

export function generateRoomCode() {
  return randomBytes(5).toString('hex').toUpperCase();
}

export function generateToken() {
  return randomBytes(24).toString('hex');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqualHex(aHex, bHex) {
  if (typeof aHex !== 'string' || typeof bHex !== 'string' || aHex.length !== bHex.length) {
    return false;
  }
  const a = Buffer.from(aHex, 'hex');
  const b = Buffer.from(bHex, 'hex');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export function validPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

export function hashPassword(password, saltHex) {
  return scryptSync(password, Buffer.from(saltHex, 'hex'), 64).toString('hex');
}

export function verifyPassword(password, room) {
  if (typeof password !== 'string' || password.length === 0 || password.length > 128) {
    return false;
  }
  return safeEqualHex(hashPassword(password, room.saltHex), room.passwordHashHex);
}

export function normalizeRoomCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

export function isValidRoomCode(roomCode) {
  return /^[0-9A-F]{10}$/.test(roomCode);
}

export function resolveSeat(room, token) {
  if (typeof token !== 'string' || token.length === 0 || token.length > 128) return null;
  const candidateHash = hashToken(token);
  if (room.whiteTokenHash && safeEqualHex(candidateHash, room.whiteTokenHash)) return 'w';
  if (room.blackTokenHash && safeEqualHex(candidateHash, room.blackTokenHash)) return 'b';
  return null;
}

export function loadGame(room) {
  const game = new Chess();
  if (room.pgn) {
    game.loadPgn(room.pgn);
  }
  return game;
}

export function snapshot(room, game = loadGame(room)) {
  return {
    version: room.version,
    fen: game.fen(),
    history: game.history(),
    turn: game.turn(),
    gameOver: game.isGameOver(),
    check: game.isCheck(),
    checkmate: game.isCheckmate(),
    draw: game.isDraw(),
    players: {
      white: Boolean(room.whiteTokenHash),
      black: Boolean(room.blackTokenHash),
    },
    result: room.result,
  };
}
