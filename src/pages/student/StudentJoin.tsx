import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, DoorOpen } from 'lucide-react'
import { ConnectionRetry } from '../../components/ConnectionRetry'
import { Button, Card, ErrorBox, Input, Label, Spinner } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { toMessage } from '../../lib/errors'
import { lookupMyStudent } from '../../lib/studentSession'
import { supabase } from '../../lib/supabase'
import type { StudentContext } from '../../lib/types'

// 「이 클래스 코드 기억하기」: 이 브라우저의 localStorage 에 클래스 코드만 저장 (번호·이름은 저장하지 않음)
const REMEMBERED_CODE_KEY = 'qlab:remembered-class-code'

function readRememberedCode(): string {
  try {
    const v = window.localStorage.getItem(REMEMBERED_CODE_KEY) ?? ''
    return /^[A-Z0-9]{6}$/.test(v) ? v : ''
  } catch {
    return ''
  }
}

function writeRememberedCode(code: string | null) {
  try {
    if (code) window.localStorage.setItem(REMEMBERED_CODE_KEY, code)
    else window.localStorage.removeItem(REMEMBERED_CODE_KEY)
  } catch {
    /* 저장할 수 없는 환경이면 무시 */
  }
}

export default function StudentJoin() {
  const navigate = useNavigate()
  const { user, isAnonymous, loading: authLoading } = useAuth()

  const [checking, setChecking] = useState(true)
  const [existing, setExisting] = useState<StudentContext | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [showForm, setShowForm] = useState(false)

  const [code, setCode] = useState(readRememberedCode)
  const [rememberCode, setRememberCode] = useState(() => readRememberedCode() !== '')
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 이 기기로 이미 입장한 학생이 있는지 확인. 일시적인 오류는 '입장 안 함'으로 보지 않고 다시 시도하게 함
  useEffect(() => {
    if (authLoading) return
    let alive = true
    const check = async () => {
      if (!user || !isAnonymous) return { existing: null, error: null }
      const result = await lookupMyStudent()
      if (result.status === 'joined') return { existing: result.student, error: null }
      if (result.status === 'error') return { existing: null, error: result.message }
      return { existing: null, error: null }
    }
    check().then((r) => {
      if (!alive) return
      setExisting(r.existing)
      setLookupError(r.error)
      setChecking(false)
    })
    return () => {
      alive = false
    }
  }, [authLoading, user, isAnonymous, retryCount])

  const retryLookup = () => {
    setChecking(true)
    setRetryCount((n) => n + 1)
  }

  const toggleRemember = (next: boolean) => {
    setRememberCode(next)
    // 체크를 풀면 저장된 클래스 코드를 바로 지움 (체크하면 입장에 성공했을 때 저장)
    if (!next) writeRememberedCode(null)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const studentNumber = Number(number)
    if (code.trim().length < 6) return setError('클래스 코드 6자리를 넣어 주세요.')
    if (!Number.isInteger(studentNumber) || studentNumber < 1 || studentNumber > 99) return setError('번호를 확인해 주세요.')
    if (!name.trim()) return setError('이름을 넣어 주세요.')

    setSubmitting(true)
    try {
      // 교사 계정으로 로그인되어 있으면 먼저 로그아웃
      if (user && !isAnonymous) await supabase.auth.signOut()
      const { data: current } = await supabase.auth.getSession()
      if (!current.session || !current.session.user.is_anonymous) {
        const { error: signInError } = await supabase.auth.signInAnonymously()
        if (signInError) throw signInError
      }
      const { error: joinError } = await supabase.rpc('join_class', {
        p_class_code: code,
        p_student_number: studentNumber,
        p_name: name,
      })
      if (joinError) throw joinError
      writeRememberedCode(rememberCode ? code : null)
      navigate('/student/board', { replace: true })
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6">
      <Link to="/" className="mb-6 inline-flex w-fit items-center gap-2 rounded-xl px-2 py-2 text-lg font-bold text-ink-soft hover:bg-ink/5">
        <ArrowLeft className="size-6" aria-hidden />
        처음으로
      </Link>

      <h1 className="mb-6 flex items-center gap-3 font-display text-4xl">
        <DoorOpen className="size-10 text-butter-ink" aria-hidden />
        우리 반 입장
      </h1>

      {checking ? (
        <Spinner />
      ) : lookupError && !showForm ? (
        <ConnectionRetry message={lookupError} retrying={checking} onRetry={retryLookup}>
          <Button variant="secondary" block onClick={() => setShowForm(true)}>
            입장 정보 다시 넣기
          </Button>
        </ConnectionRetry>
      ) : existing && !showForm ? (
        <Card className="flex flex-col gap-4">
          <p className="text-lg text-ink-soft">{existing.class_name}</p>
          <p className="font-display text-3xl">
            {existing.student_number}번 {existing.student_name}
          </p>
          <Button size="lg" block onClick={() => navigate('/student/board')}>
            계속하기
          </Button>
          <Button variant="secondary" block onClick={() => setShowForm(true)}>
            다른 사람이에요
          </Button>
        </Card>
      ) : (
        <Card>
          <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
            <div>
              <Label htmlFor="code">클래스 코드</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="Q5A82K"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="text-center font-display text-3xl tracking-[0.3em] uppercase"
              />
            </div>
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <div>
                <Label htmlFor="number">번호</Label>
                <Input
                  id="number"
                  value={number}
                  onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  inputMode="numeric"
                  placeholder="3"
                  className="text-center text-2xl"
                />
              </div>
              <div>
                <Label htmlFor="name">이름</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 20))}
                  placeholder="홍길동"
                  autoComplete="off"
                  className="text-2xl"
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-3 text-lg">
              <input
                type="checkbox"
                checked={rememberCode}
                onChange={(e) => toggleRemember(e.target.checked)}
                className="size-6 shrink-0 accent-[#e8c34f]"
              />
              이 클래스 코드 기억하기
            </label>
            <ErrorBox message={error} />
            <Button type="submit" size="xl" block loading={submitting}>
              들어가기
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-ink-soft">
            한 번 들어오면 브라우저를 닫아도 그대로 다시 들어올 수 있어요. 여러 사람이 함께 쓰는 기기에서는 다 쓴 뒤 「나가기」를 눌러 주세요.
          </p>
        </Card>
      )}
    </main>
  )
}
