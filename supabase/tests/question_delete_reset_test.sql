-- 질문 삭제 / 투표 초기화 테스트. scripts/test-db.sh 가 새 DB 에서 실행합니다.
\pset format unaligned
\pset tuples_only on

-- ---------------------------------------------------------------------
-- 테스트 도우미 (voting_test.sql 과 같은 방식)
-- ---------------------------------------------------------------------
create schema t;
grant usage on schema t to authenticated, anon;
create table t.results (n serial, label text, ok boolean, detail text);
grant insert, select on t.results to authenticated, anon;
grant usage on sequence t.results_n_seq to authenticated, anon;

create function t.login(p_user uuid, p_anonymous boolean) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_user::text, false),
         set_config('request.jwt.claims', json_build_object('is_anonymous', p_anonymous)::text, false);
$$;
create function t.try(q text) returns text language plpgsql as $$
declare r text;
begin
  execute q into r;
  return coalesce(r, 'null');
exception when others then
  return 'ERR ' || sqlerrm;
end $$;
create function t.check(p_label text, p_actual text, p_expected text) returns text language plpgsql as $$
declare ok boolean := p_actual is not distinct from p_expected;
begin
  insert into t.results (label, ok, detail)
  values (p_label, ok, case when ok then null else format('got %s, expected %s', p_actual, p_expected) end);
  return case when ok then 'PASS ' else 'FAIL ' end || p_label
      || case when ok then '' else format('  (got %s, expected %s)', p_actual, p_expected) end;
end $$;
create function t.qid(p_content text) returns uuid language sql security definer as $$
  select id from public.questions where content = p_content;
$$;
create function t.cid(p_name text) returns uuid language sql security definer as $$
  select id from public.classes where name = p_name;
$$;
create function t.vote(p_content text) returns text language sql as $$
  select t.try(format('select public.toggle_vote(%L)', t.qid(p_content)));
$$;
-- 질문 삭제 시도: 지워진 행 수 또는 오류
create function t.delete_question(p_content text) returns text language sql as $$
  select t.try(format(
    'with d as (delete from public.questions where id = %L returning 1) select count(*) from d', t.qid(p_content)));
$$;
create function t.reset(p_class text) returns text language sql as $$
  select t.try(format('select public.reset_class_votes(%L)', t.cid(p_class)));
$$;
-- 학급의 전체 표 수 / 질문 수 (권한과 무관하게 실제 값)
create function t.class_votes(p_class text) returns text language sql security definer as $$
  select count(*)::text from public.votes v join public.questions q on q.id = v.question_id
  where q.class_id = (select id from public.classes where name = p_class);
$$;
create function t.class_questions(p_class text) returns text language sql security definer as $$
  select count(*)::text from public.questions where class_id = (select id from public.classes where name = p_class);
$$;
create function t.settings(p_class text) returns text language sql security definer as $$
  select row_to_json(x)::text from (
    select voting_status, max_votes, allow_self_vote, allow_vote_change,
           show_results_during_voting, show_results_after_voting
    from public.classes where name = p_class) x;
$$;
create function t.board() returns text language sql as $$
  select coalesce(string_agg(content || '=' || coalesce(vote_count::text, 'null'), ', ' order by content), '')
  from public.list_class_questions();
$$;
grant execute on all functions in schema t to authenticated, anon;

\set teacher  '''00000000-0000-0000-0000-0000000000a1'''
\set teacher2 '''00000000-0000-0000-0000-0000000000a2'''
\set stu_a    '''00000000-0000-0000-0000-0000000000b1'''
\set stu_b    '''00000000-0000-0000-0000-0000000000b2'''
\set stu_c    '''00000000-0000-0000-0000-0000000000c1'''

-- ---------------------------------------------------------------------
-- 준비: 교사1 학급 '3-2' (학생 A, B), 교사2 학급 '4-1' (학생 C)
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values (:teacher, 't1@test.kr'), (:teacher2, 't2@test.kr');
insert into auth.users (id, is_anonymous) values (:stu_a, true), (:stu_b, true), (:stu_c, true);

set role authenticated;
select t.login(:teacher, false) \g /dev/null
insert into public.classes (name) values ('3-2');
select t.login(:teacher2, false) \g /dev/null
insert into public.classes (name) values ('4-1');
reset role;
select class_code as code1 from public.classes where name = '3-2' \gset
select class_code as code2 from public.classes where name = '4-1' \gset

set role authenticated;
select t.login(:stu_a, true) \g /dev/null
select (public.join_class(:'code1', 1, '가') is not null) \g /dev/null
select (public.create_question('A의 질문') is not null) \g /dev/null
select t.login(:stu_b, true) \g /dev/null
select (public.join_class(:'code1', 2, '나') is not null) \g /dev/null
select t.login(:stu_c, true) \g /dev/null
select (public.join_class(:'code2', 1, '다') is not null) \g /dev/null
select (public.create_question('C의 질문') is not null) \g /dev/null
reset role;
insert into public.questions (class_id, student_id, content)
select s.class_id, s.id, 'B질문' || g from public.students s, generate_series(1, 5) g
where s.student_number = 2 and s.class_id = t.cid('3-2');
update public.classes set voting_status = 'open', show_results_during_voting = true;

-- 투표: A → B1, B2, B3 (3표), B → A의 질문 (1표), C → 자기 학급 질문 불가하므로 교사2가 자기 투표 허용
update public.classes set allow_self_vote = true where name = '4-1';
set role authenticated;
select t.login(:stu_a, true) \g /dev/null
select t.vote('B질문1'), t.vote('B질문2'), t.vote('B질문3') \g /dev/null
select t.login(:stu_b, true) \g /dev/null
select t.vote('A의 질문') \g /dev/null
select t.login(:stu_c, true) \g /dev/null
select t.vote('C의 질문') \g /dev/null

select t.check('00 준비: 3-2 학급 표 4개, 4-1 학급 표 1개',
  t.class_votes('3-2') || '/' || t.class_votes('4-1'), '4/1');
select t.login(:stu_a, true) \g /dev/null
select t.check('00 준비: 학생 A 는 한도(3) 도달로 B질문5 투표 불가', t.vote('B질문5'), 'ERR VOTE_LIMIT_REACHED');

-- ---------------------------------------------------------------------
-- 질문 삭제
-- ---------------------------------------------------------------------
select t.login(:stu_a, true) \g /dev/null
select t.check('D01 학생은 질문 삭제 불가 (RLS 로 0행)', t.delete_question('B질문1'), '0');
select t.login(:teacher2, false) \g /dev/null
select t.check('D02 다른 학급 교사는 삭제 불가 (0행)', t.delete_question('B질문1'), '0');
select t.check('D03 거부된 삭제 후에도 질문과 표 유지', t.class_questions('3-2') || '/' || t.class_votes('3-2'), '6/4');

select t.login(:teacher, false) \g /dev/null
select t.check('D04 담당 교사는 삭제 가능', t.delete_question('B질문1'), '1');
select t.check('D05 삭제한 질문의 표도 함께 삭제 (cascade)', t.class_votes('3-2'), '3');
select t.check('D06 숨긴 질문도 삭제 가능',
  t.try($$with u as (update public.questions set is_hidden = true where content = 'B질문4' returning 1) select count(*) from u$$)
  || '/' || t.delete_question('B질문4'), '1/1');

select t.login(:stu_a, true) \g /dev/null
select t.check('D07 학생 목록에서 삭제된 질문 사라짐', t.board(), 'A의 질문=1, B질문2=1, B질문3=1, B질문5=0');
select t.check('D08 삭제된 질문의 표는 내 표 수에서 빠짐', public.get_my_student() ->> 'my_vote_count', '2');
select t.check('D09 삭제된 질문에는 투표 불가',
  t.try(format('select public.toggle_vote(%L)', '00000000-0000-0000-0000-000000000999')), 'ERR QUESTION_NOT_FOUND');
select t.check('D10 돌려받은 표로 다른 질문에 투표 가능', t.vote('B질문5'), 'true');

-- ---------------------------------------------------------------------
-- 투표 초기화
-- ---------------------------------------------------------------------
reset role;
select t.settings('3-2') as settings_before \gset
set role authenticated;

select t.login(:stu_a, true) \g /dev/null
select t.check('R01 학생은 초기화 불가', t.reset('3-2'), 'ERR FORBIDDEN');
select t.login(:teacher2, false) \g /dev/null
select t.check('R02 다른 학급 교사는 초기화 불가', t.reset('3-2'), 'ERR FORBIDDEN');
select t.check('R03 거부된 초기화 후 표 유지', t.class_votes('3-2'), '4');

reset role;
set role anon;
select t.check('R04 로그인하지 않은 사용자는 실행 권한 없음', t.reset('3-2'),
  'ERR permission denied for function reset_class_votes');
reset role;
set role authenticated;

select t.login(:teacher, false) \g /dev/null
select t.check('R05 담당 교사 초기화: 지운 표 수 반환', t.reset('3-2'), '4');
select t.check('R06 학급 표 0개', t.class_votes('3-2'), '0');
select t.check('R07 질문은 그대로', t.class_questions('3-2'), '4');
select t.check('R08 투표 설정은 그대로', t.settings('3-2'), :'settings_before');
select t.check('R09 다른 학급 표는 그대로', t.class_votes('4-1'), '1');
select t.check('R10 표가 없을 때 초기화하면 0 반환', t.reset('3-2'), '0');

select t.login(:stu_a, true) \g /dev/null
select t.check('R11 학생: 내 표 0개', public.get_my_student() ->> 'my_vote_count', '0');
select t.check('R12 학생 목록 투표 수 0', t.board(), 'A의 질문=0, B질문2=0, B질문3=0, B질문5=0');
select t.check('R13 초기화 후 다시 투표 가능', t.vote('B질문2'), 'true');

select t.login(:teacher, false) \g /dev/null
select t.check('R14 교사 화면(RLS)에서도 표 1개',
  (select count(*)::text from public.votes), '1');
select t.check('R15 투표 종료 상태에서도 초기화 가능',
  t.try($$with u as (update public.classes set voting_status = 'closed' where name = '3-2' returning 1) select count(*) from u$$)
  || '/' || t.reset('3-2') || '/' || (t.settings('3-2')::json ->> 'voting_status'), '1/1/closed');

-- ---------------------------------------------------------------------
-- 결과
-- ---------------------------------------------------------------------
reset role;
select format('== %s passed, %s failed', count(*) filter (where ok), count(*) filter (where not ok)) from t.results;
do $$
begin
  if exists (select 1 from t.results where not ok) then
    raise exception 'DB tests failed';
  end if;
end $$;
