import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, GraduationCap } from 'lucide-react'
import { Button, Card, ChoiceChips, ErrorBox, Input, Label, Spinner } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'

// forgot: 비밀번호 재설정 메일 받기
type Mode = 'login' | 'signup' | 'forgot'

export default function TeacherLogin() {
  const navigate = useNavigate()
  const { user, isAnonymous, loading } = useAuth()
  // 재설정 링크가 만료돼 다시 받으러 온 경우 바로 메일 받기 화면으로
  const initialMode = (useLocation().state as { mode?: Mode } | null)?.mode === 'forgot' ? 'forgot' : 'login'
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  if (loading) return <Spinner />
  if (user && !isAnonymous) return <Navigate to="/teacher" replace />

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setInfo(null)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (mode === 'forgot') return sendResetMail()
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

  // Supabase 기본 비밀번호 재설정(recovery) 메일. 링크를 누르면 /reset-password 로 돌아옴
  const sendResetMail = async () => {
    if (!email.trim()) return setError('가입한 이메일을 넣어 주세요.')
    setSubmitting(true)
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (err) throw err
      // 가입 여부를 알려 주지 않도록 항상 같은 안내
      setInfo(
        '이 이메일로 가입된 계정이 있으면 비밀번호 재설정 메일을 보냈어요. 메일의 링크를 눌러 새 비밀번호를 정해 주세요. 메일이 안 보이면 스팸함도 확인해 주세요.',
      )
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
        {mode === 'forgot' ? '비밀번호 재설정' : `교사 ${mode === 'login' ? '로그인' : '가입'}`}
      </h1>

      <Card>
        {mode !== 'forgot' && (
          <div className="mb-5">
            <ChoiceChips<Mode>
              options={[
                { value: 'login', label: '로그인' },
                { value: 'signup', label: '처음이에요 (가입)' },
              ]}
              value={mode}
              onChange={switchMode}
            />
          </div>
        )}
        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          {mode === 'forgot' && <p className="text-lg">가입한 이메일을 넣으면 새 비밀번호를 정할 수 있는 링크를 메일로 보내 드려요.</p>}
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
          {mode !== 'forgot' && (
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
              {mode === 'login' && (
                <button type="button" onClick={() => switchMode('forgot')} className="mt-2 text-base font-bold text-sky-ink underline-offset-4 hover:underline">
                  비밀번호를 잊으셨나요?
                </button>
              )}
            </div>
          )}
          {info && <p className="rounded-2xl bg-mint-soft px-4 py-3 text-lg font-bold text-mint-ink">{info}</p>}
          <ErrorBox message={error} />
          <Button type="submit" variant="sky" size="lg" block loading={submitting}>
            {mode === 'login' ? '로그인' : mode === 'signup' ? '가입하기' : '재설정 메일 보내기'}
          </Button>
          {mode === 'forgot' ? (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="text-center text-lg font-bold text-ink-soft underline-offset-4 hover:underline"
            >
              로그인으로 돌아가기
            </button>
          ) : (
            <p className="text-center text-sm text-ink-soft">로그인은 이 브라우저에 유지돼요. 함께 쓰는 컴퓨터에서는 사용 후 꼭 로그아웃해 주세요.</p>
          )}
        </form>
      </Card>
    </main>
  )
}
