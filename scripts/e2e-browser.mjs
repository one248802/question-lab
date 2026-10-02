// 실제 Supabase 를 연결한 앱을 브라우저(Chromium)로 조작해 핵심 흐름을 확인합니다.
//   교사 가입/로그인 → 학급 생성 → 학생 2명 입장 → 질문 작성 → 익명성 → 투표(before/open/closed) → 질문 삭제 → 투표 초기화 → 질문 분류 활동
//
// 실행:
//   1) npm run dev            (다른 터미널, .env 또는 환경 변수에 Supabase 값 필요)
//   2) node scripts/e2e-browser.mjs
//   - BASE_URL(기본 http://localhost:5173), CHROMIUM_PATH(기본 /opt/pw-browsers/chromium), SHOTS_DIR(기본 e2e-shots/)
//   - 매번 새 교사 테스트 계정을 만들고, 끝나면 교사 화면에서 테스트 학급을 지웁니다.
//     교사 계정과 익명 사용자는 Supabase Authentication → Users 에 남습니다.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const SHOTS = resolve(process.env.SHOTS_DIR || 'e2e-shots') + '/'
mkdirSync(SHOTS, { recursive: true })

let passed = 0
let failed = 0
const check = (label, ok, detail) => {
  if (ok) passed++
  else failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || detail === undefined ? '' : `  (${detail})`}`)
}
const shot = (page, name) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  // Playwright 의 proxy 옵션은 localhost 도 프록시로 보내므로 Chromium 인자로 직접 지정
  args: process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1'] : [],
})
const ctx = () => browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR' })
const [tCtx, aCtx, bCtx, mCtx] = await Promise.all([ctx(), ctx(), ctx(), browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })])
const teacher = await tCtx.newPage()
const stuA = await aCtx.newPage()
const stuB = await bCtx.newPage()
// 확인창(window.confirm) 응답. 기본은 '확인', 취소를 시험할 때만 false 로 바꿈
let confirmAnswer = true
for (const p of [teacher, stuA, stuB]) {
  p.on('dialog', (d) => (confirmAnswer ? d.accept() : d.dismiss()))
  p.on('pageerror', (e) => console.log(`     [pageerror] ${e.message}`))
}

// 학생 화면이 받은 list_class_questions 응답 (작성자 정보 노출 확인용)
const studentPayloads = []
stuA.on('response', async (r) => {
  if (r.url().includes('/rpc/list_class_questions') && r.ok()) studentPayloads.push(await r.json().catch(() => null))
})

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
const email = `qlab.browser.${stamp}@gmail.com`
const password = `Br-${stamp}-x9`
const className = `브라우저 테스트 ${stamp.slice(8, 12)}`
const QA = '왜 낙엽은 가을에 떨어질까요?'
const QB = '달은 왜 모양이 바뀔까요?'
const card = (page, text) => page.locator('li', { hasText: text }).first()
const voteBtn = (page, text) => card(page, text).getByRole('button', { name: /투표/ })
// 투표 버튼 클릭 후 서버 처리(toggle_vote)와 목록 새로고침까지 기다림
const clickVote = async (page, text) => {
  const done = page.waitForResponse((r) => r.url().includes('/rpc/list_class_questions'), { timeout: 15000 })
  const voted = page.waitForResponse((r) => r.url().includes('/rpc/toggle_vote'), { timeout: 15000 })
  await voteBtn(page, text).click()
  await voted
  await done
}
const reload = async (page) => {
  await page.reload()
  await page.getByText('우리 반 질문').first().waitFor()
}

try {
  // 1. 교사 회원가입 → 로그아웃 → 로그인 ---------------------------------------
  await teacher.goto(`${BASE}/teacher/login`)
  await teacher.getByRole('radio', { name: '처음이에요 (가입)' }).click()
  await teacher.locator('#displayName').fill('브라우저 선생님')
  await teacher.locator('#email').fill(email)
  await teacher.locator('#password').fill(password)
  await teacher.getByRole('button', { name: '가입하기' }).click()
  await teacher.waitForURL(`${BASE}/teacher`, { timeout: 15000 })
  check('B01 교사 회원가입 후 대시보드 이동', true)
  await teacher.getByRole('button', { name: /로그아웃/ }).click()
  await teacher.waitForURL(/\/($|teacher\/login)/)
  await teacher.goto(`${BASE}/teacher/login`)
  await teacher.locator('#email').fill(email)
  await teacher.locator('#password').fill(password)
  await teacher.getByRole('button', { name: '로그인', exact: true }).click()
  await teacher.waitForURL(`${BASE}/teacher`, { timeout: 15000 })
  check('B02 교사 로그인', true)
  console.log(`     교사 계정: ${email}`)

  // 2. 설정 화면에서 profiles 로 불러온 이메일 확인 -------------------------------
  await teacher.goto(`${BASE}/teacher/settings`)
  await teacher.getByText(email).waitFor({ timeout: 10000 })
  check('B03 profiles 자동 생성 (설정 화면에 내 이메일)', true)

  // 3. 학급 생성 + 클래스 코드 --------------------------------------------------
  await teacher.goto(`${BASE}/teacher/classes`)
  await teacher.locator('#class-name').fill(className)
  await teacher.getByRole('button', { name: '만들기' }).click()
  const codeBtn = teacher.getByTitle('코드 복사').last()
  await codeBtn.waitFor({ timeout: 10000 })
  const classCode = (await codeBtn.innerText()).trim()
  check('B04 학급 생성 + 6자리 클래스 코드 표시', /^[A-Z0-9]{6}$/.test(classCode), classCode)
  await shot(teacher, '01-teacher-classes')

  // 4. 학생 입장 (각자 다른 브라우저 = 다른 익명 로그인) -----------------------------
  for (const [page, num, name] of [[stuA, '1', '김하늘'], [stuB, '2', '이바다']]) {
    await page.goto(`${BASE}/student`)
    await page.locator('#code').fill(classCode.toLowerCase())
    await page.locator('#number').fill(num)
    await page.locator('#name').fill(name)
    await page.getByRole('button', { name: '들어가기' }).click()
    await page.waitForURL(`${BASE}/student/board`, { timeout: 15000 })
    await page.getByText(className).waitFor()
    check(`B05 학생 ${name} 입장 (익명 로그인 + 클래스 코드)`, true)
  }

  // 5. 질문 등록 -----------------------------------------------------------
  for (const [page, text] of [[stuA, QA], [stuB, QB]]) {
    await page.getByLabel('질문 내용').fill(text)
    await page.getByRole('button', { name: '질문 올리기' }).click()
    await page.getByText('질문이 올라갔어요!').waitFor({ timeout: 10000 })
    await card(page, text).waitFor()
  }
  check('B06 학생 두 명 질문 등록 (내용만, 유형 선택 없음)', (await stuA.getByText('질문의 형태').count()) === 0)
  await reload(stuA)

  // 6. 익명성 -------------------------------------------------------------
  const boardText = await stuA.locator('main').innerText()
  check('B07 학생 화면에 다른 학생 이름 없음', !boardText.includes('이바다'), '이바다 노출')
  check('B08 다른 학생 질문은 "익명의 질문"으로 표시', (await card(stuA, QB).innerText()).includes('익명의 질문'))
  check('B09 내 질문에 "내 질문" 표시', (await card(stuA, QA).innerText()).includes('내 질문'))
  const last = studentPayloads.at(-1) ?? []
  const leaked = last.flatMap((q) => Object.keys(q)).filter((k) => /student|name|number/.test(k))
  check('B10 학생 브라우저가 받은 응답에 작성자 필드 없음', last.length === 2 && leaked.length === 0, JSON.stringify(last))
  await shot(stuA, '02-student-board-before')

  await teacher.goto(`${BASE}/teacher/questions`)
  await card(teacher, QB).waitFor({ timeout: 10000 })
  const tA = await card(teacher, QA).innerText()
  const tB = await card(teacher, QB).innerText()
  check('B11 교사 화면에 작성자 표시', tA.includes('1번 김하늘') && tB.includes('2번 이바다'), `${tA} | ${tB}`)
  await shot(teacher, '03-teacher-questions')

  // 7. before -------------------------------------------------------------
  check('B12 before: "투표가 아직 시작되지 않았어요"', await stuA.getByText('투표가 아직 시작되지 않았어요.').first().isVisible())
  check('B13 before: 투표 버튼 비활성', await voteBtn(stuA, QB).isDisabled())

  // 8. open ---------------------------------------------------------------
  await teacher.goto(`${BASE}/teacher/settings`)
  await teacher.getByText('투표 시작 전이에요').waitFor()
  await teacher.getByRole('button', { name: '투표 시작' }).click()
  await teacher.getByText('투표 중이에요').waitFor({ timeout: 10000 })
  check('B14 교사 "투표 시작" → 투표 중', true)
  await shot(teacher, '04-teacher-settings-open')

  await reload(stuA)
  check('B15 open: "남은 표 3 / 3"', await stuA.getByText('투표 중 · 남은 표 3 / 3').isVisible())
  check('B16 open: 자기 질문 투표 버튼 비활성 (자기 투표 금지)', await voteBtn(stuA, QA).isDisabled())
  await clickVote(stuA, QB)
  await stuA.getByText('남은 표 2 / 3').waitFor({ timeout: 10000 })
  check('B17 open: 다른 질문 투표 → 남은 표 2 / 3', (await voteBtn(stuA, QB).getAttribute('aria-pressed')) === 'true')
  check('B18 open: 결과 비공개면 숫자 대신 "투표함"', (await voteBtn(stuA, QB).innerText()).includes('투표함'))
  await clickVote(stuA, QB)
  await stuA.getByText('남은 표 3 / 3').waitFor({ timeout: 10000 })
  check('B19 open: 투표 취소 (바꾸기 허용)', (await voteBtn(stuA, QB).getAttribute('aria-pressed')) === 'false')
  await clickVote(stuA, QB)
  await stuA.getByText('남은 표 2 / 3').waitFor({ timeout: 10000 })

  await reload(stuB)
  await clickVote(stuB, QA)
  await stuB.getByText('남은 표 2 / 3').waitFor({ timeout: 10000 })

  // 결과 공개 (투표 중), 투표 개수 1, 바꾸기 금지
  await teacher.getByRole('switch', { name: `${className} 투표 중 결과 공개` }).click()
  await teacher.waitForTimeout(1500)
  await reload(stuA)
  check('B20 open: 투표 중 결과 공개 ON → 투표 수 숫자 표시', (await voteBtn(stuA, QB).innerText()).trim() === '1', await voteBtn(stuA, QB).innerText())

  await teacher.getByRole('radio', { name: '1개' }).click()
  await teacher.waitForTimeout(1500)
  await teacher.getByRole('switch', { name: `${className} 투표 바꾸기` }).click()
  await teacher.waitForTimeout(1500)
  await reload(stuA)
  check('B21 max_votes=1: "남은 표 0 / 1"', await stuA.getByText('남은 표 0 / 1').isVisible())
  check('B22 바꾸기 금지: 이미 한 투표 취소 버튼 비활성', await voteBtn(stuA, QB).isDisabled())
  check('B23 비활성 이유 표시', (await voteBtn(stuA, QB).getAttribute('title')) === '이번 투표는 바꿀 수 없어요.')
  await shot(stuA, '05-student-board-open')

  // 개수를 줄여도 기존 표 유지 + 초과 시 취소 안내 (B 는 1표 사용 중 → max 1 이면 초과 아님. A 에게 2표를 만들기 위해 3개로 늘렸다가 다시 줄임)
  await teacher.getByRole('switch', { name: `${className} 내 질문에 투표` }).click()
  await teacher.waitForTimeout(800)
  await teacher.getByRole('radio', { name: '3개' }).click()
  await teacher.waitForTimeout(1500)
  await reload(stuA)
  await clickVote(stuA, QA)
  await stuA.getByText('남은 표 1 / 3').waitFor({ timeout: 10000 })
  await teacher.getByRole('radio', { name: '1개' }).click()
  await teacher.waitForTimeout(1500)
  await reload(stuA)
  check('B24 개수를 1로 줄여도 기존 2표 유지 + 취소 안내', await stuA.getByText('투표 1개를 취소해 주세요.').isVisible())
  check('B25 초과 상태: 바꾸기 금지여도 취소 버튼 활성', await voteBtn(stuA, QA).isEnabled())
  await clickVote(stuA, QA)
  await stuA.getByText('남은 표 0 / 1').waitFor({ timeout: 10000 })
  check('B26 초과분 취소 후 한도(1)로 맞춰짐', (await stuA.getByText('취소해 주세요').count()) === 0)

  // 9. closed -------------------------------------------------------------
  await teacher.getByRole('button', { name: '투표 종료' }).click()
  await teacher.getByText('투표가 종료되었어요').waitFor({ timeout: 10000 })
  check('B27 교사 "투표 종료" → 종료, "투표 다시 열기" 버튼 표시', await teacher.getByRole('button', { name: '투표 다시 열기' }).isVisible())
  await reload(stuA)
  check('B28 closed: "투표가 종료되었습니다"', await stuA.getByText('투표가 종료되었습니다.').first().isVisible())
  check('B29 closed: 투표 버튼 모두 비활성', (await voteBtn(stuA, QA).isDisabled()) && (await voteBtn(stuA, QB).isDisabled()))
  check('B30 closed: 종료 후 결과 공개(기본 ON) → 숫자 표시', (await voteBtn(stuA, QB).innerText()).trim() === '1' && (await voteBtn(stuA, QA).innerText()).trim() === '1',
    `${await voteBtn(stuA, QA).innerText()} / ${await voteBtn(stuA, QB).innerText()}`)
  await shot(stuA, '06-student-board-closed')

  await teacher.getByRole('switch', { name: `${className} 투표 종료 후 결과 공개` }).click()
  await teacher.waitForTimeout(1500)
  await reload(stuA)
  check('B31 closed: 종료 후 결과 공개 OFF → 숫자 숨김', !/\d/.test(await voteBtn(stuA, QB).innerText()), await voteBtn(stuA, QB).innerText())

  await teacher.getByRole('button', { name: '투표 다시 열기' }).click()
  await teacher.getByText('투표 중이에요').waitFor({ timeout: 10000 })
  await reload(stuA)
  check('B32 "투표 다시 열기" → 학생 화면 투표 중', await stuA.getByText(/투표 중 · 남은 표/).isVisible())
  await shot(teacher, '07-teacher-settings-reopened')

  // 10. 모바일 폭 레이아웃 (학생 화면) ------------------------------------------
  const mobile = await mCtx.newPage()
  await mobile.goto(`${BASE}/student`)
  await mobile.locator('#code').fill(classCode)
  await mobile.locator('#number').fill('3')
  await mobile.locator('#name').fill('박구름')
  await mobile.getByRole('button', { name: '들어가기' }).click()
  await mobile.waitForURL(`${BASE}/student/board`, { timeout: 15000 })
  await card(mobile, QA).waitFor()
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check('B33 모바일 폭(390px)에서 가로 스크롤 없음', overflow <= 0, `${overflow}px`)
  await shot(mobile, '08-student-mobile')

  // 11. 질문 삭제 (숨기기와 별개, 확인창) -------------------------------------
  await teacher.goto(`${BASE}/teacher/questions`)
  await card(teacher, QB).waitFor({ timeout: 10000 })
  confirmAnswer = false
  await card(teacher, QB).getByRole('button', { name: '삭제' }).click()
  await teacher.waitForTimeout(1000)
  check('B34 삭제 확인창에서 취소하면 질문 유지', await card(teacher, QB).isVisible())
  confirmAnswer = true
  check('B35 숨기기와 삭제 버튼이 따로 있음',
    (await card(teacher, QB).getByRole('button', { name: '숨기기' }).isVisible()) && (await card(teacher, QB).getByRole('button', { name: '삭제' }).isVisible()))
  await card(teacher, QB).getByRole('button', { name: '삭제' }).click()
  await card(teacher, QB).waitFor({ state: 'detached', timeout: 10000 })
  check('B36 확인하면 교사 화면에서 질문 삭제', (await card(teacher, QA).count()) === 1)
  await shot(teacher, '09-teacher-questions-deleted')
  await reload(stuA)
  check('B37 학생 화면에서도 삭제된 질문 안 보임', (await stuA.getByText(QB).count()) === 0)
  check('B38 삭제된 질문의 표는 돌려받음 (남은 표 1 / 1)', await stuA.getByText('남은 표 1 / 1').isVisible())

  // 12. 투표 초기화 (확인창, 설정 유지) ----------------------------------------
  await teacher.goto(`${BASE}/teacher/settings`)
  await teacher.getByText('투표 중이에요').waitFor()
  confirmAnswer = false
  await teacher.getByRole('button', { name: '투표 초기화' }).click()
  await teacher.waitForTimeout(1000)
  check('B39 초기화 확인창에서 취소하면 아무 일 없음', (await teacher.getByText(/표를 초기화했어요/).count()) === 0)
  confirmAnswer = true
  await teacher.getByRole('button', { name: '투표 초기화' }).click()
  await teacher.getByText(/투표 \d+표를 초기화했어요/).waitFor({ timeout: 10000 })
  check('B40 확인하면 초기화 완료 안내', (await teacher.getByText(`「${className}」의 투표 1표를 초기화했어요.`).count()) === 1,
    await teacher.getByRole('status').innerText())
  check('B41 투표 설정 유지 (투표 중, 1개, 바꾸기 OFF)',
    (await teacher.getByText('투표 중이에요').isVisible()) &&
      (await teacher.getByRole('radio', { name: '1개' }).getAttribute('aria-checked')) === 'true' &&
      (await teacher.getByRole('switch', { name: `${className} 투표 바꾸기` }).getAttribute('aria-checked')) === 'false')
  await shot(teacher, '10-teacher-settings-reset')
  await reload(stuB)
  check('B42 학생 B: 투표가 지워져 남은 표 1 / 1', await stuB.getByText('남은 표 1 / 1').isVisible())
  check('B43 학생 B: 질문은 그대로, 투표 표시 해제', (await voteBtn(stuB, QA).getAttribute('aria-pressed')) === 'false')

  // 13. 질문 분류 활동 (tap-to-move) -------------------------------------------
  const QC = '무지개는 왜 둥글까요?'
  const ACT = `분류 활동 ${stamp.slice(8, 12)}`
  await stuA.getByLabel('질문 내용').fill(QC)
  await stuA.getByRole('button', { name: '질문 올리기' }).click()
  await stuA.getByText('질문이 올라갔어요!').waitFor({ timeout: 10000 })

  await teacher.getByRole('link', { name: '질문 분류 활동' }).click()
  await teacher.waitForURL(`${BASE}/teacher/activities`)
  await teacher.getByRole('button', { name: '새 분류 활동' }).click()
  await teacher.locator('#activity-title').fill(ACT)
  await teacher.getByLabel('영역 1 이름').fill('사실')
  await teacher.getByLabel('영역 2 이름').fill('생각')
  await teacher.getByRole('button', { name: '영역 추가' }).click()
  await teacher.getByLabel('영역 3 이름').fill('느낌')
  await teacher.getByRole('button', { name: '모두 선택' }).click()
  await teacher.getByRole('button', { name: '저장' }).click()
  const actCard = teacher.locator('li', { hasText: ACT }).first()
  await actCard.waitFor({ timeout: 10000 })
  const actText = await actCard.innerText()
  check('B44 교사 분류 활동 만들기 (비공개, 영역 3개, 질문 2개)',
    actText.includes('비공개') && ['사실', '생각', '느낌'].every((n) => actText.includes(n)) && actText.includes('질문 2개'), actText)
  await shot(teacher, '11-teacher-activities')

  await reload(stuA)
  check('B45 공개 전: 학생 화면에 분류 활동 없음', (await stuA.getByRole('link', { name: new RegExp(ACT) }).count()) === 0)
  await teacher.getByRole('switch', { name: `${ACT} 학생에게 공개` }).click()
  await actCard.getByText('학생에게 공개', { exact: true }).waitFor({ timeout: 10000 })
  await reload(stuA)
  const actLink = stuA.getByRole('link', { name: new RegExp(ACT) })
  check('B46 공개 후: 학생 게시판에 분류 활동 표시', (await actLink.innerText()).includes('질문 2개 · 영역 3개'), await actLink.innerText())
  await actLink.click()
  await stuA.waitForURL(/\/student\/activity\//)
  const tray = stuA.getByRole('region', { name: '아직 분류하지 않은 질문' })
  const zone = (name) => stuA.getByRole('region', { name })
  await tray.getByRole('button', { name: QA }).waitFor({ timeout: 10000 })
  check('B47 분류 화면: 질문 2개가 미분류, 영역 3개',
    (await tray.getByRole('button').count()) === 2 && (await zone('사실').count()) === 1 && (await zone('느낌').count()) === 1)
  const pageText = await stuA.locator('main').innerText()
  check('B48 분류 화면에 작성자 정보 없음', !/김하늘|이바다|\d+번/.test(pageText), pageText.slice(0, 200))

  await tray.getByRole('button', { name: QA }).click()
  check('B49 카드를 누르면 선택되고 「여기에 놓기」 표시',
    (await tray.getByRole('button', { name: QA }).getAttribute('aria-pressed')) === 'true' &&
      (await stuA.getByRole('button', { name: '여기에 놓기' }).count()) === 3)
  await zone('사실').getByRole('button', { name: '여기에 놓기' }).click()
  check('B50 「사실」 영역으로 이동', (await zone('사실').getByRole('button', { name: QA }).count()) === 1 && (await tray.getByRole('button').count()) === 1)
  await zone('사실').getByRole('button', { name: QA }).click()
  await zone('생각').getByRole('button', { name: '여기에 놓기' }).click()
  await tray.getByRole('button', { name: QC }).click()
  await zone('느낌').getByRole('button', { name: '여기에 놓기' }).click()
  check('B51 다른 영역으로 다시 옮기기',
    (await zone('생각').getByRole('button', { name: QA }).count()) === 1 && (await zone('사실').getByRole('button').count()) === 0 &&
      (await zone('느낌').getByRole('button', { name: QC }).count()) === 1)
  await shot(stuA, '12-student-activity')
  await stuA.reload()
  await zone('생각').getByRole('button', { name: QA }).waitFor({ timeout: 10000 })
  check('B52 새로고침해도 배치 유지 (sessionStorage)', (await zone('느낌').getByRole('button', { name: QC }).count()) === 1)
  const stored = await stuA.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('qlab:classify:')).length)
  check('B53 배치는 이 탭의 sessionStorage 에만 있음', stored === 1, String(stored))

  await stuB.goto(`${BASE}${new URL(stuA.url()).pathname}`)
  await stuB.getByRole('region', { name: '아직 분류하지 않은 질문' }).getByRole('button', { name: QA }).waitFor({ timeout: 10000 })
  check('B54 다른 학생은 자기 화면에서 처음부터 (배치 공유 안 됨)',
    (await stuB.getByRole('region', { name: '아직 분류하지 않은 질문' }).getByRole('button').count()) === 2)

  await stuA.getByRole('button', { name: '처음으로' }).click()
  await tray.getByRole('button', { name: QA }).waitFor({ timeout: 5000 })
  check('B55 「처음으로」: 모두 미분류로', (await tray.getByRole('button').count()) === 2)

  await actCard.getByRole('button', { name: '수정' }).click()
  await teacher.getByLabel('영역 3 이름').fill('궁금함')
  await teacher.getByRole('button', { name: '저장' }).click()
  await actCard.getByText('궁금함').waitFor({ timeout: 10000 })
  await stuA.getByRole('button', { name: '새로고침' }).click()
  await zone('궁금함').waitFor({ timeout: 10000 })
  check('B56 교사가 영역 이름 수정 → 학생 새로고침 시 반영', (await zone('느낌').count()) === 0)

  await teacher.getByRole('switch', { name: `${ACT} 학생에게 공개` }).click()
  await actCard.getByText('비공개', { exact: true }).waitFor({ timeout: 10000 })
  await stuA.getByRole('button', { name: '새로고침' }).click()
  await stuA.getByText('분류 활동을 열 수 없어요').waitFor({ timeout: 10000 })
  check('B57 비공개로 바꾸면 학생은 열 수 없음', true)

  await actCard.getByRole('button', { name: '삭제' }).click()
  await actCard.waitFor({ state: 'detached', timeout: 10000 })
  check('B58 교사 활동 삭제 (확인창)', true)
  await stuA.goto(`${BASE}/student/board`)
  await card(stuA, QC).waitFor({ timeout: 10000 })
  check('B59 활동을 지워도 질문은 그대로', (await card(stuA, QA).count()) === 1 && (await card(stuA, QC).count()) === 1)
} catch (e) {
  failed++
  console.log(`FAIL 중단: ${e.message.split('\n')[0]}`)
  await Promise.all([shot(teacher, 'zz-teacher-fail'), shot(stuA, 'zz-studentA-fail')]).catch(() => {})
} finally {
  // 정리: 교사 화면에서 테스트 학급 삭제 (학생·질문·투표 함께 삭제)
  try {
    await teacher.goto(`${BASE}/teacher/classes`)
    // 이 테스트 계정의 학급은 하나뿐
    await teacher.getByRole('button', { name: '학급 지우기' }).click({ timeout: 8000 })
    await teacher.getByRole('button', { name: '학급 지우기' }).waitFor({ state: 'detached', timeout: 10000 })
    console.log('     테스트 학급 삭제 완료 (교사 화면의 삭제 버튼)')
  } catch (e) {
    console.log(`     테스트 학급 삭제 실패: ${e.message.split('\n')[0]}`)
  }
  await browser.close()
  console.log(`== ${passed} passed, ${failed} failed  (screenshots: ${SHOTS})`)
  process.exit(failed ? 1 : 0)
}
