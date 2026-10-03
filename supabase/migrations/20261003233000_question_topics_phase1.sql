-- =====================================================================
-- 질문 주제 1차 개편
--  - 기존 질문 폴더를 '질문 주제' 구조로 옮깁니다.
--  - 질문은 하나의 주제에 소속됩니다.
--  - 주제 상태: active(진행 중) / archived(보관) / hidden(숨김)
--  - 주제 삭제 시 그 주제의 질문과 관련 기록도 questions FK cascade를 따라 삭제됩니다.
--  - 기존 question_folders 테이블은 롤백/호환을 위해 이번 단계에서는 남겨 둡니다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 질문 주제
-- ---------------------------------------------------------------------
create table if not exists public.question_topics (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  name        text not null check (name = btrim(name) and char_length(name) between 1 and 40),
  status      text not null default 'hidden'
                check (status in ('active', 'archived', 'hidden')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint question_topics_class_name_unique unique (class_id, name)
);

create index if not exists question_topics_class_status_idx
  on public.question_topics(class_id, status, created_at);

create or replace function public.question_topics_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.question_topics_touch_updated_at() from public, anon, authenticated;

drop trigger if exists question_topics_touch_updated_at on public.question_topics;
create trigger question_topics_touch_updated_at
  before update on public.question_topics
  for each row execute function public.question_topics_touch_updated_at();

alter table public.question_topics enable row level security;

drop policy if exists "question_topics: teacher read" on public.question_topics;
create policy "question_topics: teacher read" on public.question_topics
  for select to authenticated using (public.owns_class(class_id));

drop policy if exists "question_topics: teacher insert" on public.question_topics;
create policy "question_topics: teacher insert" on public.question_topics
  for insert to authenticated with check (public.owns_class(class_id));

drop policy if exists "question_topics: teacher update" on public.question_topics;
create policy "question_topics: teacher update" on public.question_topics
  for update to authenticated
  using (public.owns_class(class_id))
  with check (public.owns_class(class_id));

drop policy if exists "question_topics: teacher delete" on public.question_topics;
create policy "question_topics: teacher delete" on public.question_topics
  for delete to authenticated using (public.owns_class(class_id));

revoke all on public.question_topics from anon, authenticated;
grant select, insert, delete on public.question_topics to authenticated;
grant update (name, status) on public.question_topics to authenticated;

-- ---------------------------------------------------------------------
-- 2. 질문은 하나의 질문 주제에 소속
--    아직 학생 작성 화면을 주제 선택 방식으로 바꾸기 전이므로 일시적으로 nullable 입니다.
-- ---------------------------------------------------------------------
alter table public.questions
  add column if not exists topic_id uuid references public.question_topics(id) on delete cascade;

create index if not exists questions_topic_id_created_at_idx
  on public.questions(topic_id, created_at desc);

-- topic_id와 질문의 class_id가 반드시 같아야 합니다.
create or replace function public.questions_validate_topic()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_topic_class uuid;
begin
  if new.topic_id is null then
    return new;
  end if;

  select t.class_id into v_topic_class
  from public.question_topics t
  where t.id = new.topic_id;

  if v_topic_class is null or v_topic_class <> new.class_id then
    raise exception 'INVALID_QUESTION_TOPIC';
  end if;

  return new;
end;
$$;

revoke execute on function public.questions_validate_topic() from public, anon, authenticated;

drop trigger if exists questions_validate_topic on public.questions;
create trigger questions_validate_topic
  before insert or update of topic_id, class_id on public.questions
  for each row execute function public.questions_validate_topic();

-- ---------------------------------------------------------------------
-- 3. 기존 폴더 데이터 보존 마이그레이션
--    기존 폴더는 과거 기록으로 보고 '보관' 상태의 질문 주제로 복사합니다.
--    한 질문이 여러 폴더에 있었다면 가장 먼저 넣은 폴더 하나를 주제로 선택합니다.
-- ---------------------------------------------------------------------
insert into public.question_topics(id, class_id, name, status, created_at, updated_at)
select f.id, f.class_id, f.name, 'archived', f.created_at, f.created_at
from public.question_folders f
on conflict (id) do nothing;

with first_folder as (
  select distinct on (i.question_id)
    i.question_id,
    i.folder_id
  from public.question_folder_items i
  order by i.question_id, i.added_at asc, i.folder_id
)
update public.questions q
set topic_id = ff.folder_id
from first_folder ff
where q.id = ff.question_id
  and q.topic_id is null
  and exists (select 1 from public.question_topics t where t.id = ff.folder_id);

-- 폴더가 없던 기존 질문도 잃지 않도록 학급별 '기존 질문' 보관 주제를 만듭니다.
insert into public.question_topics(class_id, name, status)
select distinct q.class_id, '기존 질문', 'archived'
from public.questions q
where q.topic_id is null
on conflict (class_id, name) do nothing;

update public.questions q
set topic_id = t.id
from public.question_topics t
where q.topic_id is null
  and t.class_id = q.class_id
  and t.name = '기존 질문';

-- ---------------------------------------------------------------------
-- 4. 질문 업그레이드 시 주제 유지
--    기존 폴더 연결도 이번 단계에서는 호환을 위해 함께 최신 버전으로 이동합니다.
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
  if v_student_id is null then raise exception 'NOT_JOINED'; end if;

  select q.* into v_old
  from public.questions q
  where q.id = p_question_id and q.student_id = v_student_id
  for update;

  if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
  if v_old.is_hidden then raise exception 'HIDDEN_QUESTION'; end if;
  if v_old.superseded_at is not null then raise exception 'ALREADY_UPGRADED'; end if;
  if char_length(v_content) < 1 or char_length(v_content) > 300 then raise exception 'INVALID_CONTENT'; end if;
  if v_content = v_old.content then raise exception 'SAME_CONTENT'; end if;

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

  insert into public.questions(class_id, student_id, topic_id, content, parent_question_id)
  values (v_old.class_id, v_old.student_id, v_old.topic_id, v_content, v_old.id)
  returning id into v_new_id;

  -- 레거시 폴더 연결도 기존 동작을 유지합니다.
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
-- 5. 주제와 기록 전체 삭제
--    question_topics -> questions(topic_id on delete cascade) -> votes / thoughts /
--    teacher feedback / classification links 등의 기존 cascade가 이어집니다.
-- ---------------------------------------------------------------------
create or replace function public.delete_question_topic(p_topic_id uuid)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_class_id uuid;
  v_question_count int;
begin
  select t.class_id into v_class_id
  from public.question_topics t
  where t.id = p_topic_id;

  if v_class_id is null or not public.owns_class(v_class_id) then
    raise exception 'FORBIDDEN';
  end if;

  select count(*)::int into v_question_count
  from public.questions q
  where q.topic_id = p_topic_id;

  delete from public.question_topics
  where id = p_topic_id;

  return v_question_count;
end;
$$;

revoke all on function public.delete_question_topic(uuid) from public;
grant execute on function public.delete_question_topic(uuid) to authenticated;
