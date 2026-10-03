-- 생각 놀이터 1차 확장 보완
-- 1) 교사가 숨긴 질문 생각을 학생이 수정해도 자동으로 다시 공개되지 않게 함
-- 2) 학생 기준 수정 허용을 끄면 교사 기준이 다시 보이게 함(개인 기준 데이터는 보존)
-- 3) 공개 분류 활동 질문 수에서도 업그레이드 전 질문을 제외
-- 4) 반환형 변경 때문에 재생성한 list_class_questions() 실행 권한을 다시 제한

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
    set content = excluded.content,
        updated_at = now()
  returning id into v_id;
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
    'area_names', to_jsonb(case when a.student_can_edit_area_names then coalesce(sa.area_names, a.area_names) else a.area_names end),
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

create or replace function public.list_open_classification_activities()
returns table (
  id uuid,
  title text,
  area_count int,
  question_count int,
  created_at timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_class_id uuid;
begin
  select s.class_id into v_class_id from public.students s where s.id = public.current_student_id();
  if v_class_id is null then raise exception 'NOT_JOINED'; end if;

  return query
  select
    a.id,
    a.title,
    cardinality(a.area_names),
    (select count(*)::int
       from public.classification_activity_questions aq
       join public.questions q on q.id = aq.question_id
      where aq.activity_id = a.id and q.is_hidden = false and q.superseded_at is null),
    a.created_at
  from public.classification_activities a
  where a.class_id = v_class_id and a.is_open
  order by a.created_at desc;
end;
$$;

revoke all on function public.list_class_questions() from public, anon;
grant execute on function public.list_class_questions() to authenticated;
