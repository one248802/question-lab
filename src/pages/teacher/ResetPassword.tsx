import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CircleCheck, KeyRound, Link2Off } from 'lucide-react'
import { Button, Card, ErrorBox, Input, Label, Spinner } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { initialAuthRedirect, markRecoveryRedirectHandled } from '../../lib/authRedirect'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'

const MIN_PASSWORD_LENGTH = 6

/**
 * 비밀번호 재설정 메일의 링크로 들어오는 화면.
 * supabase-js 가 링크 주소의 값으로 복구(recovery) 세션을 만들어 두므로, 여기서는 새 비밀번호만 받아 updateUser 로 바꿉니다.
 */
export default function ResetPassword() {
  const navigate = useNavigate()
  const { user, isAnonymous, loading } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    markRecoveryRedirectHandled()
  }, [])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`새 비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상으로 넣어 주세요.`)
    if (password !== confirm) return setError('새 비밀번호와 확인이 서로 달라요. 다시 넣어 주세요.')
    setSubmitting(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) throw err
      setDone(true)
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  // 링크가 만료됐거나 이미 쓴 링크면 주소에 오류가 담겨 옴. 이때는 이미 로그인돼 있어도 바꾸기 화면을 보여 주지 않음
  const linkError = initialAuthRedirect?.type === 'error' ? initialAuthRedirect : null
  const hasTeacherSession = Boolean(user && !isAnonymous)

  let body
  if (loading) body = <Spinner />
  else if (done)
    body = (
      <Card className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 font-display text-2xl">
          <CircleCheck className="size-7 text-mint-ink" aria-hidden />
          비밀번호를 바꿨어요
        </h2>
        <p className="text-lg">다음부터는 새 비밀번호로 로그인해 주세요.</p>
        <Button variant="sky" size="lg" block onClick={() => navigate('/teacher', { replace: true })}>
          교사 화면으로 가기
        </Button>
      </Card>
    )
  else if (linkError || !hasTeacherSession)
    body = (
      <Card className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 font-display text-2xl">
          <Link2Off className="size-7 text-pink-ink" aria-hidden />
          링크를 쓸 수 없어요
        </h2>
        <p className="text-lg">
          {linkError?.code === 'otp_expired' ? '재설정 링크가 만료되었거나 이미 사용되었어요.' : '재설정 링크가 올바르지 않거나 만료되었어요.'} 재설정 메일을
          다시 받아 주세요.
        </p>
        <p className="text-sm text-ink-soft">가장 최근에 받은 메일의 링크만 쓸 수 있어요.</p>
        <Button variant="sky" size="lg" block onClick={() => navigate('/teacher/login', { replace: true, state: { mode: 'forgot' } })}>
          재설정 메일 다시 받기
        </Button>
      </Card>
    )
  else
    body = (
      <Card>
        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          {user?.email && (
            <p className="text-lg">
              <span className="font-bold">{user.email}</span> 계정의 새 비밀번호를 정해 주세요.
            </p>
          )}
          {/* 비밀번호 관리 프로그램이 어느 계정인지 알 수 있도록 */}
          <input type="email" name="username" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
          <div>
            <Label htmlFor="newPassword">새 비밀번호</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`${MIN_PASSWORD_LENGTH}자 이상`}
            />
          </div>
          <div>
            <Label htmlFor="confirmPassword">새 비밀번호 확인</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="한 번 더 넣어 주세요"
            />
          </div>
          <ErrorBox message={error} />
          <Button type="submit" variant="sky" size="lg" block loading={submitting}>
            비밀번호 바꾸기
          </Button>
        </form>
      </Card>
    )

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6">
      <Link to="/" className="mb-6 inline-flex w-fit items-center gap-2 rounded-xl px-2 py-2 text-lg font-bold text-ink-soft hover:bg-ink/5">
        <ArrowLeft className="size-6" aria-hidden />
        처음으로
      </Link>
      <h1 className="mb-6 flex items-center gap-3 font-display text-4xl">
        <KeyRound className="size-10 text-sky-ink" aria-hidden />새 비밀번호 정하기
      </h1>
      {body}
    </main>
  )
}
