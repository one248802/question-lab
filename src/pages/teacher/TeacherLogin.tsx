import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, GraduationCap } from 'lucide-react'
import { Button, Card, ChoiceChips, ErrorBox, Input, Label, Spinner } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'

type Mode = 'login' | 'signup'

export default function TeacherLogin() {
  const navigate = useNavigate()
  const { user, isAnonymous, loading } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  if (loading) return <Spinner />
  if (user && !isAnonymous) return <Navigate to="/teacher" replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!email.trim() || !password) return setError('이메일과 비밀번호를 넣어 주세요.')
    setSubmitting(true)
    try {
      // 학생(익명)으로 들어와 있던 기기라면 먼저 로그아웃
      if (user && isAnonymous) await supabase.auth.signOut()

      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (err) throw err
        navigate('/teacher', { replace: true })
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() || null },
            emailRedirectTo: `${window.location.origin}/teacher`,
          },
        })
        if (err) throw err
        if (data.session) navigate('/teacher', { replace: true })
        else {
          setInfo('가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.')
          setMode('login')
        }
      }
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
        <GraduationCap className="size-10 text-sky-ink" aria-hidden />
        교사 {mode === 'login' ? '로그인' : '가입'}
      </h1>

      <Card>
        <div className="mb-5">
          <ChoiceChips<Mode>
            options={[
              { value: 'login', label: '로그인' },
              { value: 'signup', label: '처음이에요 (가입)' },
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m)
              setError(null)
            }}
          />
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          {mode === 'signup' && (
            <div>
              <Label htmlFor="displayName">이름 (선택)</Label>
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="김선생" maxLength={40} />
            </div>
          )}
          <div>
            <Label htmlFor="email">이메일</Label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teacher@school.kr" />
          </div>
          <div>
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? '6자 이상' : ''}
            />
          </div>
          {info && <p className="rounded-2xl bg-mint-soft px-4 py-3 text-lg font-bold text-mint-ink">{info}</p>}
          <ErrorBox message={error} />
          <Button type="submit" variant="sky" size="lg" block loading={submitting}>
            {mode === 'login' ? '로그인' : '가입하기'}
          </Button>
        </form>
      </Card>
    </main>
  )
}
