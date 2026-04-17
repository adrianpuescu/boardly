import { Chess } from "chess.js";

export interface CapturedPieces {
  pawns: number;
  bishops: number;
  knights: number;
  rooks: number;
  queens: number;
}

const STARTING_COUNTS = {
  p: 8,
  b: 2,
  n: 2,
  r: 2,
  q: 1,
} as const;

const MATERIAL_VALUES = {
  pawns: 1,
  bishops: 3,
  knights: 3,
  rooks: 5,
  queens: 9,
} as const;

function emptyCapturedPieces(): CapturedPieces {
  return { pawns: 0, bishops: 0, knights: 0, rooks: 0, queens: 0 };
}

function getMaterial(points: CapturedPieces): number {
  return (
    points.pawns * MATERIAL_VALUES.pawns +
    points.bishops * MATERIAL_VALUES.bishops +
    points.knights * MATERIAL_VALUES.knights +
    points.rooks * MATERIAL_VALUES.rooks +
    points.queens * MATERIAL_VALUES.queens
  );
}

export function getCapturedPieces(fen: string): {
  white: CapturedPieces;
  black: CapturedPieces;
  /** Total material value of pieces White has captured from Black. */
  whitePoints: number;
  /** Total material value of pieces Black has captured from White. */
  blackPoints: number;
} {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return {
      white: emptyCapturedPieces(),
      black: emptyCapturedPieces(),
      whitePoints: 0,
      blackPoints: 0,
    };
  }

  const board = chess.board();
  const whiteOnBoard = { p: 0, b: 0, n: 0, r: 0, q: 0 };
  const blackOnBoard = { p: 0, b: 0, n: 0, r: 0, q: 0 };

  for (const rank of board) {
    for (const square of rank) {
      if (!square) continue;
      if (square.type === "k") continue;
      if (square.color === "w") whiteOnBoard[square.type] += 1;
      else blackOnBoard[square.type] += 1;
    }
  }

  const whiteCaptured: CapturedPieces = {
    pawns: STARTING_COUNTS.p - blackOnBoard.p,
    bishops: STARTING_COUNTS.b - blackOnBoard.b,
    knights: STARTING_COUNTS.n - blackOnBoard.n,
    rooks: STARTING_COUNTS.r - blackOnBoard.r,
    queens: STARTING_COUNTS.q - blackOnBoard.q,
  };

  const blackCaptured: CapturedPieces = {
    pawns: STARTING_COUNTS.p - whiteOnBoard.p,
    bishops: STARTING_COUNTS.b - whiteOnBoard.b,
    knights: STARTING_COUNTS.n - whiteOnBoard.n,
    rooks: STARTING_COUNTS.r - whiteOnBoard.r,
    queens: STARTING_COUNTS.q - whiteOnBoard.q,
  };

  return {
    white: whiteCaptured,
    black: blackCaptured,
    whitePoints: getMaterial(whiteCaptured),
    blackPoints: getMaterial(blackCaptured),
  };
}
