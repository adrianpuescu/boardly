export type GameStatus = "waiting" | "active" | "completed" | "abandoned";
export type GameType = "chess";
export type TimeControlType = "time_based" | "turn_based" | "unlimited";
export type PieceColor = "white" | "black";

export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
}

export interface Game {
  id: string;
  type: GameType;
  status: GameStatus;
  white_player_id: string;
  black_player_id: string | null;
  current_turn: PieceColor;
  fen: string;
  time_control_type: TimeControlType;
  time_limit_seconds: number | null;
  turn_limit: number | null;
  winner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Move {
  id: string;
  game_id: string;
  player_id: string;
  from: string;
  to: string;
  promotion: string | null;
  san: string;
  fen_after: string;
  move_number: number;
  created_at: string;
}

export interface GameWithPlayers extends Game {
  white_player: Profile;
  black_player: Profile | null;
}

// ── Dashboard types (aligned with migration schema) ──────────────────────────

export interface CurrentUser {
  id: string;
  email: string;
  username: string;
  avatar_url: string | null;
  /** Supabase anonymous auth — show guest UI and limit account-only routes. */
  isGuest?: boolean;
}

export interface DashboardGame {
  id: string;
  status: "waiting" | "active";
  game_type: string;
  time_control: { type: string };
  state: { turn?: "white" | "black"; fen?: string };
  created_at: string;
  my_color: "white" | "black";
  opponent: {
    id: string;
    username: string;
    avatar_url: string | null;
  } | null;
}

export interface ProfileStats {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
}

export interface RecentGame {
  id: string;
  opponent: {
    id: string;
    username: string;
    avatar_url: string | null;
  } | null;
  result: "win" | "loss" | "draw";
  time_control: { type: string; minutes?: number };
  played_at: string;
}

export interface GamePageData {
  id: string;
  status: "waiting" | "active" | "completed" | "abandoned";
  game_type: string;
  state: {
    fen: string;
    turn: "white" | "black";
    result?: string;
    turn_started_at?: string;
    white_time_ms?: number;
    black_time_ms?: number;
  };
  time_control: { type: string; minutes?: number };
  winner_id: string | null;
  my_color: "white" | "black";
  opponent: {
    id: string;
    username: string;
    avatar_url: string | null;
  } | null;
}
