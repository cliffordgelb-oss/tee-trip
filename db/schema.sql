-- ============================================================
-- Tee Trip — multi-tenant SaaS schema
--
-- Run this on a fresh Supabase Postgres project. Auth lives in
-- Supabase's built-in auth schema; this file only creates the
-- application-side tenancy / scoring tables.
--
-- Prereqs in the Supabase dashboard before running:
--   Database -> Extensions -> pg_net      -> Enable
--   Database -> Extensions -> pgcrypto    -> Enable (for gen_random_uuid)
--
-- After running, set the project ref so the notification
-- dispatcher knows where to call the Edge Function:
--   alter database postgres set "app.project_ref" = 'YOUR_PROJECT_REF';
-- (Or run `select set_config('app.project_ref', 'YOUR_PROJECT_REF', false);`
--  per-session.)
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- Tenancy
-- ============================================================

-- One row per golf trip. Each user can own / belong to many.
create table if not exists tournaments (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  title                 text not null,
  owner_user_id         uuid not null references auth.users(id) on delete cascade,
  num_groups            int  not null default 2 check (num_groups between 1 and 6),
  championship_tier_size int not null default 3 check (championship_tier_size between 1 and 8),
  championship_round_id bigint, -- FK added after rounds table exists
  scoring_config        jsonb not null default '{
    "individual_stroke": { "holePoints": [5,3,1], "placement": [12,8,4], "matchPlayBonus": 1 },
    "best_ball":   { "winnerPoints": 15 },
    "scramble":    { "winnerPoints": 15 },
    "championship": { "placement": [12,8,4] }
  }'::jsonb,
  status                text not null default 'setup' check (status in ('setup','active','complete','archived')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Membership ties Supabase auth users to a tournament, and
-- optionally to a player slot inside that tournament.
-- email_invite is set when the owner adds a player slot with an
-- email but no user has signed in yet; on first sign-in matching
-- that email, a trigger claims the slot.
create table if not exists tournament_members (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references tournaments(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
  player_id       uuid, -- FK added after players table exists
  role            text not null default 'member' check (role in ('owner','admin','member','viewer')),
  email_invite    text, -- lowercased; populated by setup wizard for unclaimed slots
  created_at      timestamptz not null default now(),
  unique (tournament_id, user_id),
  check (user_id is not null or email_invite is not null)
);
create index if not exists idx_tm_user on tournament_members(user_id);
create index if not exists idx_tm_tournament on tournament_members(tournament_id);
create index if not exists idx_tm_email_invite on tournament_members(lower(email_invite)) where email_invite is not null;

-- ============================================================
-- Scoring tables (all tournament-scoped)
-- ============================================================

-- Per-tournament player slots. Owner edits this in the setup
-- wizard. `slug` is a per-tournament short id (e.g. "cliff") used
-- in UI and historically; the canonical FK target is uuid `id`.
create table if not exists players (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references tournaments(id) on delete cascade,
  slug            text not null check (slug ~ '^[a-z0-9_-]{1,30}$'),
  name            text not null,
  emoji           text not null default '⛳',
  initials        text,
  display_order   int  not null default 0,
  created_at      timestamptz not null default now(),
  unique (tournament_id, slug)
);
create index if not exists idx_players_tournament on players(tournament_id);

alter table tournament_members
  add constraint tournament_members_player_fk
  foreign key (player_id) references players(id) on delete set null;

-- Rounds (one row per scored round in the trip).
create table if not exists rounds (
  id            bigserial primary key,
  tournament_id uuid not null references tournaments(id) on delete cascade,
  round_number  int  not null,
  name          text not null,
  format        text not null check (format in ('individual_stroke','best_ball','scramble','championship')),
  status        text not null default 'pending' check (status in ('pending','active','complete')),
  scorekeepers  jsonb not null default '{}',  -- {"A":"<player_uuid>","B":"<player_uuid>"}
  starts_at     timestamptz,
  created_at    timestamptz not null default now(),
  unique (tournament_id, round_number)
);
create index if not exists idx_rounds_tournament on rounds(tournament_id);

-- Now wire the championship_round_id FK back.
alter table tournaments
  add constraint tournaments_championship_round_fk
  foreign key (championship_round_id) references rounds(id) on delete set null;

-- Holes (par + stroke index per round).
create table if not exists holes (
  round_id       bigint not null references rounds(id) on delete cascade,
  tournament_id  uuid   not null references tournaments(id) on delete cascade,
  hole           int    not null check (hole between 1 and 18),
  par            int    not null check (par between 3 and 6),
  stroke_index   int    not null check (stroke_index between 1 and 18),
  primary key (round_id, hole)
);
create index if not exists idx_holes_tournament on holes(tournament_id);

-- Per-round handicap + group assignment for a player.
create table if not exists round_strokes (
  round_id          bigint not null references rounds(id) on delete cascade,
  player_id         uuid   not null references players(id) on delete cascade,
  tournament_id     uuid   not null references tournaments(id) on delete cascade,
  handicap          int    not null default 0,
  group_assignment  text   check (group_assignment is null or group_assignment ~ '^[A-Z]$'),
  primary key (round_id, player_id)
);
create index if not exists idx_round_strokes_tournament on round_strokes(tournament_id);

-- Strokes per player per hole (scramble rounds write captain row only).
create table if not exists scores (
  id            bigserial primary key,
  round_id      bigint not null references rounds(id) on delete cascade,
  player_id     uuid   not null references players(id) on delete cascade,
  tournament_id uuid   not null references tournaments(id) on delete cascade,
  hole          int    not null check (hole between 1 and 18),
  gross         int    not null check (gross between 1 and 20),
  entered_by    uuid   references players(id) on delete set null,
  entered_at    timestamptz not null default now(),
  unique (round_id, player_id, hole)
);
create index if not exists idx_scores_round on scores(round_id);
create index if not exists idx_scores_tournament on scores(tournament_id);

-- Computed points per round per player.
create table if not exists round_points (
  round_id      bigint  not null references rounds(id) on delete cascade,
  player_id     uuid    not null references players(id) on delete cascade,
  tournament_id uuid    not null references tournaments(id) on delete cascade,
  points        numeric not null default 0,
  primary key (round_id, player_id)
);
create index if not exists idx_round_points_tournament on round_points(tournament_id);

-- Trash-talk feed.
create table if not exists messages (
  id            bigserial primary key,
  tournament_id uuid   not null references tournaments(id) on delete cascade,
  player_id     uuid   not null references players(id) on delete cascade,
  body          text   not null check (length(body) between 1 and 1000),
  created_at    timestamptz not null default now()
);
create index if not exists idx_messages_tournament_created on messages(tournament_id, created_at desc);

-- Web Push subscription per (user, tournament, browser endpoint).
create table if not exists push_subscriptions (
  id            bigserial primary key,
  user_id       uuid   not null references auth.users(id) on delete cascade,
  tournament_id uuid   not null references tournaments(id) on delete cascade,
  endpoint      text   not null,
  p256dh        text   not null,
  auth          text   not null,
  created_at    timestamptz not null default now(),
  unique (tournament_id, endpoint)
);
create index if not exists idx_push_subs_tournament on push_subscriptions(tournament_id);

-- Outbox of notification events to fan out via Web Push.
create table if not exists notification_events (
  id            bigserial primary key,
  tournament_id uuid not null references tournaments(id) on delete cascade,
  type          text not null,                        -- 'birdie'|'eagle'|'message'
  actor_player_id uuid references players(id) on delete set null,
  payload       jsonb not null,
  status        text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts      int  not null default 0,
  last_error    text,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);
create index if not exists idx_notif_pending on notification_events(status, created_at) where status = 'pending';

-- ============================================================
-- updated_at trigger for tournaments
-- ============================================================
create or replace function fn_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_tournaments_touch on tournaments;
create trigger trg_tournaments_touch
before update on tournaments
for each row execute function fn_touch_updated_at();

-- ============================================================
-- Auto-membership: the user who creates a tournament becomes its owner
-- ============================================================
create or replace function fn_tournament_owner_membership()
returns trigger language plpgsql security definer as $$
begin
  insert into tournament_members (tournament_id, user_id, role)
  values (new.id, new.owner_user_id, 'owner')
  on conflict (tournament_id, user_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_tournament_owner_membership on tournaments;
create trigger trg_tournament_owner_membership
after insert on tournaments
for each row execute function fn_tournament_owner_membership();

-- ============================================================
-- Email-invite claim: when a user signs in for the first time,
-- claim any tournament_members rows that match their email.
-- ============================================================
create or replace function fn_claim_email_invites()
returns trigger language plpgsql security definer as $$
begin
  if new.email is null then return new; end if;
  update tournament_members
     set user_id = new.id,
         email_invite = null
   where user_id is null
     and lower(email_invite) = lower(new.email);
  return new;
end $$;

drop trigger if exists trg_claim_email_invites on auth.users;
create trigger trg_claim_email_invites
after insert or update of email on auth.users
for each row execute function fn_claim_email_invites();

-- ============================================================
-- Membership helper (used by RLS policies)
-- ============================================================
create or replace function fn_is_member(t_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from tournament_members
    where tournament_id = t_id and user_id = auth.uid()
  );
$$;

create or replace function fn_is_owner_or_admin(t_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from tournament_members
    where tournament_id = t_id
      and user_id = auth.uid()
      and role in ('owner','admin')
  );
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table tournaments         enable row level security;
alter table tournament_members  enable row level security;
alter table players             enable row level security;
alter table rounds              enable row level security;
alter table holes               enable row level security;
alter table round_strokes       enable row level security;
alter table scores              enable row level security;
alter table round_points        enable row level security;
alter table messages            enable row level security;
alter table push_subscriptions  enable row level security;
alter table notification_events enable row level security;

-- tournaments: members see their tournaments; authenticated users
-- can create; owners/admins can update.
drop policy if exists "tournaments_select" on tournaments;
create policy "tournaments_select" on tournaments
  for select using (fn_is_member(id));

drop policy if exists "tournaments_insert" on tournaments;
create policy "tournaments_insert" on tournaments
  for insert with check (auth.uid() = owner_user_id);

drop policy if exists "tournaments_update" on tournaments;
create policy "tournaments_update" on tournaments
  for update using (fn_is_owner_or_admin(id)) with check (fn_is_owner_or_admin(id));

drop policy if exists "tournaments_delete" on tournaments;
create policy "tournaments_delete" on tournaments
  for delete using (auth.uid() = owner_user_id);

-- tournament_members: see members of your tournaments; owners/admins can manage.
drop policy if exists "tm_select" on tournament_members;
create policy "tm_select" on tournament_members
  for select using (fn_is_member(tournament_id));

drop policy if exists "tm_insert" on tournament_members;
create policy "tm_insert" on tournament_members
  for insert with check (fn_is_owner_or_admin(tournament_id));

drop policy if exists "tm_update" on tournament_members;
create policy "tm_update" on tournament_members
  for update using (fn_is_owner_or_admin(tournament_id)) with check (fn_is_owner_or_admin(tournament_id));

drop policy if exists "tm_delete" on tournament_members;
create policy "tm_delete" on tournament_members
  for delete using (fn_is_owner_or_admin(tournament_id) or user_id = auth.uid());

-- All other tournament-scoped tables: members can read; owners/admins write.
-- Scores/messages also writable by linked members (scorekeeper/sender enforcement
-- happens at the app layer for now; can tighten later).
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'players','rounds','holes','round_strokes','round_points','notification_events'
  ]) loop
    execute format($f$
      drop policy if exists "%1$s_select" on %1$s;
      create policy "%1$s_select" on %1$s
        for select using (fn_is_member(tournament_id));
      drop policy if exists "%1$s_modify_admin" on %1$s;
      create policy "%1$s_modify_admin" on %1$s
        for all using (fn_is_owner_or_admin(tournament_id))
              with check (fn_is_owner_or_admin(tournament_id));
    $f$, t);
  end loop;
end $$;

-- scores: any member of the tournament can enter (app layer scopes to scorekeeper).
drop policy if exists "scores_select" on scores;
create policy "scores_select" on scores
  for select using (fn_is_member(tournament_id));
drop policy if exists "scores_write" on scores;
create policy "scores_write" on scores
  for all using (fn_is_member(tournament_id)) with check (fn_is_member(tournament_id));

-- messages: any member can post.
drop policy if exists "messages_select" on messages;
create policy "messages_select" on messages
  for select using (fn_is_member(tournament_id));
drop policy if exists "messages_insert" on messages;
create policy "messages_insert" on messages
  for insert with check (fn_is_member(tournament_id));
drop policy if exists "messages_delete" on messages;
create policy "messages_delete" on messages
  for delete using (fn_is_owner_or_admin(tournament_id));

-- push_subscriptions: each user manages their own rows.
drop policy if exists "push_subs_owner" on push_subscriptions;
create policy "push_subs_owner" on push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid() and fn_is_member(tournament_id));

-- ============================================================
-- Triggers + functions for push notifications (per-tournament)
-- ============================================================

-- Queue a birdie/eagle event on every score insert.
create or replace function fn_queue_score_event()
returns trigger language plpgsql as $$
declare
  v_par              int;
  v_stroke_index     int;
  v_handicap         int;
  v_format           text;
  v_field_min        int;
  v_strokes_on_hole  int;
  v_net              int;
  v_diff             int;
  v_player_name      text;
  v_player_emoji     text;
  v_kind             text;
  v_body             text;
  v_strokes_received int;
  v_full_round       int;
  v_remainder        int;
  v_holes_count      int;
begin
  if tg_op <> 'INSERT' then return new; end if;

  select par, stroke_index into v_par, v_stroke_index
    from holes where round_id = new.round_id and hole = new.hole;
  if v_par is null then return new; end if;

  select format into v_format from rounds where id = new.round_id;

  select handicap into v_handicap from round_strokes
    where round_id = new.round_id and player_id = new.player_id;
  if v_handicap is null then v_handicap := 0; end if;

  if v_format in ('best_ball','scramble','championship') then
    select coalesce(min(handicap), 0) into v_field_min
      from round_strokes where round_id = new.round_id;
  else
    select coalesce(min(handicap), 0) into v_field_min
      from round_strokes
      where round_id = new.round_id
        and group_assignment = (
          select group_assignment from round_strokes
          where round_id = new.round_id and player_id = new.player_id
        );
  end if;

  v_strokes_received := greatest(0, v_handicap - v_field_min);
  select count(*) into v_holes_count from holes where round_id = new.round_id;
  if v_holes_count = 0 then v_holes_count := 18; end if;

  if v_stroke_index is null or v_strokes_received <= 0 then
    v_strokes_on_hole := 0;
  else
    v_full_round := v_strokes_received / v_holes_count;
    v_remainder  := v_strokes_received % v_holes_count;
    v_strokes_on_hole := v_full_round + (case when v_stroke_index <= v_remainder then 1 else 0 end);
  end if;

  v_net  := new.gross - v_strokes_on_hole;
  v_diff := v_net - v_par;
  if v_diff > -1 then return new; end if;

  v_kind := case when v_diff <= -2 then 'eagle' else 'birdie' end;

  select name, emoji into v_player_name, v_player_emoji
    from players where id = new.player_id;

  if v_kind = 'eagle' then
    v_body := v_player_emoji || ' ' || v_player_name || ' just netted an EAGLE on hole ' || new.hole || '!';
  else
    v_body := v_player_emoji || ' ' || v_player_name || ' just netted a birdie on hole ' || new.hole || '.';
  end if;

  insert into notification_events (tournament_id, type, actor_player_id, payload)
  values (
    new.tournament_id,
    v_kind,
    new.player_id,
    jsonb_build_object(
      'title', case when v_kind = 'eagle' then '🦅 Eagle!' else '🐦 Birdie' end,
      'body',  v_body,
      'tag',   'score-' || new.id,
      'url',   '/'
    )
  );
  return new;
end $$;

drop trigger if exists trg_queue_score_event on scores;
create trigger trg_queue_score_event
after insert on scores
for each row execute function fn_queue_score_event();

-- Queue a chat event on every message insert.
create or replace function fn_queue_message_event()
returns trigger language plpgsql as $$
declare
  v_player_name  text;
  v_player_emoji text;
  v_body_short   text;
begin
  if tg_op <> 'INSERT' then return new; end if;
  select name, emoji into v_player_name, v_player_emoji
    from players where id = new.player_id;
  v_body_short := substring(new.body from 1 for 140);
  insert into notification_events (tournament_id, type, actor_player_id, payload)
  values (
    new.tournament_id,
    'message',
    new.player_id,
    jsonb_build_object(
      'title', v_player_emoji || ' ' || v_player_name,
      'body',  v_body_short,
      'tag',   'msg-' || new.id,
      'url',   '/'
    )
  );
  return new;
end $$;

drop trigger if exists trg_queue_message_event on messages;
create trigger trg_queue_message_event
after insert on messages
for each row execute function fn_queue_message_event();

-- Dispatch a queued event to the send-push edge function via pg_net.
-- Reads the project ref from a Postgres setting (configured per-project).
create or replace function fn_dispatch_notification()
returns trigger language plpgsql as $$
declare
  v_ref text;
begin
  if new.status <> 'pending' then return new; end if;
  v_ref := current_setting('app.project_ref', true);
  if v_ref is null or v_ref = '' then return new; end if;  -- not configured yet
  perform net.http_post(
    url     := 'https://' || v_ref || '.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('event_id', new.id)
  );
  return new;
end $$;

drop trigger if exists trg_dispatch_notification on notification_events;
create trigger trg_dispatch_notification
after insert on notification_events
for each row execute function fn_dispatch_notification();

-- ============================================================
-- Realtime publication
-- ============================================================
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  for t in select unnest(array[
    'tournaments','tournament_members',
    'scores','messages','round_points','round_strokes','rounds','push_subscriptions'
  ]) loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
