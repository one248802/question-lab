-- =====================================================================
-- 투표 초기화 RPC
--  교사가 자기 학급의 투표(votes)를 모두 지웁니다.
--  학급의 투표 설정(voting_status, max_votes, allow_self_vote, allow_vote_change,
--  show_results_during_voting, show_results_after_voting)과 질문은 그대로 둡니다.
--  반환값: 지운 표 수
-- =====================================================================

create or replace function public.reset_class_votes(p_class_id uuid)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  -- 담당 교사만 (익명 학생, 다른 교사는 거부)
  if not public.owns_class(p_class_id) then
    raise exception 'FORBIDDEN';
  end if;

  -- 이 학급 학생들의 행을 잠가서, 초기화 중에 들어온 투표(toggle_vote 도 학생 행을 잠금)가
  -- 초기화 앞이나 뒤로 정리되게 합니다.
  perform 1 from public.students s where s.class_id = p_class_id for update;

  delete from public.votes v
  using public.questions q
  where q.id = v.question_id and q.class_id = p_class_id;
  get diagnostics v_deleted = row_count;

  return v_deleted;
end;
$$;

-- Supabase 는 새 함수에 anon/authenticated 실행 권한을 기본으로 주므로 회수 후 교사(authenticated)에게만 허용
-- (함수 안에서 owns_class 로 담당 교사인지 다시 확인합니다)
revoke execute on function public.reset_class_votes(uuid) from public, anon, authenticated;
grant execute on function public.reset_class_votes(uuid) to authenticated;
