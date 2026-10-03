# PROJECT_STATUS — 우리반 질문 상자

> 마지막 정리: 2026-10-03 (실제 배포 사용 중. PR #9 비밀번호 재설정까지 병합, 질문 카드 배치·학생 수 링크 UX PR 작업 중)
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
| 품질 도구 | `npm run build` (tsc + vite), `npm run lint` (oxlint), `./scripts/test-db.sh` (로컬 DB 테스트), `scripts/e2e-supabase.mjs` (실제 Supabase API 검증), `scripts/e2e-browser.mjs` (실제 Supabase + 브라우저 검증, playwright-core) |

## 3. 브랜치 / 커밋 / PR

- **기준 브랜치**: `main`. 모든 기능과 최신 migration이 `main`에 들어가 있습니다.
- **main 최신 커밋**: `977329c` — PR [one248802/question-lab#6](https://github.com/one248802/question-lab/pull/6) 병합 커밋
- **작업 방식**: 작업마다 **최신 `main`에서 새 브랜치**를 만들고, PR로 `main`에 병합합니다.
  ```bash
  git fetch origin && git checkout -b <새 브랜치> origin/main
  ```
- **PR 기록**

  | PR | 내용 | 상태 |
  | --- | --- | --- |
  | [one248802/question-lab#1](https://github.com/one248802/question-lab/pull/1) | 초기 구현 (구버전 migration) | GitHub에서는 closed로 보이지만 병합 커밋 `08a28ca`가 main에 있음 |
  | [one248802/question-lab#2](https://github.com/one248802/question-lab/pull/2) | 최신 스키마(투표 설정·분류 체계), 실제 Supabase 검증, 테스트 도구 | ✅ 병합 (`fdfab0b`) |
  | [one248802/question-lab#3](https://github.com/one248802/question-lab/pull/3) | PROJECT_STATUS.md 갱신 | ✅ 병합 (`f76ed3b`) |
  | [one248802/question-lab#4](https://github.com/one248802/question-lab/pull/4) | 교사 질문 삭제, 학급 투표 초기화 (migration `20261002120000`) | ✅ 병합 (`64f5fd8`) |
  | [one248802/question-lab#5](https://github.com/one248802/question-lab/pull/5) | 질문 분류 활동 PR A: 테이블·RLS·학생 RPC, 교사 화면, 학생 tap-to-move 분류 화면 (migration `20261002150000`) | ✅ 병합 (`c2f4de5`) |
  | [one248802/question-lab#7](https://github.com/one248802/question-lab/pull/7) | PROJECT_STATUS.md 갱신 (PR #6 반영) | ✅ 병합 (`f03f936`) |
  | [one248802/question-lab#8](https://github.com/one248802/question-lab/pull/8) | 로그인/재접속 UX: 첫 화면 자동 재진입, 학생 일시 오류 처리, 클래스 코드 기억하기. DB 변경 없음 | ✅ 병합 (`194d557`) |
  | [one248802/question-lab#9](https://github.com/one248802/question-lab/pull/9) | 교사 비밀번호 재설정 (Supabase 기본 recovery 메일 → `/reset-password`). DB 변경 없음 | ✅ 병합 (`bb567cb`) |
  | (작업 중) | UX: 질문 카드 1~3열, 대시보드 학생 수 → 학생 관리. 프론트만 | 브랜치 `claude/question-grid-student-count` |
  | [one248802/question-lab#6](https://github.com/one248802/question-lab/pull/6) | 질문 분류 활동 PR B: 분류 화면 drag & drop(dnd-kit), 분류 결과 PNG 저장. DB/API/migration 변경 없음 | ✅ 병합 (`977329c`) |

- **PR #2에 들어간 주요 커밋**

  | SHA | 내용 |
  | --- | --- |
  | `3c82fe6` | 브라우저 E2E 스크립트 `scripts/e2e-browser.mjs`, playwright-core devDependency, 실제 검증 결과 기록 |
  | `24d0439` | 개발 초기화 SQL `supabase/dev/reset_app_schema.sql` |
  | `ef80a85` | 실제 Supabase API 검증 스크립트 `scripts/e2e-supabase.mjs` |
  | `e4c9cae` | voting_open → voting_status(before/open/closed), 상태 전환 트리거, DB 테스트 스크립트 |
  | `862a062` | 학급별 투표 설정 + toggle_vote 규칙 |
  | `a4831f8` | 질문은 content만, 분류 체계 조회 테이블, 함수 권한 보안 수정 |
  | `f90dbc4` | `VITE_SUPABASE_PUBLISHABLE_KEY` 환경 변수 이름 지원 |

- **브랜치 정리**: 병합된 작업 브랜치는 GitHub에서 지웁니다(PR 화면의 **Delete branch**). Claude 클라우드 환경의 git 프록시는 원격 브랜치 삭제를 막습니다.

## 4. 구현 완료된 기능

### 인증 / 계정
- **교사 Auth**: Supabase 이메일/비밀번호 회원가입·로그인 (`/teacher/login`)
- **profiles 자동 생성**: `auth.users` insert 트리거 `on_auth_user_created` → `handle_new_user()`. 익명 사용자는 제외하고, display_name은 40자로 자릅니다. 이미 가입된 교사 계정은 migration에서 보충합니다.
- **학생 anonymous sign-in 구조**: 학생은 Supabase 익명 로그인 후 `join_class` RPC로 입장합니다. 익명 사용자와 학생의 연결은 `student_sessions`에 저장하며, 한 학생이 여러 기기로 입장할 수 있습니다.
- **세션 유지 / 재접속** (PR #8, DB 변경 없음): 세션은 Supabase 기본대로 localStorage(`sb-<ref>-auth-token`)에 저장되고 자동 갱신됩니다.
  - 첫 화면(`/`)에서 자동 재진입: 교사 세션 → `/teacher`, 학생 세션이 학급에 연결돼 있으면 → `/student/board`. 세션은 **명시적 로그아웃(교사)·「나가기」(학생)** 때만 끝남. 로그아웃/나가기는 첫 화면으로 먼저 옮긴 뒤(`state.signingOut`) `signOut` 하므로 첫 화면이 다시 자동 이동하지 않음
  - 학생의 `get_my_student` 가 **일시적으로 실패**(네트워크·토큰 갱신 중)하면 「미가입」으로 보지 않음: `src/lib/studentSession.ts` 의 `lookupMyStudent()` 가 몇 번 다시 시도하고, 그래도 실패하면 「연결이 잠시 불안정해요 · 다시 시도」 화면(`ConnectionRetry`). 게시판·분류 화면은 지금 상태를 유지. **요청이 성공했는데 연결된 학생이 없을 때만** 입장 화면으로 이동
  - 「이 클래스 코드 기억하기」: 입장에 성공하면 localStorage `qlab:remembered-class-code` 에 **클래스 코드만** 저장(번호·이름 저장 안 함), 다음 입장 화면에 자동 입력. 체크를 풀면 바로 삭제
  - 공용 기기 안내 문구: 학생 입장 화면(다 쓴 뒤 「나가기」), 교사 로그인 화면(사용 후 로그아웃)
  - 원인 분석 메모: 코드상 확인된 원인은 (1) 첫 화면이 세션을 보지 않아 다시 「들어가기」를 눌러야 했던 것, (2) `get_my_student` 의 일시적 오류를 미가입으로 처리해 빈 입장 폼을 보여 준 것. 그 밖에 앱이 막을 수 없는 원인으로 인앱 브라우저(카카오톡 등)·시크릿 모드·기기 정책으로 저장소가 지워지는 경우, Safari 의 7일 미방문 저장소 삭제, 같은 브라우저에서 교사 로그인(학생 세션을 먼저 로그아웃) 이 있음. 실제로 풀렸을 때 「계속하기」 화면이었는지 빈 입장 폼이었는지 확인 필요

- **교사 비밀번호 재설정** (PR #9, DB 변경 없음, Supabase 기본 기능만 사용):
  - 로그인 화면 「비밀번호를 잊으셨나요?」 → 이메일 입력 → `resetPasswordForEmail(email, { redirectTo: <현재 주소>/reset-password })`. 가입 여부와 상관없이 같은 안내를 보여 줌
  - 메일 링크 → `/reset-password#access_token=…&type=recovery` → supabase-js 가 복구 세션을 만들고 주소의 토큰을 지움 → 새 비밀번호 + 확인(6자 이상, 서로 같아야 함) → `updateUser({ password })` → 완료 화면 → 「교사 화면으로 가기」
  - 만료/이미 쓴 링크(`#error_code=otp_expired`)나 링크 없이 열면 「링크를 쓸 수 없어요 · 재설정 메일 다시 받기」. 이미 로그인돼 있어도 오류 링크면 바꾸기 화면을 보여 주지 않음
  - Redirect URL 이 등록되지 않아 Supabase 가 Site URL(첫 화면)로 보낸 경우에도 `RecoveryGate`(App.tsx)가 교사 대시보드보다 먼저 `/reset-password` 로 보냄
  - 링크의 # 값은 `src/lib/authRedirect.ts` 가 앱이 열린 순간 읽어 둠(종류·오류만, 토큰은 저장하지 않음). 비밀번호·토큰을 DB나 브라우저 저장소에 따로 저장하지 않음
  - **Supabase 설정 필요**: Authentication → URL Configuration → Redirect URLs 에 `https://<배포 주소>/reset-password`(로컬은 `http://localhost:5173/reset-password`). 기본 메일 발송(내장 SMTP)은 시간당 보낼 수 있는 수가 적고 조직 팀원 주소로만 보낼 수 있으므로, 다른 교사가 쓰려면 Custom SMTP 필요

### 학급 / 학생
- **학급 생성/수정/삭제** (`/teacher/classes`)
- **클래스 코드**: 6자리이고 헷갈리는 글자(0, O, 1, I)는 빼고 만듭니다. 학급을 만들 때 트리거가 자동으로 생성하고, `regenerate_class_code` RPC로 다시 만들 수 있습니다.
- **학생 입장**: 클래스 코드 + 번호(1~99) + 이름. 같은 번호가 다른 이름으로 이미 들어와 있으면 `NAME_MISMATCH`로 거부합니다.
- **학생 관리** (`/teacher/students`): 목록, 수정, 삭제

### 질문
- **질문 카드 배치** (UX PR, 프론트만): 학생 게시판·교사 질문 화면 모두 질문 목록이 차지하는 폭 기준(container query)으로 1열 → 2열(34rem 이상) → 3열(54rem 이상). 휴대폰 1열, 태블릿 2열, 노트북(1280px)·데스크톱 3열. 글자 크기(본문 20px)는 질문 수나 열 수와 상관없이 그대로, 카드 높이는 내용만큼(같은 줄 카드는 높이를 맞추고 투표·작성자·버튼은 카드 아래쪽). 학생 게시판 최대 폭 72rem → 90rem
- **대시보드 학생 수 링크**: 학급 카드의 「학생 N」을 누르면 그 학급이 선택된 학생 관리(`/teacher/students`), 「전체 학생」을 누르면 지금 선택된 학급의 학생 관리(위에서 학급 변경). 학급 선택은 기존 「질문 보기」와 같은 `setSelectedClassId`
- **익명 질문 등록**: `create_question(p_content text)`. 내용만 입력하고 유형은 고르지 않습니다. 1~300자이고, 3초 안에 다시 올리는 것은 막습니다.
- **학생에게 작성자 비공개**: 학생은 테이블에 직접 접근할 수 없고 `list_class_questions` RPC만 씁니다. 이 RPC는 작성자 정보 없이 `is_mine`만 돌려줍니다.
- **교사만 작성자 확인**: 교사 화면(`/teacher/questions`)에서 번호와 이름을 표시합니다. RLS로 자기 학급 질문만 볼 수 있습니다.
- **질문 숨기기**: 교사 화면의 숨기기/다시 공개. 숨긴 질문은 학생 목록과 투표 대상에서 빠지고, 표는 남아 있다가 다시 공개하면 돌아옵니다.
- **질문 삭제**: 교사 화면의 **삭제** 버튼 (숨기기와 별개, 확인창에 받은 표 수 안내). 담당 교사만 삭제할 수 있습니다(RLS 정책 `questions: teacher delete`). 질문에 받은 표는 `votes.question_id ... on delete cascade`로 함께 지워지므로, 학생은 그 표를 돌려받고 학생 목록에서도 바로 사라집니다. 되돌릴 수 없습니다.

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
- **투표 초기화**: `reset_class_votes(p_class_id)` RPC (migration `20261002120000_reset_class_votes.sql`). 담당 교사만 실행할 수 있고(함수 안에서 `owns_class` 확인, 아니면 `FORBIDDEN`), 그 학급의 votes만 지운 뒤 지운 표 수를 돌려줍니다. 질문과 투표 설정(`voting_status`, `max_votes`, `allow_self_vote` 등)은 그대로입니다. 투표 상태와 상관없이 실행할 수 있습니다. 교사 설정 화면의 **투표 초기화** 버튼(확인창)

### 투표 UI
- **교사** (`/teacher/settings`): 학급마다 상태 설명과 [투표 시작 / 투표 종료 / 투표 다시 열기] 버튼, 투표 개수 선택, 스위치 4개, [투표 초기화] 버튼
- **학생** (`/student/board`): "투표가 아직 시작되지 않았어요", "투표 중 · 남은 표 n/N", "투표가 종료되었습니다" 상태 표시. 초과 시 취소 안내. 서버가 거절할 버튼은 미리 비활성화하고 이유를 보여 줌

### 질문 분류 활동 (migration `20261002150000_classification_activities.sql`)
- **교사** (`/teacher/activities`, 메뉴 「질문 분류 활동」): 학급별로 활동을 만들고 수정·삭제·공개합니다.
  - 활동 = 제목(1~60자) + 분류 영역 이름 2~5개(각 1~20자, 서로 다름) + 이 학급 질문 중 고른 질문(1개 이상)
  - 만들기·수정은 `save_classification_activity` RPC 한 번으로 저장(제목·영역·질문 선택을 한 트랜잭션으로, 같은 학급 질문만 허용). 새 활동은 비공개로 시작
  - 학생 공개는 「학생에게 공개」 스위치(`is_open`). **한 반에 여러 활동을 동시에 공개할 수 있습니다.**
  - 삭제는 확인창 후 활동만 삭제(질문·투표는 그대로)
- **학생**: 게시판(`/student/board`)의 「분류 활동」 카드에 공개된 활동 목록 → `/student/activity/:id` 분류 화면
  - 질문 카드는 처음에 「아직 분류하지 않은 질문」에 있고, **카드를 누른 뒤 영역의 「여기에 놓기」를 눌러** 옮깁니다(tap-to-move). 언제든 다른 영역으로 다시 옮길 수 있고 「처음으로」로 되돌립니다.
  - **분류 결과(배치)는 DB에 저장하지 않습니다.** 새로고침에 대비해 이 탭의 `sessionStorage`에만 두고, 탭을 닫으면 사라집니다. 학생별 기록·집계·통계는 없습니다.
  - 학생은 테이블에 직접 접근하지 않고 읽기 전용 RPC만 씁니다: `list_open_classification_activities()`, `get_classification_activity(id)` — 우리 반에 공개된 활동만, **질문은 id와 내용만**(작성자·투표 정보 없음), 숨긴 질문은 제외
- 질문이 삭제되면 활동에서도 빠지고(cascade), 학급을 지우면 활동도 지워집니다. 질문·투표 테이블과 기존 RPC, 통계는 바뀌지 않았습니다.
- **drag & drop, PNG 저장 (PR #6, 구현 완료, DB/API/migration 변경 없음)**
  - ✅ drag & drop (`@dnd-kit/core`): 카드를 끌어 영역에 놓기. 마우스는 6px 움직이면, 터치는 0.2초 길게 누르면 끌기 시작(짧게 누르면 기존 tap-to-move 선택, 길게 누르지 않고 밀면 끌리지 않음). 놓을 영역은 손가락/마우스가 가리키는 영역 우선(`pointerWithin`, 영역 밖이면 겹침 기준). 놓는 애니메이션은 끔(애니메이션 중에는 다음 끌기가 시작되지 않던 문제 수정). tap-to-move 는 그대로 fallback 으로 유지하고 둘 다 같은 `moveCard` → 같은 placement / sessionStorage 사용. 화면 읽기 안내는 한국어로 「카드 선택 → 여기에 놓기」 방법을 안내(키보드 끌기는 쓰지 않음)
  - ✅ 분류 결과 PNG 저장 (`src/lib/classificationPng.ts`): 화면 캡처가 아니라 Canvas 2D 로 직접 그림 — 활동 제목, 학급명, 학생 번호·이름, 날짜, 영역별 질문, 미분류 질문. 너비 1600px × 2배(휴대폰 캔버스 한도 1,600만 픽셀 안으로 자동 축소). 웹 글꼴(Jua, Noto Sans KR)을 필요한 글자만큼 미리 불러옴. 저장은 학생 기기에만: 컴퓨터는 파일 다운로드, 터치 기기에서 파일 공유를 지원하면 공유 화면(사진에 저장 등), 실패하면 다운로드. Supabase Storage·서버 업로드 없음. 파일 이름 `질문분류_제목_3번_이름_2026-10-02.png`
  - ✅ 브라우저 테스트 72/72 (기존 60 + 12): 마우스 끌기(미분류→영역, 영역→영역, 영역→미분류), 끌기 뒤 tap-to-move, 끌어서 옮긴 배치의 새로고침 유지, PNG 다운로드(파일 이름·PNG 형식·너비 3200px), PNG 저장 중 Supabase 요청 없음, 휴대폰(터치) 길게 눌러 끌기·짧게 눌러 선택·「여기에 놓기」, 휴대폰 폭 가로 스크롤 없음
  - 참고: dnd-kit 은 끌기가 끝난 뒤 0.05초 동안 클릭을 막음(놓을 때 생기는 클릭 방지). 테스트는 끌기 뒤 0.1초 쉼. 테스트 브라우저는 `LANG=C.UTF-8` 로 실행(로캘이 없으면 한글 다운로드 파일 이름이 `download` 로 바뀜 — 실제 학생 브라우저와는 무관)
  - **실제 기기에서 아직 미검증** (Chromium 터치 에뮬레이션으로만 확인함, 실제 휴대폰·태블릿으로 직접 확인 필요):
    1. **long-press drag & drop**: 실제 손가락으로 0.2초 길게 눌러 끌어 영역에 놓기
    2. **swipe scroll**: 카드 위에서 길게 누르지 않고 밀었을 때 카드는 끌리지 않고 페이지가 스크롤되는지
    3. **PNG save/share**: 터치 기기에서 공유 화면이 열리고 「사진에 저장」 등으로 저장되는지 (테스트 환경에는 공유 기능이 없어 컴퓨터용 다운로드 경로만 확인함)
- 기존 조회 테이블 `classification_frameworks`, `classification_categories`(열린/닫힌, 확인/명료화/심화, 사실적/개념적/논쟁적/호기심 촉발 seed)는 **그대로 두고 쓰지 않습니다**. init migration 9번 섹션의 설계 메모(framework_code, classification_responses)는 이 설계로 대체되었습니다.

### 보안 설계 요약
- 교사: RLS로 `classes.teacher_id = auth.uid()`인 학급과 그 학급의 학생·질문·투표만 접근합니다.
- 학생: 테이블에 직접 접근할 수 없고 `security definer` RPC만 씁니다.
- 함수 실행 권한: Supabase 기본 권한을 모두 회수한 뒤 필요한 RPC만 `authenticated`에 허용합니다. 내부 함수(`generate_class_code`, `student_context_json`, `student_vote_count`, `vote_results_visible`, 트리거 함수)는 직접 호출할 수 없습니다.
- 브라우저에는 publishable(anon) key만 씁니다. service_role key는 쓰지 않습니다.

## 5. 테스트 결과

| 항목 | 결과 |
| --- | --- |
| `./scripts/test-db.sh` | ✅ 모든 migration을 순서대로(파일마다 단일 트랜잭션) 적용한 뒤, 테스트 파일마다 새 DB 복사본에서 실행. **121/121 통과** |
| `supabase/tests/voting_test.sql` | 50개: profiles 트리거, 기본값, before/open/closed 규칙, 상태 전환, max_votes 감소, 자기 투표, 결과 공개 조합, 숨김, 권한 |
| `supabase/tests/classification_activity_test.sql` | 44개: 활동 만들기/수정 검증(영역 2~5개·이름·중복·제목·질문 필수·다른 학급 질문 거부), 권한(다른 교사·학생·비로그인 불가, 교사도 RPC 외 직접 수정 불가), 공개 전 비노출, 여러 활동 동시 공개, 학생 응답은 제목·영역·질문(id, 내용)만, 숨긴 질문 제외, 다른 반 학생 차단, 질문/활동/학급 삭제 cascade, 질문 수·투표 수·학급 통계 그대로, 결과 저장 테이블 없음 |
| `supabase/tests/question_delete_reset_test.sql` | 27개: 질문 삭제 권한(학생·다른 교사 불가), 표 cascade 삭제와 표 돌려받기, 학생 목록에서 사라짐, 투표 초기화 권한(학생·다른 교사·비로그인 불가), 학급 표만 삭제, 질문·설정 유지, 다른 학급 영향 없음, 초기화 후 재투표 |
| `npm run build` | ✅ 통과. 번들 500kB 초과 경고만 있음 |
| `npm run lint` | 에러 0. **경고 9개** (모두 예전부터 있던 것: `set-state-in-effect`, `only-export-components`. 재접속 작업에서 학생 입장 화면 경고 1개가 없어짐) |

- `test-db.sh`는 임시 로컬 Postgres를 띄우고 `supabase/tests/supabase_stub.sql`로 Supabase 환경(auth 스키마, anon/authenticated 역할, 기본 권한)을 흉내 냅니다. 실제 Supabase에는 접속하지 않습니다. 필요한 도구는 `initdb`, `pg_ctl`, `psql`입니다(이 클라우드 환경에는 Postgres 16이 설치되어 있음).
- 기대값을 일부러 틀리게 바꾸면 FAIL이 출력되고 스크립트가 0이 아닌 코드로 끝나는 것도 확인했습니다.

### 실제 Supabase 검증 (2026-10-02)
| 항목 | 결과 |
| --- | --- |
| `NODE_USE_ENV_PROXY=1 node scripts/e2e-supabase.mjs` | ✅ **87/87 통과** (질문 삭제·투표 초기화 12개, 질문 분류 활동 17개 포함). supabase-js(앱과 같은 라이브러리)로 실제 프로젝트에 요청 |
| `node scripts/e2e-ux.mjs` (dev 서버 실행 중) | ✅ **17/17 통과** (2026-10-03). 대시보드 학생 수 → 해당 학급이 선택된 학생 관리, 전체 학생 → 학생 관리. 질문 30개(목록 응답만 가짜)로 학생 게시판 390/768/1024/1280/1920px, 교사 질문 화면 390/1024/1280/1920px 의 열 수, 글자 20px 유지, 본문 잘림·가로 스크롤 없음, 「내 질문」·투표 버튼 유지 |
| `node scripts/e2e-password-reset.mjs` (dev 서버 실행 중) | ✅ **22/22 통과** (2026-10-03). 메일 링크 흐름 18개는 Supabase Auth 응답을 가짜로 돌려줘서 실제 메일 없이 확인(메일 요청·redirect_to, 너무 잦은 요청 안내, 링크 진입·토큰 주소에서 삭제, 6자 미만·불일치·같은 비밀번호 거부, 변경 완료, 저장소에 비밀번호 없음, 만료 링크, 링크 없음, Site URL 로 열린 링크). 실제 Supabase 4개: 테스트 교사(`qlab.reset.*@gmail.com`)로 비밀번호를 실제로 바꾼 뒤 예전 비밀번호 거부·새 비밀번호 로그인 |
| `node scripts/e2e-browser.mjs` (dev 서버 실행 중) | ✅ **90/90 통과** (질문 삭제·투표 초기화 10개, 질문 분류 활동 16개, drag & drop·터치·PNG 12개, 재접속 18개 포함, 확인창 취소/확인 모두). 재접속 테스트는 같은 프로필로 브라우저 프로세스를 완전히 껐다 켬(교사·학생 재진입, 만료된 access token 자동 갱신, `get_my_student` 503 시 다시 시도 화면, 로그아웃·나가기 후 세션 삭제, 클래스 코드 기억/삭제). 실제 Chromium으로 교사·학생 A·학생 B를 각각 다른 브라우저 세션으로 조작 |

- 검증한 흐름: 교사 회원가입·로그아웃·로그인 → profiles 자동 생성 → 학급 생성·클래스 코드 → 학생 익명 로그인·입장(틀린 코드, 이름 불일치 거부) → 질문 등록(내용만, 3초 제한, 빈 질문 거부) → 익명성(학생 화면·학생이 받은 응답에 작성자 없음, 학생의 테이블 직접 조회/추가 불가, 내부 함수 호출 불가) → 교사만 작성자 확인 → before/open/closed 규칙과 잘못된 전환 거부 → max_votes(줄여도 기존 표 유지, 초과분 취소) → 자기 질문 투표 → 투표 바꾸기 → 투표 중/종료 후 결과 공개 → 다시 열기 → 질문 숨기기 → 모바일 폭(390px) 가로 스크롤 없음
- **앱 버그는 발견되지 않았습니다.** 고친 것은 테스트 스크립트(선택자, 투표 응답 대기)와 테스트 환경(아래)뿐입니다.
- 두 스크립트 모두 끝나면 테스트 학급을 지웁니다(학생·질문·투표 함께 삭제). **테스트용 교사 계정(`qlab.e2e.*@gmail.com`, `qlab.browser.*@gmail.com`, `qlab.reset.*@gmail.com`, `qlab.ux.*@gmail.com`)과 익명 사용자는 Authentication → Users 에 남습니다** (publishable key로는 지울 수 없음). 대시보드에서 지워도 됩니다.
- 브라우저 테스트 환경 주의: 이 클라우드 환경의 Chromium은 프록시 CA를 신뢰하지 않아 Supabase 요청이 `ERR_CERT_AUTHORITY_INVALID`로 실패했습니다. `/root/.ccr/ca-bundle.crt`의 인증서를 `certutil`로 `~/.pki/nssdb`에 등록해 해결했습니다(TLS 검증은 끄지 않음). 새 컨테이너에서는 다시 해야 할 수 있습니다:
  ```bash
  apt-get install -y libnss3-tools
  d=$(mktemp -d); awk -v d=$d '/BEGIN CERT/{n++; f=sprintf("%s/c%03d.pem",d,n)} f{print > f} /END CERT/{close(f); f=""}' /root/.ccr/ca-bundle.crt
  for f in $d/*.pem; do certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "ccr-$(basename $f .pem)" -i $f; done
  ```
  또 Playwright의 `proxy` 옵션은 localhost도 프록시로 보내므로, 스크립트는 `--proxy-server` / `--proxy-bypass-list` Chromium 인자를 직접 씁니다.

## 6. 실제 Supabase 상태 (2026-10-02 마지막 확인)

| 항목 | 상태 |
| --- | --- |
| 프로젝트 | 생성 완료. URL `https://ogmsfyuhtrljcubuhclq.supabase.co` |
| Claude 환경 변수 | 설정 완료: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. 코드는 `VITE_SUPABASE_ANON_KEY`도 읽음 |
| 네트워크 | `*.supabase.co` 허용 완료. Auth API 200 응답 확인 |
| **migration** | ✅ **적용 완료 (2026-10-02)**. 현재 main의 `20261001000000_init.sql`을 SQL Editor에서 실행. 그 전에 PR #1 시절 구버전 migration이 실행되어 있어서 `supabase/dev/reset_app_schema.sql`로 앱 객체만 정리한 뒤 다시 적용 |
| migration `20261002120000_reset_class_votes.sql` | ✅ 적용 완료 (2026-10-02, SQL Editor). 투표 초기화 RPC |
| migration `20261002150000_classification_activities.sql` | ✅ 적용 완료 (2026-10-02, SQL Editor). 질문 분류 활동 |
| Anonymous Sign-ins | ✅ 켜져 있음. 실제 익명 로그인으로 학생 입장 확인 |
| Confirm email | 꺼져 있음 (`mailer_autoconfirm: true`, 가입하면 바로 로그인). 운영 전 결정 필요 |
| Site URL | 확인하지 않음. 배포 후 Authentication → URL Configuration에서 설정 |

- 세션 안에서는 Supabase DB 접속 정보(비밀번호/연결 문자열)가 없어서 SQL을 직접 실행할 수 없습니다. 스키마 변경은 SQL Editor에서 사람이 실행합니다.
- **이제 실제 DB에 적용되었으므로 `20261001000000_init.sql`은 수정하지 않습니다.** 이후 스키마 변경은 `supabase/migrations/2026MMDDhhmmss_<설명>.sql` 새 파일로 만들고, `./scripts/test-db.sh`가 모든 migration을 순서대로 실행해 테스트합니다.
- `supabase/dev/reset_app_schema.sql`은 **개발 초기화용**입니다(앱 테이블 데이터 전부 삭제, auth.users는 유지). 실제 수업 데이터가 생긴 뒤에는 쓰지 마세요.

## 7. 다음에 할 작업 (순서대로)

모든 작업은 최신 `main`에서 새 브랜치를 만들어 시작하고, DB 변경은 **새 migration 파일**로 합니다.

1. UX PR(`claude/question-grid-student-count`) 병합. 다른 교사도 비밀번호 재설정을 쓰려면 Custom SMTP 설정
   - 나중에 학생별 질문 모아보기는 학생 관리(`StudentsPage`)의 학생 줄에서 여는 방식으로 붙이면 됨 (이미 학생별 질문 수를 불러옴)
2. 실제 휴대폰·태블릿에서 질문 분류 활동 확인: long-press drag & drop, swipe scroll, PNG save/share (4번 「질문 분류 활동」의 미검증 항목)
3. 실제 사용 중 학생 로그인이 풀렸다고 느껴지면: 그때 화면이 「계속하기」였는지 빈 입장 폼이었는지, 기기·브라우저·링크를 연 방법(인앱 브라우저 여부) 기록
4. 작은 미해결 항목 중 필요한 것 선택 (9번)
5. 나머지 2차 기능 (8번)

## 8. 아직 구현하지 않은 2차 기능

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

1. migration은 모두 실제 Supabase에 적용했고(2026-10-02), 실제 환경 API 검증 87개, 브라우저 검증 72개를 통과했습니다. 로컬 stub(`supabase_stub.sql`)은 실제 Supabase를 단순화한 것이라, 새 migration은 로컬 테스트 후 실제 환경 검증 스크립트로도 확인하세요.
2. **`20261001000000_init.sql`은 실제 DB에 적용되었으므로 더 이상 고치지 않습니다.** 변경은 새 migration 파일로 합니다.
3. 질문 삭제와 투표 초기화는 되돌릴 수 없습니다(확인창만 있음). 삭제된 질문/표를 복구하거나 기록을 남기는 기능은 없습니다.
4. 투표를 다시 열어도 기존 표는 유지됩니다. 새 라운드가 필요하면 설정 화면의 **투표 초기화**를 씁니다.
5. 교사 화면의 투표 수에는 숨긴 질문에 한 표도 그대로 표시됩니다. 학생의 개수 계산에서는 빠집니다.
6. **학생 신원 확인이 약합니다**: 클래스 코드 + 번호 + 이름만 알면 같은 학생으로 입장할 수 있습니다. **현재 사용 목적상 허용하기로 결정했습니다 (2026-10-02). 교사 승인·PIN 같은 인증 강화는 이번 범위에서 구현하지 않습니다.**
7. 실시간 갱신이 아니라 폴링입니다(학생 10초, 교사 15초). 설정 변경은 다음 폴링 때 학생 화면에 반영됩니다.
8. `max_votes` 상한 20, 학생 번호 1~99, 질문 300자, 학급 이름 40자, 학생 이름 20자는 임의로 정한 값입니다.
9. 빌드 번들이 500kB를 넘는다는 경고가 있습니다(코드 분할 미적용). lint 경고는 9개(모두 예전부터 있던 것)입니다.
10. Confirm email(현재 꺼짐)과 Site URL은 운영 전에 정해야 합니다.
11. `.env` 파일은 저장소에 없습니다. 로컬에서 실행하려면 `.env.example`을 복사해 값을 넣어야 합니다. Claude 클라우드 환경에는 환경 변수로 설정되어 있습니다.
12. GitHub에서 PR #1은 "closed"로 보이지만 main에는 병합 커밋이 있습니다. 이후 PR은 모두 최신 main에서 만든 새 브랜치 → main 입니다.
13. 학생 화면에서 투표 버튼을 빠르게 두 번 누르면 두 번째 클릭은 무시됩니다(처리 중 중복 방지). 버튼이 처리 중임을 따로 표시하지는 않습니다.
14. 테스트 스크립트를 돌릴 때마다 실제 Supabase Auth에 테스트 교사 계정 1개와 익명 사용자 2~3개가 쌓입니다.

## 10. 주요 파일 위치

| 파일 | 내용 |
| --- | --- |
| `supabase/migrations/20261001000000_init.sql` | 초기 스키마, RLS, RPC, 트리거, 권한. **실제 DB 적용 완료, 수정 금지** |
| `supabase/migrations/20261002120000_reset_class_votes.sql` | 투표 초기화 RPC `reset_class_votes` |
| `supabase/migrations/20261002150000_classification_activities.sql` | 질문 분류 활동 테이블 2개, RLS, `save_classification_activity`(교사), `list_open_classification_activities`·`get_classification_activity`(학생) |
| `supabase/tests/classification_activity_test.sql` | DB 테스트 44개 (질문 분류 활동) |
| `supabase/tests/voting_test.sql` | DB 테스트 50개 (투표 규칙) |
| `supabase/tests/question_delete_reset_test.sql` | DB 테스트 27개 (질문 삭제, 투표 초기화) |
| `supabase/tests/supabase_stub.sql` | 로컬 테스트용 Supabase 흉내 |
| `scripts/test-db.sh` | 임시 Postgres로 migration + 테스트 실행 |
| `scripts/e2e-supabase.mjs` | 실제 Supabase API 검증 (`NODE_USE_ENV_PROXY=1 node scripts/e2e-supabase.mjs [--keep]`) |
| `scripts/e2e-browser.mjs` | 실제 Supabase + 브라우저 검증 (`npm run dev` 후 `node scripts/e2e-browser.mjs`, 스크린샷은 `e2e-shots/`) |
| `supabase/dev/reset_app_schema.sql` | 개발 초기화용: public의 앱 객체만 삭제 (auth.users 유지). migration 아님 |
| `src/lib/supabase.ts` | Supabase 클라이언트 (PUBLISHABLE_KEY 또는 ANON_KEY, 세션은 localStorage 에 유지·자동 갱신) |
| `src/lib/studentSession.ts`, `src/components/ConnectionRetry.tsx` | 학생 조회(joined / not_joined / 일시적 error 구분, 재시도), 연결 불안정 시 다시 시도 화면 |
| `src/pages/Home.tsx` | 첫 화면 + 교사·학생 자동 재진입 |
| `src/pages/teacher/ResetPassword.tsx`, `src/lib/authRedirect.ts` | 비밀번호 재설정 화면(`/reset-password`), 메일 링크 주소(# 값) 읽기와 `RecoveryGate` 용 상태 |
| `scripts/e2e-ux.mjs` | 질문 카드 배치·학생 수 링크 브라우저 검증 (`npm run dev` 후 `node scripts/e2e-ux.mjs`) |
| `scripts/e2e-password-reset.mjs` | 비밀번호 재설정 브라우저 검증 (`npm run dev` 후 `node scripts/e2e-password-reset.mjs`) |
| `src/lib/types.ts` | `ClassRoom`, `StudentContext`, `VotingStatus` 등 타입 |
| `src/lib/errors.ts` | RPC 오류 코드 → 한국어 메시지 |
| `src/pages/student/StudentJoin.tsx`, `StudentBoard.tsx` | 학생 입장, 질문 쓰기 + 게시판 + 투표 |
| `src/pages/student/StudentActivity.tsx`, `src/components/OpenActivities.tsx` | 학생 분류 화면(drag & drop + tap-to-move, sessionStorage, PNG 저장 버튼), 게시판의 공개 활동 목록 카드 |
| `src/lib/classificationPng.ts` | 분류 결과 PNG 그리기(Canvas 2D)와 학생 기기 저장(다운로드/공유) |
| `src/pages/teacher/ActivitiesPage.tsx` | 교사 질문 분류 활동 만들기/수정/삭제/공개 |
| `src/pages/teacher/*` | 교사 로그인, 대시보드, 학급, 질문, 학생, 설정(투표 설정) |
| `README.md` | 실행 방법, Supabase 설정, 보안 설계, DB 테스트 방법 |

---

## 작업 재개 프롬프트

아래를 새 세션 첫 메시지로 그대로 붙여 넣으세요.

```text
"우리반 질문 상자"(저장소 one248802/question-lab) 작업을 이어서 합니다.
기준 브랜치는 main 입니다. 최신 main 을 받아 PROJECT_STATUS.md 를 끝까지 읽어서 현재 상태를 파악해 주세요.
작업을 시작할 때는 최신 main 에서 새 브랜치를 만들어 주세요.

현재 상태 요약:
- React + TypeScript + Vite + Tailwind v4 + Supabase 앱. 교사(이메일 로그인), 학생(익명 로그인 + 클래스 코드/번호/이름)
- 질문은 content 만 등록, 학생에게 작성자 비공개, 교사만 작성자 확인
- 학급별 투표 설정: voting_status(before/open/closed, 전환은 DB 트리거로 강제), max_votes, allow_self_vote,
  allow_vote_change, show_results_during_voting, show_results_after_voting. 규칙은 toggle_vote RPC 에서 검사
- 질문 분류 활동: 교사가 제목·영역 2~5개·질문을 골라 공개, 학생은 카드를 drag & drop 또는 tap-to-move 로 영역에 배치
  (결과는 DB 저장 안 함, sessionStorage), 분류 결과 PNG 저장(학생 기기에만). 실제 기기에서 long-press drag & drop,
  swipe scroll, PNG save/share 는 아직 미검증
  기존 classification_frameworks/categories 테이블은 그대로 두고 쓰지 않음
- 실제 Supabase(https://ogmsfyuhtrljcubuhclq.supabase.co)에 migration 3개 모두 적용 완료, PR #6 까지 main 병합 완료
- 검증: ./scripts/test-db.sh 121/121, scripts/e2e-supabase.mjs 87/87, scripts/e2e-browser.mjs 90/90,
  npm run build 통과, lint 경고 9개는 기존 것
- 로그인 유지: 첫 화면에서 교사·학생 자동 재진입, 학생 get_my_student 일시 오류는 다시 시도 화면, 클래스 코드 기억하기(localStorage 에 코드만)
- 교사 비밀번호 재설정: Supabase 기본 recovery 메일 → /reset-password (scripts/e2e-password-reset.mjs 22/22)

규칙:
- supabase/migrations/20261001000000_init.sql 은 실제 DB 에 적용되었으므로 수정하지 말고, 스키마 변경은 새 migration 파일로 작성
- 이미 구현된 기능을 다시 만들거나 대규모로 재작성하지 않기
- 실제 Supabase 에 SQL 적용이 필요하면 제가 SQL Editor 에서 실행하므로, 실행할 SQL 과 확인 방법을 먼저 보여 주기
- 작업은 최신 main 에서 새 브랜치를 만들어 하고, PR 로 main 에 병합

먼저 할 일:
1. 최신 main 의 커밋과 ./scripts/test-db.sh, npm run build 결과를 확인해 주세요.
2. PROJECT_STATUS.md 7번 "다음에 할 작업"을 보고 무엇부터 할지 제안해 주세요. 제가 정한 뒤 진행합니다.
```
