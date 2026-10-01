import { useEffect, useState } from 'react'
import { Heart, Settings, UserRound } from 'lucide-react'
import { NoClassYet } from '../../components/ClassPicker'
import { Button, Card, ErrorBox, Input, Label, PageTitle, Spinner, Toggle } from '../../components/ui'
import { useTeacher } from '../../contexts/TeacherContext'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { ClassRoom } from '../../lib/types'

export default function SettingsPage() {
  const { classes, loading, reload, profile, reloadProfile } = useTeacher()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [displayName, setDisplayName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [savedName, setSavedName] = useState(false)

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '')
  }, [profile])

  const setShowVotes = async (c: ClassRoom, next: boolean) => {
    setBusyId(c.id)
    setError(null)
    const { error: err } = await supabase.from('classes').update({ show_vote_results: next }).eq('id', c.id)
    if (err) setError(toMessage(err))
    await reload()
    setBusyId(null)
  }

  const saveName = async () => {
    if (!profile) return
    setSavingName(true)
    setError(null)
    const { error: err } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() || null })
      .eq('id', profile.id)
    setSavingName(false)
    if (err) return setError(toMessage(err))
    setSavedName(true)
    window.setTimeout(() => setSavedName(false), 1500)
    await reloadProfile()
  }

  if (loading) return <Spinner />

  return (
    <>
      <PageTitle icon={<Settings className="size-9 text-peach-ink" />} title="설정" />
      <div className="flex flex-col gap-6">
        <ErrorBox message={error} />

        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-display text-2xl">
            <Heart className="size-7 text-pink-ink" aria-hidden />
            투표 결과 공개
          </h2>
          <p className="mb-4 text-ink-soft">ON이면 학생 화면에 투표 수가 보여요. 선생님 화면에서는 항상 보여요.</p>
          {classes.length === 0 ? (
            <NoClassYet />
          ) : (
            <ul className="flex flex-col divide-y-2 divide-line">
              {classes.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-xl font-bold">{c.name}</p>
                    <p className="text-ink-soft">{c.show_vote_results ? '학생에게 공개' : '학생에게 비공개'}</p>
                  </div>
                  <Toggle
                    label={`${c.name} 투표 결과 공개`}
                    checked={c.show_vote_results}
                    disabled={busyId === c.id}
                    onChange={(next) => setShowVotes(c, next)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-display text-2xl">
            <UserRound className="size-7 text-sky-ink" aria-hidden />내 정보
          </h2>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <Label htmlFor="display-name">이름</Label>
              <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} placeholder="김선생" />
            </div>
            <Button size="lg" variant="sky" onClick={saveName} loading={savingName}>
              {savedName ? '저장됨!' : '저장'}
            </Button>
          </div>
          <p className="mt-3 text-ink-soft">{profile?.email}</p>
        </Card>
      </div>
    </>
  )
}
