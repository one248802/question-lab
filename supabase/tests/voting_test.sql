-- 투표 규칙 / 권한 테스트. scripts/test-db.sh 가 임시 Postgres 에서 실행합니다.
-- 각 줄에 PASS / FAIL 을 출력하고, 하나라도 FAIL 이면 마지막에 오류로 끝납니다.
\pset format unaligned
\pset tuples_only on

-- ---------------------------------------------------------------------
-- 테스트 도우미
-- ---------------------------------------------------------------------
create schema t;
grant usage on schema t to authenticated;
create table t.results (n serial, label text, ok boolean, detail text);
grant insert, select on t.results to authenticated;
grant usage on sequence t.results_n_seq to authenticated;

-- 로그인 사용자 바꾸기 (JWT 흉내)
create function t.login(p_user uuid, p_anonymous boolean) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_user::text, false),
         set_config('request.jwt.claims', json_build_object('is_anonymous', p_anonymous)::text, false);
$$;

-- SQL 을 실행해 첫 값을 글자로, 오류면 'ERR <메시지>' 로 돌려줌
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

-- 질문 내용으로 id 찾기 (RLS 와 무관하게)
create function t.qid(p_content text) returns uuid language sql security definer as $$
  select id from public.questions where content = p_content;
$$;

-- 투표 / 질문 목록 요약
create function t.vote(p_content text) returns text language sql as $$
  select t.try(format('select public.toggle_vote(%L)', t.qid(p_content)));
$$;
create function t.counts() returns text language sql as $$
  select string_agg(content || '=' || coalesce(vote_count::text, 'null'), ', ' order by content)
  from public.list_class_questions();
$$;
create function t.ctx(p_key text) returns text language sql as $$
  select public.get_my_student() ->> p_key;
$$;
-- 교사가 내 학급 설정 바꾸기. 바뀐 행 수 또는 오류
create function t.set_class(p_set text) returns text language sql as $$
  select t.try(format(
    'with u as (update public.classes set %s where name = %L returning 1) select count(*) from u',
    p_set, '3-2'));
$$;
grant execute on all functions in schema t to authenticated;

\set teacher  '''00000000-0000-0000-0000-0000000000a1'''
\set teacher2 '''00000000-0000-0000-0000-0000000000a2'''
\set stu_a    '''00000000-0000-0000-0000-0000000000b1'''
\set stu_b    '''00000000-0000-0000-0000-0000000000b2'''

-- ---------------------------------------------------------------------
-- 준비: 교사 2명, 익명 학생 2명 가입
-- ---------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  (:teacher,  't1@test.kr', jsonb_build_object('display_name', repeat('가', 60))),
  (:teacher2, 't2@test.kr', '{}');
insert into auth.users (id, is_anonymous) values (:stu_a, true), (:stu_b, true);

select t.check('01 회원가입 시 교사만 profiles 생성',
  (select string_agg(email, ',' order by email) from public.profiles), 't1@test.kr,t2@test.kr');
select t.check('02 긴 display_name 은 40자로 잘림',
  (select char_length(display_name)::text from public.profiles where email = 't1@test.kr'), '40');

set role authenticated;
select t.login(:teacher, false) \g /dev/null
insert into public.classes (name) values ('3-2');
select t.check('03 기본값',
  (select row_to_json(x)::text from (
     select max_votes, allow_self_vote, voting_status, allow_vote_change,
            show_results_during_voting, show_results_after_voting from public.classes) x),
  '{"max_votes":3,"allow_self_vote":false,"voting_status":"before","allow_vote_change":true,"show_results_during_voting":false,"show_results_after_voting":true}');
select t.check('04 학급 생성 시 voting_status 지정 불가',
  t.try($$insert into public.classes (name, voting_status) values ('x', 'open') returning 1$$),
  'ERR permission denied for table classes');

reset role;
select class_code from public.classes where name = '3-2' \gset
set role authenticated;

-- 학생 A: 질문 1개, 학생 B: 질문 4개 (3초 제한을 피하려고 B 질문은 직접 넣음)
select t.login(:stu_a, true) \g /dev/null
select (public.join_class(:'class_code', 1, '가') is not null) \g /dev/null
select (public.create_question('A의 질문') is not null) \g /dev/null
select t.login(:stu_b, true) \g /dev/null
select (public.join_class(:'class_code', 2, '나') is not null) \g /dev/null
reset role;
insert into public.questions (class_id, student_id, content)
select s.class_id, s.id, 'B질문' || g from public.students s, generate_series(1, 4) g where s.student_number = 2;

-- ---------------------------------------------------------------------
-- before: 투표 시작 전
-- ---------------------------------------------------------------------
set role authenticated;
select t.login(:stu_a, true) \g /dev/null
select t.check('05 before: 새 투표 불가', t.vote('B질문1'), 'ERR VOTING_NOT_STARTED');
select t.check('06 before: 학생 상태 표시', t.ctx('voting_status'), 'before');

select t.login(:teacher, false) \g /dev/null
select t.set_class('show_results_during_voting = true, show_results_after_voting = true') \g /dev/null
select t.login(:stu_a, true) \g /dev/null
select t.check('07 before: 공개 설정이 모두 켜져 있어도 결과 비공개',
  t.counts(), 'A의 질문=null, B질문1=null, B질문2=null, B질문3=null, B질문4=null');
select t.check('08 before: show_vote_counts = false', t.ctx('show_vote_counts'), 'false');
select t.login(:teacher, false) \g /dev/null
select t.set_class('show_results_during_voting = false') \g /dev/null

-- before 에 표가 있다고 가정해도 취소 불가
reset role;
insert into public.votes (question_id, student_id)
select t.qid('B질문4'), s.id from public.students s where s.student_number = 1;
set role authenticated;
select t.login(:stu_a, true) \g /dev/null
select t.check('09 before: 투표 취소 불가', t.vote('B질문4'), 'ERR VOTING_NOT_STARTED');
reset role;
delete from public.votes;
set role authenticated;

select t.login(:teacher, false) \g /dev/null
select t.check('10 before → closed 불가', t.set_class($$voting_status = 'closed'$$), 'ERR INVALID_VOTING_TRANSITION');
select t.check('11 before → open (투표 시작)', t.set_class($$voting_status = 'open'$$), '1');

-- ---------------------------------------------------------------------
-- open: 투표 중
-- ---------------------------------------------------------------------
select t.check('12 open → before 불가', t.set_class($$voting_status = 'before'$$), 'ERR INVALID_VOTING_TRANSITION');
select t.login(:stu_a, true) \g /dev/null
select t.check('13 open: 학생 상태 표시', t.ctx('voting_status'), 'open');
select t.check('14 open: 자기 질문 투표 금지', t.vote('A의 질문'), 'ERR SELF_VOTE_NOT_ALLOWED');
select t.check('15 open: 투표 1', t.vote('B질문1'), 'true');
select t.check('16 open: 투표 2', t.vote('B질문2'), 'true');
select t.check('17 open: 투표 3', t.vote('B질문3'), 'true');
select t.check('18 open: max_votes(3) 초과 불가', t.vote('B질문4'), 'ERR VOTE_LIMIT_REACHED');
select t.check('19 open: during=false 이면 결과 비공개',
  t.counts(), 'A의 질문=null, B질문1=null, B질문2=null, B질문3=null, B질문4=null');
select t.check('20 open: 취소 (바꾸기 허용)', t.vote('B질문3'), 'false');
select t.check('21 open: 다시 투표', t.vote('B질문3'), 'true');

select t.login(:teacher, false) \g /dev/null
select t.set_class('max_votes = 2, allow_vote_change = false') \g /dev/null
select t.login(:stu_a, true) \g /dev/null
select t.check('22 max_votes 를 줄여도 기존 표 유지', t.ctx('my_vote_count'), '3');
select t.check('23 초과 상태: 새 투표 불가', t.vote('B질문4'), 'ERR VOTE_LIMIT_REACHED');
select t.check('24 초과 상태: 바꾸기 꺼져 있어도 초과분 취소 가능', t.vote('B질문3'), 'false');
select t.check('25 한도 도달 후: 바꾸기 꺼져 있으면 취소 불가', t.vote('B질문2'), 'ERR VOTE_CHANGE_NOT_ALLOWED');
select t.check('26 한도 도달 후: 새 투표 불가', t.vote('B질문4'), 'ERR VOTE_LIMIT_REACHED');

select t.login(:teacher, false) \g /dev/null
select t.set_class('allow_self_vote = true, max_votes = 3') \g /dev/null
select t.login(:stu_a, true) \g /dev/null
select t.check('27 open: 자기 질문 투표 허용', t.vote('A의 질문'), 'true');

select t.login(:teacher, false) \g /dev/null
select t.set_class('show_results_during_voting = true') \g /dev/null
select t.login(:stu_a, true) \g /dev/null
select t.check('28 open: during=true 이면 결과 공개',
  t.counts(), 'A의 질문=1, B질문1=1, B질문2=1, B질문3=0, B질문4=0');

-- ---------------------------------------------------------------------
-- closed: 투표 종료
-- ---------------------------------------------------------------------
select t.login(:teacher, false) \g /dev/null
select t.set_class('show_results_during_voting = false, allow_vote_change = true') \g /dev/null
select t.check('29 open → closed (투표 종료)', t.set_class($$voting_status = 'closed'$$), '1');
select t.login(:stu_a, true) \g /dev/null
select t.check('30 closed: 학생 상태 표시', t.ctx('voting_status'), 'closed');
select t.check('31 closed: 새 투표 불가', t.vote('B질문4'), 'ERR VOTING_CLOSED');
select t.check('32 closed: 바꾸기 허용이어도 취소 불가', t.vote('B질문1'), 'ERR VOTING_CLOSED');
select t.check('33 closed: after=true 이면 결과 공개',
  t.counts(), 'A의 질문=1, B질문1=1, B질문2=1, B질문3=0, B질문4=0');

select t.login(:teacher, false) \g /dev/null
select t.set_class('show_results_after_voting = false') \g /dev/null
select t.login(:stu_a, true) \g /dev/null
select t.check('34 closed: after=false 이면 결과 비공개',
  t.counts(), 'A의 질문=null, B질문1=null, B질문2=null, B질문3=null, B질문4=null');
select t.check('35 closed: show_vote_counts = false', t.ctx('show_vote_counts'), 'false');

select t.login(:teacher, false) \g /dev/null
select t.check('36 closed → before 불가', t.set_class($$voting_status = 'before'$$), 'ERR INVALID_VOTING_TRANSITION');
select t.check('37 closed → open (다시 열기)', t.set_class($$voting_status = 'open'$$), '1');
select t.login(:stu_a, true) \g /dev/null
select t.check('38 다시 열어도 기존 표 유지', t.ctx('my_vote_count'), '3');
select t.check('39 다시 연 뒤 취소 가능', t.vote('A의 질문'), 'false');

-- ---------------------------------------------------------------------
-- 기타 규칙 / 권한
-- ---------------------------------------------------------------------
reset role;
update public.questions set is_hidden = true where content = 'B질문1';
set role authenticated;
select t.login(:stu_a, true) \g /dev/null
select t.check('40 숨겨진 질문의 표는 개수에서 제외', t.ctx('my_vote_count'), '1');
select t.check('41 숨겨진 질문은 투표 불가', t.vote('B질문1'), 'ERR QUESTION_NOT_FOUND');

select t.login(:teacher, false) \g /dev/null
select t.check('42 max_votes 5 저장', t.set_class('max_votes = 5'), '1');
select t.check('43 max_votes 0 거부', t.set_class('max_votes = 0'),
  'ERR new row for relation "classes" violates check constraint "classes_max_votes_check"');
select t.check('44 max_votes 21 거부', t.set_class('max_votes = 21'),
  'ERR new row for relation "classes" violates check constraint "classes_max_votes_check"');
select t.check('45 잘못된 voting_status 거부', t.set_class($$voting_status = 'paused'$$),
  'ERR INVALID_VOTING_TRANSITION');

select t.login(:teacher2, false) \g /dev/null
select t.check('46 다른 교사는 내 학급 상태 변경 불가', t.set_class($$voting_status = 'closed'$$), '0');

select t.login(:stu_a, true) \g /dev/null
select t.check('47 학생은 학급 설정 변경 불가', t.set_class($$voting_status = 'closed'$$), '0');
select t.check('48 내부 함수 직접 호출 불가 (student_vote_count)',
  t.try($$select public.student_vote_count(gen_random_uuid())$$), 'ERR permission denied for function student_vote_count');
select t.check('49 내부 함수 직접 호출 불가 (student_context_json)',
  t.try($$select public.student_context_json(gen_random_uuid())$$), 'ERR permission denied for function student_context_json');
select t.check('50 학생은 votes 직접 추가 불가',
  t.try(format('insert into public.votes (question_id, student_id) values (%L, gen_random_uuid()) returning 1', t.qid('B질문4'))),
  'ERR permission denied for table votes');

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
