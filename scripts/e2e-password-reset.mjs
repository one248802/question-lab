// 교사 비밀번호 재설정 화면을 브라우저(Chromium)로 확인합니다.
//   A. 메일 링크 흐름: Supabase Auth 응답(/auth/v1/recover, /auth/v1/user)을 가짜로 돌려줘서
//      실제 메일을 보내지 않고 '비밀번호를 잊으셨나요?' → 메일 요청 → 링크로 /reset-password 진입 → 새 비밀번호 저장을 확인
//   B. 실제 Supabase: 테스트 교사 계정으로 /reset-password 에서 비밀번호를 실제로 바꾼 뒤 새 비밀번호로만 로그인되는지 확인
//
// 실행:
//   1) npm run dev            (다른 터미널, .env 또는 환경 변수에 Supabase 값 필요)
//   2) node scripts/e2e-password-reset.mjs
//   - BASE_URL(기본 http://localhost:5173), CHROMIUM_PATH(기본 /opt/pw-browsers/chromium), SHOTS_DIR(기본 e2e-shots/)
//   - B 에서 만든 교사 계정(qlab.reset.*@gmail.com)은 Supabase Authentication → Users 에 남습니다.
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
  // Playwright 의 proxy 옵션은 localhost 도 프록시로 보내므로 Chromium 인자로 직접 지정
  args: process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1'] : [],
})
// A 는 휴대폰 화면, B 는 교사가 주로 쓰는 PC 화면 (휴대폰에서는 로그아웃 버튼이 메뉴 안에 있음)
const newPage = async (desktop = false) => {
  const context = await browser.newContext(
    desktop ? { viewport: { width: 1280, height: 900 }, locale: 'ko-KR' } : { viewport: { width: 390, height: 844 }, isMobile: true, locale: 'ko-KR' },
  )
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log(`     [pageerror] ${e.message}`))
  return { context, page }
}
const waitText = (page, text, timeout = 10000) =>
  page
    .getByText(text)
    .first()
    .waitFor({ timeout })
    .then(() => true)
    .catch(() => false)

// ---- A. 가짜 Auth 응답 ----
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = () => Math.floor(Date.now() / 1000)
const fakeJwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: FAKE_USER.id, role: 'authenticated', exp: now() + 3600 })}.sig`
const FAKE_USER = {
  id: '00000000-0000-4000-8000-00000000abcd',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'reset.teacher@example.com',
  is_anonymous: false,
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
}
const recoveryHash = () =>
  `#access_token=${fakeJwt()}&expires_at=${now() + 3600}&expires_in=3600&refresh_token=fake-refresh&token_type=bearer&type=recovery`
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

/** 이 페이지의 Supabase Auth 요청을 가짜로 처리하고, 보낸 요청을 기록 */
const mockAuth = async (page) => {
  const log = { recover: [], updates: [] }
  const state = { recoverStatus: 200, updateError: null }
  await page.route('**/auth/v1/recover**', async (route) => {
    const req = route.request()
    log.recover.push({ url: req.url(), body: req.postDataJSON() })
    if (state.recoverStatus === 429)
      return json(route, 429, { code: 'over_email_send_rate_limit', msg: 'For security purposes, you can only request this after 52 seconds.' })
    return json(route, 200, {})
  })
  await page.route('**/auth/v1/user**', async (route) => {
    const req = route.request()
    if (req.method() === 'PUT') {
      log.updates.push(req.postDataJSON())
      if (state.updateError) return json(route, 422, state.updateError)
    }
    return json(route, 200, FAKE_USER)
  })
  return { log, state }
}

try {
  console.log('== A. 메일 링크 흐름 (가짜 Auth 응답)')
  {
    const { context, page } = await newPage()
    const { log, state } = await mockAuth(page)
    await page.goto(`${BASE}/teacher/login`)
    const forgot = page.getByRole('button', { name: '비밀번호를 잊으셨나요?' })
    check('P01 교사 로그인 화면에 "비밀번호를 잊으셨나요?"', await forgot.isVisible().catch(() => false))

    await forgot.click()
    const heading = await page.getByRole('heading', { name: '비밀번호 재설정' }).isVisible()
    check('P02 누르면 이메일만 넣는 재설정 화면 (비밀번호 칸 없음)', heading && (await page.locator('#password').count()) === 0 && (await page.locator('#email').isVisible()))

    await page.getByRole('button', { name: '재설정 메일 보내기' }).click()
    check('P03 이메일을 비우면 안내하고 요청하지 않음', (await waitText(page, '가입한 이메일을 넣어 주세요.')) && log.recover.length === 0)

    await page.locator('#email').fill('  reset.teacher@example.com ')
    await page.getByRole('button', { name: '재설정 메일 보내기' }).click()
    const sent = await waitText(page, '비밀번호 재설정 메일을 보냈어요')
    const req = log.recover[0]
    const redirectTo = req ? new URL(req.url).searchParams.get('redirect_to') : null
    check(
      'P04 Supabase 기본 recovery 메일 요청 (이메일, redirect_to=/reset-password)',
      sent && req?.body?.email === 'reset.teacher@example.com' && redirectTo === `${BASE}/reset-password`,
      JSON.stringify({ body: req?.body, redirectTo }),
    )
    await shot(page, 'reset-01-mail-sent')

    state.recoverStatus = 429
    await page.getByRole('button', { name: '재설정 메일 보내기' }).click()
    check('P05 너무 자주 요청하면 한국어로 안내', await waitText(page, '잠시 후 다시 요청해 주세요.'))

    await page.getByRole('button', { name: '로그인으로 돌아가기' }).click()
    check('P06 "로그인으로 돌아가기" → 로그인 화면', (await page.getByRole('heading', { name: '교사 로그인' }).isVisible()) && (await page.locator('#password').isVisible()))
    await context.close()
  }
  {
    const { context, page } = await newPage()
    const { log, state } = await mockAuth(page)
    await page.goto(`${BASE}/reset-password${recoveryHash()}`)
    const form = await waitText(page, '계정의 새 비밀번호를 정해 주세요.')
    check('P07 메일 링크로 /reset-password 진입 → 새 비밀번호 화면 (계정 이메일 표시)', form && (await page.getByText(FAKE_USER.email).isVisible()))
    check('P08 주소창에서 토큰이 지워짐', !page.url().includes('access_token'), page.url())
    await shot(page, 'reset-02-form')

    const submit = page.getByRole('button', { name: '비밀번호 바꾸기' })
    await page.locator('#newPassword').fill('abc12')
    await page.locator('#confirmPassword').fill('abc12')
    await submit.click()
    check('P09 6자보다 짧으면 안내하고 저장하지 않음', (await waitText(page, '6자 이상으로 넣어 주세요.')) && log.updates.length === 0)

    await page.locator('#newPassword').fill('NewPass-1234')
    await page.locator('#confirmPassword').fill('NewPass-1235')
    await submit.click()
    check('P10 두 값이 다르면 안내하고 저장하지 않음', (await waitText(page, '새 비밀번호와 확인이 서로 달라요.')) && log.updates.length === 0)

    state.updateError = { code: 'same_password', msg: 'New password should be different from the old password.' }
    await page.locator('#confirmPassword').fill('NewPass-1234')
    await submit.click()
    check('P11 지금 비밀번호와 같으면 Supabase 오류를 한국어로 안내', await waitText(page, '지금 쓰는 비밀번호와 다른 새 비밀번호를 넣어 주세요.'))

    state.updateError = null
    await submit.click()
    const done = await waitText(page, '비밀번호를 바꿨어요')
    check('P12 조건을 만족하면 updateUser({ password }) 로 변경 → 완료 화면', done && log.updates.at(-1)?.password === 'NewPass-1234', JSON.stringify(log.updates.at(-1)))
    await shot(page, 'reset-03-done')

    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))
    check('P13 새 비밀번호는 브라우저 저장소에 남지 않음', !stored.includes('NewPass-1234'))

    await page.getByRole('button', { name: '교사 화면으로 가기' }).click()
    await page.waitForURL(`${BASE}/teacher`, { timeout: 5000 }).catch(() => {})
    check('P14 완료 후 "교사 화면으로 가기" → /teacher', new URL(page.url()).pathname === '/teacher', page.url())
    await context.close()
  }
  {
    const { context, page } = await newPage()
    await mockAuth(page)
    await page.goto(`${BASE}/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`)
    const expired = (await waitText(page, '링크를 쓸 수 없어요')) && (await waitText(page, '만료되었거나 이미 사용되었어요'))
    check('P15 만료/사용된 링크 → "링크를 쓸 수 없어요" (비밀번호 칸 없음)', expired && (await page.locator('#newPassword').count()) === 0)
    await shot(page, 'reset-04-expired')
    await page.getByRole('button', { name: '재설정 메일 다시 받기' }).click()
    const forgotShown = await page
      .getByRole('heading', { name: '비밀번호 재설정' })
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    check('P16 "재설정 메일 다시 받기" → 메일 받기 화면', forgotShown)

    await page.goto(`${BASE}/reset-password`)
    check('P17 링크 없이 /reset-password 를 열면 비밀번호 칸 없이 안내', (await waitText(page, '링크를 쓸 수 없어요')) && (await page.locator('#newPassword').count()) === 0)
    await context.close()
  }
  {
    // Redirect URLs 에 /reset-password 가 빠져 Supabase 가 Site URL(첫 화면)로 보낸 경우
    const { context, page } = await newPage()
    await mockAuth(page)
    await page.goto(`${BASE}/${recoveryHash()}`)
    const form = await waitText(page, '계정의 새 비밀번호를 정해 주세요.')
    check('P18 링크가 첫 화면(Site URL)으로 열려도 교사 대시보드가 아니라 재설정 화면으로', form && new URL(page.url()).pathname === '/reset-password', page.url())
    await context.close()
  }

  console.log('== B. 실제 Supabase 로 비밀번호 바꾸기')
  {
    const { context, page } = await newPage(true)
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
    const email = `qlab.reset.${stamp}@gmail.com`
    const oldPassword = `Old-${stamp}-x9`
    const newPassword = `New-${stamp}-y8`
    const login = async (password) => {
      await page.goto(`${BASE}/teacher/login`)
      await page.locator('#email').fill(email)
      await page.locator('#password').fill(password)
      await page.locator('form').getByRole('button', { name: '로그인' }).click()
    }

    await page.goto(`${BASE}/teacher/login`)
    await page.getByRole('radio', { name: '처음이에요 (가입)' }).click()
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(oldPassword)
    await page.getByRole('button', { name: '가입하기' }).click()
    await page.waitForURL(`${BASE}/teacher`, { timeout: 15000 }).catch(() => {})
    check('R01 테스트 교사 가입 → 대시보드', new URL(page.url()).pathname === '/teacher', page.url())

    await page.goto(`${BASE}/reset-password`)
    await page.locator('#newPassword').waitFor({ timeout: 10000 })
    await page.locator('#newPassword').fill(newPassword)
    await page.locator('#confirmPassword').fill(newPassword)
    await page.getByRole('button', { name: '비밀번호 바꾸기' }).click()
    check('R02 실제 Supabase 에서 비밀번호 변경 완료', await waitText(page, '비밀번호를 바꿨어요', 15000))

    await page.getByRole('button', { name: '교사 화면으로 가기' }).click()
    await page.getByRole('button', { name: /로그아웃/ }).first().click()
    await page.waitForURL(`${BASE}/`, { timeout: 10000 }).catch(() => {})

    await login(oldPassword)
    check('R03 예전 비밀번호로는 로그인 안 됨', await waitText(page, '이메일 또는 비밀번호가 맞지 않아요.', 15000))

    await login(newPassword)
    await page.waitForURL(`${BASE}/teacher`, { timeout: 15000 }).catch(() => {})
    check('R04 새 비밀번호로 로그인 → 대시보드', new URL(page.url()).pathname === '/teacher', page.url())
    await context.close()
  }
} catch (e) {
  failed++
  console.log(`FAIL 예외: ${e.stack || e}`)
} finally {
  await browser.close()
  console.log(`== ${passed} passed, ${failed} failed`)
  process.exitCode = failed ? 1 : 0
}
