-- =====================================================================
-- 질문 분류 활동
--  교사가 활동(제목 + 분류 영역 2~5개 + 사용할 질문)을 만들고 학생에게 공개하면,
--  학생은 질문 카드를 영역에 배치합니다.
--  - 학생의 배치(분류 결과)는 DB에 저장하지 않습니다. (학생 기기의 sessionStorage 에만 있음)
--  - 분류 결과에 대한 학생별 기록, 집계, 통계는 만들지 않습니다.
--  - questions / votes / classes 와 기존 RPC 는 바꾸지 않습니다.
--  - init migration 9번 섹션의 설계 메모(framework_code, classification_responses)는
--    이 설계로 대체합니다. classification_frameworks / classification_categories 는 그대로 두고 쓰지 않습니다.
-- =====================================================================

-- 분류 영역 이름 검사: 2~5개, 각각 앞뒤 공백 제외 1~20자, 중복 없음
create or replace function public.valid_area_names(p_names text[])
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_names is not null
     and array_ndims(p_names) = 1
     and cardinality(p_names) between 2 and 5
     and not exists (
       select 1 from unnest(p_names) n
       where n is null or char_length(btrim(n)) not between 1 and 20
     )
     and (select count(distinct btrim(n)) from unnest(p_names) n) = cardinality(p_names);
$$;

-- ---------------------------------------------------------------------
-- 테이블
-- ---------------------------------------------------------------------
create table public.classification_activities (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 60),
  area_names  text[] not null check (public.valid_area_names(area_names)),
  is_open     boolean not null default false,   -- 학생에게 공개 (여러 활동을 동시에 공개 가능)
  created_at  timestamptz not null default now()
);
create index classification_activities_class_id_idx on public.classification_activities (class_id);

-- 활동에 쓸 질문. 질문이 삭제되면 활동에서도 빠집니다.
create table public.classification_activity_questions (
  activity_id  uuid not null references public.classification_activities (id) on delete cascade,
  question_id  uuid not null references public.questions (id) on delete cascade,
  sort_order   int  not null default 0,
  primary key (activity_id, question_id)
);
create index classification_activity_questions_question_id_idx
  on public.classification_activity_questions (question_id);

-- ---------------------------------------------------------------------
-- RLS: 교사는 자기 학급 활동만 조회/공개 전환/삭제. 만들기·수정은 save_classification_activity RPC.
--      학생은 테이블에 직접 접근하지 않고 아래 읽기 전용 RPC 만 사용.
-- ---------------------------------------------------------------------
alter table public.classification_activities          enable row level security;
alter table public.classification_activity_questions  enable row level security;

create policy "classification_activities: teacher read" on public.classification_activities
  for select to authenticated using (public.owns_class(class_id));
create policy "classification_activities: teacher update" on public.classification_activities
  for update to authenticated using (public.owns_class(class_id)) with check (public.owns_class(class_id));
create policy "classification_activities: teacher delete" on public.classification_activities
  for delete to authenticated using (public.owns_class(class_id));

create policy "classification_activity_questions: teacher read" on public.classification_activity_questions
  for select to authenticated using (
    exists (
      select 1 from public.classification_activities a
      where a.id = classification_activity_questions.activity_id and public.owns_class(a.class_id)
    )
  );

-- Supabase 는 새 테이블에 anon/authenticated 의 모든 권한을 기본으로 주므로 필요한 것만 남깁니다.
revoke all on public.classification_activities, public.classification_activity_questions from anon;
revoke insert, update, truncate, references, trigger on public.classification_activities from authenticated;
grant update (is_open) on public.classification_activities to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.classification_activity_questions from authenticated;

-- ---------------------------------------------------------------------
-- 교사용 RPC: 활동 만들기/수정 (제목, 영역, 질문 선택을 한 번에 저장)
--  p_activity_id 가 null 이면 새로 만들고(공개 안 함 상태), 아니면 수정합니다(공개 상태는 유지).
--  반환값: 활동 id
-- ---------------------------------------------------------------------
create or replace function public.save_classification_activity(
  p_activity_id  uuid,
  p_class_id     uuid,
  p_title        text,
  p_area_names   text[],
  p_question_ids uuid[]
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id     uuid := p_activity_id;
  v_class  uuid;
  v_title  text := btrim(coalesce(p_title, ''));
  v_areas  text[];
begin
  -- 권한: 새 활동은 학급 담당 교사, 수정은 그 활동 학급의 담당 교사
  if v_id is null then
    v_class := p_class_id;
  else
    select a.class_id into v_class from public.classification_activities a where a.id = v_id;
  end if;
  if v_class is null or not public.owns_class(v_class) then
    raise exception 'FORBIDDEN';
  end if;

  if char_length(v_title) not between 1 and 60 then
    raise exception 'INVALID_TITLE';
  end if;
  select array_agg(btrim(n) order by o) into v_areas
  from unnest(p_area_names) with ordinality as u(n, o);
  if not coalesce(public.valid_area_names(v_areas), false) then
    raise exception 'INVALID_AREAS';
  end if;
  if coalesce(cardinality(p_question_ids), 0) = 0 then
    raise exception 'NO_QUESTIONS';
  end if;
  -- 모든 질문이 같은 학급의 질문이어야 함
  if exists (
    select 1 from unnest(p_question_ids) as u(qid)
    where not exists (select 1 from public.questions q where q.id = u.qid and q.class_id = v_class)
  ) then
    raise exception 'INVALID_QUESTION';
  end if;

  if v_id is null then
    insert into public.classification_activities (class_id, title, area_names)
    values (v_class, v_title, v_areas)
    returning id into v_id;
  else
    update public.classification_activities
    set title = v_title, area_names = v_areas
    where id = v_id;
    delete from public.classification_activity_questions where activity_id = v_id;
  end if;

  insert into public.classification_activity_questions (activity_id, question_id, sort_order)
  select v_id, u.qid, min(u.o)::int
  from unnest(p_question_ids) with ordinality as u(qid, o)
  group by u.qid;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 학생용 읽기 전용 RPC (작성자, 투표 정보 없음)
-- ---------------------------------------------------------------------

-- 우리 반에 공개된 분류 활동 목록. question_count 는 학생에게 보이는(숨기지 않은) 질문 수
create or replace function public.list_open_classification_activities()
returns table (
  id              uuid,
  title           text,
  area_count      int,
  question_count  int,
  created_at      timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_class_id uuid;
begin
  select s.class_id into v_class_id from public.students s where s.id = public.current_student_id();
  if v_class_id is null then
    raise exception 'NOT_JOINED';
  end if;

  return query
  select
    a.id,
    a.title,
    cardinality(a.area_names),
    (select count(*)::int
       from public.classification_activity_questions aq
       join public.questions q on q.id = aq.question_id
      where aq.activity_id = a.id and q.is_hidden = false),
    a.created_at
  from public.classification_activities a
  where a.class_id = v_class_id and a.is_open
  order by a.created_at desc;
end;
$$;

-- 분류 활동 하나: 제목, 영역 이름, 질문(id, 내용만). 우리 반에 공개된 활동만, 숨긴 질문 제외
create or replace function public.get_classification_activity(p_activity_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_class_id uuid;
  v_result   jsonb;
begin
  select s.class_id into v_class_id from public.students s where s.id = public.current_student_id();
  if v_class_id is null then
    raise exception 'NOT_JOINED';
  end if;

  select jsonb_build_object(
    'id',         a.id,
    'title',      a.title,
    'area_names', to_jsonb(a.area_names),
    'questions',  coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'content', q.content) order by aq.sort_order, q.created_at)
      from public.classification_activity_questions aq
      join public.questions q on q.id = aq.question_id
      where aq.activity_id = a.id and q.is_hidden = false
    ), '[]'::jsonb)
  ) into v_result
  from public.classification_activities a
  where a.id = p_activity_id and a.class_id = v_class_id and a.is_open;

  if v_result is null then
    raise exception 'ACTIVITY_NOT_FOUND';
  end if;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- 함수 실행 권한: 새 함수의 기본 권한을 회수하고 로그인 사용자에게 필요한 것만 허용
-- (valid_area_names 는 입력만 검사하는 순수 함수. 교사가 is_open 을 바꿀 때 check 제약이 다시 계산되므로 필요)
-- ---------------------------------------------------------------------
revoke execute on function
  public.valid_area_names(text[]),
  public.save_classification_activity(uuid, uuid, text, text[], uuid[]),
  public.list_open_classification_activities(),
  public.get_classification_activity(uuid)
from public, anon, authenticated;

grant execute on function
  public.valid_area_names(text[]),
  public.save_classification_activity(uuid, uuid, text, text[], uuid[]),
  public.list_open_classification_activities(),
  public.get_classification_activity(uuid)
to authenticated;
