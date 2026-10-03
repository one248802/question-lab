-- =====================================================================
-- 질문 성장 + 교사 피드백
--  - 학급별로 교사 좋아요 / 교사 코멘트 기능을 각각 켜고 끌 수 있습니다.
--  - 학생은 자기 질문을 '업그레이드'할 수 있습니다. 기존 질문/득표/피드백은 이력으로 남고
--    새 버전은 새 질문으로 만들어져 이후 투표를 새로 받습니다.
--  - 학생은 자기 질문 이력에서 공개 설정에 따른 득표 수와, 켜진 교사 피드백만 확인합니다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 학급별 피드백 기능 설정
-- ---------------------------------------------------------------------
alter table public.classes
  add column teacher_like_enabled boolean not null default false,
  add column teacher_comment_enabled boolean not null default false;

grant update (teacher_like_enabled, teacher_comment_enabled) on public.classes to authenticated;

-- ---------------------------------------------------------------------
-- 2. 질문 성장 연결
--    원본 -> 업그레이드 버전을 parent_question_id 로 연결합니다.
--    superseded_at 이 있으면 반 게시판에서는 빠지고 성장 이력에만 남습니다.
-- ---------------------------------------------------------------------
alter table public.questions
  add column parent_question_id uuid references public.questions (id) on delete set null,
  add column superseded_at timestamptz;

create unique index questions_one_child_per_version_idx
  on public.questions (parent_question_id)
  where parent_question_id is not null;

create index questions_parent_question_id_idx on public.questions (parent_question_id);
create index questions_class_current_idx on public.questions (class_id, created_at desc)
  where superseded_at is null;

create or replace function public.questions_validate_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent public.questions%rowtype;
begin
  if new.parent_question_id is null then
    return new;
  end if;

  if new.id = new.parent_question_id then
    raise exception 'INVALID_PARENT_QUESTION';
  end if;

  select q.* into v_parent
  from public.questions q
  where q.id = new.parent_question_id;

  if not found
     or v_parent.class_id <> new.class_id
     or v_parent.student_id <> new.student_id then
    raise exception 'INVALID_PARENT_QUESTION';
  end if;

  return new;
end;
$$;

create trigger questions_validate_parent
  before insert or update of parent_question_id, class_id, student_id on public.questions
  for each row execute function public.questions_validate_parent();

-- ---------------------------------------------------------------------
-- 3. 교사 피드백
--    질문 하나에 좋아요 1개 + 코멘트 1개를 저장합니다.
--    기능을 꺼도 데이터는 지우지 않고 숨겨 두었다가 다시 켜면 그대로 보입니다.
-- ---------------------------------------------------------------------
create table public.teacher_question_feedback (
  question_id uuid primary key references public.questions (id) on delete cascade,
  liked       boolean not null default false,
  comment     text check (comment is null or char_length(btrim(comment)) between 1 and 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (liked or comment is not null)
);

alter table public.teacher_question_feedback enable row level security;

-- 학생은 테이블을 직접 읽지 않습니다. 담당 교사만 직접 조회합니다.
create policy "teacher_question_feedback: teacher read" on public.teacher_question_feedback
  for select to authenticated using (
    exists (
      select 1 from public.questions q
      where q.id = teacher_question_feedback.question_id
        and public.owns_class(q.class_id)
    )
  );

revoke all on public.teacher_question_feedback from anon;
revoke all on public.teacher_question_feedback from authenticated;
grant select on public.teacher_question_feedback to authenticated;

-- ---------------------------------------------------------------------
-- 4. 업그레이드 이전 질문의 표는 보존하되 현재 투표 한도에는 세지 않음
-- ---------------------------------------------------------------------
create or replace function public.student_vote_count(p_student_id uuid)
returns int
language sql stable security definer
set search_path = ''
as $$
  select count(*)::int
  from public.votes v
  join public.questions q on q.id = v.question_id
  where v.student_id = p_student_id
    and q.is_hidden = false
    and q.superseded_at is null;
$$;

-- 대시보드 질문 수 역시 현재 버전만 셉니다. 성장 이력은 학생별 화면에서 봅니다.
create or replace function public.teacher_class_stats(p_today_start timestamptz)
returns table (
  class_id uuid,
  student_count int,
  question_count int,
  today_question_count int
)
language sql stable
set search_path = ''
as $$
  select
    c.id,
    (select count(*)::int from public.students s where s.class_id = c.id),
    (select count(*)::int from public.questions q where q.class_id = c.id and q.superseded_at is null),
    (select count(*)::int from public.questions q
       where q.class_id = c.id
         and q.superseded_at is null
         and q.created_at >= p_today_start)
  from public.classes c
  where c.teacher_id = auth.uid() and public.is_teacher();
$$;

-- ---------------------------------------------------------------------
-- 5. 내부 학생 컨텍스트에 피드백 설정 추가
-- ---------------------------------------------------------------------
create or replace function public.student_context_json(p_student_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'student_id',              s.id,
    'student_number',          s.student_number,
    'student_name',            s.name,
    'class_id',                c.id,
    'class_name',              c.name,
    'grade',                   c.grade,
    'max_votes',               c.max_votes,
    'allow_self_vote',         c.allow_self_vote,
    'voting_status',           c.voting_status,
    'allow_vote_change',       c.allow_vote_change,
    'show_vote_counts',        public.vote_results_visible(
                                 c.voting_status, c.show_results_during_voting, c.show_results_after_voting),
    'my_vote_count',           public.student_vote_count(s.id),
    'teacher_like_enabled',    c.teacher_like_enabled,
    'teacher_comment_enabled', c.teacher_comment_enabled
  )
  from public.students s
  join public.classes c on c.id = s.class_id
  where s.id = p_student_id;
$$;

-- ---------------------------------------------------------------------
-- 6. 우리 반 질문 목록
--    업그레이드된 이전 버전은 반 게시판에서 숨기고 최신 버전만 보여 줍니다.
-- ---------------------------------------------------------------------
create or replace function public.list_class_questions()
returns table (
  id uuid,
  content text,
  created_at timestamptz,
  is_mine boolean,
  voted_by_me boolean,
  vote_count int
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_student_id uuid := public.current_student_id();
  v_class      public.classes%rowtype;
begin
  if v_student_id is null then
    raise exception 'NOT_JOINED';
  end if;

  select c.* into v_class
  from public.classes c
  join public.students s on s.class_id = c.id
  where s.id = v_student_id;

  return query
  select
    q.id,
    q.content,
    q.created_at,
    q.student_id = v_student_id,
    exists (
      select 1 from public.votes v
      where v.question_id = q.id and v.student_id = v_student_id
    ),
    case when public.vote_results_visible(
           v_class.voting_status,
           v_class.show_results_during_voting,
           v_class.show_results_after_voting
         )
      then (select count(*)::int from public.votes v where v.question_id = q.id)
      else null end
  from public.questions q
  where q.class_id = v_class.id
    and q.is_hidden = false
    and q.superseded_at is null
  order by q.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. 학생: 질문 업그레이드
--    이전 질문을 덮어쓰지 않고 새 질문 버전을 만듭니다.
--    이전 버전은 superseded_at 을 찍어 반 게시판에서 빠지지만 표/피드백은 그대로 보존됩니다.
--    교사가 넣어 둔 질문 폴더는 새 버전으로 이어집니다.
-- ---------------------------------------------------------------------
create or replace function public.upgrade_question(
  p_question_id uuid,
  p_content text
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student_id uuid := public.current_student_id();
  v_old public.questions%rowtype;
  v_content text := btrim(coalesce(p_content, ''));
  v_new_id uuid;
begin
  if v_student_id is null then
    raise exception 'NOT_JOINED';
  end if;

  select q.* into v_old
  from public.questions q
  where q.id = p_question_id and q.student_id = v_student_id
  for update;

  if not found then
    raise exception 'QUESTION_NOT_FOUND';
  end if;

  if v_old.is_hidden then
    raise exception 'HIDDEN_QUESTION';
  end if;

  if v_old.superseded_at is not null then
    raise exception 'ALREADY_UPGRADED';
  end if;

  if char_length(v_content) < 1 or char_length(v_content) > 300 then
    raise exception 'INVALID_CONTENT';
  end if;

  if v_content = v_old.content then
    raise exception 'SAME_CONTENT';
  end if;

  if exists (
    select 1 from public.questions q
    where q.student_id = v_student_id
      and q.created_at > now() - interval '3 seconds'
  ) then
    raise exception 'TOO_FAST';
  end if;

  update public.questions
  set superseded_at = now()
  where id = v_old.id;

  insert into public.questions (class_id, student_id, content, parent_question_id)
  values (v_old.class_id, v_old.student_id, v_content, v_old.id)
  returning id into v_new_id;

  -- 기존 폴더 분류는 성장한 최신 질문으로 옮깁니다.
  update public.question_folder_items
  set question_id = v_new_id,
      added_at = now()
  where question_id = v_old.id;

  return v_new_id;
end;
$$;

revoke all on function public.upgrade_question(uuid, text) from public;
grant execute on function public.upgrade_question(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. 교사: 좋아요 / 코멘트 저장
--    켜진 기능만 바꾸고, 꺼진 기능의 기존 값은 그대로 보존합니다.
-- ---------------------------------------------------------------------
create or replace function public.set_teacher_question_feedback(
  p_question_id uuid,
  p_liked boolean,
  p_comment text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_question public.questions%rowtype;
  v_class public.classes%rowtype;
  v_old_liked boolean := false;
  v_old_comment text := null;
  v_liked boolean;
  v_comment text;
begin
  select q.* into v_question
  from public.questions q
  where q.id = p_question_id;

  if not found or not public.owns_class(v_question.class_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_question.is_hidden then
    raise exception 'HIDDEN_QUESTION';
  end if;

  select c.* into v_class
  from public.classes c
  where c.id = v_question.class_id;

  if not v_class.teacher_like_enabled and not v_class.teacher_comment_enabled then
    raise exception 'FEEDBACK_DISABLED';
  end if;

  select f.liked, f.comment
  into v_old_liked, v_old_comment
  from public.teacher_question_feedback f
  where f.question_id = p_question_id;

  if not found then
    v_old_liked := false;
    v_old_comment := null;
  end if;

  v_liked := case
    when v_class.teacher_like_enabled then coalesce(p_liked, false)
    else v_old_liked
  end;

  v_comment := case
    when v_class.teacher_comment_enabled then nullif(btrim(coalesce(p_comment, '')), '')
    else v_old_comment
  end;

  if v_comment is not null and char_length(v_comment) > 500 then
    raise exception 'COMMENT_TOO_LONG';
  end if;

  if not v_liked and v_comment is null then
    delete from public.teacher_question_feedback
    where question_id = p_question_id;
    return jsonb_build_object('liked', false, 'comment', null);
  end if;

  insert into public.teacher_question_feedback (question_id, liked, comment)
  values (p_question_id, v_liked, v_comment)
  on conflict (question_id) do update
    set liked = excluded.liked,
        comment = excluded.comment,
        updated_at = now();

  return jsonb_build_object('liked', v_liked, 'comment', v_comment);
end;
$$;

revoke all on function public.set_teacher_question_feedback(uuid, boolean, text) from public;
grant execute on function public.set_teacher_question_feedback(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- 9. 학생: 내 질문 성장 이력
--    득표 수는 기존 투표 결과 공개 설정을 그대로 따릅니다.
--    좋아요/코멘트는 해당 학급에서 켠 기능만 반환합니다.
-- ---------------------------------------------------------------------
create or replace function public.list_my_question_history()
returns table (
  id uuid,
  content text,
  created_at timestamptz,
  parent_question_id uuid,
  is_current boolean,
  vote_count int,
  teacher_liked boolean,
  teacher_comment text
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_student_id uuid := public.current_student_id();
  v_class public.classes%rowtype;
begin
  if v_student_id is null then
    raise exception 'NOT_JOINED';
  end if;

  select c.* into v_class
  from public.classes c
  join public.students s on s.class_id = c.id
  where s.id = v_student_id;

  return query
  select
    q.id,
    q.content,
    q.created_at,
    q.parent_question_id,
    q.superseded_at is null as is_current,
    case when public.vote_results_visible(
           v_class.voting_status,
           v_class.show_results_during_voting,
           v_class.show_results_after_voting
         )
      then (select count(*)::int from public.votes v where v.question_id = q.id)
      else null end as vote_count,
    case when v_class.teacher_like_enabled
      then coalesce(f.liked, false)
      else false end as teacher_liked,
    case when v_class.teacher_comment_enabled
      then f.comment
      else null end as teacher_comment
  from public.questions q
  left join public.teacher_question_feedback f on f.question_id = q.id
  where q.student_id = v_student_id
    and q.is_hidden = false
  order by q.created_at desc;
end;
$$;

revoke all on function public.list_my_question_history() from public;
grant execute on function public.list_my_question_history() to authenticated;
