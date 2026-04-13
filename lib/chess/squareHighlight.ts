import type { CSSProperties } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";

export const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type LastMoveSquares = { from: Square; to: Square };

export interface MoveLike {
  move_san: string;
  fen_after: string;
}

/** Derive from/to for the last move using the prior FEN and SAN (DB does not store UCI). */
export function getLastMoveSquaresFromMoves(
  moves: MoveLike[],
  fenBeforeFirst: string = INITIAL_FEN
): LastMoveSquares | null {
  if (moves.length === 0) return null;
  const last = moves[moves.length - 1];
  const prevFen = moves.length < 2 ? fenBeforeFirst : moves[moves.length - 2].fen_after;
  const chess = new Chess(prevFen);
  const played = chess.move(last.move_san);
  if (!played) return null;
  return { from: played.from as Square, to: played.to as Square };
}

function findKingSquareForSideToMove(chess: Chess): Square | null {
  const color = chess.turn();
  const board = chess.board();
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const p = board[i][j];
      if (p && p.type === "k" && p.color === color) {
        const file = String.fromCharCode(97 + j);
        const rank = String(8 - i);
        return `${file}${rank}` as Square;
      }
    }
  }
  return null;
}

/** Side to move is in check; king is the current player's king. */
export function getCheckHighlight(fen: string): {
  inCheck: boolean;
  kingSquare: Square | null;
} {
  const chess = new Chess(fen);
  if (!chess.inCheck()) return { inCheck: false, kingSquare: null };
  return { inCheck: true, kingSquare: findKingSquareForSideToMove(chess) };
}

const LAST_FROM = "rgba(255, 170, 0, 0.3)";
const LAST_TO = "rgba(255, 170, 0, 0.5)";
const IN_CHECK = "rgba(239, 68, 68, 0.45)";

export function getSquareStyles(
  lastMove: LastMoveSquares | null,
  inCheck: boolean,
  kingSquare: Square | null
): Record<string, CSSProperties> {
  const styles: Record<string, CSSProperties> = {};
  if (lastMove) {
    styles[lastMove.from] = { backgroundColor: LAST_FROM };
    styles[lastMove.to] = { backgroundColor: LAST_TO };
  }
  if (inCheck && kingSquare) {
    styles[kingSquare] = { backgroundColor: IN_CHECK };
  }
  return styles;
}
