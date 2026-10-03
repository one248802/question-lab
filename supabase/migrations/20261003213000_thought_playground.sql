-- =====================================================================
-- 생각 놀이터 1차 확장
--  1) 질문별 「생각 나누기」: 학생 1명당 질문별 생각 1개, 수정/삭제 가능
--  2) 생각 나누기 익명/실명 설정(학급별)
--  3) 분류 활동 기준을 학생이 자기 기준으로 수정해 저장할 수 있는 옵션
--  4) 생각 상자: 교사 주제 생성 → 학생 생각 등록 → 투표 → 결과/랭킹 공개
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 학급별 생각 나누기 설정
-- ---------------------------------------------------------------------
alter table public.classes
  add column if not exists thought_sharing_enabled boolean not null default true,
  add column if not exists thought_author_mode text not null default 'anonymous'
    check (thought_author_mode in ('anonymous', 'named'));

grant update (thought_sharing_enabled, thought_author_mode) on public.classes to authenticated;

-- ---------------------------------------------------------------------
-- 2. 질문별 생각 나누기
--    한 학생은 한 질문에 하나의 생각을 남기고, 다시 저장하면 수정됩니다.
-- ---------------------------------------------------------------------
create table if not exists public.question_thoughts (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  content     text not null check (char_length(btrim(content)) between 1 and 500),
  is_hidden   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (question_id, student_id)
);
create index if not exists question_thoughts_question_id_idx on public.question_thoughts(question_id);
create index if not exists question_thoughts_student_id_idx on public.question_thoughts(student_id);

alter table public.question_thoughts enable row level security;

drop policy if exists "question_thoughts: teacher read" on public.question_thoughts;
create policy "question_thoughts: teacher read" on public.question_thoughts
  for select to authenticated using (
    exists (
      select 1 from public.questions q
      where q.id = question_thoughts.question_id and public.owns_class(q.class_id)
    )
  );

drop policy if exists "question_thoughts: teacher update" on public.question_thoughts;
create policy "question_thoughts: teacher update" on public.question_thoughts
  for update to authenticated using (
    exists (
      select 1 from public.questions q
      where q.id = question_thoughts.question_id and public.owns_class(q.class_id)
    )
  ) with check (
    exists (
      select 1 from public.questions q
      where q.id = question_thoughts.question_id and public.owns_class(q.class_id)
    )
  );

drop policy if exists "question_thoughts: teacher delete" on public.question_thoughts;
create policy "question_thoughts: teacher delete" on public.question_thoughts
  for delete to authenticated using (
    exists (
      select 1 from public.questions q
      where q.id = question_thoughts.question_id and public.owns_class(q.class_id)
    )
  );

revoke all on public.question_thoughts from anon;
revoke all on public.question_thoughts from authenticated;
grant select, delete on public.question_thoughts to authenticated;
grant update (is_hidden) on public.question_thoughts to authenticated;

create or replace function public.upsert_my_question_thought(p_question_id uuid, p_content text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student_id uuid := public.current_student_id();
  v_question public.questions%rowtype;
  v_class public.classes%rowtype;
  v_content text := btrim(coalesce(p_content, ''));
  v_id uuid;
begin
  if v_student_id is null then raise exception 'NOT_JOINED'; end if;
  if char_length(v_content) not between 1 and 500 then raise exception 'INVALID_CONTENT'; end if;

  select q.* into v_question from public.questions q where q.id = p_question_id;
  if not found or v_question.is_hidden or v_question.superseded_at is not null then
    raise exception 'QUESTION_NOT_FOUND';
  end if;
  if not exists (
    select 1 from public.students s where s.id = v_student_id and s.class_id = v_question.class_id
  ) then raise exception 'FORBIDDEN'; end if;

  select c.* into v_class from public.classes c where c.id = v_question.class_id;
  if not v_class.thought_sharing_enabled then raise exception 'THOUGHT_SHARING_DISABLED'; end if;

  insert into public.question_thoughts(question_id, student_id, content)
  values (p_question_id, v_student_id, v_content)
  on conflict (question_id, student_id) do update
    set content = excluded.content, is_hidden = false, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.delete_my_question_thought(p_question_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student_id uuid := public.current_student_id();
  v_count int;
begin
  if v_student_id is null then raise exception 'NOT_JOINED'; end if;
  delete from public.question_thoughts
  where question_id = p_question_id and student_id = v_student_id;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.list_question_thoughts(p_question_id uuid)
returns table (
  id uuid,
  content text,
  created_at timestamptz,
  updated_at timestamptz,
  is_mine boolean,
  author_label text
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_student_id uuid := public.current_student_id();
  v_question public.questions%rowtype;
  v_class public.classes%rowtype;
begin
  if v_student_id is null then raise exception 'NOT_JOINED'; end if;
  select q.* into v_question from public.questions q where q.id = p_question_id;
  if not found or v_question.is_hidden or v_question.superseded_at is not null then
    raise exception 'QUESTION_NOT_FOUND';
  end if;
  if not exists (select 1 from public.students s where s.id = v_student_id and s.class_id = v_question.class_id) then
    raise exception 'FORBIDDEN';
  end if;
  select c.* into v_class from public.classes c where c.id = v_question.class_id;
  if not v_class.thought_sharing_enabled then raise exception 'THOUGHT_SHARING_DISABLED'; end if;

  return query
  select t.id, t.content, t.created_at, t.updated_at,
         t.student_id = v_student_id,
         case
           when t.student_id = v_student_id then '내 생각'
           when v_class.thought_author_mode = 'named' then s.student_number::text || '번 ' || s.name
           else '익명의 생각'
         end
  from public.question_thoughts t
  join public.students s on s.id = t.student_id
  where t.question_id = p_question_id and t.is_hidden = false
  order by t.created_at asc;
end;
$$;

revoke all on function public.upsert_my_question_thought(uuid, text) from public;
revoke all on function public.delete_my_question_thought(uuid) from public;
revoke all on function public.list_question_thoughts(uuid) from public;
grant execute on function public.upsert_my_question_thought(uuid, text), public.delete_my_question_thought(uuid), public.list_question_thoughts(uuid) to authenticated;

-- 학생 컨텍스트에 생각 나누기 설정 추가
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
    'show_vote_counts',        public.vote_results_visible(c.voting_status, c.show_results_during_voting, c.show_results_after_voting),
    'my_vote_count',           public.student_vote_count(s.id),
    'teacher_like_enabled',    c.teacher_like_enabled,
    'teacher_comment_enabled', c.teacher_comment_enabled,
    'thought_sharing_enabled', c.thought_sharing_enabled,
    'thought_author_mode',     c.thought_author_mode
  )
  from public.students s
  join public.classes c on c.id = s.class_id
  where s.id = p_student_id;
$$;

-- 질문 카드에서 생각 개수 표시
create or replace function public.list_class_questions()
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
  from public.classes c join public.students s on s.class_id = c.id
  where s.id = v_student_id;

  return query
  select q.id, q.content, q.created_at, q.student_id = v_student_id,
    exists (select 1 from public.votes v where v.question_id = q.id and v.student_id = v_student_id),
    case when public.vote_results_visible(v_class.voting_status, v_class.show_results_during_voting, v_class.show_results_after_voting)
      then (select count(*)::int from public.votes v where v.question_id = q.id) else null end,
    (select count(*)::int from public.question_thoughts t where t.question_id = q.id and t.is_hidden = false)
  from public.questions q
  where q.class_id = v_class.id and q.is_hidden = false and q.superseded_at is null
  order by q.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. 분류 기준 학생 개인 수정
-- ---------------------------------------------------------------------
alter table public.classification_activities
  add column if not exists student_can_edit_area_names boolean not null default false;

grant update (is_open, student_can_edit_area_names) on public.classification_activities to authenticated;

create table if not exists public.student_classification_area_names (
  activity_id uuid not null references public.classification_activities(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  area_names text[] not null check (public.valid_area_names(area_names)),
  updated_at timestamptz not null default now(),
  primary key (activity_id, student_id)
);
alter table public.student_classification_area_names enable row level security;
revoke all on public.student_classification_area_names from anon, authenticated;

create or replace function public.save_my_classification_area_names(p_activity_id uuid, p_area_names text[])
returns text[]
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student_id uuid := public.current_student_id();
  v_activity public.classification_activities%rowtype;
  v_names text[];
begin
  if v_student_id is null then raise exception 'NOT_JOINED'; end if;
  select a.* into v_activity from public.classification_activities a where a.id = p_activity_id and a.is_open;
  if not found then raise exception 'ACTIVITY_NOT_FOUND'; end if;
  if not v_activity.student_can_edit_area_names then raise exception 'EDIT_NOT_ALLOWED'; end if;
  if not exists (select 1 from public.students s where s.id = v_student_id and s.class_id = v_activity.class_id) then raise exception 'FORBIDDEN'; end if;

  select array_agg(btrim(n) order by o) into v_names from unnest(p_area_names) with ordinality as u(n,o);
  if not public.valid_area_names(v_names) or cardinality(v_names) <> cardinality(v_activity.area_names) then
    raise exception 'INVALID_AREAS';
  end if;

  insert into public.student_classification_area_names(activity_id, student_id, area_names)
  values (p_activity_id, v_student_id, v_names)
  on conflict (activity_id, student_id) do update set area_names = excluded.area_names, updated_at = now();
  return v_names;
end;
$$;

-- 6개 인자 버전: 기존 5개 인자 함수는 남겨 호환성을 유지하고 새 UI는 이 버전을 사용
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
  if cardinality(v_areas) not between 2 and 3 then raise exception 'AREA_COUNT_MUST_BE_2_OR_3'; end if;
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
    -- 영역 수가 바뀌면 학생 개인 기준은 더 이상 맞지 않으므로 초기화
    delete from public.student_classification_area_names where activity_id=v_id and cardinality(area_names) <> cardinality(v_areas);
  end if;

  insert into public.classification_activity_questions(activity_id,question_id,sort_order)
  select v_id,u.qid,min(u.o)::int from unnest(p_question_ids) with ordinality u(qid,o) group by u.qid;
  return v_id;
end;
$$;

create or replace function public.get_classification_activity(p_activity_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_student_id uuid := public.current_student_id();
  v_class_id uuid;
  v_result jsonb;
begin
  select s.class_id into v_class_id from public.students s where s.id=v_student_id;
  if v_class_id is null then raise exception 'NOT_JOINED'; end if;

  select jsonb_build_object(
    'id', a.id,
    'title', a.title,
    'teacher_area_names', to_jsonb(a.area_names),
    'area_names', to_jsonb(coalesce(sa.area_names, a.area_names)),
    'student_can_edit_area_names', a.student_can_edit_area_names,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('id',q.id,'content',q.content) order by aq.sort_order,q.created_at)
      from public.classification_activity_questions aq join public.questions q on q.id=aq.question_id
      where aq.activity_id=a.id and q.is_hidden=false and q.superseded_at is null
    ),'[]'::jsonb)
  ) into v_result
  from public.classification_activities a
  left join public.student_classification_area_names sa on sa.activity_id=a.id and sa.student_id=v_student_id
  where a.id=p_activity_id and a.class_id=v_class_id and a.is_open;

  if v_result is null then raise exception 'ACTIVITY_NOT_FOUND'; end if;
  return v_result;
end;
$$;

revoke all on function public.save_my_classification_area_names(uuid,text[]) from public;
revoke all on function public.save_classification_activity(uuid,uuid,text,text[],uuid[],boolean) from public;
grant execute on function public.save_my_classification_area_names(uuid,text[]), public.save_classification_activity(uuid,uuid,text,text[],uuid[],boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 4. 생각 상자
-- ---------------------------------------------------------------------
create table if not exists public.thought_topics (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  is_open boolean not null default false,
  results_visible boolean not null default false,
  max_votes int not null default 1 check (max_votes between 1 and 10),
  created_at timestamptz not null default now()
);
create index if not exists thought_topics_class_id_idx on public.thought_topics(class_id);

create table if not exists public.thought_items (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.thought_topics(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 120),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists thought_items_topic_id_idx on public.thought_items(topic_id);

create table if not exists public.thought_votes (
  item_id uuid not null references public.thought_items(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, student_id)
);
create index if not exists thought_votes_student_id_idx on public.thought_votes(student_id);

alter table public.thought_topics enable row level security;
alter table public.thought_items enable row level security;
alter table public.thought_votes enable row level security;

create policy "thought_topics: teacher all" on public.thought_topics for all to authenticated
  using (public.owns_class(class_id)) with check (public.owns_class(class_id));
create policy "thought_items: teacher read" on public.thought_items for select to authenticated using (
  exists (select 1 from public.thought_topics t where t.id=thought_items.topic_id and public.owns_class(t.class_id))
);
create policy "thought_items: teacher update" on public.thought_items for update to authenticated using (
  exists (select 1 from public.thought_topics t where t.id=thought_items.topic_id and public.owns_class(t.class_id))
) with check (
  exists (select 1 from public.thought_topics t where t.id=thought_items.topic_id and public.owns_class(t.class_id))
);
create policy "thought_items: teacher delete" on public.thought_items for delete to authenticated using (
  exists (select 1 from public.thought_topics t where t.id=thought_items.topic_id and public.owns_class(t.class_id))
);
create policy "thought_votes: teacher read" on public.thought_votes for select to authenticated using (
  exists (
    select 1 from public.thought_items i join public.thought_topics t on t.id=i.topic_id
    where i.id=thought_votes.item_id and public.owns_class(t.class_id)
  )
);

revoke all on public.thought_topics, public.thought_items, public.thought_votes from anon;
revoke all on public.thought_topics, public.thought_items, public.thought_votes from authenticated;
grant select,insert,update,delete on public.thought_topics to authenticated;
grant select,delete on public.thought_items to authenticated;
grant update (is_hidden) on public.thought_items to authenticated;
grant select on public.thought_votes to authenticated;

create or replace function public.list_open_thought_topics()
returns table(id uuid,title text,is_open boolean,results_visible boolean,max_votes int,item_count int,created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
declare v_class_id uuid;
begin
  select s.class_id into v_class_id from public.students s where s.id=public.current_student_id();
  if v_class_id is null then raise exception 'NOT_JOINED'; end if;
  return query
  select t.id,t.title,t.is_open,t.results_visible,t.max_votes,
    (select count(*)::int from public.thought_items i where i.topic_id=t.id and i.is_hidden=false),t.created_at
  from public.thought_topics t
  where t.class_id=v_class_id and (t.is_open or t.results_visible)
  order by t.created_at desc;
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
    'id',v_topic.id,'title',v_topic.title,'is_open',v_topic.is_open,'results_visible',v_topic.results_visible,'max_votes',v_topic.max_votes,
    'my_vote_count',(select count(*) from public.thought_votes v join public.thought_items i on i.id=v.item_id where v.student_id=v_student_id and i.topic_id=v_topic.id),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'content',i.content,'is_mine',i.student_id=v_student_id,
      'voted_by_me',exists(select 1 from public.thought_votes v where v.item_id=i.id and v.student_id=v_student_id),
      'vote_count',case when v_topic.results_visible then (select count(*) from public.thought_votes v where v.item_id=i.id) else null end,
      'created_at',i.created_at
    ) order by i.created_at) from public.thought_items i where i.topic_id=v_topic.id and i.is_hidden=false),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.create_thought_item(p_topic_id uuid,p_content text)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_student_id uuid:=public.current_student_id(); v_topic public.thought_topics%rowtype; v_content text:=btrim(coalesce(p_content,'')); v_id uuid;
begin
  if v_student_id is null then raise exception 'NOT_JOINED'; end if;
  if char_length(v_content) not between 1 and 120 then raise exception 'INVALID_CONTENT'; end if;
  select t.* into v_topic from public.thought_topics t where t.id=p_topic_id and t.is_open;
  if not found then raise exception 'TOPIC_CLOSED'; end if;
  if not exists(select 1 from public.students s where s.id=v_student_id and s.class_id=v_topic.class_id) then raise exception 'FORBIDDEN'; end if;
  if exists(select 1 from public.thought_items i where i.student_id=v_student_id and i.created_at>now()-interval '3 seconds') then raise exception 'TOO_FAST'; end if;
  insert into public.thought_items(topic_id,student_id,content) values(p_topic_id,v_student_id,v_content) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.delete_my_thought_item(p_item_id uuid)
returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_student_id uuid:=public.current_student_id(); v_count int;
begin
  if v_student_id is null then raise exception 'NOT_JOINED'; end if;
  delete from public.thought_items where id=p_item_id and student_id=v_student_id;
  get diagnostics v_count=row_count; return v_count>0;
end;
$$;

create or replace function public.toggle_thought_vote(p_item_id uuid)
returns boolean
language plpgsql security definer set search_path=''
as $$
declare
  v_student_id uuid:=public.current_student_id(); v_topic public.thought_topics%rowtype; v_topic_id uuid; v_has boolean; v_count int;
begin
  if v_student_id is null then raise exception 'NOT_JOINED'; end if;
  select t.id,t.class_id,t.title,t.is_open,t.results_visible,t.max_votes,t.created_at into v_topic
  from public.thought_items i join public.thought_topics t on t.id=i.topic_id
  where i.id=p_item_id and i.is_hidden=false;
  if not found or not v_topic.is_open then raise exception 'TOPIC_CLOSED'; end if;
  if not exists(select 1 from public.students s where s.id=v_student_id and s.class_id=v_topic.class_id) then raise exception 'FORBIDDEN'; end if;
  select exists(select 1 from public.thought_votes v where v.item_id=p_item_id and v.student_id=v_student_id) into v_has;
  if v_has then
    delete from public.thought_votes where item_id=p_item_id and student_id=v_student_id; return false;
  end if;
  select count(*)::int into v_count from public.thought_votes v join public.thought_items i on i.id=v.item_id where v.student_id=v_student_id and i.topic_id=v_topic.id;
  if v_count>=v_topic.max_votes then raise exception 'VOTE_LIMIT'; end if;
  insert into public.thought_votes(item_id,student_id) values(p_item_id,v_student_id); return true;
end;
$$;

revoke all on function public.list_open_thought_topics(), public.get_thought_topic(uuid), public.create_thought_item(uuid,text), public.delete_my_thought_item(uuid), public.toggle_thought_vote(uuid) from public;
grant execute on function public.list_open_thought_topics(), public.get_thought_topic(uuid), public.create_thought_item(uuid,text), public.delete_my_thought_item(uuid), public.toggle_thought_vote(uuid) to authenticated;
