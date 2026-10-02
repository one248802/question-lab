# PROJECT_STATUS — 우리반 질문 상자

> 마지막 정리: 2026-10-02 (실제 Supabase 적용 + 실제 환경 검증 완료)
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

- **작업 브랜치**: `claude/admiring-edison-vllnk4`
- **최근 커밋**: 이 문서를 갱신한 커밋이 브랜치의 최신 커밋입니다. 주요 커밋은 아래와 같습니다.

  | SHA | 내용 |
  | --- | --- |
  | (이 문서 갱신 커밋) | 브라우저 E2E 스크립트 `scripts/e2e-browser.mjs`, playwright-core devDependency, 상태 문서 갱신 |
  | `24d0439` | 개발 초기화 SQL `supabase/dev/reset_app_schema.sql` |
  | `ef80a85` | 실제 Supabase API 검증 스크립트 `scripts/e2e-supabase.mjs` |
  | `b9ddc33` | PROJECT_STATUS.md 최초 작성 |
  | `e4c9cae` | voting_open → voting_status(before/open/closed), 상태 전환 트리거, DB 테스트 스크립트 |
  | `862a062` | 학급별 투표 설정 + toggle_vote 규칙 |
  | `a4831f8` | 질문은 content만, 분류 체계 조회 테이블, 함수 권한 보안 수정 |
  | `f90dbc4` | `VITE_SUPABASE_PUBLISHABLE_KEY` 환경 변수 이름 지원 |

- **main과의 관계**: main(`08a28ca`, PR #1 병합 커밋)에서 갈라졌고, main보다 **앞서 있기만 하고 뒤처진 커밋은 없습니다** (정확한 개수는 `git rev-list --left-right --count origin/main...HEAD`). 충돌 없이 fast-forward 가능한 상태입니다.
- ⚠️ **main 브랜치에는 아직 구버전 migration(`question_scopes` 포함)이 있습니다.** SQL을 복사할 때는 반드시 이 브랜치에서 복사하세요. (2026-10-02에 main 버전을 실수로 실행해 초기화한 적이 있음)
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

### 실제 Supabase 검증 (2026-10-02)
| 항목 | 결과 |
| --- | --- |
| `NODE_USE_ENV_PROXY=1 node scripts/e2e-supabase.mjs` | ✅ **58/58 통과**. supabase-js(앱과 같은 라이브러리)로 실제 프로젝트에 요청 |
| `node scripts/e2e-browser.mjs` (dev 서버 실행 중) | ✅ **34/34 통과**. 실제 Chromium으로 교사·학생 A·학생 B를 각각 다른 브라우저 세션으로 조작 |

- 검증한 흐름: 교사 회원가입·로그아웃·로그인 → profiles 자동 생성 → 학급 생성·클래스 코드 → 학생 익명 로그인·입장(틀린 코드, 이름 불일치 거부) → 질문 등록(내용만, 3초 제한, 빈 질문 거부) → 익명성(학생 화면·학생이 받은 응답에 작성자 없음, 학생의 테이블 직접 조회/추가 불가, 내부 함수 호출 불가) → 교사만 작성자 확인 → before/open/closed 규칙과 잘못된 전환 거부 → max_votes(줄여도 기존 표 유지, 초과분 취소) → 자기 질문 투표 → 투표 바꾸기 → 투표 중/종료 후 결과 공개 → 다시 열기 → 질문 숨기기 → 모바일 폭(390px) 가로 스크롤 없음
- **앱 버그는 발견되지 않았습니다.** 고친 것은 테스트 스크립트(선택자, 투표 응답 대기)와 테스트 환경(아래)뿐입니다.
- 두 스크립트 모두 끝나면 테스트 학급을 지웁니다(학생·질문·투표 함께 삭제). **테스트용 교사 계정(`qlab.e2e.*@gmail.com`, `qlab.browser.*@gmail.com`)과 익명 사용자는 Authentication → Users 에 남습니다** (publishable key로는 지울 수 없음). 대시보드에서 지워도 됩니다.
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
| **migration** | ✅ **적용 완료 (2026-10-02)**. 이 브랜치의 `20261001000000_init.sql`을 SQL Editor에서 실행. 그 전에 main의 구버전 migration이 실행되어 있어서 `supabase/dev/reset_app_schema.sql`로 앱 객체만 정리한 뒤 다시 적용 |
| Anonymous Sign-ins | ✅ 켜져 있음. 실제 익명 로그인으로 학생 입장 확인 |
| Confirm email | 꺼져 있음 (`mailer_autoconfirm: true`, 가입하면 바로 로그인). 운영 전 결정 필요 |
| Site URL | 확인하지 않음. 배포 후 Authentication → URL Configuration에서 설정 |

- 세션 안에서는 Supabase DB 접속 정보(비밀번호/연결 문자열)가 없어서 SQL을 직접 실행할 수 없습니다. 스키마 변경은 SQL Editor에서 사람이 실행합니다.
- **이제 실제 DB에 적용되었으므로 `20261001000000_init.sql`은 수정하지 않습니다.** 이후 스키마 변경은 `supabase/migrations/2026MMDDhhmmss_<설명>.sql` 새 파일로 만들고, `./scripts/test-db.sh`가 모든 migration을 순서대로 실행해 테스트합니다.
- `supabase/dev/reset_app_schema.sql`은 **개발 초기화용**입니다(앱 테이블 데이터 전부 삭제, auth.users는 유지). 실제 수업 데이터가 생긴 뒤에는 쓰지 마세요.

## 7. 다음에 할 작업 (순서대로)

1. **main으로 PR 생성** (사용자 확인 후). main에 아직 구버전 migration이 남아 있어 혼동 위험이 있으므로 우선순위가 높습니다.
2. 운영 전 Supabase 설정 결정: Confirm email 켤지, Site URL(배포 주소), 테스트 계정 정리
3. 배포 (vercel.json 있음) 후 배포 주소에서 `BASE_URL=<배포 주소> node scripts/e2e-browser.mjs` 로 한 번 더 확인
4. 작은 미해결 항목 중 필요한 것 선택 (9번: 질문 삭제 버튼, 투표 초기화 등). 스키마가 바뀌면 **새 migration 파일**로
5. 2차 기능 착수 (8번). 첫 후보는 질문 분류 활동 (migration 9번 섹션의 설계 메모 참고, 새 migration 파일로 테이블 추가)

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

1. migration은 2026-10-02 실제 Supabase에 적용했고, 실제 환경 API 검증 58개, 브라우저 검증 34개를 통과했습니다. 로컬 stub(`supabase_stub.sql`)은 실제 Supabase를 단순화한 것이라, 새 migration은 로컬 테스트 후 실제 환경 검증 스크립트로도 확인하세요.
2. **`20261001000000_init.sql`은 실제 DB에 적용되었으므로 더 이상 고치지 않습니다.** 변경은 새 migration 파일로 합니다.
3. **교사 화면에 질문 삭제 버튼이 없습니다.** 숨김만 있고, 삭제는 DB 권한만 있습니다. 필요하면 QuestionsPage에 추가하세요.
4. **투표 초기화 기능이 없습니다.** 다시 열기를 해도 기존 표는 유지됩니다. 새 투표 라운드가 필요하면 `reset_class_votes` 같은 교사 RPC를 추가해야 합니다.
5. 교사 화면의 투표 수에는 숨긴 질문에 한 표도 그대로 표시됩니다. 학생의 개수 계산에서는 빠집니다.
6. **학생 신원 확인이 약합니다**: 클래스 코드 + 번호 + 이름만 알면 같은 학생으로 입장할 수 있습니다. **현재 사용 목적상 허용하기로 결정했습니다 (2026-10-02). 교사 승인·PIN 같은 인증 강화는 이번 범위에서 구현하지 않습니다.**
7. 실시간 갱신이 아니라 폴링입니다(학생 10초, 교사 15초). 설정 변경은 다음 폴링 때 학생 화면에 반영됩니다.
8. `max_votes` 상한 20, 학생 번호 1~99, 질문 300자, 학급 이름 40자, 학생 이름 20자는 임의로 정한 값입니다.
9. 빌드 번들이 500kB를 넘는다는 경고가 있습니다(코드 분할 미적용). lint 경고 10개는 그대로입니다.
10. Confirm email(현재 꺼짐)과 Site URL은 운영 전에 정해야 합니다.
11. `.env` 파일은 저장소에 없습니다. 로컬에서 실행하려면 `.env.example`을 복사해 값을 넣어야 합니다. Claude 클라우드 환경에는 환경 변수로 설정되어 있습니다.
12. GitHub에서 PR #1은 "closed"로 보이지만 main에는 병합 커밋이 있습니다. 새 PR은 이 브랜치에서 main으로 만들면 됩니다.
13. 학생 화면에서 투표 버튼을 빠르게 두 번 누르면 두 번째 클릭은 무시됩니다(처리 중 중복 방지). 버튼이 처리 중임을 따로 표시하지는 않습니다.
14. 테스트 스크립트를 돌릴 때마다 실제 Supabase Auth에 테스트 교사 계정 1개와 익명 사용자 2~3개가 쌓입니다.

## 10. 주요 파일 위치

| 파일 | 내용 |
| --- | --- |
| `supabase/migrations/20261001000000_init.sql` | 전체 스키마, RLS, RPC, 트리거, 권한 (단일 파일) |
| `supabase/tests/voting_test.sql` | DB 테스트 50개 |
| `supabase/tests/supabase_stub.sql` | 로컬 테스트용 Supabase 흉내 |
| `scripts/test-db.sh` | 임시 Postgres로 migration + 테스트 실행 |
| `scripts/e2e-supabase.mjs` | 실제 Supabase API 검증 (`NODE_USE_ENV_PROXY=1 node scripts/e2e-supabase.mjs [--keep]`) |
| `scripts/e2e-browser.mjs` | 실제 Supabase + 브라우저 검증 (`npm run dev` 후 `node scripts/e2e-browser.mjs`, 스크린샷은 `e2e-shots/`) |
| `supabase/dev/reset_app_schema.sql` | 개발 초기화용: public의 앱 객체만 삭제 (auth.users 유지). migration 아님 |
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

현재 상태 요약:
- React + TypeScript + Vite + Tailwind v4 + Supabase 앱. 교사(이메일 로그인), 학생(익명 로그인 + 클래스 코드/번호/이름)
- 질문은 content 만 등록, 학생에게 작성자 비공개, 교사만 작성자 확인
- 학급별 투표 설정: voting_status(before/open/closed, 전환은 DB 트리거로 강제), max_votes, allow_self_vote,
  allow_vote_change, show_results_during_voting, show_results_after_voting. 규칙은 toggle_vote RPC 에서 검사
- 질문 분류 체계 조회 테이블(classification_frameworks/categories)만 있고, 분류 활동 테이블은 init migration 9번에 설계 주석만 있음
- 실제 Supabase(https://ogmsfyuhtrljcubuhclq.supabase.co)에 init migration 적용 완료 (2026-10-02)
- 검증: ./scripts/test-db.sh 50/50, scripts/e2e-supabase.mjs 58/58, scripts/e2e-browser.mjs 34/34,
  npm run build 통과, lint 경고 10개는 기존 것

규칙:
- supabase/migrations/20261001000000_init.sql 은 실제 DB 에 적용되었으므로 수정하지 말고, 스키마 변경은 새 migration 파일로 작성
- 이미 구현된 기능을 다시 만들거나 대규모로 재작성하지 않기
- 실제 Supabase 에 SQL 적용이 필요하면 제가 SQL Editor 에서 실행하므로, 실행할 SQL 과 확인 방법을 먼저 보여 주기
- main 브랜치에는 아직 구버전 migration 이 있으니 SQL 은 항상 이 브랜치 기준으로 안내

먼저 할 일:
1. git 상태(브랜치, 최신 커밋, main 과의 차이)와 ./scripts/test-db.sh, npm run build 결과를 확인해 주세요.
2. PROJECT_STATUS.md 7번 "다음에 할 작업"을 보고 무엇부터 할지 제안해 주세요. 제가 정한 뒤 진행합니다.
```
