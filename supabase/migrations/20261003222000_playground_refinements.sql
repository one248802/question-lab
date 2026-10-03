-- 생각 놀이터 후속 보완
-- 1) 생각 상자: 학생 1인당 생각 등록 수 제한(0이면 교사 후보만)
-- 2) 교사가 생각 상자 후보를 직접 등록
-- 3) 우리 반 질문 날짜별 갤러리용 RPC
-- 4) 질문 분류 영역을 2~4개로 확장

-- ---------------------------------------------------------------------
-- 1. 생각 상자 등록 수 제한 + 교사 후보
-- ---------------------------------------------------------------------
alter table public.thought_topics
  add column if not exists max_items_per_student int not null default 3
    check (max_items_per_student between 0 and 10);

alter table public.thought_items
  alter column student_id drop not null;

alter table public.thought_items
  add column if not exists created_by_teacher boolean not null default false;

alter table public.thought_items
  drop constraint if exists thought_items_author_shape_check;

alter table public.thought_items
  add constraint thought_items_author_shape_check check (
    (created_by_teacher = true and student_id is null)
    or
    (created_by_teacher = false and student_id is not null)
  );

create or replace function public.create_thought_item(p_topic_id uuid,p_content text)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_student_id uuid:=public.current_student_id();
  v_topic public.thought_topics%rowtype;
  v_content text:=btrim(coalesce(p_content,''));
  v_id uuid;
  v_count int;
begin
  if v_student_id is null then raise exception 'NOT_JOINED'; end if;
  if char_length(v_content) not between 1 and 120 then raise exception 'INVALID_CONTENT'; end if;

  select t.* into v_topic from public.thought_topics t where t.id=p_topic_id and t.is_open;
  if not found then raise exception 'TOPIC_CLOSED'; end if;
  if not exists(select 1 from public.students s where s.id=v_student_id and s.class_id=v_topic.class_id) then raise exception 'FORBIDDEN'; end if;
  if v_topic.max_items_per_student = 0 then raise exception 'STUDENT_SUBMISSIONS_DISABLED'; end if;

  select count(*)::int into v_count
  from public.thought_items i
  where i.topic_id=p_topic_id and i.student_id=v_student_id;
  if v_count >= v_topic.max_items_per_student then raise exception 'ITEM_LIMIT'; end if;

  if exists(select 1 from public.thought_items i where i.student_id=v_student_id and i.created_at>now()-interval '3 seconds') then
    raise exception 'TOO_FAST';
  end if;

  insert into public.thought_items(topic_id,student_id,content,created_by_teacher)
  values(p_topic_id,v_student_id,v_content,false)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_teacher_thought_item(p_topic_id uuid,p_content text)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_topic public.thought_topics%rowtype;
  v_content text:=btrim(coalesce(p_content,''));
  v_id uuid;
begin
  if char_length(v_content) not between 1 and 120 then raise exception 'INVALID_CONTENT'; end if;
  select t.* into v_topic from public.thought_topics t where t.id=p_topic_id;
  if not found or not public.owns_class(v_topic.class_id) then raise exception 'FORBIDDEN'; end if;

  insert into public.thought_items(topic_id,student_id,content,created_by_teacher)
  values(p_topic_id,null,v_content,true)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.get_thought_topic(p_topic_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_student_id uuid:=public.current_student_id();
  v_class_id uuid;
  v_topic public.thought_topics%rowtype;
  v_result jsonb;
begin
  select s.class_id into v_class_id from public.students s where s.id=v_student_id;
  if v_class_id is null then raise exception 'NOT_JOINED'; end if;
  select t.* into v_topic from public.thought_topics t where t.id=p_topic_id and t.class_id=v_class_id and (t.is_open or t.results_visible);
  if not found then raise exception 'TOPIC_NOT_FOUND'; end if;

  select jsonb_build_object(
    'id',v_topic.id,
    'title',v_topic.title,
    'is_open',v_topic.is_open,
    'results_visible',v_topic.results_visible,
    'max_votes',v_topic.max_votes,
    'max_items_per_student',v_topic.max_items_per_student,
    'my_item_count',(select count(*) from public.thought_items i where i.topic_id=v_topic.id and i.student_id=v_student_id),
    'my_vote_count',(select count(*) from public.thought_votes v join public.thought_items i on i.id=v.item_id where v.student_id=v_student_id and i.topic_id=v_topic.id),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,
      'content',i.content,
      'is_mine',coalesce(i.student_id=v_student_id,false),
      'is_teacher_candidate',i.created_by_teacher,
      'voted_by_me',exists(select 1 from public.thought_votes v where v.item_id=i.id and v.student_id=v_student_id),
      'vote_count',case when v_topic.results_visible then (select count(*) from public.thought_votes v where v.item_id=i.id) else null end,
      'created_at',i.created_at
    ) order by i.created_at) from public.thought_items i where i.topic_id=v_topic.id and i.is_hidden=false),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.create_teacher_thought_item(uuid,text) from public;
grant execute on function public.create_teacher_thought_item(uuid,text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. 우리 반 질문 날짜별 갤러리
--    업그레이드 전 버전도 기록으로 남겨 읽기 전용으로 보여 줍니다.
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
    case when public.vote_results_visible(v_class.voting_status,v_class.show_results_during_voting,v_class.show_results_after_voting)
      then (select count(*)::int from public.votes v where v.question_id=q.id)
      else null end,
    (select count(*)::int from public.question_thoughts qt where qt.question_id=q.id and qt.is_hidden=false)
  from public.questions q
  where q.class_id=v_class.id and q.is_hidden=false
  order by q.created_at desc;
end;
$$;

revoke all on function public.list_class_question_gallery() from public;
grant execute on function public.list_class_question_gallery() to authenticated;

-- ---------------------------------------------------------------------
-- 3. 질문 분류 2~4개
-- ---------------------------------------------------------------------
create or replace function public.save_classification_activity(
  p_activity_id uuid,
  p_class_id uuid,
  p_title text,
  p_area_names text[],
  p_question_ids uuid[],
  p_student_can_edit_area_names boolean
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := p_activity_id;
  v_class uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_areas text[];
begin
  if v_id is null then v_class := p_class_id;
  else select a.class_id into v_class from public.classification_activities a where a.id = v_id;
  end if;
  if v_class is null or not public.owns_class(v_class) then raise exception 'FORBIDDEN'; end if;
  if char_length(v_title) not between 1 and 60 then raise exception 'INVALID_TITLE'; end if;
  select array_agg(btrim(n) order by o) into v_areas from unnest(p_area_names) with ordinality as u(n,o);
  if not coalesce(public.valid_area_names(v_areas), false) then raise exception 'INVALID_AREAS'; end if;
  if cardinality(v_areas) not between 2 and 4 then raise exception 'AREA_COUNT_MUST_BE_2_TO_4'; end if;
  if coalesce(cardinality(p_question_ids),0) = 0 then raise exception 'NO_QUESTIONS'; end if;
  if exists (
    select 1 from unnest(p_question_ids) u(qid)
    where not exists (select 1 from public.questions q where q.id = u.qid and q.class_id = v_class)
  ) then raise exception 'INVALID_QUESTION'; end if;

  if v_id is null then
    insert into public.classification_activities(class_id,title,area_names,student_can_edit_area_names)
    values (v_class,v_title,v_areas,coalesce(p_student_can_edit_area_names,false)) returning id into v_id;
  else
    update public.classification_activities
    set title=v_title, area_names=v_areas, student_can_edit_area_names=coalesce(p_student_can_edit_area_names,false)
    where id=v_id;
    delete from public.classification_activity_questions where activity_id=v_id;
    delete from public.student_classification_area_names
    where activity_id=v_id and cardinality(area_names) <> cardinality(v_areas);
  end if;

  insert into public.classification_activity_questions(activity_id,question_id,sort_order)
  select v_id,u.qid,min(u.o)::int
  from unnest(p_question_ids) with ordinality u(qid,o)
  group by u.qid;
  return v_id;
end;
$$;