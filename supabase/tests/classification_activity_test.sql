-- 질문 분류 활동 테스트. scripts/test-db.sh 가 새 DB 에서 실행합니다.
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
create function t.aid(p_title text) returns uuid language sql security definer as $$
  select id from public.classification_activities where title = p_title;
$$;
-- 활동 저장 (질문은 내용으로 지정). 결과: 'ok' 또는 오류
create function t.save(p_activity uuid, p_class text, p_title text, p_areas text[], p_questions text[])
returns text language sql as $$
  select t.try(format(
    'select case when public.save_classification_activity(%L, %L, %L, %L, %L) is not null then ''ok'' end',
    p_activity, t.cid(p_class), p_title, p_areas,
    (select array_agg(coalesce(t.qid(c), gen_random_uuid()) order by o) from unnest(p_questions) with ordinality u(c, o))));
$$;
-- 활동의 실제 상태 (권한과 무관)
create function t.activity(p_title text) returns text language sql security definer as $$
  select format('%s|%s|%s|%s', a.title, array_to_string(a.area_names, ','), a.is_open::text,
    (select string_agg(q.content, ',' order by aq.sort_order)
       from public.classification_activity_questions aq join public.questions q on q.id = aq.question_id
      where aq.activity_id = a.id))
  from public.classification_activities a where a.title = p_title;
$$;
create function t.list() returns text language sql as $$
  select coalesce(string_agg(format('%s(%s/%s)', title, area_count, question_count), ', ' order by title), '')
  from public.list_open_classification_activities();
$$;
create function t.get(p_title text) returns text language sql as $$
  select t.try(format('select public.get_classification_activity(%L)::text', t.aid(p_title)));
$$;
-- 질문/투표 관련 수치 (분류 활동 전후 비교용)
create function t.core_counts() returns text language sql security definer as $$
  select format('q=%s v=%s', (select count(*) from public.questions), (select count(*) from public.votes));
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
select s.class_id, s.id, 'B질문' || g from public.students s, generate_series(1, 3) g
where s.student_number = 2 and s.class_id = t.cid('3-2');
update public.questions set is_hidden = true where content = 'B질문3';
-- 투표 데이터 (분류 활동이 건드리지 않는지 확인용)
update public.classes set voting_status = 'open';
set role authenticated;
select t.login(:stu_a, true) \g /dev/null
select public.toggle_vote(t.qid('B질문1')) \g /dev/null
reset role;
select t.core_counts() as core_before \gset
set role authenticated;

select t.check('00 학생 분류 결과를 저장하는 테이블은 없음',
  (to_regclass('public.classification_responses') is null)::text, 'true');

-- ---------------------------------------------------------------------
-- 교사: 활동 만들기 / 수정 (save_classification_activity)
-- ---------------------------------------------------------------------
select t.login(:teacher, false) \g /dev/null
select t.check('C01 활동 만들기',
  t.save(null, '3-2', '  궁금한 질문 나누기 ', array[' 사실 ', '생각'], array['A의 질문', 'B질문1', 'B질문3']), 'ok');
select t.check('C02 제목/영역 공백 정리, 처음엔 비공개, 고른 질문 순서대로',
  t.activity('궁금한 질문 나누기'), '궁금한 질문 나누기|사실,생각|false|A의 질문,B질문1,B질문3');
select t.check('C03 영역 1개 거부', t.save(null, '3-2', 'x', array['하나'], array['A의 질문']), 'ERR INVALID_AREAS');
select t.check('C04 영역 6개 거부',
  t.save(null, '3-2', 'x', array['1','2','3','4','5','6'], array['A의 질문']), 'ERR INVALID_AREAS');
select t.check('C05 빈 영역 이름 거부', t.save(null, '3-2', 'x', array['가', '  '], array['A의 질문']), 'ERR INVALID_AREAS');
select t.check('C06 21자 영역 이름 거부',
  t.save(null, '3-2', 'x', array['가', repeat('나', 21)], array['A의 질문']), 'ERR INVALID_AREAS');
select t.check('C07 중복 영역 이름 거부', t.save(null, '3-2', 'x', array['같음', ' 같음'], array['A의 질문']), 'ERR INVALID_AREAS');
select t.check('C08 빈 제목 거부', t.save(null, '3-2', '   ', array['가', '나'], array['A의 질문']), 'ERR INVALID_TITLE');
select t.check('C09 질문 없이 거부', t.save(null, '3-2', 'x', array['가', '나'], array[]::text[]), 'ERR NO_QUESTIONS');
select t.check('C10 다른 학급 질문 거부', t.save(null, '3-2', 'x', array['가', '나'], array['C의 질문']), 'ERR INVALID_QUESTION');
select t.check('C11 없는 질문 거부', t.save(null, '3-2', 'x', array['가', '나'], array['없는 질문']), 'ERR INVALID_QUESTION');
select t.check('C12 영역 5개는 허용',
  t.save(null, '3-2', '다섯 영역', array['1','2','3','4','5'], array['B질문2', 'B질문2']), 'ok');
select t.check('C13 같은 질문을 두 번 골라도 한 번만', t.activity('다섯 영역'), '다섯 영역|1,2,3,4,5|false|B질문2');

select t.login(:teacher2, false) \g /dev/null
select t.check('C14 다른 교사는 남의 학급에 활동 만들기 불가',
  t.save(null, '3-2', 'x', array['가', '나'], array['A의 질문']), 'ERR FORBIDDEN');
select t.check('C15 다른 교사는 남의 활동 수정 불가',
  t.save(t.aid('궁금한 질문 나누기'), '4-1', 'x', array['가', '나'], array['C의 질문']), 'ERR FORBIDDEN');
select t.login(:stu_a, true) \g /dev/null
select t.check('C16 학생은 활동 만들기 불가', t.save(null, '3-2', 'x', array['가', '나'], array['A의 질문']), 'ERR FORBIDDEN');
reset role;
set role anon;
select t.check('C17 비로그인 사용자는 실행 권한 없음',
  t.try('select public.save_classification_activity(null, null, null, null, null)'),
  'ERR permission denied for function save_classification_activity');
reset role;
set role authenticated;

select t.login(:teacher, false) \g /dev/null
select t.check('C18 활동 수정 (제목, 영역 3개, 질문 교체)',
  t.save(t.aid('궁금한 질문 나누기'), '3-2', '질문 분류 1', array['사실', '생각', '느낌'], array['B질문2', 'A의 질문']), 'ok');
select t.check('C19 수정 결과', t.activity('질문 분류 1'), '질문 분류 1|사실,생각,느낌|false|B질문2,A의 질문');

-- ---------------------------------------------------------------------
-- 공개 / 학생 조회
-- ---------------------------------------------------------------------
select t.login(:stu_a, true) \g /dev/null
select t.check('S01 공개 전: 학생 목록 비어 있음', t.list(), '');
select t.check('S02 공개 전: 학생 조회 불가', t.get('질문 분류 1'), 'ERR ACTIVITY_NOT_FOUND');

select t.login(:teacher, false) \g /dev/null
select t.check('S03 교사 공개 전환',
  t.try($$with u as (update public.classification_activities set is_open = true where title = '질문 분류 1' returning 1) select count(*) from u$$), '1');
select t.check('S04 교사는 제목을 직접 수정할 수 없음 (RPC 로만)',
  t.try($$update public.classification_activities set title = 'y' returning 1$$), 'ERR permission denied for table classification_activities');
select t.check('S05 교사는 활동 질문을 직접 추가할 수 없음 (RPC 로만)',
  t.try(format('insert into public.classification_activity_questions (activity_id, question_id) values (%L, %L) returning 1',
    t.aid('질문 분류 1'), t.qid('B질문1'))), 'ERR permission denied for table classification_activity_questions');

select t.login(:stu_a, true) \g /dev/null
select t.check('S06 학생 목록: 공개된 활동만 (영역 3개, 질문 2개)', t.list(), '질문 분류 1(3/2)');
select t.check('S07 학생 조회: 제목, 영역, 질문(id, 내용)만',
  (select string_agg(k, ',' order by k) from jsonb_object_keys(public.get_classification_activity(t.aid('질문 분류 1'))) k)
  || ' / ' ||
  (select string_agg(k, ',' order by k) from jsonb_object_keys(public.get_classification_activity(t.aid('질문 분류 1')) -> 'questions' -> 0) k),
  'area_names,id,questions,title / content,id');
select t.check('S08 학생 조회: 질문 순서와 영역',
  (select string_agg(q ->> 'content', ',') from jsonb_array_elements(public.get_classification_activity(t.aid('질문 분류 1')) -> 'questions') q)
  || ' / ' || (public.get_classification_activity(t.aid('질문 분류 1')) ->> 'area_names'),
  'B질문2,A의 질문 / ["사실", "생각", "느낌"]');
select t.check('S09 학생 응답에 작성자/투표 관련 키와 학생 이름 없음',
  (public.get_classification_activity(t.aid('질문 분류 1'))::text ~ '"(student[a-z_]*|author[a-z_]*|is_mine|vote[a-z_]*|name)"|"(가|나)"')::text, 'false');

-- 숨긴 질문은 학생에게 보이지 않음
select t.login(:teacher, false) \g /dev/null
select t.save(t.aid('질문 분류 1'), '3-2', '질문 분류 1', array['사실', '생각', '느낌'], array['B질문2', 'A의 질문', 'B질문3']) \g /dev/null
select t.login(:stu_a, true) \g /dev/null
select t.check('S10 숨긴 질문은 학생 목록 수와 조회에서 제외',
  t.list() || ' / ' || jsonb_array_length(public.get_classification_activity(t.aid('질문 분류 1')) -> 'questions'),
  '질문 분류 1(3/2) / 2');
select t.check('S11 수정해도 공개 상태 유지', split_part(t.activity('질문 분류 1'), '|', 3), 'true');

-- 여러 활동 동시 공개
select t.login(:teacher, false) \g /dev/null
select t.try($$with u as (update public.classification_activities set is_open = true where title = '다섯 영역' returning 1) select count(*) from u$$) \g /dev/null
select t.login(:stu_b, true) \g /dev/null
select t.check('S12 여러 활동 동시 공개: 같은 반 다른 학생도 목록 2개', t.list(), '다섯 영역(5/1), 질문 분류 1(3/2)');

-- 다른 학급 / 직접 접근
select t.login(:stu_c, true) \g /dev/null
select t.check('S13 다른 반 학생: 목록 비어 있음', t.list(), '');
select t.check('S14 다른 반 학생: 조회 불가', t.get('질문 분류 1'), 'ERR ACTIVITY_NOT_FOUND');
select t.login(:stu_a, true) \g /dev/null
select t.check('S15 학생은 활동 테이블 직접 조회 불가 (0행)',
  (select count(*)::text from public.classification_activities) || '/' || (select count(*)::text from public.classification_activity_questions), '0/0');
select t.check('S16 학생은 공개 전환 불가 (0행)',
  t.try($$with u as (update public.classification_activities set is_open = false returning 1) select count(*) from u$$), '0');
select t.check('S17 학생은 활동 삭제 불가 (0행)',
  t.try($$with d as (delete from public.classification_activities returning 1) select count(*) from d$$), '0');
select t.login(:teacher2, false) \g /dev/null
select t.check('S18 다른 교사는 남의 활동 조회/공개 전환 불가',
  (select count(*)::text from public.classification_activities) || '/' ||
  t.try($$with u as (update public.classification_activities set is_open = false returning 1) select count(*) from u$$), '0/0');
reset role;
set role anon;
select t.check('S19 비로그인 사용자는 학생 RPC 실행 권한 없음',
  t.try('select count(*) from public.list_open_classification_activities()'),
  'ERR permission denied for function list_open_classification_activities');
reset role;
set role authenticated;

-- ---------------------------------------------------------------------
-- 기존 기능과의 관계
-- ---------------------------------------------------------------------
select t.login(:teacher, false) \g /dev/null
select t.check('X01 활동 작업 후에도 질문 수 / 투표 수 그대로', t.core_counts(), :'core_before');
select t.check('X02 질문 삭제 시 활동에서도 빠짐',
  t.try($$with d as (delete from public.questions where content = 'B질문2' returning 1) select count(*) from d$$)
  || ' / ' || t.activity('질문 분류 1'), '1 / 질문 분류 1|사실,생각,느낌|true|A의 질문,B질문3');
select t.check('X03 활동 삭제: 활동 질문 연결도 삭제, 질문은 그대로',
  t.try($$with d as (delete from public.classification_activities where title = '다섯 영역' returning 1) select count(*) from d$$)
  || ' / ' || (select count(*)::text from public.classification_activity_questions aq
               join public.classification_activities a on a.id = aq.activity_id where a.title = '다섯 영역')
  || ' / ' || t.core_counts(), '1 / 0 / q=4 v=1');
select t.check('X04 학급 통계(teacher_class_stats) 그대로',
  (select format('%s/%s', student_count, question_count) from public.teacher_class_stats(now() - interval '1 day') where class_id = t.cid('3-2')),
  '2/3');
select t.check('X05 학급 삭제 시 활동도 삭제',
  t.try($$with d as (delete from public.classes where name = '3-2' returning 1) select count(*) from d$$)
  || ' / ' || t.try('select count(*) from public.classification_activities'), '1 / 0');

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
