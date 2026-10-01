# PROJECT_STATUS — 우리반 질문 상자

> 마지막 정리: 2026-10-01 (1일차 작업 종료 시점)
> 다음 세션은 이 문서만 읽고 이어서 작업할 수 있도록 작성했습니다. 맨 아래 **작업 재개 프롬프트**를 그대로 붙여 넣으세요.

---

## 1. 프로젝트

- **이름**: 우리반 질문 상자
- **목적**: 초등학교 수업에서 학생들이 질문을 만들고, 서로의 질문을 보고, 투표하는 웹앱
- **저장소**: `one248802/question-lab`

## 2. 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| 프론트엔드 | React 19, TypeScript, Vite 8, Tailwind CSS v4, react-router-dom 7, lucide-react |
| 백엔드 | Supabase (Postgres + Auth + Row Level Security + RPC) |
| 코드 관리 | GitHub |
| 배포 설정 | `vercel.json` (SPA rewrite)만 있음. 실제 배포 여부는 확인하지 않음 |
| 품질 도구 | `npm run build` (tsc + vite), `npm run lint` (oxlint), `./scripts/test-db.sh` (DB 테스트) |

## 3. 브랜치 / 커밋 / PR

- **작업 브랜치**: `claude/admiring-edison-vllnk4`
- **최근 커밋**: 이 문서를 추가한 커밋이 브랜치의 최신 커밋입니다. 그 직전 기능 커밋은 아래와 같습니다.

  | SHA | 내용 |
  | --- | --- |
  | `e4c9cae` | voting_open → voting_status(before/open/closed), 상태 전환 트리거, DB 테스트 스크립트 |
  | `862a062` | 학급별 투표 설정 + toggle_vote 규칙 |
  | `a4831f8` | 질문은 content만, 분류 체계 조회 테이블, 함수 권한 보안 수정 |
  | `f90dbc4` | `VITE_SUPABASE_PUBLISHABLE_KEY` 환경 변수 이름 지원 |

- **main과의 관계**: main(`08a28ca`, PR #1 병합 커밋)에서 갈라졌고, main보다 **커밋 5개 앞서 있으며 뒤처진 커밋은 없습니다**. 충돌 없이 fast-forward 가능한 상태입니다.
- **PR 상태**: 이 브랜치로는 **아직 PR을 만들지 않았습니다**. 초기 구현 PR([one248802/question-lab#1](https://github.com/one248802/question-lab/pull/1))은 GitHub에서 closed 상태이고, main에는 그 병합 커밋 `08a28ca`가 들어가 있습니다.

## 4. 구현 완료된 기능

### 인증 / 계정
- **교사 Auth**: Supabase 이메일/비밀번호 회원가입·로그인 (`/teacher/login`)
- **profiles 자동 생성**: `auth.users` insert 트리거 `on_auth_user_created` → `handle_new_user()`. 익명 사용자는 제외하고, display_name은 40자로 자릅니다. 이미 가입된 교사 계정은 migration에서 보충합니다.
- **학생 anonymous sign-in 구조**: 학생은 Supabase 익명 로그인 후 `join_class` RPC로 입장합니다. 익명 사용자와 학생의 연결은 `student_sessions`에 저장하며, 한 학생이 여러 기기로 입장할 수 있습니다.

### 학급 / 학생
- **학급 생성/수정/삭제** (`/teacher/classes`)
- **클래스 코드**: 6자리이고 헷갈리는 글자(0, O, 1, I)는 빼고 만듭니다. 학급을 만들 때 트리거가 자동으로 생성하고, `regenerate_class_code` RPC로 다시 만들 수 있습니다.
- **학생 입장**: 클래스 코드 + 번호(1~99) + 이름. 같은 번호가 다른 이름으로 이미 들어와 있으면 `NAME_MISMATCH`로 거부합니다.
- **학생 관리** (`/teacher/students`): 목록, 수정, 삭제

### 질문
- **익명 질문 등록**: `create_question(p_content text)`. 내용만 입력하고 유형은 고르지 않습니다. 1~300자이고, 3초 안에 다시 올리는 것은 막습니다.
- **학생에게 작성자 비공개**: 학생은 테이블에 직접 접근할 수 없고 `list_class_questions` RPC만 씁니다. 이 RPC는 작성자 정보 없이 `is_mine`만 돌려줍니다.
- **교사만 작성자 확인**: 교사 화면(`/teacher/questions`)에서 번호와 이름을 표시합니다. RLS로 자기 학급 질문만 볼 수 있습니다.
- **질문 숨김/삭제**: 숨김은 교사 UI에 있습니다(숨기기/다시 공개). 숨긴 질문은 학생 목록과 투표 대상에서 빠집니다. **삭제는 DB(RLS 정책 `questions: teacher delete`)에서만 허용되고, 교사 화면에 삭제 버튼은 아직 없습니다.** (9번 참고)

### 투표 (학급별 설정, 모두 서버 `toggle_vote`에서 검사)
| 설정 | 기본값 | 내용 |
| --- | --- | --- |
| `voting_status` | `before` | `before`(시작 전) → `open`(투표 중) → `closed`(종료). `closed → open` 다시 열기 가능 |
| `max_votes` | 3 | 1인당 투표 개수. 1~20, UI에서 1·2·3·5 또는 직접 입력 |
| `allow_self_vote` | false | 자기 질문 투표 허용 여부 |
| `allow_vote_change` | true | 투표 중 취소(바꾸기) 허용 여부 |
| `show_results_during_voting` | false | `open`일 때 학생 화면에 투표 수 공개 |
| `show_results_after_voting` | true | `closed`일 때 학생 화면에 투표 수 공개 |

- **상태별 규칙**
  - `before`: 투표·취소 불가(`VOTING_NOT_STARTED`). 공개 설정과 상관없이 결과 비공개
  - `open`: 투표 가능, `allow_vote_change` 적용, `show_results_during_voting` 적용
  - `closed`: 투표·취소 불가(`VOTING_CLOSED`), `show_results_after_voting` 적용
- **상태 전환 DB 트리거**: `classes_check_voting_status`는 위 세 가지 전환만 허용하고, 나머지는 `INVALID_VOTING_TRANSITION`으로 거부합니다. 학급을 만들 때는 `voting_status`를 지정할 수 없어서(insert 권한 없음) 항상 `before`로 시작합니다.
- **max_votes를 줄인 경우**: 기존 표는 지우지 않습니다. 초과한 학생은 새 투표를 할 수 없고, 한도까지 줄이는 취소는 `allow_vote_change=false`여도 허용합니다.
- **숨겨진 질문에 한 표**는 학생의 투표 개수에서 뺍니다(취소할 방법이 없기 때문).
- **동시성**: 투표할 때 학생 행을 `for update`로 잠가서, 여러 기기에서 동시에 눌러도 한도를 넘지 않습니다.
- **중복 투표 방지**: `votes (question_id, student_id)` unique 제약

### 투표 UI
- **교사** (`/teacher/settings`): 학급마다 상태 설명과 [투표 시작 / 투표 종료 / 투표 다시 열기] 버튼, 투표 개수 선택, 스위치 4개
- **학생** (`/student/board`): "투표가 아직 시작되지 않았어요", "투표 중 · 남은 표 n/N", "투표가 종료되었습니다" 상태 표시. 초과 시 취소 안내. 서버가 거절할 버튼은 미리 비활성화하고 이유를 보여 줌

### 질문 분류 체계 (설계 + 조회 테이블만 있음)
- 학생은 질문을 등록할 때 유형을 고르지 않습니다. 분류는 나중에 교사가 만드는 "질문 분류 활동"에서 학생이 드래그앤드롭으로 합니다.
- 조회 테이블: `classification_frameworks`, `classification_categories` (seed 포함, 로그인 사용자 읽기 전용)

  | framework_code | 범주 |
  | --- | --- |
  | `inquiry` (A) | factual 사실적 / conceptual 개념적 / debatable 논쟁적 / provocative 호기심 촉발 |
  | `open_closed` (B) | open 열린 / closed 닫힌 |
  | `role` (C) | confirm 확인 / clarify 명료화 / deepen 심화 |

- 활동 테이블(`classification_activities`, `classification_activity_questions`, `classification_responses`)은 **migration 9번 섹션에 주석으로 설계만** 있고, 아직 만들지 않았습니다.

### 보안 설계 요약
- 교사: RLS로 `classes.teacher_id = auth.uid()`인 학급과 그 학급의 학생·질문·투표만 접근합니다.
- 학생: 테이블에 직접 접근할 수 없고 `security definer` RPC만 씁니다.
- 함수 실행 권한: Supabase 기본 권한을 모두 회수한 뒤 필요한 RPC만 `authenticated`에 허용합니다. 내부 함수(`generate_class_code`, `student_context_json`, `student_vote_count`, `vote_results_visible`, 트리거 함수)는 직접 호출할 수 없습니다.
- 브라우저에는 publishable(anon) key만 씁니다. service_role key는 쓰지 않습니다.

## 5. 테스트 결과

| 항목 | 결과 |
| --- | --- |
| `./scripts/test-db.sh` | ✅ migration 전체를 단일 트랜잭션으로 실행 성공, **DB 테스트 50/50 통과** |
| `supabase/tests/voting_test.sql` | 테스트 50개: profiles 트리거, 기본값, before/open/closed 규칙, 상태 전환, max_votes 감소, 자기 투표, 결과 공개 조합, 숨김, 권한 |
| `npm run build` | ✅ 통과. 번들 500kB 초과 경고만 있음 |
| `npm run lint` | 에러 0. **경고 10개는 이번 작업 전부터 있던 것** (`set-state-in-effect`, `only-export-components`) |

- `test-db.sh`는 임시 로컬 Postgres를 띄우고 `supabase/tests/supabase_stub.sql`로 Supabase 환경(auth 스키마, anon/authenticated 역할, 기본 권한)을 흉내 냅니다. 실제 Supabase에는 접속하지 않습니다. 필요한 도구는 `initdb`, `pg_ctl`, `psql`입니다(이 클라우드 환경에는 Postgres 16이 설치되어 있음).
- 기대값을 일부러 틀리게 바꾸면 FAIL이 출력되고 스크립트가 0이 아닌 코드로 끝나는 것도 확인했습니다.
- **브라우저 E2E 테스트는 하지 않았습니다.** 실제 DB가 없어서 화면 동작은 빌드와 타입 검사로만 확인했습니다.

## 6. 실제 Supabase 상태 (2026-10-01 마지막 확인)

| 항목 | 상태 |
| --- | --- |
| 프로젝트 | 생성 완료. URL `https://ogmsfyuhtrljcubuhclq.supabase.co` |
| Claude 환경 변수 | 설정 완료: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. 코드는 `VITE_SUPABASE_ANON_KEY`도 읽음 |
| 네트워크 | `*.supabase.co` 허용 완료. Auth API 200 응답 확인 |
| **migration** | ❌ **아직 실행하지 않음**. `classes` 등 모든 테이블과 RPC가 404 |
| Anonymous Sign-ins | 마지막 확인 때 Auth 설정 API가 `anonymous_users: true`를 반환. **켜져 있는 것으로 보이지만, 내일 대시보드에서 다시 확인 필요**. 학생 입장에 필수 |
| Confirm email | 마지막 확인 때 `mailer_autoconfirm: true`(이메일 인증 없이 바로 로그인). 테스트에는 편하지만 운영 전 결정 필요 |
| Site URL | 확인하지 않음. 배포 후 Authentication → URL Configuration에서 설정 |

- 세션 안에서는 Supabase DB 접속 정보(비밀번호/연결 문자열)가 없어서 migration을 직접 실행할 수 없습니다. SQL Editor에서 사람이 실행해야 합니다.

## 7. 내일 가장 먼저 할 작업 (순서대로)

1. Supabase **SQL Editor**에서 `supabase/migrations/20261001000000_init.sql` **전체**를 새 쿼리에 붙여 넣고 한 번에 실행 (DB가 비어 있으므로 처음부터 실행해도 안전)
   - 실행 후에도 REST가 404면 `notify pgrst, 'reload schema';` 실행
2. **Authentication → Sign In / Providers → Allow anonymous sign-ins**가 켜져 있는지 확인
3. 실제 DB 연결 확인: REST로 `classification_categories` 9행, `classes` 200 응답, RPC 존재 여부
4. 교사 회원가입/로그인 테스트 → `profiles` 행 자동 생성 확인
5. 학급 생성 테스트 → 6자리 클래스 코드 생성 확인
6. 학생 클래스 코드 입장 테스트 (번호 + 이름, 이름 불일치 거부)
7. 질문 등록 테스트 (내용만)
8. 익명성 확인: 학생 응답에 작성자 정보가 없는지, 학생이 `questions`/`votes`/`students` 테이블을 직접 읽을 수 없는지
9. 투표 테스트: before에서 막힘 → 시작 → 개수 제한 / 자기 투표 / 바꾸기 → 종료 → 결과 공개 설정 → 다시 열기
10. 문제가 없으면 이 브랜치로 main에 PR 생성 (사용자 확인 후)

## 8. 아직 구현하지 않은 2차 기능

- 질문 분류 활동 UI (교사가 활동 생성, 분류 체계 1개 선택, 대상 질문 선택)
- 드래그앤드롭 분류 (학생별 응답 저장, 결과 집계)
- 질문 키우기
- 질문 성장 이력
- 질문 연결
- 질문 지도
- 질문 비교
- 질문 생애주기
- 질문 성찰
- 랭킹
- 명예의 전당
- 폴더/아카이브 확장

## 9. 알려진 주의사항 / 미해결 항목

1. **migration은 아직 한 번도 실제 Supabase에서 실행되지 않았습니다.** 로컬 stub과 실제 Supabase가 다를 수 있습니다(예: `auth.users` 트리거 권한, `is_anonymous` 컬럼). 실행 중 오류가 나면 메시지를 그대로 확인하세요.
2. **실제 DB에 적용한 뒤에는 `20261001000000_init.sql`을 고치지 말고** 새 migration 파일을 추가해야 합니다. 지금까지는 DB가 비어 있어서 init 파일을 직접 고쳤습니다.
3. **교사 화면에 질문 삭제 버튼이 없습니다.** 숨김만 있고, 삭제는 DB 권한만 있습니다. 필요하면 QuestionsPage에 추가하세요.
4. **투표 초기화 기능이 없습니다.** 다시 열기를 해도 기존 표는 유지됩니다. 새 투표 라운드가 필요하면 `reset_class_votes` 같은 교사 RPC를 추가해야 합니다.
5. 교사 화면의 투표 수에는 숨긴 질문에 한 표도 그대로 표시됩니다. 학생의 개수 계산에서는 빠집니다.
6. **학생 신원 확인이 약합니다**: 클래스 코드 + 번호 + 이름만 알면 같은 학생으로 입장할 수 있습니다. 설계상 한계이며, 필요하면 교사 승인이나 PIN을 검토하세요.
7. 실시간 갱신이 아니라 폴링입니다(학생 10초, 교사 15초). 설정 변경은 다음 폴링 때 학생 화면에 반영됩니다.
8. `max_votes` 상한 20, 학생 번호 1~99, 질문 300자, 학급 이름 40자, 학생 이름 20자는 임의로 정한 값입니다.
9. 빌드 번들이 500kB를 넘는다는 경고가 있습니다(코드 분할 미적용). lint 경고 10개는 그대로입니다.
10. Confirm email(현재 꺼짐)과 Site URL은 운영 전에 정해야 합니다.
11. `.env` 파일은 저장소에 없습니다. 로컬에서 실행하려면 `.env.example`을 복사해 값을 넣어야 합니다. Claude 클라우드 환경에는 환경 변수로 설정되어 있습니다.
12. GitHub에서 PR #1은 "closed"로 보이지만 main에는 병합 커밋이 있습니다. 새 PR은 이 브랜치에서 main으로 만들면 됩니다.

## 10. 주요 파일 위치

| 파일 | 내용 |
| --- | --- |
| `supabase/migrations/20261001000000_init.sql` | 전체 스키마, RLS, RPC, 트리거, 권한 (단일 파일) |
| `supabase/tests/voting_test.sql` | DB 테스트 50개 |
| `supabase/tests/supabase_stub.sql` | 로컬 테스트용 Supabase 흉내 |
| `scripts/test-db.sh` | 임시 Postgres로 migration + 테스트 실행 |
| `src/lib/supabase.ts` | Supabase 클라이언트 (PUBLISHABLE_KEY 또는 ANON_KEY) |
| `src/lib/types.ts` | `ClassRoom`, `StudentContext`, `VotingStatus` 등 타입 |
| `src/lib/errors.ts` | RPC 오류 코드 → 한국어 메시지 |
| `src/pages/student/StudentJoin.tsx`, `StudentBoard.tsx` | 학생 입장, 질문 쓰기 + 게시판 + 투표 |
| `src/pages/teacher/*` | 교사 로그인, 대시보드, 학급, 질문, 학생, 설정(투표 설정) |
| `README.md` | 실행 방법, Supabase 설정, 보안 설계, DB 테스트 방법 |

---

## 작업 재개 프롬프트

아래를 새 세션 첫 메시지로 그대로 붙여 넣으세요.

```text
"우리반 질문 상자"(저장소 one248802/question-lab) 작업을 이어서 합니다.
작업 브랜치는 claude/admiring-edison-vllnk4 입니다. 먼저 이 브랜치를 체크아웃하고
PROJECT_STATUS.md 를 끝까지 읽어서 현재 상태를 파악해 주세요.

어제까지 상태 요약:
- React + TypeScript + Vite + Tailwind v4 + Supabase 앱. 교사(이메일 로그인), 학생(익명 로그인 + 클래스 코드/번호/이름)
- 질문은 content 만 등록, 학생에게 작성자 비공개, 교사만 작성자 확인
- 학급별 투표 설정: voting_status(before/open/closed, 전환은 DB 트리거로 강제), max_votes, allow_self_vote,
  allow_vote_change, show_results_during_voting, show_results_after_voting. 규칙은 toggle_vote RPC 에서 검사
- 질문 분류 체계 조회 테이블(classification_frameworks/categories)만 있고, 분류 활동 테이블은 migration 9번에 설계 주석만 있음
- ./scripts/test-db.sh 로 DB 테스트 50개 통과, npm run build 통과, lint 경고 10개는 기존 것
- 실제 Supabase(https://ogmsfyuhtrljcubuhclq.supabase.co)에는 migration 을 아직 실행하지 않았음

오늘 할 일 (순서대로):
1. 먼저 ./scripts/test-db.sh 와 npm run build 로 현재 상태가 그대로인지 확인해 주세요.
2. 제가 Supabase SQL Editor 에서 supabase/migrations/20261001000000_init.sql 전체를 실행하겠습니다.
   실행 전에 주의할 점이 있으면 알려 주세요. 실행 후 오류가 나면 메시지를 붙여 넣겠습니다.
3. 실행이 끝났다고 말하면, 환경 변수(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)로
   실제 DB 연결과 Anonymous sign-in 설정을 확인해 주세요 (테이블/RPC 존재, 분류 범주 9행 등).
4. 그다음 실제 Supabase 에서 교사 회원가입·로그인 → 학급 생성 → 학생 입장 → 질문 등록 → 익명성 확인
   → 투표(before/open/closed 규칙) 순서로 점검해 주세요. 가능하면 Playwright 로 앱을 띄워 확인해 주세요.
5. 실제 DB 에 적용한 뒤에는 init migration 을 고치지 말고 새 migration 파일로 변경해 주세요.

실제 Supabase 에 쓰기 작업이나 migration 적용이 필요하면 실행 전에 저에게 먼저 확인해 주세요.
```
