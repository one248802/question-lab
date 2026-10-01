// 실제 Supabase 프로젝트에서 핵심 흐름을 확인합니다.
//   교사 회원가입/로그인 → 학급 생성 → 학생 입장 → 질문 작성 → 익명성 확인 → 투표
//
// 실행: NODE_USE_ENV_PROXY=1 node scripts/e2e-supabase.mjs [--keep]
//   - VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY(또는 VITE_SUPABASE_ANON_KEY) 환경 변수가 필요합니다.
//   - 교사 계정은 E2E_TEACHER_EMAIL / E2E_TEACHER_PASSWORD 가 있으면 그것을, 없으면 새 테스트 계정을 만듭니다.
//     (새 계정은 Supabase 의 Confirm email 이 꺼져 있어야 바로 로그인됩니다.)
//   - 끝나면 테스트 학급을 지웁니다(학생·질문·투표도 함께 삭제). --keep 이면 남겨 둡니다.
//     교사 계정과 익명 사용자는 publishable key 로 지울 수 없어 auth.users 에 남습니다.
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('VITE_SUPABASE_URL 과 VITE_SUPABASE_PUBLISHABLE_KEY 가 필요합니다.')
  process.exit(2)
}
const keep = process.argv.includes('--keep')
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

let passed = 0
let failed = 0
function check(label, ok, detail) {
  if (ok) passed++
  else failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || detail === undefined ? '' : `  (${detail})`}`)
}
const errMsg = (e) => (e ? e.message : 'no error')
const show = (v) => JSON.stringify(v)

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
const teacher = client()
const stuA = client()
const stuB = client()
let classId = null

try {
  // 1. 교사 회원가입 / 로그인 -------------------------------------------------
  const email = process.env.E2E_TEACHER_EMAIL || `qlab.e2e.${stamp}@gmail.com`
  const password = process.env.E2E_TEACHER_PASSWORD || `E2e-${stamp}-${Math.random().toString(36).slice(2, 10)}`
  if (!process.env.E2E_TEACHER_EMAIL) {
    const { data, error } = await teacher.auth.signUp({ email, password, options: { data: { display_name: 'E2E 선생님' } } })
    check('01 교사 회원가입', !error && data.user, errMsg(error))
    check('02 이메일 인증 없이 바로 세션 발급 (Confirm email 꺼짐)', Boolean(data?.session), 'session 없음: Confirm email 이 켜져 있음')
    await teacher.auth.signOut()
  }
  const login = await teacher.auth.signInWithPassword({ email, password })
  check('03 교사 로그인', !login.error && login.data.session, errMsg(login.error))
  if (login.error) throw new Error('교사 로그인 실패로 중단')
  console.log(`     교사 계정: ${email}`)

  const prof = await teacher.from('profiles').select('email, display_name').single()
  check('04 profiles 자동 생성', !prof.error && prof.data?.email === email, errMsg(prof.error))

  const cats = await teacher.from('classification_categories').select('framework_code, code')
  check('05 분류 범주 9개', cats.data?.length === 9, `${cats.data?.length} ${errMsg(cats.error)}`)

  // 2. 학급 생성 ------------------------------------------------------------
  const created = await teacher.from('classes').insert({ name: `E2E 테스트 반 ${stamp.slice(8, 12)}` }).select().single()
  check('06 학급 생성', !created.error, errMsg(created.error))
  if (created.error) throw new Error('학급 생성 실패로 중단')
  classId = created.data.id
  const cls = created.data
  check('07 클래스 코드 6자리 자동 생성', /^[A-HJ-NP-Z2-9]{6}$/.test(cls.class_code), cls.class_code)
  check(
    '08 투표 설정 기본값',
    cls.voting_status === 'before' && cls.max_votes === 3 && !cls.allow_self_vote && cls.allow_vote_change &&
      !cls.show_results_during_voting && cls.show_results_after_voting,
    show(cls),
  )
  const stats = await teacher.rpc('teacher_class_stats', { p_today_start: new Date(Date.now() - 864e5).toISOString() })
  check('09 대시보드 통계 RPC', !stats.error && stats.data.some((r) => r.class_id === classId), errMsg(stats.error))

  // 3. 학생 입장 (익명 로그인 + 클래스 코드) -------------------------------------
  for (const [c, label] of [[stuA, 'A'], [stuB, 'B']]) {
    const { error } = await c.auth.signInAnonymously()
    check(`10 학생 ${label} 익명 로그인`, !error, errMsg(error))
  }
  const joinA = await stuA.rpc('join_class', { p_class_code: cls.class_code.toLowerCase(), p_student_number: 1, p_name: ' 김 하늘 ' })
  check('11 학생 A 입장 (소문자 코드, 공백 정리)', !joinA.error && joinA.data?.student_name === '김 하늘', errMsg(joinA.error))
  const joinB = await stuB.rpc('join_class', { p_class_code: cls.class_code, p_student_number: 2, p_name: '이바다' })
  check('12 학생 B 입장', !joinB.error, errMsg(joinB.error))
  const wrongCode = await stuB.rpc('join_class', { p_class_code: 'ZZZZZZ', p_student_number: 2, p_name: '이바다' })
  check('13 틀린 클래스 코드 거부', wrongCode.error?.message === 'CLASS_NOT_FOUND', errMsg(wrongCode.error))
  const mismatch = await stuB.rpc('join_class', { p_class_code: cls.class_code, p_student_number: 1, p_name: '다른이름' })
  check('14 같은 번호 다른 이름 거부', mismatch.error?.message === 'NAME_MISMATCH', errMsg(mismatch.error))
  const rejoinB = await stuB.rpc('join_class', { p_class_code: cls.class_code, p_student_number: 2, p_name: '이바다' })
  check('15 학생 B 다시 입장', !rejoinB.error, errMsg(rejoinB.error))
  const teacherJoin = await teacher.rpc('join_class', { p_class_code: cls.class_code, p_student_number: 3, p_name: '선생' })
  check('16 교사 계정은 학생 입장 불가', teacherJoin.error?.message === 'STUDENT_ONLY', errMsg(teacherJoin.error))

  // 4. 질문 작성 ------------------------------------------------------------
  const qA = await stuA.rpc('create_question', { p_content: '왜 하늘은 파란색일까요?' })
  check('17 학생 A 질문 작성 (내용만)', !qA.error && qA.data, errMsg(qA.error))
  const qB = await stuB.rpc('create_question', { p_content: '물고기는 잠을 잘까요?' })
  check('18 학생 B 질문 작성', !qB.error && qB.data, errMsg(qB.error))
  const tooFast = await stuB.rpc('create_question', { p_content: '연속 질문' })
  check('19 3초 안 연속 작성 거부', tooFast.error?.message === 'TOO_FAST', errMsg(tooFast.error))
  const empty = await stuA.rpc('create_question', { p_content: '   ' })
  check('20 빈 질문 거부', empty.error?.message === 'INVALID_CONTENT', errMsg(empty.error))

  // 5. 익명성 확인 ----------------------------------------------------------
  const listA = await stuA.rpc('list_class_questions')
  check('21 학생 질문 목록', !listA.error && listA.data?.length === 2, `${listA.data?.length} ${errMsg(listA.error)}`)
  const keys = Object.keys(listA.data?.[0] ?? {}).sort()
  check(
    '22 목록에 작성자 정보 없음',
    show(keys) === show(['content', 'created_at', 'id', 'is_mine', 'vote_count', 'voted_by_me']),
    show(keys),
  )
  check('23 내 질문만 is_mine', listA.data?.filter((q) => q.is_mine).map((q) => q.id).join() === qA.data, show(listA.data))
  for (const table of ['questions', 'students', 'votes', 'classes', 'profiles']) {
    const r = await stuA.from(table).select('*')
    check(`24 학생은 ${table} 테이블 직접 조회 불가`, Boolean(r.error) || r.data.length === 0, `${r.data?.length}행`)
  }
  const sess = await stuA.from('student_sessions').select('*')
  check('25 학생은 student_sessions 조회 불가', Boolean(sess.error) || sess.data.length === 0, `${sess.data?.length}행`)
  const leak = await stuA.rpc('student_context_json', { p_student_id: joinB.data?.student_id })
  check('26 내부 함수로 다른 학생 정보 조회 불가', Boolean(leak.error), show(leak.data))
  const directInsert = await stuA.from('questions').insert({ class_id: classId, student_id: joinA.data?.student_id, content: '직접' })
  check('27 학생은 questions 직접 추가 불가', Boolean(directInsert.error), errMsg(directInsert.error))
  const tq = await teacher
    .from('questions')
    .select('id, content, student:students(student_number, name), votes(count)')
    .eq('class_id', classId)
  const authors = (tq.data ?? []).map((q) => `${q.student?.student_number}번 ${q.student?.name}`).sort()
  check('28 교사는 작성자 확인 가능', show(authors) === show(['1번 김 하늘', '2번 이바다']), show(authors))
  const anonForTeacher = createClient(url, key, { auth: { persistSession: false } })
  const anonRead = await anonForTeacher.from('questions').select('*')
  check('29 로그인하지 않은 사용자는 조회 불가', Boolean(anonRead.error) || anonRead.data.length === 0, `${anonRead.data?.length}행`)

  // 6. 투표 ---------------------------------------------------------------
  const vote = (c, id) => c.rpc('toggle_vote', { p_question_id: id })
  const setClass = (patch) => teacher.from('classes').update(patch).eq('id', classId)
  const counts = async (c) => {
    const { data } = await c.rpc('list_class_questions')
    return Object.fromEntries((data ?? []).map((q) => [q.id === qA.data ? 'A' : 'B', q.vote_count]))
  }

  let r = await vote(stuA, qB.data)
  check('30 before: 투표 불가', r.error?.message === 'VOTING_NOT_STARTED', errMsg(r.error))
  let ctx = await stuA.rpc('get_my_student')
  check('31 before: 결과 비공개', ctx.data?.show_vote_counts === false && show(await counts(stuA)) === show({ B: null, A: null }), show(ctx.data))

  r = await setClass({ voting_status: 'closed' })
  check('32 before → closed 전환 거부', r.error?.message === 'INVALID_VOTING_TRANSITION', errMsg(r.error))
  r = await setClass({ voting_status: 'open' })
  check('33 투표 시작 (before → open)', !r.error, errMsg(r.error))

  r = await vote(stuA, qA.data)
  check('34 open: 자기 질문 투표 금지', r.error?.message === 'SELF_VOTE_NOT_ALLOWED', errMsg(r.error))
  r = await vote(stuA, qB.data)
  check('35 open: 학생 A → B 질문 투표', r.data === true, errMsg(r.error))
  r = await vote(stuB, qA.data)
  check('36 open: 학생 B → A 질문 투표', r.data === true, errMsg(r.error))
  check('37 open: during=false 이면 결과 비공개', Object.values(await counts(stuA)).every((v) => v === null), show(await counts(stuA)))
  r = await vote(stuA, qB.data)
  check('38 open: 투표 취소 (바꾸기 허용)', r.data === false, errMsg(r.error))
  r = await vote(stuA, qB.data)
  check('39 open: 다시 투표', r.data === true, errMsg(r.error))

  r = await setClass({ max_votes: 1, allow_vote_change: false })
  check('40 교사가 max_votes=1, 바꾸기 금지로 변경', !r.error, errMsg(r.error))
  r = await vote(stuA, qB.data)
  check('41 바꾸기 금지: 한도 안에서는 취소 불가', r.error?.message === 'VOTE_CHANGE_NOT_ALLOWED', errMsg(r.error))
  r = await setClass({ allow_self_vote: true })
  r = await vote(stuA, qA.data)
  check('42 한도(1) 초과 투표 불가', r.error?.message === 'VOTE_LIMIT_REACHED', errMsg(r.error))
  const forged = await stuA.from('classes').update({ max_votes: 20 }).eq('id', classId).select()
  check('43 학생은 학급 설정 변경 불가', Boolean(forged.error) || forged.data.length === 0, show(forged.data))

  r = await setClass({ show_results_during_voting: true })
  check('44 open: during=true 이면 결과 공개', show(await counts(stuB)) === show({ B: 1, A: 1 }), show(await counts(stuB)))

  r = await setClass({ voting_status: 'closed', show_results_during_voting: false, allow_vote_change: true })
  check('45 투표 종료 (open → closed)', !r.error, errMsg(r.error))
  r = await vote(stuB, qA.data)
  check('46 closed: 취소 불가', r.error?.message === 'VOTING_CLOSED', errMsg(r.error))
  ctx = await stuB.rpc('get_my_student')
  check('47 closed: 학생 상태 closed, after=true 이면 결과 공개',
    ctx.data?.voting_status === 'closed' && ctx.data?.show_vote_counts === true && show(await counts(stuB)) === show({ B: 1, A: 1 }),
    show(ctx.data))
  r = await setClass({ show_results_after_voting: false })
  check('48 closed: after=false 이면 결과 비공개', Object.values(await counts(stuB)).every((v) => v === null), show(await counts(stuB)))
  r = await setClass({ voting_status: 'before' })
  check('49 closed → before 전환 거부', r.error?.message === 'INVALID_VOTING_TRANSITION', errMsg(r.error))
  r = await setClass({ voting_status: 'open' })
  check('50 투표 다시 열기 (closed → open)', !r.error, errMsg(r.error))

  const tv = await teacher.from('questions').select('content, votes(count)').eq('class_id', classId)
  check('51 교사 화면 투표 수', (tv.data ?? []).every((q) => q.votes?.[0]?.count === 1), show(tv.data))
  const hide = await teacher.from('questions').update({ is_hidden: true }).eq('id', qB.data)
  check('52 교사 질문 숨기기', !hide.error, errMsg(hide.error))
  check('53 숨긴 질문은 학생 목록에서 제외', (await stuA.rpc('list_class_questions')).data?.length === 1)
} catch (e) {
  failed++
  console.log(`FAIL 중단: ${e.message}`)
} finally {
  if (classId && !keep) {
    const { error } = await teacher.from('classes').delete().eq('id', classId)
    console.log(error ? `     테스트 학급 삭제 실패: ${error.message}` : '     테스트 학급 삭제 완료 (학생·질문·투표 함께 삭제)')
  } else if (classId) {
    console.log(`     --keep: 테스트 학급을 남겨 둡니다 (id ${classId})`)
  }
  console.log(`== ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
