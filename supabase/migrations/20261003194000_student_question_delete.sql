-- =====================================================================
-- 학생 자기 질문 삭제
--  - 학생은 자기 '현재 질문'만 삭제 요청할 수 있습니다.
--  - 업그레이드 이력이 있는 질문은 같은 성장 체인 전체를 삭제합니다.
--  - 질문 삭제 시 FK cascade 로 투표/교사 피드백/폴더 연결 등도 함께 정리됩니다.
-- =====================================================================

create or replace function public.delete_my_question(p_question_id uuid)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student_id uuid := public.current_student_id();
  v_question public.questions%rowtype;
  v_root_id uuid;
  v_deleted int := 0;
begin
  if v_student_id is null then
    raise exception 'NOT_JOINED';
  end if;

  select q.* into v_question
  from public.questions q
  where q.id = p_question_id
    and q.student_id = v_student_id
  for update;

  if not found then
    raise exception 'QUESTION_NOT_FOUND';
  end if;

  -- 이전 버전은 개별 삭제하지 않습니다. 학생 화면에서는 현재 질문에만 삭제 버튼이 보입니다.
  if v_question.superseded_at is not null then
    raise exception 'ONLY_CURRENT_QUESTION';
  end if;

  -- 성장 체인의 맨 처음 질문까지 올라갑니다.
  v_root_id := v_question.id;
  while v_question.parent_question_id is not null loop
    v_root_id := v_question.parent_question_id;

    select q.* into v_question
    from public.questions q
    where q.id = v_root_id
      and q.student_id = v_student_id;

    if not found then
      raise exception 'INVALID_QUESTION_CHAIN';
    end if;
  end loop;

  -- 루트부터 이어진 모든 버전을 함께 지워 성장 이력이 중간에서 끊기지 않게 합니다.
  with recursive chain as (
    select q.id
    from public.questions q
    where q.id = v_root_id
      and q.student_id = v_student_id

    union all

    select child.id
    from public.questions child
    join chain parent on child.parent_question_id = parent.id
    where child.student_id = v_student_id
  ), deleted as (
    delete from public.questions q
    using chain c
    where q.id = c.id
    returning q.id
  )
  select count(*)::int into v_deleted from deleted;

  return v_deleted;
end;
$$;

revoke all on function public.delete_my_question(uuid) from public;
grant execute on function public.delete_my_question(uuid) to authenticated;
