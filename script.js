// ---------------------------
// Chess Engine + UI
// ---------------------------
const boardEl = document.getElementById('board');
const turnLabel = document.getElementById('turnLabel');
const stateLabel = document.getElementById('stateLabel');
const historyList = document.getElementById('historyList');
const restartBtn = document.getElementById('restartBtn');
const undoBtn = document.getElementById('undoBtn');
const flipBtn = document.getElementById('flipBtn');
const aiBtn = document.getElementById('aiBtn');
const promotionModal = document.getElementById('promotionModal');
const promotionOptions = document.getElementById('promotionOptions');
const winModal = document.getElementById('winModal');
const winMessage = document.getElementById('winMessage');
const playAgainBtn = document.getElementById('playAgainBtn');
const PIECES = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const FILES = 'abcdefgh';

let game = {};
let selected = null;
let legalMoves = [];
let flipped = false;
let aiEnabled = false;

function createInitialBoard() {
  const empty = () => Array.from({ length: 8 }, () => null);
  const board = Array.from({ length: 8 }, empty);
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

  for (let x = 0; x < 8; x++) {
    board[0][x] = { type: back[x], color: 'b', hasMoved: false };
    board[1][x] = { type: 'p', color: 'b', hasMoved: false };
    board[6][x] = { type: 'p', color: 'w', hasMoved: false };
    board[7][x] = { type: back[x], color: 'w', hasMoved: false };
  }
  return board;
}

function initGame() {
  game = {
    board: createInitialBoard(),
    currentPlayer: 'w',
    enPassant: null,
    history: [],
    snapshots: [],
    lastMove: null,
    status: 'playing',
  };
  selected = null;
  legalMoves = [];
  generateBoard();
  render();
}

function generateBoard() {
  boardEl.innerHTML = '';
  for (let i = 0; i < 64; i++) {
    const square = document.createElement('div');
    square.className = 'square';
    square.dataset.index = String(i);
    square.addEventListener('click', onSquareClick);
    square.addEventListener('dragover', (e) => e.preventDefault());
    square.addEventListener('drop', onDropSquare);
    boardEl.appendChild(square);
  }
}

function boardToScreen(x, y) {
  if (!flipped) return { sx: x, sy: y };
  return { sx: 7 - x, sy: 7 - y };
}

function screenToBoard(sx, sy) {
  if (!flipped) return { x: sx, y: sy };
  return { x: 7 - sx, y: 7 - sy };
}

function render() {
  const squares = [...boardEl.children];
  squares.forEach((sq, i) => {
    const sx = i % 8;
    const sy = Math.floor(i / 8);
    const { x, y } = screenToBoard(sx, sy);
    const piece = game.board[y][x];

    sq.className = `square ${(sx + sy) % 2 === 0 ? 'light' : 'dark'}`;
    sq.innerHTML = '';
    sq.dataset.x = String(x);
    sq.dataset.y = String(y);

    if (selected && selected.x === x && selected.y === y) sq.classList.add('selected');
    if (game.lastMove) {
      if (game.lastMove.from.x === x && game.lastMove.from.y === y) sq.classList.add('last-from');
      if (game.lastMove.to.x === x && game.lastMove.to.y === y) sq.classList.add('last-to');
    }

    const kingPos = findKing(game.board, game.currentPlayer);
    if (kingPos && kingPos.x === x && kingPos.y === y && isSquareAttacked(game.board, x, y, opposite(game.currentPlayer))) {
      sq.classList.add('in-check');
    }

    const move = legalMoves.find((m) => m.to.x === x && m.to.y === y);
    if (move) sq.classList.add(move.capture ? 'capture' : 'legal');

    if (piece) {
      const span = document.createElement('span');
      span.className = 'piece';
      span.textContent = PIECES[piece.color][piece.type];
      span.draggable = piece.color === game.currentPlayer && game.status === 'playing';
      span.dataset.x = String(x);
      span.dataset.y = String(y);
      span.addEventListener('dragstart', onDragStartPiece);
      span.addEventListener('dragend', (e) => e.target.classList.remove('dragging'));
      sq.appendChild(span);
    }
  });

  turnLabel.textContent = `Turn: ${game.currentPlayer === 'w' ? 'White' : 'Black'}`;
  stateLabel.textContent = stateMessage();
  renderHistory();
}

function stateMessage() {
  if (game.status === 'checkmate') return `Checkmate! ${game.currentPlayer === 'w' ? 'Black' : 'White'} wins.`;
  if (game.status === 'stalemate') return 'Stalemate! Draw.';
  if (game.status === 'check') return 'Check!';
  return 'Game in progress.';
}

function renderHistory() {
  historyList.innerHTML = '';
  for (let i = 0; i < game.history.length; i += 2) {
    const li = document.createElement('li');
    const white = game.history[i] || '';
    const black = game.history[i + 1] || '';
    li.textContent = `${Math.floor(i / 2) + 1}. ${white} ${black}`.trim();
    historyList.appendChild(li);
  }
}

function onSquareClick(e) {
  if (game.status !== 'playing' && game.status !== 'check') return;
  const sq = e.currentTarget;
  const x = Number(sq.dataset.x);
  const y = Number(sq.dataset.y);
  handleSelectionOrMove(x, y);
}

function onDragStartPiece(e) {
  const x = Number(e.target.dataset.x);
  const y = Number(e.target.dataset.y);
  e.target.classList.add('dragging');
  e.dataTransfer.setData('text/plain', `${x},${y}`);
  selected = { x, y };
  legalMoves = getLegalMoves(game.board, x, y, game.currentPlayer, game.enPassant);
  render();
}

function onDropSquare(e) {
  if (!e.dataTransfer) return;
  const src = e.dataTransfer.getData('text/plain');
  if (!src) return;
  const [fx, fy] = src.split(',').map(Number);
  const x = Number(e.currentTarget.dataset.x);
  const y = Number(e.currentTarget.dataset.y);
  tryMove(fx, fy, x, y);
}

function handleSelectionOrMove(x, y) {
  const piece = game.board[y][x];
  if (selected) {
    if (selected.x === x && selected.y === y) {
      selected = null; legalMoves = []; render(); return;
    }
    if (tryMove(selected.x, selected.y, x, y)) return;
  }
  if (piece && piece.color === game.currentPlayer) {
    selected = { x, y };
    legalMoves = getLegalMoves(game.board, x, y, game.currentPlayer, game.enPassant);
  } else {
    selected = null;
    legalMoves = [];
  }
  render();
}

function tryMove(fx, fy, tx, ty) {
  const moves = getLegalMoves(game.board, fx, fy, game.currentPlayer, game.enPassant);
  const move = moves.find((m) => m.to.x === tx && m.to.y === ty);
  if (!move) return false;
  performMove(move, true);
  return true;
}

async function performMove(move, fromHuman = false) {
  saveSnapshot();

  const piece = game.board[move.from.y][move.from.x];
  const targetPiece = game.board[move.to.y][move.to.x];
  let captured = targetPiece;

  game.board[move.from.y][move.from.x] = null;

  if (move.enPassant) {
    const capY = piece.color === 'w' ? move.to.y + 1 : move.to.y - 1;
    captured = game.board[capY][move.to.x];
    game.board[capY][move.to.x] = null;
  }

  game.board[move.to.y][move.to.x] = piece;
  piece.hasMoved = true;

  if (move.castle) {
    const rookFromX = move.castle === 'king' ? 7 : 0;
    const rookToX = move.castle === 'king' ? 5 : 3;
    const rook = game.board[move.to.y][rookFromX];
    game.board[move.to.y][rookFromX] = null;
    game.board[move.to.y][rookToX] = rook;
    rook.hasMoved = true;
  }

  if (piece.type === 'p' && Math.abs(move.to.y - move.from.y) === 2) {
    game.enPassant = { x: move.from.x, y: (move.from.y + move.to.y) / 2, pawnColor: piece.color };
  } else {
    game.enPassant = null;
  }

  if (piece.type === 'p' && (move.to.y === 0 || move.to.y === 7)) {
    const choice = fromHuman ? await askPromotion(piece.color) : 'q';
    piece.type = choice;
  }

  game.lastMove = { from: { ...move.from }, to: { ...move.to } };

  const notation = makeNotation(move, piece, captured);
  game.history.push(notation);

  playSound(captured ? 'capture' : 'move');

  game.currentPlayer = opposite(game.currentPlayer);
  selected = null;
  legalMoves = [];

  updateGameStatus();
  render();

  if ((game.status === 'check' || game.status === 'playing') && aiEnabled && game.currentPlayer === 'b') {
    setTimeout(aiMove, 250);
  }
}

function updateGameStatus() {
  const color = game.currentPlayer;
  const hasMove = hasAnyLegalMove(game.board, color, game.enPassant);
  const inCheck = isKingInCheck(game.board, color);
  
  if (!hasMove && inCheck) {
    game.status = 'checkmate';
    playSound('gameover');
    
    // 🏆 Show winner popup
    const winner = game.currentPlayer === 'w' ? 'Black' : 'White';
    showWinPopup(`Checkmate! ${winner} Wins! 🎉`);
    
  } else if (!hasMove) {
    game.status = 'stalemate';
    playSound('gameover');
    
    // 🤝 Show draw popup
    showWinPopup('Stalemate! It\'s a Draw! 🤝');
    
  } else if (inCheck) {
    game.status = 'check';
    playSound('check');
  } else {
    game.status = 'playing';
  }
}
function hasAnyLegalMove(board, color, enPassant) {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (board[y][x]?.color === color && getLegalMoves(board, x, y, color, enPassant).length) return true;
  }
  return false;
}

function getLegalMoves(board, x, y, color, enPassant) {
  const piece = board[y][x];
  if (!piece || piece.color !== color) return [];
  const pseudo = getPseudoMoves(board, x, y, piece, enPassant);
  return pseudo.filter((m) => {
    const test = simulateMove(board, m);
    return !isKingInCheck(test, color);
  });
}
// ✨ Popup show karne ke liye function
function showWinPopup(message) {
  winMessage.textContent = message;
  winModal.classList.remove('hidden');
}

// Play Again button click
playAgainBtn.addEventListener('click', () => {
  winModal.classList.add('hidden');
  initGame();
});

function getPseudoMoves(board, x, y, piece, enPassant, includeCastling = true) {
  const moves = [];
  const push = (tx, ty, meta = {}) => {
    if (tx < 0 || tx > 7 || ty < 0 || ty > 7) return;
    const target = board[ty][tx];
    if (!target || target.color !== piece.color) {
      moves.push({ from: { x, y }, to: { x: tx, y: ty }, capture: !!target, ...meta });
    }
  };

  const slide = (dirs) => {
    for (const [dx, dy] of dirs) {
      let tx = x + dx, ty = y + dy;
      while (tx >= 0 && tx < 8 && ty >= 0 && ty < 8) {
        const t = board[ty][tx];
        if (!t) {
          moves.push({ from: { x, y }, to: { x: tx, y: ty }, capture: false });
        } else {
          if (t.color !== piece.color) moves.push({ from: { x, y }, to: { x: tx, y: ty }, capture: true });
          break;
        }
        tx += dx; ty += dy;
      }
    }
  };

  if (piece.type === 'p') {
    const dir = piece.color === 'w' ? -1 : 1;
    const start = piece.color === 'w' ? 6 : 1;
    if (!board[y + dir]?.[x]) {
      push(x, y + dir);
      if (y === start && !board[y + 2 * dir]?.[x]) push(x, y + 2 * dir);
    }
    for (const dx of [-1, 1]) {
      const tx = x + dx, ty = y + dir;
      if (tx < 0 || tx > 7 || ty < 0 || ty > 7) continue;
      const t = board[ty][tx];
      if (t && t.color !== piece.color) push(tx, ty, { capture: true });
    }
    if (enPassant && Math.abs(enPassant.x - x) === 1 && enPassant.y === y + dir) {
      moves.push({ from: { x, y }, to: { x: enPassant.x, y: enPassant.y }, capture: true, enPassant: true });
    }
  }

  if (piece.type === 'n') {
    [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]].forEach(([dx,dy]) => push(x+dx,y+dy));
  }
  if (piece.type === 'b') slide([[1,1],[-1,1],[1,-1],[-1,-1]]);
  if (piece.type === 'r') slide([[1,0],[-1,0],[0,1],[0,-1]]);
  if (piece.type === 'q') slide([[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]);
  if (piece.type === 'k') {
    [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy]) => push(x+dx,y+dy));
    if (includeCastling && !piece.hasMoved && !isKingInCheck(board, piece.color)) {
      const row = piece.color === 'w' ? 7 : 0;
      const rookK = board[row][7];
      if (rookK && rookK.type === 'r' && !rookK.hasMoved && !board[row][5] && !board[row][6]) {
        if (!isSquareAttacked(board, 5, row, opposite(piece.color)) && !isSquareAttacked(board, 6, row, opposite(piece.color))) {
          moves.push({ from: { x, y }, to: { x: 6, y: row }, castle: 'king' });
        }
      }
      const rookQ = board[row][0];
      if (rookQ && rookQ.type === 'r' && !rookQ.hasMoved && !board[row][1] && !board[row][2] && !board[row][3]) {
        if (!isSquareAttacked(board, 2, row, opposite(piece.color)) && !isSquareAttacked(board, 3, row, opposite(piece.color))) {
          moves.push({ from: { x, y }, to: { x: 2, y: row }, castle: 'queen' });
        }
      }
    }
  }

  return moves;
}

function cloneBoard(board) {
  return board.map((row) => row.map((p) => (p ? { ...p } : null)));
}

function simulateMove(board, move) {
  const b = cloneBoard(board);
  const piece = b[move.from.y][move.from.x];
  b[move.from.y][move.from.x] = null;
  if (move.enPassant) {
    const capY = piece.color === 'w' ? move.to.y + 1 : move.to.y - 1;
    b[capY][move.to.x] = null;
  }
  b[move.to.y][move.to.x] = { ...piece, hasMoved: true };
  if (move.castle) {
    const rookFromX = move.castle === 'king' ? 7 : 0;
    const rookToX = move.castle === 'king' ? 5 : 3;
    const rook = b[move.to.y][rookFromX];
    b[move.to.y][rookFromX] = null;
    b[move.to.y][rookToX] = { ...rook, hasMoved: true };
  }
  return b;
}

function findKing(board, color) {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const p = board[y][x];
    if (p && p.type === 'k' && p.color === color) return { x, y };
  }
  return null;
}

function isKingInCheck(board, color) {
  const king = findKing(board, color);
  if (!king) return false;
  return isSquareAttacked(board, king.x, king.y, opposite(color));
}

function isSquareAttacked(board, x, y, byColor) {
  for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) {
    const p = board[yy][xx];
    if (!p || p.color !== byColor) continue;

    if (p.type === 'p') {
      const dir = byColor === 'w' ? -1 : 1;
      if (yy + dir === y && (xx + 1 === x || xx - 1 === x)) return true;
      continue;
    }

    const pseudo = getPseudoMoves(board, xx, yy, p, null, false);
    if (pseudo.some((m) => m.to.x === x && m.to.y === y)) return true;
  }
  return false;
}

function opposite(color) { return color === 'w' ? 'b' : 'w'; }

function coordToAlg(x, y) { return `${FILES[x]}${8 - y}`; }

function makeNotation(move, piece, captured) {
  if (move.castle === 'king') return 'O-O';
  if (move.castle === 'queen') return 'O-O-O';
  const letter = piece.type === 'p' ? '' : piece.type.toUpperCase();
  const capture = (captured || move.enPassant) ? 'x' : '';
  const fromFile = piece.type === 'p' && capture ? FILES[move.from.x] : '';
  let note = `${letter}${fromFile}${capture}${coordToAlg(move.to.x, move.to.y)}`;
  if (piece.type !== 'p' && move.capture) note = `${letter}x${coordToAlg(move.to.x, move.to.y)}`;
  if (isKingInCheck(game.board, game.currentPlayer)) {
    const any = hasAnyLegalMove(game.board, game.currentPlayer, game.enPassant);
    note += any ? '+' : '#';
  }
  return note;
}

function saveSnapshot() {
  game.snapshots.push(JSON.stringify({
    board: game.board,
    currentPlayer: game.currentPlayer,
    enPassant: game.enPassant,
    history: game.history,
    lastMove: game.lastMove,
    status: game.status,
  }));
}

function undoMove() {
  if (!game.snapshots.length) return;
  const prev = JSON.parse(game.snapshots.pop());
  game.board = prev.board;
  game.currentPlayer = prev.currentPlayer;
  game.enPassant = prev.enPassant;
  game.history = prev.history;
  game.lastMove = prev.lastMove;
  game.status = prev.status;
  selected = null;
  legalMoves = [];
  render();
}

function askPromotion(color) {
  return new Promise((resolve) => {
    promotionOptions.innerHTML = '';
    ['q', 'r', 'b', 'n'].forEach((type) => {
      const btn = document.createElement('button');
      btn.className = 'promo-piece';
      btn.textContent = PIECES[color][type];
      btn.addEventListener('click', () => {
        promotionModal.classList.add('hidden');
        resolve(type);
      });
      promotionOptions.appendChild(btn);
    });
    promotionModal.classList.remove('hidden');
  });
}

function evaluateBoard(board) {
  let score = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const p = board[y][x];
    if (!p) continue;
    score += (p.color === 'b' ? 1 : -1) * PIECE_VALUES[p.type];
  }
  return score;
}

function generateAllMoves(board, color, enPassant) {
  const out = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (board[y][x]?.color === color) out.push(...getLegalMoves(board, x, y, color, enPassant));
  }
  return out;
}

function minimax(board, depth, alpha, beta, maximizingPlayer, color, enPassant) {
  if (depth === 0) return { score: evaluateBoard(board) };
  const moves = generateAllMoves(board, color, enPassant);
  if (!moves.length) {
    if (isKingInCheck(board, color)) return { score: maximizingPlayer ? -99999 : 99999 };
    return { score: 0 };
  }

  let bestMove = moves[0];
  if (maximizingPlayer) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const newBoard = simulateMove(board, move);
      const evalRes = minimax(newBoard, depth - 1, alpha, beta, false, opposite(color), null).score;
      if (evalRes > maxEval) { maxEval = evalRes; bestMove = move; }
      alpha = Math.max(alpha, evalRes);
      if (beta <= alpha) break;
    }
    return { score: maxEval, move: bestMove };
  }

  let minEval = Infinity;
  for (const move of moves) {
    const newBoard = simulateMove(board, move);
    const evalRes = minimax(newBoard, depth - 1, alpha, beta, true, opposite(color), null).score;
    if (evalRes < minEval) { minEval = evalRes; bestMove = move; }
    beta = Math.min(beta, evalRes);
    if (beta <= alpha) break;
  }
  return { score: minEval, move: bestMove };
}

function aiMove() {
  if (!aiEnabled || game.currentPlayer !== 'b' || (game.status !== 'playing' && game.status !== 'check')) return;
  const result = minimax(game.board, 2, -Infinity, Infinity, true, 'b', game.enPassant);
  if (result.move) performMove(result.move, false);
}

// ---------------------------
// Sound synthesis (no assets)
// ---------------------------
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function tone(freq, duration = 0.1, type = 'triangle', gainVal = 0.03) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = gainVal;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}
function playSound(kind) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (kind === 'move') tone(540, .08);
  if (kind === 'capture') { tone(280, .1, 'sawtooth', .04); setTimeout(() => tone(180, .12, 'sawtooth', .03), 65); }
  if (kind === 'check') { tone(780, .09); setTimeout(() => tone(610, .12), 80); }
  if (kind === 'gameover') { tone(200, .18); setTimeout(() => tone(140, .28), 140); }
}

restartBtn.addEventListener('click', initGame);
undoBtn.addEventListener('click', undoMove);
flipBtn.addEventListener('click', () => { flipped = !flipped; render(); });
aiBtn.addEventListener('click', () => {
  aiEnabled = !aiEnabled;
  aiBtn.textContent = `AI: ${aiEnabled ? 'On' : 'Off'}`;
  aiBtn.setAttribute('aria-pressed', String(aiEnabled));
  if (aiEnabled && game.currentPlayer === 'b') aiMove();
});

initGame();
