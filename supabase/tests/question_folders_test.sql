-- 교사 질문 폴더 테스트. scripts/test-db.sh 가 새 DB 에서 실행합니다.
--   ./scripts/test-db.sh question_folders   (이 파일만 실행)
\pset format unaligned
\pset tuples_only on

-- ---------------------------------------------------------------------
-- 테스트 도우미 (question_delete_reset_test.sql 과 같은 방식)
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
create function t.fid(p_class text, p_name text) returns uuid language sql security definer as $$
  select id from public.question_folders where class_id = t.cid(p_class) and name = p_name;
$$;
-- 폴더 만들기 시도: 만든 행 수 또는 오류
create function t.new_folder(p_class text, p_name text) returns text language sql as $$
  select t.try(format(
    'with i as (insert into public.question_folders (class_id, name) values (%L, %L) returning 1) select count(*) from i',
    t.cid(p_class), p_name));
$$;
-- 질문을 폴더에 넣기 시도 (이미 있으면 무시: 앱과 같은 on conflict do nothing)
create function t.put(p_class text, p_folder text, p_content text) returns text language sql as $$
  select t.try(format(
    'with i as (insert into public.question_folder_items (folder_id, question_id) values (%L, %L) on conflict do nothing returning 1) select count(*) from i',
    t.fid(p_class, p_folder), t.qid(p_content)));
$$;
create function t.take_out(p_class text, p_folder text, p_content text) returns text language sql as $$
  select t.try(format(
    'with d as (delete from public.question_folder_items where folder_id = %L and question_id = %L returning 1) select count(*) from d',
    t.fid(p_class, p_folder), t.qid(p_content)));
$$;
-- 실제 값 (권한과 무관)
create function t.folder_items(p_class text, p_folder text) returns text language sql security definer as $$
  select coalesce(string_agg(q.content, ', ' order by q.content), '')
  from public.question_folder_items i join public.questions q on q.id = i.question_id
  where i.folder_id = t.fid(p_class, p_folder);
$$;
create function t.count_all(p_table text) returns text language plpgsql security definer as $$
declare r text;
begin
  execute format('select count(*)::text from public.%I', p_table) into r;
  return r;
end $$;
-- 현재 사용자(RLS)에게 보이는 행 수
create function t.visible(p_table text) returns text language sql as $$
  select t.try(format('select count(*)::text from public.%I', p_table));
$$;
grant execute on all functions in schema t to authenticated, anon;

\set teacher  '''00000000-0000-0000-0000-0000000000a1'''
\set teacher2 '''00000000-0000-0000-0000-0000000000a2'''
\set stu_a    '''00000000-0000-0000-0000-0000000000b1'''
\set stu_c    '''00000000-0000-0000-0000-0000000000c1'''

-- ---------------------------------------------------------------------
-- 준비: 교사1 학급 '3-2' (학생 A, 질문 Q1~Q3), 교사2 학급 '4-1' (학생 C, 질문 C1)
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values (:teacher, 't1@test.kr'), (:teacher2, 't2@test.kr');
insert into auth.users (id, is_anonymous) values (:stu_a, true), (:stu_c, true);

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
select t.login(:stu_c, true) \g /dev/null
select (public.join_class(:'code2', 1, '다') is not null) \g /dev/null
reset role;
insert into public.questions (class_id, student_id, content)
select s.class_id, s.id, 'Q' || g from public.students s, generate_series(1, 3) g where s.class_id = t.cid('3-2');
insert into public.questions (class_id, student_id, content)
select s.class_id, s.id, 'C1' from public.students s where s.class_id = t.cid('4-1');
update public.classes set voting_status = 'open', allow_self_vote = true;

-- ---------------------------------------------------------------------
-- 폴더 만들기
-- ---------------------------------------------------------------------
set role authenticated;
select t.login(:teacher, false) \g /dev/null
select t.check('F01 담당 교사는 폴더 만들기 가능', t.new_folder('3-2', '역사 질문'), '1');
select t.check('F02 두 번째 폴더', t.new_folder('3-2', '좋은 질문'), '1');
select t.check('F03 같은 학급에 같은 이름 폴더는 불가', left(t.new_folder('3-2', '역사 질문'), 13), 'ERR duplicate');
select t.check('F04 빈 이름 불가', (t.new_folder('3-2', '') like '%violates check constraint%')::text, 'true');
select t.check('F05 31자 이름 불가', (t.new_folder('3-2', repeat('가', 31)) like '%violates check constraint%')::text, 'true');
select t.check('F05b 앞뒤 공백 이름은 그대로 저장 불가 (앱에서 다듬어 보냄)', (t.new_folder('3-2', ' 과학 ') like '%violates check constraint%')::text, 'true');
select t.check('F06 다른 교사 학급에 폴더 만들기 불가 (RLS)', left(t.new_folder('4-1', '몰래'), 27), 'ERR new row violates row-le');

select t.login(:teacher2, false) \g /dev/null
select t.check('F07 다른 학급이면 같은 이름 폴더 가능', t.new_folder('4-1', '역사 질문'), '1');

select t.login(:stu_a, true) \g /dev/null
select t.check('F08 학생은 폴더 만들기 불가', left(t.new_folder('3-2', '학생 폴더'), 27), 'ERR new row violates row-le');
select t.check('F09 학생에게 폴더가 보이지 않음', t.visible('question_folders'), '0');
reset role;
set role anon;
select t.check('F10 anon 은 폴더 테이블 접근 불가', left(t.visible('question_folders'), 27), 'ERR permission denied for t');
reset role;

-- ---------------------------------------------------------------------
-- 질문 넣기 / 빼기
-- ---------------------------------------------------------------------
set role authenticated;
select t.login(:teacher, false) \g /dev/null
select t.check('I01 질문 2개를 폴더에 넣기', t.put('3-2', '역사 질문', 'Q1') || t.put('3-2', '역사 질문', 'Q2'), '11');
select t.check('I02 한 질문을 여러 폴더에 넣기', t.put('3-2', '좋은 질문', 'Q1'), '1');
select t.check('I03 이미 넣은 질문은 다시 넣어도 중복 없음', t.put('3-2', '역사 질문', 'Q1') || '/' || t.folder_items('3-2', '역사 질문'), '0/Q1, Q2');
select t.check('I04 다른 학급 질문은 넣기 불가', t.put('3-2', '역사 질문', 'C1'), 'ERR INVALID_QUESTION');
select t.check('I05 교사 화면(RLS)에서 폴더 2개, 연결 3개', t.visible('question_folders') || '/' || t.visible('question_folder_items'), '2/3');

select t.login(:teacher2, false) \g /dev/null
select t.check('I06 다른 교사에게는 교사1 폴더·연결이 보이지 않음', t.visible('question_folders') || '/' || t.visible('question_folder_items'), '1/0');
select t.check('I07 다른 교사는 교사1 폴더에 넣기 불가', left(t.put('3-2', '좋은 질문', 'Q3'), 27), 'ERR new row violates row-le');
select t.check('I08 다른 교사는 교사1 폴더에서 빼기 불가 (0행)', t.take_out('3-2', '역사 질문', 'Q1'), '0');
select t.check('I09 다른 교사는 교사1 폴더 이름 변경 불가 (0행)',
  t.try(format($$with u as (update public.question_folders set name = '바꿈' where id = %L returning 1) select count(*) from u$$, t.fid('3-2', '좋은 질문'))), '0');
select t.check('I10 다른 교사는 교사1 폴더 삭제 불가 (0행)',
  t.try(format($$with d as (delete from public.question_folders where id = %L returning 1) select count(*) from d$$, t.fid('3-2', '좋은 질문'))), '0');

select t.login(:stu_a, true) \g /dev/null
select t.check('I11 학생은 폴더에 넣기 불가', left(t.put('3-2', '좋은 질문', 'Q3'), 27), 'ERR new row violates row-le');
select t.check('I12 학생은 폴더에서 빼기 불가 (0행)', t.take_out('3-2', '역사 질문', 'Q1'), '0');
select t.check('I13 학생에게 연결이 보이지 않음', t.visible('question_folder_items'), '0');
select t.check('I14 학생 질문 목록(list_class_questions)은 그대로', (select count(*)::text from public.list_class_questions()), '3');

select t.login(:teacher, false) \g /dev/null
select t.check('I15 폴더에서 빼기: 연결만 지워지고 질문은 남음',
  t.take_out('3-2', '역사 질문', 'Q2') || '/' || t.folder_items('3-2', '역사 질문') || '/' || t.count_all('questions'), '1/Q1/4');
select t.check('I16 폴더 이름 변경',
  t.try(format($$with u as (update public.question_folders set name = '다음 시간에 탐구할 질문' where id = %L returning 1) select count(*) from u$$, t.fid('3-2', '좋은 질문'))), '1');
select t.check('I17 폴더의 학급은 바꿀 수 없음 (권한 없음)',
  left(t.try(format($$update public.question_folders set class_id = %L where id = %L$$, t.cid('4-1'), t.fid('3-2', '역사 질문'))), 27), 'ERR permission denied for t');
select t.check('I18 연결 행은 수정할 수 없음 (권한 없음)',
  left(t.try(format($$update public.question_folder_items set question_id = %L$$, t.qid('Q3'))), 27), 'ERR permission denied for t');

-- ---------------------------------------------------------------------
-- 삭제 연쇄 (cascade)
-- ---------------------------------------------------------------------
select t.put('3-2', '역사 질문', 'Q3') \g /dev/null
select t.check('C01 준비: 역사 질문 = Q1, Q3 / 다음 시간 = Q1',
  t.folder_items('3-2', '역사 질문') || ' / ' || t.folder_items('3-2', '다음 시간에 탐구할 질문'), 'Q1, Q3 / Q1');
select t.check('C02 질문 삭제 → 그 질문의 폴더 연결만 사라짐',
  t.try($$with d as (delete from public.questions where content = 'Q1' returning 1) select count(*) from d$$)
  || '/' || t.folder_items('3-2', '역사 질문') || '/' || t.folder_items('3-2', '다음 시간에 탐구할 질문') || '/' || t.count_all('question_folders'),
  '1/Q3//3');
select t.check('C03 폴더 삭제 → 질문은 그대로, 연결만 사라짐',
  t.try(format($$with d as (delete from public.question_folders where id = %L returning 1) select count(*) from d$$, t.fid('3-2', '역사 질문')))
  || '/' || t.count_all('questions') || '/' || t.count_all('question_folder_items'),
  '1/3/0');
select t.put('3-2', '다음 시간에 탐구할 질문', 'Q2') \g /dev/null
select t.login(:stu_a, true) \g /dev/null
select t.check('C04 폴더에 든 질문도 학생 투표는 그대로 동작',
  t.try(format('select public.toggle_vote(%L)', t.qid('Q2'))), 'true');
reset role;
delete from public.classes where name = '3-2';
select t.check('C05 학급 삭제 → 그 학급 폴더·연결 모두 사라짐, 다른 학급 폴더는 그대로',
  t.count_all('question_folders') || '/' || t.count_all('question_folder_items')
  || '/' || (select name from public.question_folders), '1/0/역사 질문');

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
