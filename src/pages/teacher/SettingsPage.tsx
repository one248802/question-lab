import { useEffect, useState } from 'react'
import { Settings, UserRound } from 'lucide-react'
import { Button, Card, ErrorBox, Input, Label, PageTitle, Spinner } from '../../components/ui'
import { useTeacher } from '../../contexts/TeacherContext'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'

export default function SettingsPage() {
  const { loading, profile, reloadProfile } = useTeacher()
  const [displayName, setDisplayName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [savedName, setSavedName] = useState(false)
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

  if (loading) return <Spinner />

  return (
    <>
      <PageTitle icon={<Settings className="size-9 text-peach-ink" />} title="내 설정" />
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
          <p className="mt-3 text-ink-soft">{profile?.email}</p>
        </Card>
        <Card className="bg-cream">
          <p className="font-bold">설정 위치를 나눴어요.</p>
          <p className="mt-1 text-ink-soft">질문 투표·생각 나누기·교사 피드백은 「❓ 질문 상자 → 설정」에서, 생각 주제의 참여·등록 수·투표·결과 공개는 「💭 생각 상자 → 설정」에서 관리해요.</p>
        </Card>
      </div>
    </>
  )
}
