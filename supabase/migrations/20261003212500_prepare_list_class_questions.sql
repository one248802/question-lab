-- list_class_questions()는 반환 컬럼에 thought_count를 추가하므로
-- PostgreSQL의 CREATE OR REPLACE FUNCTION만으로는 반환형을 바꿀 수 없습니다.
-- 기존 함수를 먼저 삭제한 뒤 다음 migration에서 새 반환형으로 다시 만듭니다.
drop function if exists public.list_class_questions();
