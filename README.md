# Boardly 🎲

A friendly, Duolingo-inspired platform for turn-based board games. Chess is just the beginning.

## Tech Stack

| Layer | Tools |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript |
| Styling | Tailwind CSS, shadcn/ui, Framer Motion |
| Backend | Supabase (Auth · Postgres · Realtime) |
| Chess | chess.js, react-chessboard |

## Setup

```bash
# 1. Clone the repo
git clone https://github.com/your-username/boardly.git
cd boardly

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.local.example .env.local
# Fill in your Supabase project URL, anon key, and service role key

# 4. Apply the database migration
# Run the SQL in supabase/migrations/001_initial_schema.sql
# in the Supabase SQL editor (or via the Supabase CLI)

# 5. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in the values from your [Supabase project settings](https://supabase.com/dashboard/project/_/settings/api).

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — **keep secret, server-only** |
| `NEXT_PUBLIC_APP_URL` | App base URL (e.g. `http://localhost:3000`) |

## Features (MVP)

- **Google OAuth + Magic Link** — passwordless auth via Supabase
- **Multi-game dashboard** — manage and play multiple games simultaneously
- **Real-time board sync** — moves appear instantly for both players via Supabase Realtime
- **Time controls** — unlimited, per-turn, or per-game clocks
- **Invite by email** — send invite links to opponents; unknown emails get an invite record

## Project Structure

```
app/
  (auth)/login/         # Login page (magic link + Google OAuth)
  (protected)/
    dashboard/          # Active games grid
    lobby/              # New game setup
    game/[id]/          # Live chess board
  api/
    games/              # Create / list games
    moves/[id]/         # Submit / fetch moves
  auth/callback/        # OAuth + magic link redirect handler
components/
  game/                 # Board, game card, dashboard client, game page client
  layout/               # Shared navbar
  ui/                   # shadcn/ui primitives
hooks/
  useGameRealtime.ts    # Supabase Realtime subscription (moves + game status)
  useTimer.ts           # Countdown timer hook
lib/
  supabase/             # Browser, server, and admin Supabase clients
  types.ts              # Shared TypeScript types
supabase/
  migrations/           # SQL migrations
```
