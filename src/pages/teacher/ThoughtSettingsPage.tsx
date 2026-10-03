import { useCallback, useEffect, useState } from 'react'
import { Lightbulb, Settings } from 'lucide-react'
import { ClassPicker, NoClassYet } from '../../components/ClassPicker'
import { Card, EmptyState, ErrorBox, Input, Label, PageTitle, Spinner, Toggle } from '../../components/ui'
import { useTeacher } from '../../contexts/TeacherContext'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'

type TopicSettings = {
  id: string
  class_id: string
  title: string
  is_open: boolean
  results_visible: boolean
  max_votes: number
  max_items_per_student: number
  created_at: string
}

export default function ThoughtSettingsPage() {
  const { classes, loading: classesLoading, selectedClassId } = useTeacher()
  if (classesLoading) return <Spinner />

  return (
    <>
      <PageTitle icon={<Settings className="size-9 text-mint-ink" />} title="생각 상자 설정" right={classes.length > 0 && <ClassPicker />} />
      {classes.length === 0 || !selectedClassId ? <NoClassYet /> : <ClassThoughtSettings key={selectedClassId} classId={selectedClassId} />}
    </>
  )
}

function ClassThoughtSettings({ classId }: { classId: string }) {
  const [topics, setTopics] = useState<TopicSettings[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('thought_topics')
      .select('id, class_id, title, is_open, results_visible, max_votes, max_items_per_student, created_at')
      .eq('class_id', classId)
      .order('created_at', { ascending: false })
    if (err) setError(toMessage(err))
    else {
      setTopics((data ?? []) as TopicSettings[])
      setError(null)
    }
    setLoading(false)
  }, [classId])

  useEffect(() => { load() }, [load])

  const update = async (topic: TopicSettings, patch: Partial<Pick<TopicSettings, 'is_open' | 'results_visible' | 'max_votes' | 'max_items_per_student'>>) => {
    setBusyId(topic.id)
    setError(null)
    const { error: err } = await supabase.from('thought_topics').update(patch).eq('id', topic.id)
    if (err) setError(toMessage(err))
    await load()
    setBusyId(null)
  }

  if (loading) return <Spinner />

  return (
    <div className="flex flex-col gap-5">
      <p className="text-lg text-ink-soft">생각 상자 설정은 주제마다 따로 정해요. 학생 생각 등록 수를 0개로 두면 선생님이 후보를 올리고 학생은 투표만 할 수 있어요.</p>
      <ErrorBox message={error} />
      {topics.length === 0 ? (
        <EmptyState icon={<Lightbulb className="size-14" />} title="아직 생각 주제가 없어요" />
      ) : (
        <ul className="flex flex-col gap-4">
          {topics.map((topic) => (
            <li key={topic.id} className="rounded-3xl border-2 border-line bg-paper p-5 shadow-pop">
              <h2 className="text-2xl font-bold break-words">{topic.title}</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-cream p-4">
                  <Label htmlFor={`items-${topic.id}`}>학생 1인당 생각 등록 수</Label>
                  <Input
                    id={`items-${topic.id}`}
                    type="number"
                    min={0}
                    max={10}
                    defaultValue={topic.max_items_per_student}
                    disabled={busyId === topic.id}
                    onBlur={(e) => {
                      const n = Number(e.currentTarget.value)
                      if (!Number.isInteger(n) || n < 0 || n > 10) {
                        e.currentTarget.value = String(topic.max_items_per_student)
                        return
                      }
                      if (n !== topic.max_items_per_student) update(topic, { max_items_per_student: n })
                    }}
                  />
                  <p className="mt-2 text-sm text-ink-soft">0개 = 학생은 후보를 올리지 않고 투표만 해요. 선생님이 「생각 주제」 화면에서 후보를 올릴 수 있어요.</p>
                </div>
                <div className="rounded-2xl bg-cream p-4">
                  <Label htmlFor={`votes-${topic.id}`}>학생 1인당 투표 수</Label>
                  <Input
                    id={`votes-${topic.id}`}
                    type="number"
                    min={1}
                    max={10}
                    defaultValue={topic.max_votes}
                    disabled={busyId === topic.id}
                    onBlur={(e) => {
                      const n = Number(e.currentTarget.value)
                      if (!Number.isInteger(n) || n < 1 || n > 10) {
                        e.currentTarget.value = String(topic.max_votes)
                        return
                      }
                      if (n !== topic.max_votes) update(topic, { max_votes: n })
                    }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-cream p-4">
                  <div><p className="font-bold">학생 참여</p><p className="text-sm text-ink-soft">투표를 열고 닫아요. 등록 수가 1개 이상이면 생각 등록도 함께 열려요.</p></div>
                  <Toggle label={`${topic.title} 학생 참여`} checked={topic.is_open} disabled={busyId === topic.id} onChange={(next) => update(topic, { is_open: next })} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-cream p-4">
                  <div><p className="font-bold">결과 공개</p><p className="text-sm text-ink-soft">학생 화면에 득표 수와 1~3위 랭킹을 보여요.</p></div>
                  <Toggle label={`${topic.title} 결과 공개`} checked={topic.results_visible} disabled={busyId === topic.id} onChange={(next) => update(topic, { results_visible: next })} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
