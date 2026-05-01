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
  elo_rating?: number;
  country?: string | null;
  /** Supabase anonymous auth — show guest UI and limit account-only routes. */
  isGuest?: boolean;
}

export interface DashboardGame {
  id: string;
  name?: string | null;
  created_by: string | null;
  status: "waiting" | "active" | "completed" | "abandoned";
  game_type: string;
  time_control: { type: string };
  state: { turn?: "white" | "black"; fen?: string; vs_bot?: boolean };
  created_at: string;
  my_color: "white" | "black";
  opponent: {
    id: string;
    username: string;
    avatar_url: string | null;
    elo_rating?: number;
  } | null;
}

export interface ProfileStats {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
}

export interface RankingPlayer {
  id: string;
  username: string;
  avatar_url: string | null;
  elo_rating: number;
  country: string | null;
  city: string | null;
  continent: string | null;
  games_played: number;
  wins: number;
  win_rate: number;
  current_win_streak?: number;
  games_last_30_days?: number;
  weekly_elo_gain?: number;
  monthly_elo_gain?: number;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "wins" | "social" | "special";
}

export interface ProfileBadge extends Badge {
  earned_at: string | null;
}

export interface RecentGame {
  id: string;
  opponent: {
    id: string;
    username: string;
    avatar_url: string | null;
    elo_rating?: number;
  } | null;
  result: "win" | "loss" | "draw";
  time_control: { type: string; minutes?: number };
  played_at: string;
  friend_request_status?:
    | "none"
    | "friends"
    | "pending"
    | "declined_by_you"
    | "declined_by_them";
}

export interface GamePageData {
  id: string;
  name?: string | null;
  created_by: string | null;
  status: "waiting" | "active" | "completed" | "abandoned";
  game_type: string;
  state: {
    fen: string;
    turn: "white" | "black";
    result?: string;
    turn_started_at?: string;
    white_time_ms?: number;
    black_time_ms?: number;
    /** Present when the black player is the Stockfish bot. */
    vs_bot?: boolean;
    bot_difficulty?: number;
    bot_user_id?: string;
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

export interface FriendListItem {
  friendshipId: string;
  id: string;
  username: string;
  avatar_url: string | null;
  status: "accepted";
  created_at: string;
  updated_at: string;
  is_online?: boolean;
}

export interface IncomingFriendRequest {
  friendshipId: string;
  requester_id: string;
  username: string;
  avatar_url: string | null;
  status: "pending";
  created_at: string;
  updated_at: string;
}

export interface OutgoingFriendRequest {
  friendshipId: string;
  addressee_id: string;
  username: string;
  avatar_url: string | null;
  status: "pending" | "declined";
  created_at: string;
  updated_at: string;
}
