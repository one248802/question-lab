// 질문 카드 배치(1~3열)와 대시보드 학생 수 → 학생 관리 이동을 브라우저(Chromium)로 확인합니다.
//   - 실제 Supabase: 테스트 교사 가입, 학급 2개, 학생 추가(교사 화면), 학생 1명 입장
//   - 질문 목록은 30개를 화면에 넣어 보기 위해 목록 응답만 가짜로 바꿈 (실제 질문은 만들지 않음)
//
// 실행:
//   1) npm run dev            (다른 터미널)
//   2) node scripts/e2e-ux.mjs
//   - 끝나면 테스트 학급을 지웁니다. 교사 계정(qlab.ux.*@gmail.com)과 익명 사용자는 Authentication → Users 에 남습니다.
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
  env: { ...process.env, LANG: process.env.LANG || 'C.UTF-8' },
  args: process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1'] : [],
})
const tCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR' })
const sCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR' })
const teacher = await tCtx.newPage()
const student = await sCtx.newPage()
for (const p of [teacher, student]) {
  p.on('dialog', (d) => d.accept())
  p.on('pageerror', (e) => console.log(`     [pageerror] ${e.message}`))
}

// ---- 가짜 질문 30개 (짧은 것, 3~4줄, 아주 긴 것, 띄어쓰기 없는 긴 글자 섞음) ----
const SAMPLES = [
  '왜 하늘은 파래요?',
  '달은 왜 모양이 바뀔까요? 매일 밤 조금씩 달라 보이는데 진짜로 달의 모양이 변하는 건지, 아니면 우리가 보는 방향 때문인지 궁금해요.',
  '식물은 햇빛이 없으면 어떻게 될까요? 교실 구석에 있는 화분은 창가에 있는 화분보다 잎이 작고 색이 연한데, 빛이 얼마나 있어야 잘 자라는지 알고 싶어요. 그리고 전등 불빛으로도 광합성을 할 수 있나요?',
  '공룡은 왜 멸종했어요?',
  '바닷물은 왜 짤까요? 강물은 짜지 않은데 강물이 바다로 흘러가면 왜 바다만 짜게 되는지 궁금합니다.',
  'Supercalifragilisticexpialidocious_띄어쓰기없이아주긴글자도카드밖으로넘치지않는지확인합니다',
]
const now = Date.now()
const boardQuestions = Array.from({ length: 30 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  content: `${i + 1}. ${SAMPLES[i % SAMPLES.length]}`,
  created_at: new Date(now - i * 60000).toISOString(),
  is_mine: i % 7 === 0,
  voted_by_me: i % 5 === 0,
  vote_count: (i * 3) % 11,
}))

/** 화면에 보이는 질문 목록의 열 수, 질문 글자 크기, 잘린 본문 수, 가로 스크롤 여부 */
const measure = (page) =>
  page.evaluate(() => {
    const ul = [...document.querySelectorAll('ul')].find((u) => u.children.length >= 30)
    if (!ul) return null
    const cols = getComputedStyle(ul).gridTemplateColumns.split(' ').filter(Boolean).length
    const bodies = [...ul.querySelectorAll('li > p')]
    const sizes = [...new Set(bodies.map((p) => getComputedStyle(p).fontSize))]
    const clipped = bodies.filter((p) => p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1).length
    const cardOverflow = [...ul.children].filter((li) => li.scrollWidth > li.clientWidth + 1).length
    const lines = Math.max(...bodies.map((p) => Math.round(p.clientHeight / parseFloat(getComputedStyle(p).lineHeight))))
    return {
      cols,
      sizes,
      clipped,
      cardOverflow,
      maxLines: lines,
      hScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      mine: ul.querySelectorAll('li span').length && [...ul.querySelectorAll('li span')].filter((s) => s.textContent === '내 질문').length,
      voteButtons: ul.querySelectorAll('li button[aria-label="투표하기"], li button[aria-label="투표 취소"]').length,
    }
  })

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
const email = `qlab.ux.${stamp}@gmail.com`
const classA = `UX 1반 ${stamp.slice(8, 12)}`
const classB = `UX 2반 ${stamp.slice(8, 12)}`

const createClass = async (name) => {
  await teacher.goto(`${BASE}/teacher/classes`)
  await teacher.locator('#class-name').fill(name)
  await teacher.getByRole('button', { name: '만들기' }).click()
  // 새 학급 이름이 목록에 나타나면 그 카드의 클래스 코드
  const item = teacher
    .locator('div', { has: teacher.getByText(name, { exact: true }) })
    .filter({ has: teacher.getByTitle('코드 복사') })
    .last()
  await item.getByTitle('코드 복사').waitFor({ timeout: 15000 })
  return (await item.getByTitle('코드 복사').innerText()).trim()
}
const addStudent = async (num, name) => {
  await teacher.getByLabel('번호').fill(String(num))
  await teacher.getByLabel('이름', { exact: true }).fill(name)
  await teacher.getByRole('button', { name: '학생 추가' }).click()
  await teacher.getByText(name).waitFor({ timeout: 10000 })
}
const selectedClassName = () => teacher.locator('select').first().evaluate((s) => s.options[s.selectedIndex]?.text ?? '')

try {
  // ---- 준비 ----
  await teacher.goto(`${BASE}/teacher/login`)
  await teacher.getByRole('radio', { name: '처음이에요 (가입)' }).click()
  await teacher.locator('#email').fill(email)
  await teacher.locator('#password').fill(`Ux-${stamp}-z7`)
  await teacher.getByRole('button', { name: '가입하기' }).click()
  await teacher.waitForURL(`${BASE}/teacher`, { timeout: 15000 })
  const codeA = await createClass(classA)
  await createClass(classB)

  // 학생 관리에서 1반 학생 3명, 2반 학생 1명 추가
  await teacher.goto(`${BASE}/teacher/students`)
  // 학급 목록이 다 불러와질 때까지 기다림
  await teacher.waitForFunction((n) => [...document.querySelectorAll('select option')].some((o) => o.text === n), classB, { timeout: 15000 })
  await teacher.locator('select').first().selectOption({ label: classA })
  for (const [n, name] of [[1, '김하늘'], [2, '이바다'], [3, '박구름']]) await addStudent(n, name)
  await teacher.locator('select').first().selectOption({ label: classB })
  await addStudent(1, '최별')
  // 학생 관리 화면에서 마지막으로 고른 학급이 2반이 되도록 둠 → 1반 숫자를 누르면 1반으로 바뀌는지 확인

  // ---- 1. 대시보드 학생 수 → 학생 관리 ----
  console.log('== 대시보드 학생 수 → 학생 관리')
  await teacher.goto(`${BASE}/teacher`)
  const linkA = teacher.getByRole('link', { name: `${classA} 학생 3명, 명단 보기` })
  await linkA.waitFor({ timeout: 10000 })
  check('U01 학급 카드의 학생 수가 링크로 보임', await linkA.isVisible())
  await shot(teacher, 'ux-01-dashboard')
  await linkA.click()
  await teacher.waitForURL(`${BASE}/teacher/students`, { timeout: 5000 }).catch(() => {})
  await teacher.getByText('학생 3명').waitFor({ timeout: 10000 }).catch(() => {})
  const namesA = await Promise.all(['김하늘', '이바다', '박구름'].map((n) => teacher.getByText(n).isVisible()))
  check(
    'U02 1반 학생 수 클릭 → 1반이 선택된 학생 관리 (명단 3명)',
    new URL(teacher.url()).pathname === '/teacher/students' && (await selectedClassName()) === classA && namesA.every(Boolean),
    `${teacher.url()} / ${await selectedClassName()}`,
  )

  await teacher.goto(`${BASE}/teacher`)
  await teacher.getByRole('link', { name: `${classB} 학생 1명, 명단 보기` }).click()
  await teacher.getByText('최별').waitFor({ timeout: 10000 }).catch(() => {})
  check('U03 2반 학생 수 클릭 → 2반이 선택된 학생 관리 (최별)', (await selectedClassName()) === classB && (await teacher.getByText('최별').isVisible()))

  await teacher.goto(`${BASE}/teacher`)
  const totalLink = teacher.getByRole('link', { name: /전체 학생/ })
  // 학생 수 통계는 학급 목록보다 조금 늦게 올 수 있어 숫자가 채워질 때까지 기다림
  const totalShown = await teacher
    .waitForFunction(() => [...document.querySelectorAll('a')].some((a) => /전체 학생\s*4/.test(a.innerText)), null, { timeout: 10000 })
    .then(() => true)
    .catch(() => false)
  check('U04 "전체 학생 4" 카드가 링크로 보임', totalShown && (await totalLink.isVisible()), await totalLink.innerText().catch(() => ''))
  await totalLink.click()
  await teacher.waitForURL(`${BASE}/teacher/students`, { timeout: 5000 }).catch(() => {})
  check('U05 전체 학생 클릭 → 학생 관리 (지금 선택된 학급)', new URL(teacher.url()).pathname === '/teacher/students' && (await selectedClassName()) === classB)

  // ---- 2. 학생 게시판 질문 카드 ----
  console.log('== 학생 게시판 질문 카드 (가짜 질문 30개)')
  await student.route('**/rest/v1/rpc/list_class_questions', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(boardQuestions) }),
  )
  await student.goto(`${BASE}/student`)
  await student.locator('#code').fill(codeA)
  await student.locator('#number').fill('1')
  await student.locator('#name').fill('김하늘')
  await student.getByRole('button', { name: '들어가기' }).click()
  await student.waitForURL(`${BASE}/student/board`, { timeout: 15000 })
  await student.getByText('30. ').first().waitFor({ timeout: 10000 })

  const sizesSeen = new Set()
  for (const [w, h, expect, name] of [
    [390, 844, 1, '휴대폰'],
    [768, 1024, 2, '태블릿 세로'],
    [1024, 768, 2, '태블릿 가로'],
    [1280, 800, 3, '노트북'],
    [1920, 1080, 3, '데스크톱'],
  ]) {
    await student.setViewportSize({ width: w, height: h })
    await student.waitForTimeout(150)
    const m = await measure(student)
    m.sizes.forEach((s) => sizesSeen.add(s))
    check(
      `U06 학생 ${name} ${w}px → ${expect}열, 본문 잘림 없음, 가로 스크롤 없음`,
      m.cols === expect && m.clipped === 0 && m.cardOverflow === 0 && !m.hScroll,
      JSON.stringify(m),
    )
    await shot(student, `ux-02-student-${w}`)
  }
  check('U07 화면 폭이 바뀌어도 질문 글자 크기는 그대로 (20px)', sizesSeen.size === 1 && sizesSeen.has('20px'), [...sizesSeen].join(','))
  const m = await measure(student)
  check('U08 긴 질문은 여러 줄로 다 보임 (고정 높이로 자르지 않음)', m.maxLines >= 4, `maxLines=${m.maxLines}`)
  check('U09 "내 질문" 표시와 투표 버튼 그대로', m.mine === boardQuestions.filter((q) => q.is_mine).length && m.voteButtons === 30, JSON.stringify(m))

  // ---- 3. 교사 질문 화면 ----
  console.log('== 교사 질문 화면 (가짜 질문 30개)')
  const teacherQuestions = boardQuestions.map((q, i) => ({
    id: q.id,
    class_id: '00000000-0000-4000-8000-0000000000aa',
    student_id: '00000000-0000-4000-8000-0000000000bb',
    content: q.content,
    is_hidden: i === 3,
    created_at: q.created_at,
    student: { student_number: (i % 3) + 1, name: ['김하늘', '이바다', '박구름'][i % 3] },
    votes: [{ count: q.vote_count }],
  }))
  await teacher.route('**/rest/v1/questions?**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(teacherQuestions) })
      : route.continue(),
  )
  await teacher.goto(`${BASE}/teacher/questions`)
  await teacher.getByText('30. ').first().waitFor({ timeout: 10000 })
  for (const [w, h, expect, name] of [
    [390, 844, 1, '휴대폰'],
    [1024, 768, 2, '태블릿 가로'],
    [1280, 800, 3, '노트북'],
    [1920, 1080, 3, '데스크톱'],
  ]) {
    await teacher.setViewportSize({ width: w, height: h })
    await teacher.waitForTimeout(150)
    const t = await teacher.evaluate(() => {
      const ul = [...document.querySelectorAll('ul')].find((u) => u.children.length >= 30)
      const bodies = [...ul.querySelectorAll('li > p')]
      return {
        cols: getComputedStyle(ul).gridTemplateColumns.split(' ').filter(Boolean).length,
        sizes: [...new Set(bodies.map((p) => getComputedStyle(p).fontSize))],
        overflow: [...ul.children].filter((li) => li.scrollWidth > li.clientWidth + 1).length,
        hScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    check(
      `U10 교사 ${name} ${w}px → ${expect}열, 글자 20px, 넘침·가로 스크롤 없음`,
      t.cols === expect && t.sizes.join() === '20px' && t.overflow === 0 && !t.hScroll,
      JSON.stringify(t),
    )
    await shot(teacher, `ux-03-teacher-${w}`)
  }
} catch (e) {
  failed++
  console.log(`FAIL 예외: ${e.stack || e}`)
  await Promise.all([shot(teacher, 'ux-zz-teacher-fail'), shot(student, 'ux-zz-student-fail')]).catch(() => {})
} finally {
  try {
    await teacher.unrouteAll({ behavior: 'ignoreErrors' })
    await teacher.setViewportSize({ width: 1280, height: 900 })
    await teacher.goto(`${BASE}/teacher/classes`)
    for (let i = 0; i < 2; i++) {
      const del = teacher.getByRole('button', { name: '학급 지우기' })
      const n = await del.count()
      if (!n) break
      await del.first().click({ timeout: 8000 })
      await teacher.waitForFunction((k) => document.querySelectorAll('button').length && [...document.querySelectorAll('button')].filter((x) => (x.getAttribute('aria-label') || x.title || x.innerText).includes('학급 지우기')).length < k, n, { timeout: 10000 })
    }
    console.log(`     테스트 학급 정리: 남은 학급 ${await teacher.getByRole('button', { name: '학급 지우기' }).count()}개`)
  } catch (e) {
    console.log(`     테스트 학급 삭제 실패: ${e.message.split('\n')[0]}`)
  }
  await browser.close()
  console.log(`== ${passed} passed, ${failed} failed  (screenshots: ${SHOTS})`)
  process.exitCode = failed ? 1 : 0
}
