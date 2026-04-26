create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users(id) on delete cascade,
  addressee_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending', -- pending | accepted | declined | blocked
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id),
  check (status in ('pending', 'accepted', 'declined', 'blocked'))
);

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.users(id) on delete cascade,
  following_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);
create index if not exists friendships_status_idx on public.friendships (status);
create index if not exists follows_follower_idx on public.follows (follower_id);
create index if not exists follows_following_idx on public.follows (following_id);

drop trigger if exists trg_friendships_updated_at on public.friendships;
create trigger trg_friendships_updated_at
  before update on public.friendships
  for each row execute procedure public.set_updated_at();

alter table public.friendships enable row level security;
alter table public.follows enable row level security;

create policy "friendships: users can read own"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "friendships: users can request"
  on public.friendships for insert
  with check (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "friendships: users can update own"
  on public.friendships for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id)
  with check (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "friendships: users can delete own"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "follows: users can read own"
  on public.follows for select
  using (auth.uid() = follower_id or auth.uid() = following_id);

create policy "follows: users can insert own"
  on public.follows for insert
  with check (auth.uid() = follower_id);

create policy "follows: users can delete own"
  on public.follows for delete
  using (auth.uid() = follower_id);
