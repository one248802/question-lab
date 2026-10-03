-- =====================================================================
-- 교사 질문 폴더
--  교사가 학급마다 폴더(예: 역사 질문, 좋은 질문)를 만들고 질문을 넣습니다.
--  - 질문을 옮기지 않고 「질문 ↔ 폴더」 연결만 저장합니다. 한 질문을 여러 폴더에 넣을 수 있습니다.
--  - 폴더를 지워도 질문은 그대로입니다. 질문·학급을 지우면 연결은 함께 지워집니다(cascade).
--  - 교사만 자기 학급 폴더를 다룹니다. 학생(익명 사용자)과 anon 은 접근할 수 없습니다.
--  - questions / votes / classes 와 기존 RPC 는 바꾸지 않습니다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 테이블
-- ---------------------------------------------------------------------
create table public.question_folders (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes (id) on delete cascade,
  -- 앞뒤 공백 없이 1~30자
  name        text not null check (name = btrim(name) and char_length(name) between 1 and 30),
  created_at  timestamptz not null default now(),
  -- 같은 학급에 같은 이름의 폴더는 하나만
  constraint question_folders_class_name_unique unique (class_id, name)
);

create table public.question_folder_items (
  folder_id    uuid not null references public.question_folders (id) on delete cascade,
  question_id  uuid not null references public.questions (id) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (folder_id, question_id)
);
create index question_folder_items_question_id_idx on public.question_folder_items (question_id);

-- 폴더와 질문은 같은 학급이어야 함 (다른 학급 질문을 넣지 못하게)
create or replace function public.question_folder_items_same_class()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.question_folders f
    join public.questions q on q.class_id = f.class_id
    where f.id = new.folder_id and q.id = new.question_id
  ) then
    raise exception 'INVALID_QUESTION';
  end if;
  return new;
end;
$$;
revoke execute on function public.question_folder_items_same_class() from public, anon, authenticated;

create trigger question_folder_items_same_class
  before insert or update on public.question_folder_items
  for each row execute function public.question_folder_items_same_class();

-- 폴더의 학급을 다른 학급으로 바꾸지 못하게 (이미 들어 있는 질문과 학급이 어긋나므로)
create or replace function public.question_folders_keep_class()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.class_id is distinct from old.class_id then
    raise exception 'FORBIDDEN';
  end if;
  return new;
end;
$$;
revoke execute on function public.question_folders_keep_class() from public, anon, authenticated;

create trigger question_folders_keep_class
  before update on public.question_folders
  for each row execute function public.question_folders_keep_class();

-- ---------------------------------------------------------------------
-- RLS: 담당 교사만 자기 학급 폴더와 연결을 조회/추가/삭제, 폴더 이름 변경
--      (owns_class 는 익명 사용자에게 항상 false)
-- ---------------------------------------------------------------------
alter table public.question_folders       enable row level security;
alter table public.question_folder_items  enable row level security;

create policy "question_folders: teacher read" on public.question_folders
  for select to authenticated using (public.owns_class(class_id));
create policy "question_folders: teacher insert" on public.question_folders
  for insert to authenticated with check (public.owns_class(class_id));
create policy "question_folders: teacher update" on public.question_folders
  for update to authenticated using (public.owns_class(class_id)) with check (public.owns_class(class_id));
create policy "question_folders: teacher delete" on public.question_folders
  for delete to authenticated using (public.owns_class(class_id));

create policy "question_folder_items: teacher read" on public.question_folder_items
  for select to authenticated using (
    exists (select 1 from public.question_folders f where f.id = question_folder_items.folder_id and public.owns_class(f.class_id))
  );
create policy "question_folder_items: teacher insert" on public.question_folder_items
  for insert to authenticated with check (
    exists (select 1 from public.question_folders f where f.id = question_folder_items.folder_id and public.owns_class(f.class_id))
  );
create policy "question_folder_items: teacher delete" on public.question_folder_items
  for delete to authenticated using (
    exists (select 1 from public.question_folders f where f.id = question_folder_items.folder_id and public.owns_class(f.class_id))
  );

-- Supabase 는 새 테이블에 anon/authenticated 의 모든 권한을 기본으로 주므로 필요한 것만 남깁니다.
revoke all on public.question_folders, public.question_folder_items from anon;
revoke update, truncate, references, trigger on public.question_folders from authenticated;
grant update (name) on public.question_folders to authenticated;
revoke update, truncate, references, trigger on public.question_folder_items from authenticated;
