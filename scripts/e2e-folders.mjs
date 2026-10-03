// 교사 질문 화면의 날짜별 보기 · 질문 선택 · 질문 폴더를 브라우저(Chromium)로 확인합니다.
//   A. 화면 동작: 실제 Supabase 로 교사·학급을 만들고, 질문 목록과 폴더 테이블 응답만 가짜(메모리)로 바꿔
//      날짜가 다른 질문 12개로 날짜 필터·선택·폴더 넣기/빼기/이름 바꾸기/지우기를 확인
//   B. 실제 DB: 실제 Supabase 에 question_folders migration 이 적용돼 있을 때만 실행 (없으면 SKIP)
//      학생 2명이 실제 질문을 올리고, 교사 화면에서 폴더에 넣기 → 빼기 → 폴더 삭제 → 질문 삭제 시 연결 삭제 확인
//
// 실행:
//   1) npm run dev            (다른 터미널, .env 또는 환경 변수에 Supabase 값 필요)
//   2) node scripts/e2e-folders.mjs
//   - ONLY_MOCK=1 이면 A 만 실행 (실제 DB 구간 B 는 건너뜀)
//   - 끝나면 테스트 학급을 지웁니다. 교사 계정(qlab.folder.*@gmail.com)과 익명 사용자는 Authentication → Users 에 남습니다.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const SHOTS = resolve(process.env.SHOTS_DIR || 'e2e-shots') + '/'
const SB_URL = process.env.VITE_SUPABASE_URL
const SB_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
mkdirSync(SHOTS, { recursive: true })

let passed = 0
let failed = 0
let skipped = 0
const check = (label, ok, detail) => {
  if (ok) passed++
  else failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || detail === undefined ? '' : `  (${detail})`}`)
}
const shot = (page, name) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  env: { ...process.env, LANG: process.env.LANG || 'C.UTF-8' },
  args: process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1'] : [],
})
const newPage = async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log(`     [pageerror] ${e.message}`))
  return page
}
const teacher = await newPage()
// 확인창: 기본은 '확인'. prompt 는 promptAnswer 로 답함
let promptAnswer = null
teacher.on('dialog', (d) => (d.type() === 'prompt' ? (promptAnswer === null ? d.dismiss() : d.accept(promptAnswer)) : d.accept()))

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
const email = `qlab.folder.${stamp}@gmail.com`
const className = `폴더 테스트 ${stamp.slice(8, 14)}`

const card = (text) => teacher.locator('li', { hasText: text }).first()
const cardCount = () => teacher.locator('ul > li').count()
const waitCards = async (n, timeout = 8000) =>
  teacher
    .waitForFunction((k) => document.querySelectorAll('ul > li').length === k, n, { timeout })
    .then(() => true)
    .catch(() => false)
const chip = (name) => teacher.getByRole('radiogroup', { name: '폴더' }).getByRole('radio', { name: new RegExp(`^${name}`) })
const chipCount = async (name) => {
  const text = await chip(name).innerText()
  return Number(text.match(/(\d+)\s*$/)?.[1] ?? NaN)
}
// 폴더 칩의 질문 수가 n 이 될 때까지 기다림
const waitChip = (name, n, timeout = 8000) =>
  teacher
    .waitForFunction(
      ([nm, k]) =>
        [...document.querySelectorAll('[role="radiogroup"][aria-label="폴더"] [role="radio"]')].some((b) => {
          const t = b.textContent.trim()
          return t.startsWith(nm) && Number(t.match(/(\d+)$/)?.[1]) === k
        }),
      [name, n],
      { timeout },
    )
    .then(() => true)
    .catch(() => false)
const selectedText = () => teacher.getByText(/개 질문 선택됨$/).innerText()
const pick = (text) => card(text).getByRole('checkbox').check()

// ---------------------------------------------------------------------
// A. 가짜 질문 + 메모리 폴더
// ---------------------------------------------------------------------
const DAY = 86400000
/** 서울 기준 '오늘 0시'로부터 며칠 전 몇 시 */
const seoulMidnight = (() => {
  const now = new Date()
  const s = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const offset = now.getTime() - s.getTime() // 이 컴퓨터 시간 - 서울 시간
  s.setHours(0, 0, 0, 0)
  return s.getTime() + offset
})()
const at = (daysAgo, hour) => new Date(seoulMidnight - daysAgo * DAY + hour * 3600000).toISOString()
const seoulDay = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })).getDay() // 0=일
const daysSinceMonday = (seoulDay + 6) % 7

const mockQuestions = [
  ['오늘 질문 1', 0, 9],
  ['오늘 질문 2', 0, 0.1],
  ['오늘 질문 3 (숨김)', 0, 8],
  ['어제 질문 1', 1, 10],
  ['어제 질문 2', 1, 23.9],
  ['사흘 전 질문', 3, 11],
  ['열흘 전 질문 1', 10, 9],
  ['열흘 전 질문 2', 10, 14],
  ['한 달 전 질문 1', 30, 9],
  ['한 달 전 질문 2', 30, 10],
  ['한 달 전 질문 3', 30, 11],
  ['석 달 전 질문', 90, 9],
].map(([content, daysAgo, hour], i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  class_id: null,
  student_id: '00000000-0000-4000-8000-0000000000bb',
  content,
  is_hidden: content.includes('숨김'),
  created_at: at(daysAgo, hour),
  daysAgo,
  student: { student_number: (i % 3) + 1, name: ['김하늘', '이바다', '박구름'][i % 3] },
  votes: [{ count: i % 4 }],
}))
const expectWeek = mockQuestions.filter((q) => q.daysAgo <= daysSinceMonday).length

const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body) })
const param = (url, key) => new URL(url).searchParams.get(key)
const eqVal = (url, key) => param(url, key)?.replace(/^eq\./, '')

async function mockBackend(page, classId) {
  const db = { folders: [], items: [], questions: mockQuestions.map((q) => ({ ...q, class_id: classId })) }
  let seq = 0
  await page.route('**/rest/v1/questions?**', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') return json(route, 200, db.questions)
    if (req.method() === 'DELETE') {
      const id = eqVal(req.url(), 'id')
      db.questions = db.questions.filter((q) => q.id !== id)
      db.items = db.items.filter((i) => i.question_id !== id) // on delete cascade
      return json(route, 200, [{ id }])
    }
    if (req.method() === 'PATCH') {
      const id = eqVal(req.url(), 'id')
      Object.assign(db.questions.find((q) => q.id === id) ?? {}, req.postDataJSON())
      return json(route, 204)
    }
    return route.continue()
  })
  await page.route('**/rest/v1/question_folders?**', async (route) => {
    const req = route.request()
    const url = req.url()
    if (req.method() === 'GET') {
      return json(
        route,
        200,
        db.folders.map((f) => ({ ...f, question_folder_items: db.items.filter((i) => i.folder_id === f.id).map((i) => ({ question_id: i.question_id })) })),
      )
    }
    if (req.method() === 'POST') {
      const body = req.postDataJSON()
      if (db.folders.some((f) => f.class_id === body.class_id && f.name === body.name))
        return json(route, 409, { code: '23505', message: 'duplicate key value violates unique constraint "question_folders_class_name_unique"' })
      const folder = { id: `f0000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, class_id: body.class_id, name: body.name, created_at: new Date().toISOString() }
      db.folders.push(folder)
      return json(route, 201, (req.headers().accept ?? '').includes('object') ? folder : [folder])
    }
    if (req.method() === 'PATCH') {
      Object.assign(db.folders.find((f) => f.id === eqVal(url, 'id')) ?? {}, req.postDataJSON())
      return json(route, 204)
    }
    if (req.method() === 'DELETE') {
      const id = eqVal(url, 'id')
      db.folders = db.folders.filter((f) => f.id !== id)
      db.items = db.items.filter((i) => i.folder_id !== id) // on delete cascade
      return json(route, 204)
    }
    return route.continue()
  })
  await page.route('**/rest/v1/question_folder_items**', async (route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      for (const row of req.postDataJSON()) {
        if (db.items.some((i) => i.folder_id === row.folder_id && i.question_id === row.question_id))
          return json(route, 409, { code: '23505', message: 'duplicate key value violates unique constraint "question_folder_items_pkey"' })
        db.items.push(row)
      }
      return json(route, 201)
    }
    if (req.method() === 'DELETE') {
      const folder = eqVal(req.url(), 'folder_id')
      const ids = (param(req.url(), 'question_id') ?? '').replace(/^in\.\(|\)$/g, '').split(',').map((s) => s.replace(/"/g, ''))
      db.items = db.items.filter((i) => !(i.folder_id === folder && ids.includes(i.question_id)))
      return json(route, 204)
    }
    return route.continue()
  })
  return db
}

const setDate = async (label) => teacher.getByRole('radio', { name: label, exact: true }).click()

try {
  // ---- 준비: 실제 교사 + 학급 ----
  await teacher.goto(`${BASE}/teacher/login`)
  await teacher.getByRole('radio', { name: '처음이에요 (가입)' }).click()
  await teacher.locator('#email').fill(email)
  await teacher.locator('#password').fill(`Fd-${stamp}-q4`)
  await teacher.getByRole('button', { name: '가입하기' }).click()
  await teacher.waitForURL(`${BASE}/teacher`, { timeout: 15000 })
  await teacher.goto(`${BASE}/teacher/classes`)
  await teacher.locator('#class-name').fill(className)
  await teacher.getByRole('button', { name: '만들기' }).click()
  await teacher.getByText(className, { exact: true }).waitFor({ timeout: 15000 })
  const classId = await teacher.evaluate(() => localStorage.getItem('qlab:selected-class-id') ?? Object.entries(localStorage).find(([k]) => k.includes('selected'))?.[1] ?? null)

  console.log('== A. 날짜별 보기 · 선택 · 폴더 (가짜 질문 12개)')
  const db = await mockBackend(teacher, classId)
  await teacher.goto(`${BASE}/teacher/questions`)
  await card('석 달 전 질문').waitFor({ timeout: 10000 })

  // 날짜 필터
  check('A01 날짜 필터 기본 "전체" → 12개', (await cardCount()) === 12)
  await setDate('오늘')
  check('A02 "오늘" → 오늘 0시~ 질문 3개 (0시 6분 질문 포함)', await waitCards(3), String(await cardCount()))
  await setDate('이번 주')
  check(`A03 "이번 주"(월요일부터) → ${expectWeek}개`, await waitCards(expectWeek), String(await cardCount()))
  await setDate('날짜 선택')
  const dateInput = teacher.getByLabel('질문 날짜')
  const yesterday = await teacher.evaluate(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  await dateInput.fill(yesterday)
  check('A04 "날짜 선택" 어제 → 어제 질문 2개 (밤 11시 54분 질문 포함)', await waitCards(2), String(await cardCount()))
  await teacher.getByRole('radio', { name: '숨김', exact: true }).click()
  await setDate('오늘')
  check('A05 날짜 필터와 공개/숨김 필터 함께 → 오늘 + 숨김 1개', await waitCards(1))
  await teacher.getByRole('radio', { name: '모두', exact: true }).click()
  await setDate('전체')
  await waitCards(12)

  // 선택
  check('A06 처음에는 0개 선택됨', (await selectedText()) === '0개 질문 선택됨')
  await teacher.getByRole('button', { name: '전체 선택' }).click()
  check('A07 "전체 선택" → 보이는 12개 선택됨', (await selectedText()) === '12개 질문 선택됨')
  await teacher.getByRole('button', { name: '선택 해제' }).click()
  check('A08 "선택 해제" → 0개', (await selectedText()) === '0개 질문 선택됨')
  for (const q of ['한 달 전 질문 1', '한 달 전 질문 2', '열흘 전 질문 1']) await pick(q)
  check('A09 카드 체크박스로 3개 선택', (await selectedText()) === '3개 질문 선택됨')

  // 폴더에 넣기 → 새 폴더 만들고 넣기
  await teacher.getByRole('button', { name: '폴더에 넣기' }).click()
  await teacher.getByLabel('새 폴더 이름').last().fill('역사 질문')
  await teacher.getByRole('button', { name: '새 폴더 만들고 넣기' }).click()
  await teacher.getByText('「역사 질문」 폴더에 3개 넣었어요').waitFor({ timeout: 5000 })
  check('A10 "폴더에 넣기 → 새 폴더 만들고 넣기" → 역사 질문 3개, 선택은 해제', (await chipCount('역사 질문')) === 3 && (await selectedText()) === '0개 질문 선택됨')
  check('A11 카드에 폴더 이름 표시', await card('한 달 전 질문 1').getByText('역사 질문').isVisible())

  // 새 폴더(폴더 줄의 + 새 폴더) 후 기존 폴더에 넣기, 한 질문을 여러 폴더에
  await teacher.getByRole('button', { name: '새 폴더', exact: true }).click()
  await teacher.getByLabel('새 폴더 이름').fill('좋은 질문')
  await teacher.getByRole('button', { name: '폴더 만들기' }).click()
  await chip('좋은 질문').waitFor({ timeout: 5000 })
  check('A12 "+ 새 폴더"로 빈 폴더 만들기 (0개)', (await chipCount('좋은 질문')) === 0)
  await teacher.getByRole('button', { name: '새 폴더', exact: true }).click()
  await teacher.getByLabel('새 폴더 이름').fill('역사 질문')
  await teacher.getByRole('button', { name: '폴더 만들기' }).click()
  const dupShown = await teacher
    .getByText('이미 같은 이름의 폴더가 있어요.')
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  check('A13 같은 이름 폴더는 안내하고 만들지 않음', dupShown && db.folders.length === 2)
  await teacher.getByRole('button', { name: '취소' }).click()

  for (const q of ['한 달 전 질문 1', '오늘 질문 1']) await pick(q)
  await teacher.getByRole('button', { name: '폴더에 넣기' }).click()
  await teacher.locator('div', { hasText: /^선택한 2개 질문을 넣을 폴더를 고르세요/ }).first().waitFor()
  await teacher.getByRole('button', { name: '좋은 질문', exact: true }).click()
  await teacher.getByText('「좋은 질문」 폴더에 2개 넣었어요').waitFor({ timeout: 5000 })
  check('A14 한 질문을 여러 폴더에 (한 달 전 질문 1 = 역사·좋은 질문)', (await card('한 달 전 질문 1').getByText(/역사 질문|좋은 질문/).count()) === 2)

  await pick('한 달 전 질문 1')
  await pick('한 달 전 질문 3')
  await teacher.getByRole('button', { name: '폴더에 넣기' }).click()
  await teacher.getByRole('button', { name: '역사 질문', exact: true }).click()
  await teacher.getByText(/「역사 질문」 폴더에 1개 넣었어요 \(이미 든 1개 제외\)/).waitFor({ timeout: 5000 })
  check('A15 이미 든 질문은 건너뛰고 나머지만 넣음 (역사 질문 4개)', (await chipCount('역사 질문')) === 4 && db.items.length === 6)

  // 폴더 필터 + 날짜 필터
  await chip('역사 질문').click()
  check('A16 폴더 필터 "역사 질문" → 4개', await waitCards(4))
  await setDate('날짜 선택')
  await dateInput.fill(await teacher.evaluate(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }))
  check('A17 폴더 필터 + 날짜 선택(30일 전) 함께 → 3개', await waitCards(3), String(await cardCount()))
  await setDate('전체')
  await waitCards(4)
  await shot(teacher, 'folders-01-history')

  // 폴더에서 빼기 → 질문은 그대로
  await pick('열흘 전 질문 1')
  await teacher.getByRole('button', { name: '이 폴더에서 빼기' }).click()
  await teacher.getByText('「역사 질문」 폴더에서 1개 뺐어요').waitFor({ timeout: 5000 })
  check('A18 폴더에서 빼기 → 폴더 3개, 질문 원본은 그대로 12개', (await waitCards(3)) && (await chipCount('역사 질문')) === 3 && db.questions.length === 12)

  // 이름 바꾸기
  promptAnswer = '다음 시간에 탐구할 질문'
  await teacher.getByRole('button', { name: '이름 바꾸기' }).click()
  await chip('다음 시간에 탐구할 질문').waitFor({ timeout: 5000 })
  check('A19 폴더 이름 바꾸기', (await chipCount('다음 시간에 탐구할 질문')) === 3)
  promptAnswer = null

  // 질문 삭제 → 연결만 사라짐
  await card('한 달 전 질문 3').getByRole('button', { name: '삭제' }).click()
  await teacher.waitForFunction(() => !document.body.innerText.includes('한 달 전 질문 3'), null, { timeout: 5000 })
  check('A20 폴더 안 질문을 삭제하면 그 연결만 없어짐 (폴더 2개)', (await waitChip('다음 시간에 탐구할 질문', 2)) && db.questions.length === 11)

  // 폴더 지우기 → 질문은 그대로
  await teacher.getByRole('button', { name: '폴더 지우기' }).click()
  await teacher.getByText('폴더를 지웠어요. 질문은 그대로예요.').waitFor({ timeout: 5000 })
  check(
    'A21 폴더 지우기 → 전체 질문으로 돌아오고 질문 11개 그대로',
    (await waitCards(11)) && (await chip('다음 시간에 탐구할 질문').count()) === 0 && db.questions.length === 11,
  )
  check('A22 숨기기/삭제 버튼과 작성자·투표 수 표시 그대로', (await card('오늘 질문 1').getByRole('button', { name: '숨기기' }).isVisible()) && (await card('오늘 질문 1').getByText(/\d+표/).isVisible()))
  await teacher.setViewportSize({ width: 390, height: 844 })
  check('A23 휴대폰 폭(390px)에서 가로 스크롤 없음', await teacher.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  await shot(teacher, 'folders-02-mobile')
  await teacher.setViewportSize({ width: 1280, height: 900 })

  // 「폴더 없음」 가상 필터: 지금 폴더는 「좋은 질문」(한 달 전 질문 1, 오늘 질문 1)만 남음, 질문 11개
  const noFolder = chip('폴더 없음')
  check('A24 "폴더 없음 9" (어느 폴더에도 없는 질문 수)', await waitChip('폴더 없음', 9))
  await noFolder.click()
  check('A25 "폴더 없음" → 폴더에 든 질문(한 달 전 질문 1, 오늘 질문 1)은 빠지고 9개', (await waitCards(9)) && (await card('한 달 전 질문 1').count()) === 0 && (await card('오늘 질문 1').count()) === 0)
  check(
    'A26 "폴더 없음"에는 이름 바꾸기·폴더 지우기·이 폴더에서 빼기 없음',
    (await teacher.getByRole('button', { name: '이름 바꾸기' }).count()) === 0 &&
      (await teacher.getByRole('button', { name: '폴더 지우기' }).count()) === 0 &&
      (await teacher.getByRole('button', { name: '이 폴더에서 빼기' }).count()) === 0,
  )
  await setDate('오늘')
  const todayNoFolder = await waitCards(2)
  await teacher.getByRole('radio', { name: '숨김', exact: true }).click()
  const todayHiddenNoFolder = await waitCards(1)
  await teacher.getByRole('radio', { name: '모두', exact: true }).click()
  await setDate('전체')
  await teacher.getByRole('radio', { name: '투표순', exact: true }).click()
  const sortedNoFolder = await waitCards(9)
  await teacher.getByRole('radio', { name: '최신순', exact: true }).click()
  check('A27 날짜(오늘 2개)·숨김(1개)·정렬과 함께 사용', todayNoFolder && todayHiddenNoFolder && sortedNoFolder)

  await pick('오늘 질문 2')
  await pick('사흘 전 질문')
  await teacher.getByRole('button', { name: '폴더에 넣기' }).click()
  await teacher.getByRole('button', { name: '좋은 질문', exact: true }).click()
  await teacher.getByText('「좋은 질문」 폴더에 2개 넣었어요').waitFor({ timeout: 5000 })
  check(
    'A28 "폴더 없음"에서 골라 폴더에 넣기 → 바로 사라지고 폴더 없음 7, 좋은 질문 4',
    (await waitCards(7)) && (await waitChip('폴더 없음', 7)) && (await waitChip('좋은 질문', 4)) && (await card('사흘 전 질문').count()) === 0,
  )
  await shot(teacher, 'folders-03-no-folder')
  await teacher.unrouteAll({ behavior: 'ignoreErrors' })

  // -------------------------------------------------------------------
  // B. 실제 DB (migration 적용 시)
  // -------------------------------------------------------------------
  console.log('== B. 실제 Supabase 폴더 테이블')
  const probe = process.env.ONLY_MOCK ? { status: -1, body: '' } : await fetch(`${SB_URL}/rest/v1/question_folders?select=id&limit=1`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } })
    .then(async (r) => ({ status: r.status, body: await r.text() }))
    .catch((e) => ({ status: 0, body: String(e) }))
  if (probe.status === -1) {
    skipped++
    console.log('SKIP B: ONLY_MOCK=1')
  } else if (probe.status === 404 || probe.body.includes('PGRST205')) {
    skipped++
    console.log('SKIP B: 실제 Supabase 에 question_folders 테이블이 아직 없음 (migration 적용 후 다시 실행)')
  } else {
    const code = (await teacher.getByTitle('코드 복사').first().innerText().catch(() => '')).trim()
    const classCode =
      code ||
      (await (async () => {
        await teacher.goto(`${BASE}/teacher/classes`)
        return (await teacher.getByTitle('코드 복사').first().innerText()).trim()
      })())
    const students = []
    for (const [num, name, text] of [
      [1, '김하늘', '실제 질문 하나'],
      [2, '이바다', '실제 질문 둘'],
    ]) {
      const p = await newPage()
      await p.goto(`${BASE}/student`)
      await p.locator('#code').fill(classCode)
      await p.locator('#number').fill(String(num))
      await p.locator('#name').fill(name)
      await p.getByRole('button', { name: '들어가기' }).click()
      await p.waitForURL(`${BASE}/student/board`, { timeout: 15000 })
      await p.getByLabel('질문 내용').fill(text)
      await p.getByRole('button', { name: '질문 올리기' }).click()
      await p.getByText('질문이 올라갔어요!').waitFor({ timeout: 10000 })
      students.push(p)
    }
    await teacher.goto(`${BASE}/teacher/questions`)
    await card('실제 질문 둘').waitFor({ timeout: 10000 })
    await pick('실제 질문 하나')
    await pick('실제 질문 둘')
    await teacher.getByRole('button', { name: '폴더에 넣기' }).click()
    await teacher.getByLabel('새 폴더 이름').last().fill('과학 질문')
    await teacher.getByRole('button', { name: '새 폴더 만들고 넣기' }).click()
    await teacher.getByText('「과학 질문」 폴더에 2개 넣었어요').waitFor({ timeout: 10000 })
    check('B01 실제 DB: 새 폴더 만들고 질문 2개 넣기', (await chipCount('과학 질문')) === 2)
    await teacher.reload()
    await chip('과학 질문').waitFor({ timeout: 10000 })
    check('B02 새로고침 후에도 폴더와 질문 수 유지', (await chipCount('과학 질문')) === 2)

    await chip('과학 질문').click()
    await waitCards(2)
    await pick('실제 질문 하나')
    await teacher.getByRole('button', { name: '이 폴더에서 빼기' }).click()
    await teacher.getByText('「과학 질문」 폴더에서 1개 뺐어요').waitFor({ timeout: 10000 })
    // 안내가 먼저 뜨고 폴더 수는 다시 불러온 뒤 바뀌므로, 숫자가 실제로 갱신될 때까지 기다림
    check('B03 실제 DB: 폴더에서 빼기 → 폴더 1개, 전체 질문 2개 그대로', (await waitChip('과학 질문', 1, 10000)) && (await waitChip('전체 질문', 2, 10000)))

    await teacher.getByRole('button', { name: '폴더 지우기' }).click()
    await teacher.getByText('폴더를 지웠어요. 질문은 그대로예요.').waitFor({ timeout: 10000 })
    await waitCards(2)
    check('B04 실제 DB: 폴더 지우기 → 질문 2개 그대로', (await cardCount()) === 2)

    await pick('실제 질문 둘')
    await teacher.getByRole('button', { name: '폴더에 넣기' }).click()
    await teacher.getByLabel('새 폴더 이름').last().fill('좋은 질문')
    await teacher.getByRole('button', { name: '새 폴더 만들고 넣기' }).click()
    await teacher.getByText('「좋은 질문」 폴더에 1개 넣었어요').waitFor({ timeout: 10000 })
    // 화면에서는 카드가 먼저 사라지므로, 삭제 요청이 서버에서 끝난 뒤에 새로고침 (먼저 새로고침하면 요청이 끊김)
    const deleteDone = teacher.waitForResponse((r) => r.url().includes('/rest/v1/questions') && r.request().method() === 'DELETE', { timeout: 10000 })
    await card('실제 질문 둘').getByRole('button', { name: '삭제' }).click()
    const deleteRes = await deleteDone
    await teacher.waitForFunction(() => !document.body.innerText.includes('실제 질문 둘'), null, { timeout: 10000 })
    await teacher.reload()
    await card('실제 질문 하나').waitFor({ timeout: 10000 })
    check(
      'B05 실제 DB: 폴더 안 질문 삭제 → 폴더는 남고 연결만 없어짐 (0개), 전체 질문 1개',
      deleteRes.ok() && (await waitChip('좋은 질문', 0, 10000)) && (await waitChip('전체 질문', 1, 10000)),
    )

    const s = students[0]
    await s.reload()
    await s.getByText('실제 질문 하나').waitFor({ timeout: 10000 })
    check('B06 학생 게시판은 그대로 (폴더 표시 없음)', (await s.getByText('좋은 질문').count()) === 0)
    for (const p of students) await p.context().close()
  }
} catch (e) {
  failed++
  console.log(`FAIL 예외: ${e.stack || e}`)
  await shot(teacher, 'folders-zz-fail').catch(() => {})
} finally {
  try {
    await teacher.unrouteAll({ behavior: 'ignoreErrors' })
    await teacher.goto(`${BASE}/teacher/classes`)
    await teacher.getByRole('button', { name: '학급 지우기' }).click({ timeout: 8000 })
    await teacher.getByRole('button', { name: '학급 지우기' }).waitFor({ state: 'detached', timeout: 10000 })
    console.log('     테스트 학급 삭제 완료')
  } catch (e) {
    console.log(`     테스트 학급 삭제 실패: ${e.message.split('\n')[0]}`)
  }
  await browser.close()
  console.log(`== ${passed} passed, ${failed} failed, ${skipped} skipped  (screenshots: ${SHOTS})`)
  process.exitCode = failed ? 1 : 0
}
