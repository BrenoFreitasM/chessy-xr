import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Chess } from 'chess.js';
import './style.css';

const SESSION_KEY = 'chessy-xr-session';
const POLL_INTERVAL_MS = 1500;
const glyph = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟︎',
};

function loadSavedSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.roomCode && parsed?.token && (parsed.color === 'w' || parsed.color === 'b')) {
      return parsed;
    }
  } catch {
    // Ignore storage errors (e.g., private browsing)
  }
  return null;
}

function saveSession(session) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore storage errors
  }
}

async function apiRequest(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['x-player-token'] = token;

  const response = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const err = new Error(data?.error || 'Erro de comunicação com o servidor.');
    err.status = response.status;
    throw err;
  }
  return data;
}

function App() {
  const [session, setSession] = useState(() => loadSavedSession());
  const [input, setInput] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [promotion, setPromotion] = useState(null);
  const [busy, setBusy] = useState(false);

  const versionRef = useRef(0);
  versionRef.current = state?.version ?? 0;

  const room = session?.roomCode || '';
  const color = session?.color || null;
  const token = session?.token || '';

  const clearMatch = useCallback((message = '') => {
    saveSession(null);
    setSession(null);
    setState(null);
    setSelected(null);
    setPromotion(null);
    setError(message);
  }, []);

  const applyState = useCallback(nextState => {
    setState(nextState);
    setSelected(null);
    setPromotion(null);
  }, []);

  const syncState = useCallback(async (forceFull = false) => {
    if (!room || !token) return;
    const queryVersion = forceFull ? '' : `&v=${versionRef.current}`;
    try {
      const data = await apiRequest(
        `/api/state?roomCode=${encodeURIComponent(room)}${queryVersion}`,
        { token }
      );
      if (!data.unchanged && data.state) {
        applyState(data.state);
      }
      setError('');
    } catch (err) {
      if (err.status === 401 || err.status === 403 || err.status === 404) {
        clearMatch(err.message || 'Sala expirada ou indisponível.');
      } else {
        setError(err.message);
      }
    }
  }, [room, token, applyState, clearMatch]);

  const ready = Boolean(state?.players.white && state?.players.black);
  const finished = Boolean(state?.gameOver || state?.result);

  useEffect(() => {
    if (!room || !token) return undefined;
    if (!state) {
      syncState(true);
    }
    if (finished) return undefined;

    let cancelled = false;
    let timerId = null;

    const scheduleNext = () => {
      if (cancelled) return;
      timerId = window.setTimeout(async () => {
        if (document.visibilityState === 'visible') {
          await syncState(false);
        }
        scheduleNext();
      }, POLL_INTERVAL_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncState(false);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    scheduleNext();

    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [room, token, state, finished, syncState]);

  const game = useMemo(() => new Chess(state?.fen), [state?.fen]);
  const myTurn = ready && !finished && !busy && state?.turn === color;
  const files = color === 'b' ? 'hgfedcba' : 'abcdefgh';
  const ranks = color === 'b' ? '12345678' : '87654321';

  async function handleCreate() {
    if (busy || password.length < 8) return;
    setBusy(true);
    setError('');
    try {
      const data = await apiRequest('/api/create', {
        method: 'POST',
        body: { password },
      });
      const nextSession = { roomCode: data.roomCode, color: data.color, token: data.token };
      saveSession(nextSession);
      setSession(nextSession);
      applyState(data.state);
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (busy || password.length < 8 || input.length !== 10) return;
    setBusy(true);
    setError('');
    try {
      const data = await apiRequest('/api/join', {
        method: 'POST',
        body: { roomCode: input, password },
      });
      const nextSession = { roomCode: data.roomCode, color: data.color, token: data.token };
      saveSession(nextSession);
      setSession(nextSession);
      applyState(data.state);
      setPassword('');
      setInput('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendMove(move) {
    setBusy(true);
    setError('');
    try {
      const data = await apiRequest('/api/move', {
        method: 'POST',
        token,
        body: { roomCode: room, ...move },
      });
      applyState(data.state);
    } catch (err) {
      setError(err.message);
      await syncState(true);
    } finally {
      setBusy(false);
    }
  }

  async function handleResign() {
    if (busy || !ready || finished) return;
    if (!window.confirm('Desistir da partida?')) return;
    setBusy(true);
    setError('');
    try {
      const data = await apiRequest('/api/resign', {
        method: 'POST',
        token,
        body: { roomCode: room },
      });
      applyState(data.state);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleLeave() {
    if (!finished && !window.confirm('Sair desta sala?')) return;
    clearMatch();
  }

  function squareClick(square) {
    if (!myTurn || promotion) return;
    const piece = game.get(square);
    if (piece?.color === color) {
      setSelected(square === selected ? null : square);
      return;
    }
    if (!selected) return;
    const moves = game.moves({ square: selected, verbose: true }).filter(m => m.to === square);
    if (!moves.length) {
      setSelected(null);
      return;
    }
    if (moves.some(m => m.isPromotion())) {
      setPromotion({ from: selected, to: square });
      return;
    }
    const from = selected;
    setSelected(null);
    sendMove({ from, to: square });
  }

  function status() {
    if (!state) return 'Carregando sala…';
    if (state.result) return state.result;
    if (state.checkmate) return `Xeque-mate! ${state.turn === 'w' ? 'Pretas' : 'Brancas'} venceram.`;
    if (state.draw) return 'Partida empatada.';
    if (!ready) return 'Aguardando o segundo jogador…';
    return `${state.turn === 'w' ? 'Brancas' : 'Pretas'} jogam${state.check ? ' — xeque!' : '.'}`;
  }

  return (
    <main>
      <h1>♟ Chessy XR</h1>
      <p>Partidas privadas para dois jogadores. Sem dicas.</p>
      {!room ? (
        <section className="lobby">
          <div className="join">
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Senha privada (mín. 8)"
              maxLength={128}
            />
            <button disabled={busy || password.length < 8} onClick={handleCreate}>
              Criar sala privada
            </button>
          </div>
          <div className="join">
            <input
              value={input}
              onChange={e => setInput(e.target.value.toUpperCase())}
              placeholder="Código da sala"
              maxLength={10}
            />
            <button disabled={busy || password.length < 8 || input.length !== 10} onClick={handleJoin}>
              Entrar na sala
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="info">
            Sala privada: <strong>{room}</strong>{' '}
            <button onClick={() => navigator.clipboard?.writeText(room)}>Copiar código</button>
          </div>
          <p className="small">Compartilhe o código e a senha apenas com seu convidado.</p>
          <p>Você joga com as {color === 'w' ? 'brancas' : 'pretas'}.</p>
          <h2>{status()}</h2>
          <div className="board" role="grid" aria-label="Tabuleiro de xadrez">
            {[...ranks].flatMap(rank =>
              [...files].map(file => {
                const square = file + rank;
                const piece = game.get(square);
                const dark = ('abcdefgh'.indexOf(file) + Number(rank)) % 2 === 0;
                return (
                  <button
                    key={square}
                    role="gridcell"
                    aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'branca' : 'preta'} ${piece.type}` : ''}`}
                    className={`square ${dark ? 'dark' : 'light'} ${selected === square ? 'selected' : ''}`}
                    onClick={() => squareClick(square)}
                  >
                    <span className={piece?.color === 'w' ? 'whitepiece' : 'blackpiece'}>
                      {piece ? glyph[piece.color + piece.type] : ''}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {promotion && (
            <div className="promotion">
              <p>Escolha a peça para promoção:</p>
              {['q', 'r', 'b', 'n'].map(p => (
                <button
                  key={p}
                  disabled={busy}
                  onClick={() => {
                    const pending = promotion;
                    setPromotion(null);
                    sendMove({ ...pending, promotion: p });
                  }}
                >
                  {glyph[color + p]}
                </button>
              ))}
            </div>
          )}
          <div className="actions">
            <button disabled={busy || !ready || finished} onClick={handleResign}>
              Desistir
            </button>
            <button disabled={busy} onClick={handleLeave}>
              {finished ? 'Nova partida' : 'Sair da sala'}
            </button>
          </div>
          <p className="small">Movimentos: {state?.history?.join(' ') || 'Nenhum ainda.'}</p>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
