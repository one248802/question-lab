import { useEffect, useState } from 'react'
import { LockKeyhole, UserRound } from 'lucide-react'
import { Button, Card, ErrorBox, Input, Label, PageTitle, Spinner } from '../../components/ui'
import { useTeacher } from '../../contexts/TeacherContext'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'

export default function SettingsPage() {
  const { loading, profile, reloadProfile } = useTeacher()
  const [displayName, setDisplayName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [savedName, setSavedName] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [savedPassword, setSavedPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '')
  }, [profile])

  const saveName = async () => {
    if (!profile) return
    setSavingName(true)
    setError(null)
    const { error: err } = await supabase.from('profiles').update({ display_name: displayName.trim() || null }).eq('id', profile.id)
    setSavingName(false)
    if (err) return setError(toMessage(err))
    setSavedName(true)
    window.setTimeout(() => setSavedName(false), 1500)
    await reloadProfile()
  }

  const changePassword = async () => {
    setError(null)
    setSavedPassword(false)
    if (newPassword.length < 6) return setError('새 비밀번호는 6자 이상 입력해 주세요.')
    if (newPassword !== confirmPassword) return setError('새 비밀번호와 비밀번호 확인이 일치하지 않아요.')

    setSavingPassword(true)
    const { error: err } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPassword(false)
    if (err) return setError(toMessage(err))

    setNewPassword('')
    setConfirmPassword('')
    setSavedPassword(true)
    window.setTimeout(() => setSavedPassword(false), 2000)
  }

  if (loading) return <Spinner />

  return (
    <>
      <PageTitle icon={<UserRound className="size-9 text-peach-ink" />} title="내 정보" />
      <div className="flex max-w-3xl flex-col gap-6">
        <ErrorBox message={error} />

        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-display text-2xl"><UserRound className="size-7 text-sky-ink" aria-hidden />내 정보</h2>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <Label htmlFor="display-name">이름</Label>
              <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} placeholder="김선생" />
            </div>
            <Button size="lg" variant="sky" onClick={saveName} loading={savingName}>{savedName ? '저장됨!' : '저장'}</Button>
          </div>
          <div className="mt-4">
            <Label>이메일</Label>
            <p className="rounded-2xl border-2 border-line bg-cream px-4 py-3 text-ink-soft">{profile?.email}</p>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-display text-2xl"><LockKeyhole className="size-7 text-lilac-ink" aria-hidden />비밀번호 변경</h2>
          <div className="grid gap-4">
            <div>
              <Label htmlFor="new-password">새 비밀번호</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="6자 이상 입력"
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">새 비밀번호 확인</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') changePassword()
                }}
                placeholder="새 비밀번호를 한 번 더 입력"
              />
            </div>
            <div className="flex justify-end">
              <Button size="lg" variant="secondary" onClick={changePassword} loading={savingPassword} disabled={!newPassword || !confirmPassword}>
                {savedPassword ? '변경됨!' : '비밀번호 변경'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}
