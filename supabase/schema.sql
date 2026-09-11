-- ============================================================================
-- QuizRace — Supabase schema
-- Chạy toàn bộ file này trong Supabase Dashboard → SQL Editor → New query
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Bộ câu hỏi (thư viện của Host)
-- ----------------------------------------------------------------------------
create table quizzes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Bộ câu hỏi chưa đặt tên',
  description text default '',
  cover_image text,
  status text not null default 'draft' check (status in ('draft','ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  position int not null default 0,
  content text not null default '',
  image_url text,
  time_limit int not null default 20,
  max_score int not null default 1000,
  explanation text default '',
  created_at timestamptz not null default now()
);

create table options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  position int not null default 0,
  content text not null default '',
  is_correct boolean not null default false
);

-- ----------------------------------------------------------------------------
-- 2. Phiên chơi (game session) — snapshot riêng để không bị ảnh hưởng
--    khi Host sửa bộ câu hỏi gốc trong lúc đang chơi.
-- ----------------------------------------------------------------------------
create table game_sessions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid references quizzes(id) on delete set null,
  host_id uuid not null references auth.users(id) on delete cascade,
  pin text not null unique,
  status text not null default 'lobby'
    check (status in ('lobby','countdown','question','reveal','leaderboard','finished')),
  current_question_index int not null default -1,
  current_question_started_at timestamptz,
  locked boolean not null default false,
  created_at timestamptz not null default now()
);

create table session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references game_sessions(id) on delete cascade,
  position int not null,
  content text not null,
  image_url text,
  time_limit int not null,
  max_score int not null,
  explanation text default ''
);

create table session_options (
  id uuid primary key default gen_random_uuid(),
  session_question_id uuid not null references session_questions(id) on delete cascade,
  position int not null,
  content text not null,
  is_correct boolean not null default false
);

create table participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references game_sessions(id) on delete cascade,
  name text not null,
  total_score int not null default 0,
  connected boolean not null default true,
  created_at timestamptz not null default now(),
  unique (session_id, name)
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references game_sessions(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  session_question_id uuid not null references session_questions(id) on delete cascade,
  option_id uuid references session_options(id),
  is_correct boolean not null default false,
  score int not null default 0,
  created_at timestamptz not null default now(),
  unique (session_question_id, participant_id)
);

create index on questions (quiz_id);
create index on options (question_id);
create index on session_questions (session_id);
create index on session_options (session_question_id);
create index on participants (session_id);
create index on answers (session_id);
create index on answers (session_question_id);

-- ----------------------------------------------------------------------------
-- 3. View công khai — KHÔNG lộ đáp án đúng / giải thích trước khi công bố
-- ----------------------------------------------------------------------------
create view session_questions_public as
  select id, session_id, position, content, image_url, time_limit, max_score
  from session_questions;

create view session_options_public as
  select id, session_question_id, position, content
  from session_options;

grant select on session_questions_public to anon, authenticated;
grant select on session_options_public to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. RPC: tham gia phòng & gửi đáp án (tính điểm phía máy chủ)
-- ----------------------------------------------------------------------------
create or replace function submit_answer(
  p_participant_id uuid,
  p_session_question_id uuid,
  p_option_id uuid
) returns table (is_correct boolean, score int, correct_option_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_status text;
  v_current_index int;
  v_position int;
  v_started_at timestamptz;
  v_time_limit int;
  v_max_score int;
  v_is_correct boolean;
  v_elapsed numeric;
  v_score int;
  v_correct_id uuid;
begin
  select sq.session_id, sq.position, sq.time_limit, sq.max_score
    into v_session_id, v_position, v_time_limit, v_max_score
  from session_questions sq where sq.id = p_session_question_id;

  if v_session_id is null then
    raise exception 'question_not_found';
  end if;

  select gs.status, gs.current_question_index, gs.current_question_started_at
    into v_status, v_current_index, v_started_at
  from game_sessions gs where gs.id = v_session_id;

  if v_status is distinct from 'question' or v_current_index is distinct from v_position then
    raise exception 'question_closed';
  end if;

  if not exists (
    select 1 from participants p where p.id = p_participant_id and p.session_id = v_session_id
  ) then
    raise exception 'invalid_participant';
  end if;

  select so.is_correct into v_is_correct
  from session_options so
  where so.id = p_option_id and so.session_question_id = p_session_question_id;

  if v_is_correct is null then
    v_is_correct := false;
  end if;

  v_elapsed := extract(epoch from (now() - v_started_at));
  if v_elapsed > v_time_limit then
    v_is_correct := false;
  end if;

  if v_is_correct then
    v_score := round(v_max_score * (1 - 0.5 * least(v_elapsed, v_time_limit) / v_time_limit));
  else
    v_score := 0;
  end if;

  insert into answers (session_id, participant_id, session_question_id, option_id, is_correct, score)
  values (v_session_id, p_participant_id, p_session_question_id, p_option_id, v_is_correct, v_score);

  update participants set total_score = total_score + v_score where id = p_participant_id;

  select so.id into v_correct_id from session_options so
  where so.session_question_id = p_session_question_id and so.is_correct = true
  limit 1;

  return query select v_is_correct, v_score, v_correct_id;
end;
$$;

revoke all on function submit_answer(uuid, uuid, uuid) from public;
grant execute on function submit_answer(uuid, uuid, uuid) to anon, authenticated;

-- Tạo phiên chơi từ một bộ câu hỏi (snapshot toàn bộ câu hỏi + đáp án)
create or replace function create_session(p_quiz_id uuid, p_pin text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_owner uuid;
  q record;
  o record;
  v_sq_id uuid;
begin
  select owner into v_owner from quizzes where id = p_quiz_id;
  if v_owner is distinct from auth.uid() then
    raise exception 'not_owner';
  end if;

  insert into game_sessions (quiz_id, host_id, pin)
  values (p_quiz_id, auth.uid(), p_pin)
  returning id into v_session_id;

  for q in select * from questions where quiz_id = p_quiz_id order by position asc loop
    insert into session_questions (session_id, position, content, image_url, time_limit, max_score, explanation)
    values (v_session_id, q.position, q.content, q.image_url, q.time_limit, q.max_score, q.explanation)
    returning id into v_sq_id;

    for o in select * from options where question_id = q.id order by position asc loop
      insert into session_options (session_question_id, position, content, is_correct)
      values (v_sq_id, o.position, o.content, o.is_correct);
    end loop;
  end loop;

  return v_session_id;
end;
$$;

revoke all on function create_session(uuid, text) from public;
grant execute on function create_session(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Row Level Security
-- ----------------------------------------------------------------------------
alter table quizzes enable row level security;
alter table questions enable row level security;
alter table options enable row level security;
alter table game_sessions enable row level security;
alter table session_questions enable row level security;
alter table session_options enable row level security;
alter table participants enable row level security;
alter table answers enable row level security;

-- quizzes: chỉ chủ sở hữu được đọc/ghi
create policy "own quizzes" on quizzes for all
  using (owner = auth.uid()) with check (owner = auth.uid());

create policy "own questions" on questions for all
  using (exists (select 1 from quizzes qz where qz.id = questions.quiz_id and qz.owner = auth.uid()))
  with check (exists (select 1 from quizzes qz where qz.id = questions.quiz_id and qz.owner = auth.uid()));

create policy "own options" on options for all
  using (exists (
    select 1 from questions qs join quizzes qz on qz.id = qs.quiz_id
    where qs.id = options.question_id and qz.owner = auth.uid()
  ))
  with check (exists (
    select 1 from questions qs join quizzes qz on qz.id = qs.quiz_id
    where qs.id = options.question_id and qz.owner = auth.uid()
  ));

-- game_sessions: ai cũng đọc được (để tra mã PIN), chỉ Host được sửa
create policy "read sessions" on game_sessions for select using (true);
create policy "host update session" on game_sessions for update
  using (host_id = auth.uid()) with check (host_id = auth.uid());
create policy "host delete session" on game_sessions for delete using (host_id = auth.uid());
-- Việc INSERT do hàm create_session() đảm nhiệm (security definer)

-- session_questions / session_options: nội dung câu hỏi luôn đọc được,
-- nhưng đáp án đúng chỉ lộ ra sau khi Host công bố (hoặc chính Host xem)
create policy "read session questions" on session_questions for select using (true);
create policy "read session options guarded" on session_options for select using (
  exists (
    select 1 from session_questions sq join game_sessions gs on gs.id = sq.session_id
    where sq.id = session_options.session_question_id
      and (gs.status in ('reveal','leaderboard','finished') or gs.host_id = auth.uid())
  )
);

-- participants: ai cũng đọc được (bảng xếp hạng), chỉ được tham gia khi phòng "lobby"
create policy "read participants" on participants for select using (true);
create policy "join while lobby" on participants for insert with check (
  exists (select 1 from game_sessions gs where gs.id = participants.session_id and gs.status = 'lobby')
);
create policy "host manage participants" on participants for update using (
  exists (select 1 from game_sessions gs where gs.id = participants.session_id and gs.host_id = auth.uid())
);
create policy "host remove participants" on participants for delete using (
  exists (select 1 from game_sessions gs where gs.id = participants.session_id and gs.host_id = auth.uid())
);

-- answers: chỉ đọc được tổng hợp sau khi công bố (hoặc Host xem trực tiếp);
-- việc ghi answers chỉ thực hiện qua hàm submit_answer() (security definer)
create policy "read answers guarded" on answers for select using (
  exists (
    select 1 from game_sessions gs where gs.id = answers.session_id
      and (gs.status in ('reveal','leaderboard','finished') or gs.host_id = auth.uid())
  )
);

-- ============================================================================
-- Xong. Sau khi chạy xong file này, vào Authentication → Providers, đảm bảo
-- Email đã bật (mặc định), rồi lấy Project URL + anon public key ở
-- Project Settings → API để điền vào file .env của ứng dụng.
-- ============================================================================
