import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Eye, EyeOff, Lightbulb, Plus, Trash2, Trophy } from 'lucide-react'
import { ClassPicker, NoClassYet } from '../../components/ClassPicker'
import { Badge, Button, Card, EmptyState, ErrorBox, Input, Label, PageTitle, Spinner, Toggle } from '../../components/ui'
import { useTeacher } from '../../contexts/TeacherContext'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'

type Topic = {
  id: string
  class_id: string
  title: string
  is_open: boolean
  results_visible: boolean
  max_votes: number
  created_at: string
}

type TeacherThoughtItem = {
  id: string
  topic_id: string
  student_id: string
  content: string
  is_hidden: boolean
  created_at: string
  student_number: number | null
  student_name: string | null
  vote_count: number
}

export default function ThoughtTopicsPage() {
  const { classes, loading: classesLoading, selectedClassId } = useTeacher()
  if (classesLoading) return <Spinner />

  return (
    <>
      <PageTitle icon={<Lightbulb className="size-9 text-mint-ink" />} title="생각 상자" right={classes.length > 0 && <ClassPicker />} />
      {classes.length === 0 || !selectedClassId ? <NoClassYet /> : <ClassThoughtTopics key={selectedClassId} classId={selectedClassId} />}
    </>
  )
}

function ClassThoughtTopics({ classId }: { classId: string }) {
  const [topics, setTopics] = useState<Topic[]>([])
  const [title, setTitle] = useState('')
  const [maxVotes, setMaxVotes] = useState('1')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [items, setItems] = useState<TeacherThoughtItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('thought_topics')
      .select('id, class_id, title, is_open, results_visible, max_votes, created_at')
      .eq('class_id', classId)
      .order('created_at', { ascending: false })
    if (err) setError(toMessage(err))
    else {
      setError(null)
      setTopics((data ?? []) as Topic[])
    }
    setLoading(false)
  }, [classId])

  useEffect(() => { load() }, [load])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    const votes = Number(maxVotes)
    if (!t) return setError('생각 주제를 적어 주세요.')
    if (!Number.isInteger(votes) || votes < 1 || votes > 10) return setError('투표 개수는 1~10개로 정해 주세요.')
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('thought_topics').insert({ class_id: classId, title: t, max_votes: votes })
    setSaving(false)
    if (err) return setError(toMessage(err))
    setTitle('')
    setMaxVotes('1')
    await load()
  }

  const update = async (topic: Topic, patch: Partial<Pick<Topic, 'is_open' | 'results_visible' | 'max_votes'>>) => {
    setError(null)
    const { error: err } = await supabase.from('thought_topics').update(patch).eq('id', topic.id)
    if (err) return setError(toMessage(err))
    await load()
  }

  const remove = async (topic: Topic) => {
    if (!window.confirm(`「${topic.title}」 생각 주제를 삭제할까요?\n\n학생들이 올린 생각과 투표도 함께 삭제돼요.`)) return
    const { error: err } = await supabase.from('thought_topics').delete().eq('id', topic.id)
    if (err) return setError(toMessage(err))
    if (expandedId === topic.id) {
      setExpandedId(null)
      setItems([])
    }
    await load()
  }

  const fetchItems = async (topic: Topic) => {
    setItemsLoading(true)
    const [itemResult, voteResult, studentResult] = await Promise.all([
      supabase.from('thought_items').select('id, topic_id, student_id, content, is_hidden, created_at').eq('topic_id', topic.id).order('created_at'),
      supabase.from('thought_votes').select('item_id'),
      supabase.from('students').select('id, student_number, name').eq('class_id', classId),
    ])
    setItemsLoading(false)
    if (itemResult.error || voteResult.error || studentResult.error) {
      setError(toMessage(itemResult.error ?? voteResult.error ?? studentResult.error))
      return false
    }

    const votes = new Map<string, number>()
    for (const row of voteResult.data ?? []) votes.set(row.item_id as string, (votes.get(row.item_id as string) ?? 0) + 1)
    const students = new Map((studentResult.data ?? []).map((s) => [s.id as string, s]))
    setItems((itemResult.data ?? []).map((i) => {
      const s = students.get(i.student_id as string)
      return {
        ...(i as Omit<TeacherThoughtItem, 'student_number' | 'student_name' | 'vote_count'>),
        student_number: s?.student_number ?? null,
        student_name: s?.name ?? null,
        vote_count: votes.get(i.id as string) ?? 0,
      }
    }))
    return true
  }

  const toggleItems = async (topic: Topic) => {
    if (expandedId === topic.id) {
      setExpandedId(null)
      setItems([])
      return
    }
    setExpandedId(topic.id)
    await fetchItems(topic)
  }

  const toggleHidden = async (item: TeacherThoughtItem) => {
    const { error: err } = await supabase.from('thought_items').update({ is_hidden: !item.is_hidden }).eq('id', item.id)
    if (err) return setError(toMessage(err))
    const topic = topics.find((t) => t.id === item.topic_id)
    if (topic) await fetchItems(topic)
  }

  const deleteItem = async (item: TeacherThoughtItem) => {
    if (!window.confirm('이 학생 생각을 삭제할까요?')) return
    const { error: err } = await supabase.from('thought_items').delete().eq('id', item.id)
    if (err) return setError(toMessage(err))
    const topic = topics.find((t) => t.id === item.topic_id)
    if (topic) await fetchItems(topic)
  }

  if (loading) return <Spinner />

  return (
    <div className="flex flex-col gap-5">
      <p className="text-lg text-ink-soft">주제를 열면 학생들이 자유롭게 생각을 올리고 정해진 수만큼 투표할 수 있어요. 결과 공개를 켜면 학생 화면에 득표 수와 1~3위 시상대가 보여요.</p>
      <ErrorBox message={error} />

      <Card className="bg-mint-soft/40">
        <form onSubmit={create} className="grid gap-4 md:grid-cols-[1fr_8rem_auto] md:items-end">
          <div>
            <Label htmlFor="thought-topic-title">새 생각 주제</Label>
            <Input id="thought-topic-title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} maxLength={120} placeholder="예: 우리 반 파티에서 먹고 싶은 음식은?" />
          </div>
          <div>
            <Label htmlFor="thought-max-votes">1인당 표</Label>
            <Input id="thought-max-votes" type="number" min={1} max={10} value={maxVotes} onChange={(e) => setMaxVotes(e.target.value)} />
          </div>
          <Button type="submit" variant="mint" size="lg" loading={saving}><Plus className="size-5" aria-hidden />주제 만들기</Button>
        </form>
      </Card>

      {topics.length === 0 ? (
        <EmptyState icon={<Lightbulb className="size-14" />} title="아직 생각 주제가 없어요" />
      ) : (
        <ul className="flex flex-col gap-4">
          {topics.map((topic) => (
            <li key={topic.id} className="rounded-3xl border-2 border-line bg-paper p-5 shadow-pop">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-2xl font-bold break-words">{topic.title}</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge className={topic.is_open ? 'bg-mint-soft text-mint-ink' : 'bg-line text-ink-soft'}>{topic.is_open ? '학생 참여 중' : '참여 닫힘'}</Badge>
                    {topic.results_visible && <Badge className="bg-butter-soft text-butter-ink"><Trophy className="mr-1 size-4" aria-hidden />결과 공개</Badge>}
                    <Badge className="bg-sky-soft text-sky-ink">1인 {topic.max_votes}표</Badge>
                  </div>
                </div>
                <Button variant="danger" size="sm" onClick={() => remove(topic)}><Trash2 className="size-4" aria-hidden />삭제</Button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
                  <div><p className="font-bold">학생 참여</p><p className="text-sm text-ink-soft">생각 등록과 투표를 열고 닫아요.</p></div>
                  <Toggle label={`${topic.title} 학생 참여`} checked={topic.is_open} onChange={(next) => update(topic, { is_open: next })} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
                  <div><p className="font-bold">결과 공개</p><p className="text-sm text-ink-soft">득표 수와 랭킹을 학생에게 보여요.</p></div>
                  <Toggle label={`${topic.title} 결과 공개`} checked={topic.results_visible} onChange={(next) => update(topic, { results_visible: next })} />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => toggleItems(topic)}>{expandedId === topic.id ? '학생 생각 닫기' : '학생 생각·투표 보기'}</Button>
              </div>

              {expandedId === topic.id && (
                <div className="mt-4 border-t-2 border-line pt-4">
                  {itemsLoading ? <Spinner /> : items.length === 0 ? (
                    <p className="text-ink-soft">아직 학생이 올린 생각이 없어요.</p>
                  ) : (
                    <ul className="grid gap-2 md:grid-cols-2">
                      {[...items].sort((a, b) => b.vote_count - a.vote_count).map((item) => (
                        <li key={item.id} className={`rounded-2xl border-2 p-4 ${item.is_hidden ? 'border-pink bg-pink-soft/30' : 'border-line bg-cream'}`}>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="font-bold">{item.student_number ?? '?'}번 {item.student_name ?? '학생'}</span>
                            <Badge className="bg-butter-soft text-butter-ink">{item.vote_count}표</Badge>
                          </div>
                          <p className="break-words text-lg">{item.content}</p>
                          <div className="mt-3 flex gap-2">
                            <Button variant="secondary" size="sm" onClick={() => toggleHidden(item)}>{item.is_hidden ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}{item.is_hidden ? '다시 보이기' : '숨기기'}</Button>
                            <Button variant="danger" size="sm" onClick={() => deleteItem(item)}><Trash2 className="size-4" aria-hidden />삭제</Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
