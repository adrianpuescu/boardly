// PieceRenderObject: map of piece codes to render functions (from react-chessboard internals)
type PieceRenderObject = Record<
  string,
  (props?: { fill?: string; square?: string; svgStyle?: React.CSSProperties }) => React.JSX.Element
>;

export type PieceSet =
  | "rhosgfx"
  | "anarcandy"
  | "maestro"
  | "fresca"
  | "governor"
  | "horsey"
  | "companion"
  | "california"
  | "caliente"
  | "mpchess";

export const PIECE_SET_LABELS: Record<PieceSet, string> = {
  rhosgfx:    "Rhosgfx",
  anarcandy:  "Anarcandy",
  maestro:    "Maestro",
  fresca:     "Fresca",
  governor:   "Governor",
  horsey:     "Horsey",
  companion:  "Companion",
  california: "California",
  caliente:   "Caliente",
  mpchess:    "MP Chess",
};

export const ALL_PIECE_SETS = Object.keys(PIECE_SET_LABELS) as PieceSet[];

const PIECE_CODES = [
  "wK", "wQ", "wR", "wB", "wN", "wP",
  "bK", "bQ", "bR", "bB", "bN", "bP",
] as const;

export function buildPieces(set: PieceSet): PieceRenderObject {
  return Object.fromEntries(
    PIECE_CODES.map((code) => [
      code,
      ({ svgStyle, square }: { svgStyle?: React.CSSProperties; square?: string } = {}) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/pieces/${set}/${code}.svg`}
          alt={code}
          data-square={square}
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            userSelect: "none",
            ...svgStyle,
          }}
        />
      ),
    ])
  );
}
