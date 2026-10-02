-- =====================================================================
-- 개발 초기화용: 우리반 질문 상자 앱 객체만 public 스키마에서 제거합니다.
--
--  - 실제 수업 데이터가 없을 때만 사용하세요. 앱 테이블의 데이터가 모두 지워집니다.
--  - auth 스키마, auth.users(가입된 계정)는 지우지 않습니다.
--    auth.users 에 붙여 두었던 우리 트리거(on_auth_user_created)만 제거합니다.
--  - 구버전(main 브랜치) migration, 최신 migration, 부분 실행으로 생긴 객체를 모두 대상으로 합니다.
--  - IF EXISTS 를 사용하므로 여러 번 실행해도 안전합니다.
--  - 이 파일은 migration 이 아닙니다. supabase/migrations 폴더에 넣지 마세요.
--
-- 실행 후: 맨 아래 "검사" 쿼리 결과가 모두 0 이어야 합니다.
-- 그다음 supabase/migrations/20261001000000_init.sql 전체를 실행하세요.
-- =====================================================================

begin;

-- 1. auth.users 에 붙어 있는 우리 트리거 (트리거만 제거, auth.users 테이블과 계정은 그대로)
drop trigger if exists on_auth_user_created on auth.users;

-- 2. 앱 테이블 (정책, 인덱스, 테이블 트리거, 외래 키는 테이블과 함께 제거됨)
drop table if exists
  -- 추후 질문 분류 활동 (설계만 있음, 혹시 만들어졌을 경우)
  public.classification_responses,
  public.classification_activity_questions,
  public.classification_activities,
  -- 최신 migration
  public.votes,
  public.questions,
  public.student_sessions,
  public.students,
  public.classes,
  public.profiles,
  public.classification_categories,
  public.classification_frameworks,
  -- 구버전 migration (질문 유형 조회 테이블)
  public.question_types,
  public.question_scopes
cascade;

-- 3. 앱 함수 (이름 기준. 구버전/신버전의 서로 다른 인자 형태를 모두 제거)
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        -- 보조 / 트리거 함수
        'is_teacher', 'owns_class', 'current_student_id', 'generate_class_code',
        'classes_before_insert', 'classes_check_voting_status', 'handle_new_user',
        'vote_results_visible', 'student_vote_count', 'student_context_json',
        -- 교사 RPC
        'teacher_class_stats', 'regenerate_class_code',
        -- 학생 RPC
        'join_class', 'get_my_student', 'leave_class', 'list_class_questions',
        'create_question', 'toggle_vote'
      )
  loop
    execute format('drop function if exists %s cascade', fn);
  end loop;
end $$;

commit;

-- PostgREST(API)가 바뀐 스키마를 바로 보도록 캐시 새로고침
notify pgrst, 'reload schema';

-- =====================================================================
-- 검사: 아래 결과의 남은 개수(remaining)가 모두 0 이어야 합니다.
--      auth_users 는 가입된 계정 수로, 지워지지 않고 그대로 남아 있어야 합니다.
-- =====================================================================
select 'tables' as kind, count(*) as remaining,
       coalesce(string_agg(c.relname, ', '), '') as names
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
  and c.relname in ('question_scopes', 'question_types', 'classification_frameworks',
                    'classification_categories', 'profiles', 'classes', 'students',
                    'student_sessions', 'questions', 'votes', 'classification_activities',
                    'classification_activity_questions', 'classification_responses')
union all
select 'functions', count(*), coalesce(string_agg(p.oid::regprocedure::text, ', '), '')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_teacher', 'owns_class', 'current_student_id', 'generate_class_code',
                    'classes_before_insert', 'classes_check_voting_status', 'handle_new_user',
                    'vote_results_visible', 'student_vote_count', 'student_context_json',
                    'teacher_class_stats', 'regenerate_class_code', 'join_class',
                    'get_my_student', 'leave_class', 'list_class_questions',
                    'create_question', 'toggle_vote')
union all
select 'policies', count(*), coalesce(string_agg(tablename || ': ' || policyname, ', '), '')
from pg_policies
where schemaname = 'public'
  and tablename in ('question_scopes', 'question_types', 'classification_frameworks',
                    'classification_categories', 'profiles', 'classes', 'students',
                    'student_sessions', 'questions', 'votes')
union all
select 'auth.users triggers', count(*), coalesce(string_agg(tgname, ', '), '')
from pg_trigger
where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created'
union all
select 'auth_users (kept)', count(*), 'remaining = 가입된 계정 수 (삭제되지 않음)'
from auth.users;
