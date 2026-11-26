import { Redis } from '@upstash/redis';
import { HttpError } from './http.js';

const ROOM_PREFIX = 'chessy:room:';
const RATE_PREFIX = 'chessy:rate:';

const CAS_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
  return 1
end
return 0
`;

const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return current
`;

let cachedRedis = null;
let cachedKey = '';

function getRedisCredentials() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
  return { url: url.trim(), token: token.trim() };
}

function getRedisClient() {
  const { url, token } = getRedisCredentials();
  if (!url || !token) return null;
  const cacheKey = `${url}|${token}`;
  if (!cachedRedis || cachedKey !== cacheKey) {
    cachedRedis = new Redis({
      url,
      token,
      automaticDeserialization: false,
    });
    cachedKey = cacheKey;
  }
  return cachedRedis;
}

function getMemoryStore() {
  if (!globalThis.__chessyMemoryStore) {
    globalThis.__chessyMemoryStore = {
      rooms: new Map(),
      rates: new Map(),
      warned: false,
    };
  }
  if (!globalThis.__chessyMemoryStore.warned && process.env.NODE_ENV !== 'test') {
    globalThis.__chessyMemoryStore.warned = true;
    console.log('[chessy-xr] UPSTASH_REDIS_REST_URL não definida; usando memória local para desenvolvimento.');
  }
  return globalThis.__chessyMemoryStore;
}

function getBackend() {
  const redis = getRedisClient();
  if (redis) return { type: 'redis', redis };
  if (process.env.VERCEL === '1') {
    throw new HttpError(
      503,
      'Armazenamento Redis não configurado na Vercel. Conecte o Upstash Redis no Marketplace da Vercel.'
    );
  }
  return { type: 'memory', mem: getMemoryStore() };
}

export function getStoreInfo() {
  const { url, token } = getRedisCredentials();
  if (url && token) return { mode: 'upstash-redis' };
  if (process.env.VERCEL === '1') return { mode: 'unconfigured' };
  return { mode: 'memory' };
}

export async function createRoomIfAbsent(roomCode, roomData, ttlSeconds) {
  const key = ROOM_PREFIX + roomCode;
  const raw = JSON.stringify(roomData);
  const backend = getBackend();

  if (backend.type === 'redis') {
    const result = await backend.redis.set(key, raw, { nx: true, ex: ttlSeconds });
    return result === 'OK';
  }

  const now = Date.now();
  const existing = backend.mem.rooms.get(key);
  if (existing && existing.expiresAt > now) {
    return false;
  }
  backend.mem.rooms.set(key, { raw, expiresAt: now + ttlSeconds * 1000 });
  return true;
}

export async function getRoom(roomCode) {
  const key = ROOM_PREFIX + roomCode;
  const backend = getBackend();

  if (backend.type === 'redis') {
    const raw = await backend.redis.get(key);
    if (typeof raw !== 'string') return null;
    return { room: JSON.parse(raw), raw };
  }

  const entry = backend.mem.rooms.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    backend.mem.rooms.delete(key);
    return null;
  }
  return { room: JSON.parse(entry.raw), raw: entry.raw };
}

export async function compareAndSetRoom(roomCode, expectedRaw, nextRoom, ttlSeconds) {
  const key = ROOM_PREFIX + roomCode;
  const nextRaw = JSON.stringify(nextRoom);
  const backend = getBackend();

  if (backend.type === 'redis') {
    const updated = await backend.redis.eval(CAS_SCRIPT, [key], [expectedRaw, nextRaw, String(ttlSeconds)]);
    return Number(updated) === 1;
  }

  const now = Date.now();
  const entry = backend.mem.rooms.get(key);
  if (!entry || entry.expiresAt <= now || entry.raw !== expectedRaw) {
    return false;
  }
  backend.mem.rooms.set(key, { raw: nextRaw, expiresAt: now + ttlSeconds * 1000 });
  return true;
}

export async function checkRateLimit(identifier, limit, windowSeconds) {
  const key = RATE_PREFIX + identifier;
  const backend = getBackend();

  if (backend.type === 'redis') {
    const count = await backend.redis.eval(RATE_LIMIT_SCRIPT, [key], [String(windowSeconds)]);
    return Number(count) <= limit;
  }

  const now = Date.now();
  const entry = backend.mem.rates.get(key);
  if (!entry || entry.expiresAt <= now) {
    backend.mem.rates.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}
