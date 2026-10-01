# 우리반 질문 상자

초등학교 수업에서 학생들이 질문을 만들고, 서로의 질문을 보고, 투표하는 웹앱입니다.

- React + TypeScript + Vite + Tailwind CSS v4
- Supabase (Postgres + Auth + Row Level Security)

## 실행

```bash
npm install
cp .env.example .env   # Supabase URL / anon key 입력
npm run dev
npm run build
```

## Supabase 설정

1. Supabase 프로젝트 생성
2. **SQL Editor**에서 `supabase/migrations/20261001000000_init.sql` 전체 실행
   (또는 Supabase CLI: `supabase link` 후 `supabase db push`)
3. **Authentication → Sign In / Providers**
   - Email: 사용 (교사 로그인)
   - **Allow anonymous sign-ins: 켜기** (학생 입장에 필요)
4. **Authentication → URL Configuration**: Site URL을 배포 주소로 설정
5. `.env`에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`(또는 `VITE_SUPABASE_ANON_KEY`) 입력
   (service_role key는 절대 프론트엔드에 넣지 마세요)

## 구조

| 경로 | 화면 |
| --- | --- |
| `/` | 시작 화면 |
| `/student` | 학생 입장 (클래스 코드 · 번호 · 이름) |
| `/student/board` | 질문 쓰기 + 우리 반 질문 게시판 + 투표 |
| `/teacher/login` | 교사 로그인 / 가입 |
| `/teacher` | 대시보드 |
| `/teacher/classes` | 학급 관리 (생성, 코드 재발급, 삭제) |
| `/teacher/questions` | 우리반 질문 상자 (유형별 보기, 작성자, 투표 수, 숨기기) |
| `/teacher/students` | 학생 관리 |
| `/teacher/settings` | 설정 (학급별 투표 결과 공개) |

### 보안 설계

- **교사**: 이메일/비밀번호 로그인. RLS로 `classes.teacher_id = auth.uid()`인 학급과 그 학급의 학생·질문·투표만 접근.
- **학생**: Supabase 익명 로그인 후 `join_class` RPC로 입장. 익명 사용자 ↔ 학생 연결은 `student_sessions` 테이블에 저장.
- 학생은 테이블에 직접 접근할 수 없고 `security definer` RPC만 사용합니다.
  - `list_class_questions`: 작성자 정보 없이 반환, 투표 수는 `show_vote_results`가 ON일 때만 반환
  - `create_question`, `toggle_vote`: 학생 본인의 `class_id`에서만 동작
- `votes (question_id, student_id)` unique 제약으로 중복 투표 방지.
- 질문 유형은 `question_scopes`, `question_types` 조회 테이블에서 관리하므로 행을 추가/수정해 유형을 바꿀 수 있습니다.
