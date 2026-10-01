-- =====================================================================
-- 우리반 질문 상자 : 초기 스키마
--  - 교사: Supabase Auth (이메일/비밀번호)
--  - 학생: Supabase Auth 익명 로그인(Anonymous Sign-in) + 클래스 코드/번호/이름
--  - 모든 데이터는 Row Level Security 로 보호합니다.
--  - 학생은 테이블에 직접 접근하지 않고, 아래 RPC 함수만 사용합니다.
--    (작성자 익명성, 투표 수 비공개 설정을 서버에서 보장하기 위해)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 질문 분류 체계 (조회 테이블)
--  학생은 질문을 쓸 때 유형을 고르지 않습니다. 분류는 교사가 만드는 별도의
--  "질문 분류 활동"에서 학생들이 드래그앤드롭으로 합니다. (아래 9번 참고)
--  분류 체계/범주는 행을 추가하거나 is_active 를 꺼서 바꿀 수 있습니다.
--  이미 응답에 쓰인 범주는 지우지 말고 is_active = false 로 숨기세요.
-- ---------------------------------------------------------------------
create table public.classification_frameworks (
  code         text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  label        text not null,
  description  text,
  sort_order   int  not null default 0,
  is_active    boolean not null default true
);

create table public.classification_categories (
  id              uuid primary key default gen_random_uuid(),
  framework_code  text not null references public.classification_frameworks (code)
                    on update cascade on delete restrict,
  code            text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  label           text not null,
  sort_order      int  not null default 0,
  is_active       boolean not null default true,
  unique (framework_code, code)
);

insert into public.classification_frameworks (code, label, sort_order) values
  ('open_closed', '열린 질문 / 닫힌 질문',                        1),
  ('role',        '확인 / 명료화 / 심화 질문',                    2),
  ('inquiry',     '사실적 / 개념적 / 논쟁적 / 호기심 촉발 질문', 3);

insert into public.classification_categories (framework_code, code, label, sort_order) values
  ('open_closed', 'open',        '열린 질문',      1),
  ('open_closed', 'closed',      '닫힌 질문',      2),
  ('role',        'confirm',     '확인 질문',      1),
  ('role',        'clarify',     '명료화 질문',    2),
  ('role',        'deepen',      '심화 질문',      3),
  ('inquiry',     'factual',     '사실적 질문',    1),
  ('inquiry',     'conceptual',  '개념적 질문',    2),
  ('inquiry',     'debatable',   '논쟁적 질문',    3),
  ('inquiry',     'provocative', '호기심 촉발 질문', 4);

-- ---------------------------------------------------------------------
-- 2. 테이블
-- ---------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text,
  display_name  text check (display_name is null or char_length(display_name) <= 40),
  created_at    timestamptz not null default now()
);

create table public.classes (
  id                 uuid primary key default gen_random_uuid(),
  teacher_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name               text not null check (char_length(btrim(name)) between 1 and 40),
  grade              smallint check (grade is null or grade between 1 and 6),
  class_code         text not null unique check (class_code ~ '^[A-Z0-9]{6}$'),
  show_vote_results  boolean not null default false,
  created_at         timestamptz not null default now()
);
create index classes_teacher_id_idx on public.classes (teacher_id);

create table public.students (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid not null references public.classes (id) on delete cascade,
  student_number  int  not null check (student_number between 1 and 99),
  name            text not null check (char_length(btrim(name)) between 1 and 20),
  created_at      timestamptz not null default now(),
  -- 한 학급 안에서 번호는 한 명. 다른 학급의 같은 번호/이름은 다른 학생입니다.
  unique (class_id, student_number)
);
create index students_class_id_idx on public.students (class_id);

-- 익명 로그인 사용자(기기) ↔ 학생 연결. 한 학생이 여러 기기에서 입장할 수 있습니다.
create table public.student_sessions (
  auth_user_id  uuid primary key references auth.users (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  created_at    timestamptz not null default now()
);
create index student_sessions_student_id_idx on public.student_sessions (student_id);

create table public.questions (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid not null references public.classes (id) on delete cascade,
  student_id      uuid not null references public.students (id) on delete cascade,
  content         text not null check (char_length(btrim(content)) between 1 and 300),
  is_hidden       boolean not null default false,
  created_at      timestamptz not null default now()
);
create index questions_class_id_created_at_idx on public.questions (class_id, created_at desc);
create index questions_student_id_idx on public.questions (student_id);

create table public.votes (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.questions (id) on delete cascade,
  student_id   uuid not null references public.students (id) on delete cascade,
  created_at   timestamptz not null default now(),
  -- 한 학생은 한 질문에 한 번만 투표
  constraint votes_question_student_unique unique (question_id, student_id)
);
create index votes_student_id_idx on public.votes (student_id);

-- ---------------------------------------------------------------------
-- 3. 보조 함수
-- ---------------------------------------------------------------------

-- 교사 = 로그인했고 익명 사용자가 아닌 사용자
create or replace function public.is_teacher()
returns boolean
language sql stable
set search_path = ''
as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

-- 현재 사용자가 이 학급의 담당 교사인가?
create or replace function public.owns_class(p_class_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class_id and c.teacher_id = auth.uid()
  ) and public.is_teacher();
$$;

-- 현재 익명 사용자에 연결된 학생 id
create or replace function public.current_student_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select ss.student_id from public.student_sessions ss
  where ss.auth_user_id = auth.uid();
$$;

-- 헷갈리는 글자(0, O, 1, I)를 뺀 6자리 클래스 코드 생성
create or replace function public.generate_class_code()
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.classes where class_code = code);
  end loop;
  return code;
end;
$$;

-- 학급 생성 시 클래스 코드 자동 생성
create or replace function public.classes_before_insert()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.class_code := public.generate_class_code();
  new.name := btrim(new.name);
  return new;
end;
$$;

create trigger classes_before_insert
  before insert on public.classes
  for each row execute function public.classes_before_insert();

-- 교사 회원가입 시 profiles 자동 생성 (익명 학생은 제외)
-- classes.teacher_id 가 profiles 를 참조하므로, 이 행이 없으면 학급을 만들 수 없습니다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if coalesce(new.is_anonymous, false) = false then
    insert into public.profiles (id, email, display_name)
    values (
      new.id,
      new.email,
      -- display_name 길이 제한(40자) 때문에 회원가입 자체가 실패하지 않도록 자릅니다.
      left(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''), 40)
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이미 가입되어 있던 교사 계정의 profiles 보충
insert into public.profiles (id, email)
select u.id, u.email from auth.users u
where coalesce(u.is_anonymous, false) = false
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------
alter table public.classification_frameworks  enable row level security;
alter table public.classification_categories  enable row level security;
alter table public.profiles         enable row level security;
alter table public.classes          enable row level security;
alter table public.students         enable row level security;
alter table public.student_sessions enable row level security;
alter table public.questions        enable row level security;
alter table public.votes            enable row level security;

-- 분류 체계/범주: 로그인한 누구나 읽기
create policy "classification_frameworks: read" on public.classification_frameworks
  for select to authenticated using (true);
create policy "classification_categories: read" on public.classification_categories
  for select to authenticated using (true);

-- profiles: 본인 것만
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- classes: 교사는 자기 학급만
create policy "classes: teacher read" on public.classes
  for select to authenticated using (teacher_id = auth.uid() and public.is_teacher());
create policy "classes: teacher insert" on public.classes
  for insert to authenticated with check (teacher_id = auth.uid() and public.is_teacher());
create policy "classes: teacher update" on public.classes
  for update to authenticated
  using (teacher_id = auth.uid() and public.is_teacher())
  with check (teacher_id = auth.uid());
create policy "classes: teacher delete" on public.classes
  for delete to authenticated using (teacher_id = auth.uid() and public.is_teacher());

-- students: 담당 교사만 (학생 본인은 RPC 로 접근)
create policy "students: teacher read" on public.students
  for select to authenticated using (public.owns_class(class_id));
create policy "students: teacher insert" on public.students
  for insert to authenticated with check (public.owns_class(class_id));
create policy "students: teacher update" on public.students
  for update to authenticated using (public.owns_class(class_id)) with check (public.owns_class(class_id));
create policy "students: teacher delete" on public.students
  for delete to authenticated using (public.owns_class(class_id));

-- student_sessions: 정책 없음 (RPC 전용)

-- questions: 담당 교사만 직접 조회/수정 (학생은 RPC 사용)
create policy "questions: teacher read" on public.questions
  for select to authenticated using (public.owns_class(class_id));
create policy "questions: teacher update" on public.questions
  for update to authenticated using (public.owns_class(class_id)) with check (public.owns_class(class_id));
create policy "questions: teacher delete" on public.questions
  for delete to authenticated using (public.owns_class(class_id));

-- votes: 담당 교사만 조회 (학생은 RPC 사용)
create policy "votes: teacher read" on public.votes
  for select to authenticated using (
    exists (
      select 1 from public.questions q
      where q.id = votes.question_id and public.owns_class(q.class_id)
    )
  );

-- ---------------------------------------------------------------------
-- 5. 권한(GRANT) 최소화
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on public.student_sessions from authenticated;
revoke insert, update on public.classes from authenticated;
grant insert (name, grade, show_vote_results) on public.classes to authenticated;
grant update (name, grade, show_vote_results) on public.classes to authenticated;
revoke insert, update on public.questions from authenticated;
grant update (is_hidden) on public.questions to authenticated;
revoke insert, update, delete on public.votes from authenticated;
revoke insert, delete on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
revoke insert, update, delete on public.classification_frameworks, public.classification_categories from authenticated;

-- ---------------------------------------------------------------------
-- 6. 교사용 RPC
-- ---------------------------------------------------------------------

-- 대시보드 통계: 학급별 학생 수 / 질문 수 / 오늘 질문 수
create or replace function public.teacher_class_stats(p_today_start timestamptz)
returns table (
  class_id uuid,
  student_count int,
  question_count int,
  today_question_count int
)
language sql stable
set search_path = ''
as $$
  select
    c.id,
    (select count(*)::int from public.students s where s.class_id = c.id),
    (select count(*)::int from public.questions q where q.class_id = c.id),
    (select count(*)::int from public.questions q
       where q.class_id = c.id and q.created_at >= p_today_start)
  from public.classes c
  where c.teacher_id = auth.uid() and public.is_teacher();
$$;

-- 클래스 코드 다시 만들기
create or replace function public.regenerate_class_code(p_class_id uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  new_code text;
begin
  if not public.owns_class(p_class_id) then
    raise exception 'FORBIDDEN';
  end if;
  new_code := public.generate_class_code();
  update public.classes set class_code = new_code where id = p_class_id;
  return new_code;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. 학생용 RPC (익명 로그인 사용자만)
-- ---------------------------------------------------------------------

-- 내부: 현재 학생 정보 + 학급 정보 (json)
create or replace function public.student_context_json(p_student_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'student_id',        s.id,
    'student_number',    s.student_number,
    'student_name',      s.name,
    'class_id',          c.id,
    'class_name',        c.name,
    'grade',             c.grade,
    'show_vote_results', c.show_vote_results
  )
  from public.students s
  join public.classes c on c.id = s.class_id
  where s.id = p_student_id;
$$;

-- 클래스 코드 + 번호 + 이름으로 입장
create or replace function public.join_class(
  p_class_code text,
  p_student_number int,
  p_name text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_class_id   uuid;
  v_student    public.students%rowtype;
  v_name       text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_code       text := upper(regexp_replace(coalesce(p_class_code, ''), '\s', '', 'g'));
begin
  if auth.uid() is null or public.is_teacher() then
    raise exception 'STUDENT_ONLY';
  end if;
  if p_student_number is null or p_student_number < 1 or p_student_number > 99 then
    raise exception 'INVALID_NUMBER';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 20 then
    raise exception 'INVALID_NAME';
  end if;

  select id into v_class_id from public.classes where class_code = v_code;
  if v_class_id is null then
    raise exception 'CLASS_NOT_FOUND';
  end if;

  select * into v_student from public.students
  where class_id = v_class_id and student_number = p_student_number;

  if found then
    if v_student.name <> v_name then
      raise exception 'NAME_MISMATCH';
    end if;
  else
    insert into public.students (class_id, student_number, name)
    values (v_class_id, p_student_number, v_name)
    returning * into v_student;
  end if;

  insert into public.student_sessions (auth_user_id, student_id)
  values (auth.uid(), v_student.id)
  on conflict (auth_user_id) do update set student_id = excluded.student_id, created_at = now();

  return public.student_context_json(v_student.id);
end;
$$;

-- 현재 입장한 학생 정보 (없으면 null)
create or replace function public.get_my_student()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select public.student_context_json(public.current_student_id());
$$;

-- 나가기
create or replace function public.leave_class()
returns void
language sql security definer
set search_path = ''
as $$
  delete from public.student_sessions where auth_user_id = auth.uid();
$$;

-- 우리 반 질문 목록 (작성자 정보 없음, 투표 수는 공개 설정일 때만)
create or replace function public.list_class_questions()
returns table (
  id uuid,
  content text,
  created_at timestamptz,
  is_mine boolean,
  voted_by_me boolean,
  vote_count int
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_student_id uuid := public.current_student_id();
  v_class      public.classes%rowtype;
begin
  if v_student_id is null then
    raise exception 'NOT_JOINED';
  end if;

  select c.* into v_class
  from public.classes c join public.students s on s.class_id = c.id
  where s.id = v_student_id;

  return query
  select
    q.id,
    q.content,
    q.created_at,
    q.student_id = v_student_id,
    exists (select 1 from public.votes v where v.question_id = q.id and v.student_id = v_student_id),
    case when v_class.show_vote_results
      then (select count(*)::int from public.votes v where v.question_id = q.id)
      else null end
  from public.questions q
  where q.class_id = v_class.id and q.is_hidden = false
  order by q.created_at desc;
end;
$$;

-- 질문 작성
create or replace function public.create_question(p_content text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student public.students%rowtype;
  v_content text := btrim(coalesce(p_content, ''));
  v_id uuid;
begin
  select s.* into v_student from public.students s where s.id = public.current_student_id();
  if not found then
    raise exception 'NOT_JOINED';
  end if;
  if char_length(v_content) < 1 or char_length(v_content) > 300 then
    raise exception 'INVALID_CONTENT';
  end if;
  -- 너무 빠른 연속 작성 방지 (3초)
  if exists (
    select 1 from public.questions
    where student_id = v_student.id and created_at > now() - interval '3 seconds'
  ) then
    raise exception 'TOO_FAST';
  end if;

  insert into public.questions (class_id, student_id, content)
  values (v_student.class_id, v_student.id, v_content)
  returning id into v_id;
  return v_id;
end;
$$;

-- 투표 / 투표 취소 (토글). 반환값: 투표한 상태면 true
create or replace function public.toggle_vote(p_question_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student public.students%rowtype;
begin
  select s.* into v_student from public.students s where s.id = public.current_student_id();
  if not found then
    raise exception 'NOT_JOINED';
  end if;
  if not exists (
    select 1 from public.questions q
    where q.id = p_question_id and q.class_id = v_student.class_id and q.is_hidden = false
  ) then
    raise exception 'QUESTION_NOT_FOUND';
  end if;

  delete from public.votes where question_id = p_question_id and student_id = v_student.id;
  if found then
    return false;
  end if;

  insert into public.votes (question_id, student_id)
  values (p_question_id, v_student.id)
  on conflict (question_id, student_id) do nothing;
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. 함수 실행 권한: 로그인 사용자(교사/익명 학생)만
--  Supabase 는 기본으로 authenticated 에 모든 함수 실행 권한을 주므로 먼저 모두 회수합니다.
--  내부 함수(generate_class_code, student_context_json, 트리거 함수)는 RPC 로 직접 부를 수 없습니다.
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_teacher(),
  public.owns_class(uuid),
  public.current_student_id(),
  public.teacher_class_stats(timestamptz),
  public.regenerate_class_code(uuid),
  public.join_class(text, int, text),
  public.get_my_student(),
  public.leave_class(),
  public.list_class_questions(),
  public.create_question(text),
  public.toggle_vote(uuid)
to authenticated;

-- ---------------------------------------------------------------------
-- 9. (추후) 질문 분류 활동 — 설계 메모, 아직 만들지 않습니다.
--  교사가 활동을 만들고 분류 체계 하나와 분류할 질문을 고르면,
--  학생들이 질문 카드를 범주로 드래그앤드롭합니다. 학생마다 따로 응답합니다.
--
--  classification_activities
--    id              uuid pk
--    class_id        uuid → classes (on delete cascade)
--    framework_code  text → classification_frameworks (on update cascade)
--    title           text
--    status          text  'draft' | 'open' | 'closed'  (open 일 때만 학생 응답 가능)
--    created_at      timestamptz
--
--  classification_activity_questions      (활동에 포함할 질문)
--    activity_id     uuid → classification_activities (on delete cascade)
--    question_id     uuid → questions (on delete cascade)
--    sort_order      int
--    primary key (activity_id, question_id)
--    -- 질문의 class_id = 활동의 class_id 인지 트리거로 확인
--
--  classification_responses               (학생 한 명의 한 질문 분류 결과)
--    id              uuid pk
--    activity_id     uuid
--    question_id     uuid
--    student_id      uuid → students (on delete cascade)
--    category_id     uuid → classification_categories
--    updated_at      timestamptz
--    foreign key (activity_id, question_id) → classification_activity_questions
--    unique (activity_id, question_id, student_id)   -- 다시 끌어 놓으면 upsert
--    -- category 의 framework_code = 활동의 framework_code 인지 트리거로 확인
--
--  접근: 교사는 owns_class 로 RLS, 학생은 다른 기능처럼 security definer RPC 만 사용
--  (예: list_my_classification_activity, set_classification_response)
-- ---------------------------------------------------------------------
