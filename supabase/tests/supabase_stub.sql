-- 로컬 Postgres 에서 마이그레이션을 시험하기 위한 Supabase 흉내 (실제 Supabase 에는 실행하지 마세요)
-- auth 스키마, anon/authenticated 역할, Supabase 기본 권한을 최소한으로 재현합니다.
create role anon nologin;
create role authenticated nologin;

create schema auth;
create table auth.users (
  id                  uuid primary key,
  email               text,
  is_anonymous        boolean default false,
  raw_user_meta_data  jsonb default '{}'
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant usage on schema auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;

-- Supabase 는 public 스키마의 새 테이블/함수에 anon, authenticated 권한을 기본으로 줍니다.
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
