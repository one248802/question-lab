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
| `/teacher/questions` | 우리반 질문 상자 (작성자, 투표 수, 숨기기) |
| `/teacher/students` | 학생 관리 |
| `/teacher/settings` | 설정 (학급별 투표 시작/종료, 1인당 투표 개수, 자기 질문 투표, 투표 바꾸기, 결과 공개) |

### 보안 설계

- **교사**: 이메일/비밀번호 로그인. RLS로 `classes.teacher_id = auth.uid()`인 학급과 그 학급의 학생·질문·투표만 접근.
- **학생**: Supabase 익명 로그인 후 `join_class` RPC로 입장. 익명 사용자 ↔ 학생 연결은 `student_sessions` 테이블에 저장.
- 학생은 테이블에 직접 접근할 수 없고 `security definer` RPC만 사용합니다.
  - `list_class_questions`: 작성자 정보 없이 반환. 투표 수는 투표 중이면 `show_results_during_voting`, 종료 후면 `show_results_after_voting`이 ON일 때만 반환
  - `create_question`, `toggle_vote`: 학생 본인의 `class_id`에서만 동작
- 투표 규칙 (`toggle_vote`가 서버에서 검사, 학급별 설정)
  - `voting_open = false`(기본값)이면 새 투표와 취소 모두 불가
  - 1인당 `max_votes`개(기본 3, 1~20). 교사가 개수를 줄여도 기존 표는 지우지 않고, 새 투표만 막습니다
  - `allow_self_vote = false`(기본값)이면 자기 질문에 투표 불가
  - `allow_vote_change = false`이면 취소 불가. 단, 개수가 줄어 초과 상태인 학생은 `max_votes`까지 줄이는 취소는 가능
  - 숨겨진 질문에 한 표는 개수에서 제외
- `votes (question_id, student_id)` unique 제약으로 중복 투표 방지.
- 학생은 질문 내용만 등록합니다. 질문 분류(열린/닫힌, 확인/명료화/심화, 사실적/개념적/논쟁적/호기심 촉발)는 추후 교사가 만드는 "질문 분류 활동"에서 드래그앤드롭으로 합니다.
  분류 체계와 범주는 `classification_frameworks`, `classification_categories` 조회 테이블에 있고, 활동 테이블 설계는 마이그레이션 9번 주석에 있습니다.
- 교사 회원가입 시 `on_auth_user_created` 트리거가 `profiles` 행을 자동으로 만듭니다 (익명 학생 제외).
