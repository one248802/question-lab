-- =====================================================================
-- 질문 주제 상태를 학생 화면에 실제 반영
--  active   : 학생 질문 상자에서 주제 선택/질문 작성/투표 가능
--  archived : 학생 '우리반 질문 모아보기'에서 읽기 전용으로 확인
--  hidden   : 교사만 확인, 학생 RPC에서는 노출하지 않음
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 학생 질문 상자에 보여 줄 진행 중 주제
-- ---------------------------------------------------------------------
create or replace function public.list_active_question_topics()
returns table (
  id uuid,
  name text,
  question_count int
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_student_id uuid := public.current_student_id();
  v_class_id uuid;
begin
  if v_student_id is null then raise exception 'NOT_JOINED'; end if;
  select s.class_id into v_class_id from public.students s where s.id = v_student_id;
  if v_class_id is null then raise exception 'NOT_JOINED'; end if;

  return query
  select
    t.id,
    t.name,
    (select count(*)::int
       from public.questions q
       where q.topic_id = t.id
         and q.is_hidden = false
         and q.superseded_at is null)
  from public.question_topics t
  where t.class_id = v_class_id
    and t.status = 'active'
  order by t.created_at asc;
end;
$$;

revoke all on function public.list_active_question_topics() from public;
grant execute on function public.list_active_question_topics() to authenticated;

-- ---------------------------------------------------------------------
-- 2. 선택한 진행 중 주제의 질문만 학생 게시판에 반환
-- ---------------------------------------------------------------------
create or replace function public.list_active_topic_questions(p_topic_id uuid)
returns table (
  id uuid,
  content text,
  created_at timestamptz,
  is_mine boolean,
  voted_by_me boolean,
  vote_count int,
  thought_count int
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_student_id uuid := public.current_student_id();
  v_class public.classes%rowtype;
begin
  if v_student_id is null then raise exception 'NOT_JOINED'; end if;

  select c.* into v_class
  from public.classes c
  join public.students s on s.class_id = c.id
  where s.id = v_student_id;
  if not found then raise exception 'NOT_JOINED'; end if;

  if not exists (
    select 1
    from public.question_topics t
    where t.id = p_topic_id
      and t.class_id = v_class.id
      and t.status = 'active'
  ) then
    raise exception 'TOPIC_NOT_ACTIVE';
  end if;

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
      else null end,
    (select count(*)::int
       from public.question_thoughts qt
       where qt.question_id = q.id and qt.is_hidden = false)
  from public.questions q
  where q.class_id = v_class.id
    and q.topic_id = p_topic_id
    and q.is_hidden = false
    and q.superseded_at is null
  order by q.created_at desc;
end;
$$;

revoke all on function public.list_active_topic_questions(uuid) from public;
grant execute on function public.list_active_topic_questions(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. 학생 새 질문은 현재 선택한 진행 중 주제에 바로 저장
-- ---------------------------------------------------------------------
create or replace function public.create_question_for_topic(p_topic_id uuid, p_content text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student public.students%rowtype;
  v_content text := btrim(coalesce(p_content, ''));
  v_id uuid;
begin
  select s.* into v_student
  from public.students s
  where s.id = public.current_student_id();
  if not found then raise exception 'NOT_JOINED'; end if;

  if not exists (
    select 1
    from public.question_topics t
    where t.id = p_topic_id
      and t.class_id = v_student.class_id
      and t.status = 'active'
  ) then
    raise exception 'TOPIC_NOT_ACTIVE';
  end if;

  if char_length(v_content) < 1 or char_length(v_content) > 300 then
    raise exception 'INVALID_CONTENT';
  end if;

  if exists (
    select 1 from public.questions q
    where q.student_id = v_student.id
      and q.created_at > now() - interval '3 seconds'
  ) then
    raise exception 'TOO_FAST';
  end if;

  insert into public.questions(class_id, student_id, topic_id, content)
  values (v_student.class_id, v_student.id, p_topic_id, v_content)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_question_for_topic(uuid, text) from public;
grant execute on function public.create_question_for_topic(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. 현재 투표 한도는 진행 중 주제의 현재 질문에 한 표만 계산
-- ---------------------------------------------------------------------
create or replace function public.student_vote_count(p_student_id uuid)
returns int
language sql stable security definer
set search_path = ''
as $$
  select count(*)::int
  from public.votes v
  join public.questions q on q.id = v.question_id
  join public.question_topics t on t.id = q.topic_id
  where v.student_id = p_student_id
    and q.is_hidden = false
    and q.superseded_at is null
    and t.status = 'active';
$$;

-- 진행 중 주제가 아니면 직접 RPC를 호출해도 투표할 수 없게 서버에서 차단합니다.
create or replace function public.toggle_vote(p_question_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student   public.students%rowtype;
  v_class     public.classes%rowtype;
  v_question  public.questions%rowtype;
  v_my_votes  int;
begin
  select s.* into v_student from public.students s
  where s.id = public.current_student_id()
  for update;
  if not found then raise exception 'NOT_JOINED'; end if;

  select c.* into v_class from public.classes c where c.id = v_student.class_id;

  select q.* into v_question
  from public.questions q
  join public.question_topics t on t.id = q.topic_id
  where q.id = p_question_id
    and q.class_id = v_student.class_id
    and q.is_hidden = false
    and q.superseded_at is null
    and t.status = 'active';
  if not found then raise exception 'QUESTION_NOT_FOUND'; end if;

  if v_class.voting_status = 'before' then
    raise exception 'VOTING_NOT_STARTED';
  elsif v_class.voting_status <> 'open' then
    raise exception 'VOTING_CLOSED';
  end if;

  v_my_votes := public.student_vote_count(v_student.id);

  if exists (
    select 1 from public.votes v
    where v.question_id = p_question_id and v.student_id = v_student.id
  ) then
    if not v_class.allow_vote_change and v_my_votes <= v_class.max_votes then
      raise exception 'VOTE_CHANGE_NOT_ALLOWED';
    end if;
    delete from public.votes
    where question_id = p_question_id and student_id = v_student.id;
    return false;
  end if;

  if not v_class.allow_self_vote and v_question.student_id = v_student.id then
    raise exception 'SELF_VOTE_NOT_ALLOWED';
  end if;
  if v_my_votes >= v_class.max_votes then
    raise exception 'VOTE_LIMIT_REACHED';
  end if;

  insert into public.votes(question_id, student_id)
  values (p_question_id, v_student.id);
  return true;
end;
$$;

revoke all on function public.toggle_vote(uuid) from public;
grant execute on function public.toggle_vote(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. 우리반 질문 모아보기에는 '보관' 주제만 노출
--    숨김은 학생 화면 어느 곳에도 노출하지 않습니다.
-- ---------------------------------------------------------------------
create or replace function public.list_class_question_gallery()
returns table (
  id uuid,
  content text,
  created_at timestamptz,
  is_mine boolean,
  is_current boolean,
  vote_count int,
  thought_count int
)
language plpgsql stable security definer
set search_path=''
as $$
declare
  v_student_id uuid:=public.current_student_id();
  v_class public.classes%rowtype;
begin
  if v_student_id is null then raise exception 'NOT_JOINED'; end if;
  select c.* into v_class
  from public.classes c
  join public.students s on s.class_id=c.id
  where s.id=v_student_id;
  if not found then raise exception 'NOT_JOINED'; end if;

  return query
  select
    q.id,
    q.content,
    q.created_at,
    q.student_id=v_student_id,
    q.superseded_at is null,
    case when public.vote_results_visible(
      v_class.voting_status,v_class.show_results_during_voting,v_class.show_results_after_voting)
      then (select count(*)::int from public.votes v where v.question_id=q.id)
      else null end,
    (select count(*)::int from public.question_thoughts qt where qt.question_id=q.id and qt.is_hidden=false)
  from public.questions q
  join public.question_topics t on t.id = q.topic_id
  where q.class_id=v_class.id
    and q.is_hidden=false
    and t.status='archived'
  order by q.created_at desc;
end;
$$;

revoke all on function public.list_class_question_gallery() from public;
grant execute on function public.list_class_question_gallery() to authenticated;

-- ---------------------------------------------------------------------
-- 6. 내 질문 모아보기에서도 숨김 주제는 학생에게 노출하지 않음
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
  if v_student_id is null then raise exception 'NOT_JOINED'; end if;

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
    q.superseded_at is null,
    case when public.vote_results_visible(
           v_class.voting_status,
           v_class.show_results_during_voting,
           v_class.show_results_after_voting
         )
      then (select count(*)::int from public.votes v where v.question_id = q.id)
      else null end,
    case when v_class.teacher_like_enabled then coalesce(f.liked, false) else false end,
    case when v_class.teacher_comment_enabled then f.comment else null end
  from public.questions q
  join public.question_topics t on t.id = q.topic_id
  left join public.teacher_question_feedback f on f.question_id = q.id
  where q.student_id = v_student_id
    and q.is_hidden = false
    and t.status <> 'hidden'
  order by q.created_at desc;
end;
$$;

revoke all on function public.list_my_question_history() from public;
grant execute on function public.list_my_question_history() to authenticated;
