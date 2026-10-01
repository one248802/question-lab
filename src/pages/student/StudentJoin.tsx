import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, DoorOpen } from 'lucide-react'
import { Button, Card, ErrorBox, Input, Label, Spinner } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { StudentContext } from '../../lib/types'

export default function StudentJoin() {
  const navigate = useNavigate()
  const { user, isAnonymous, loading: authLoading } = useAuth()

  const [checking, setChecking] = useState(true)
  const [existing, setExisting] = useState<StudentContext | null>(null)
  const [showForm, setShowForm] = useState(false)

  const [code, setCode] = useState('')
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 이 기기로 이미 입장한 학생이 있는지 확인
  useEffect(() => {
    if (authLoading) return
    if (!user || !isAnonymous) {
      setChecking(false)
      return
    }
    supabase.rpc('get_my_student').then(({ data }) => {
      setExisting((data as StudentContext | null) ?? null)
      setChecking(false)
    })
  }, [authLoading, user, isAnonymous])

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
            <ErrorBox message={error} />
            <Button type="submit" size="xl" block loading={submitting}>
              들어가기
            </Button>
          </form>
        </Card>
      )}
    </main>
  )
}
