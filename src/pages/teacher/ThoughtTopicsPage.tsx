import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Lightbulb, Plus, Settings, Trash2, Trophy } from 'lucide-react'
import { ClassPicker, NoClassYet } from '../../components/ClassPicker'
import { Badge, Button, Card, EmptyState, ErrorBox, Input, Label, PageTitle, Spinner } from '../../components/ui'
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
  max_items_per_student: number
  created_at: string
}

type TeacherThoughtItem = {
  id: string
  topic_id: string
  student_id: string | null
  content: string
  is_hidden: boolean
  created_by_teacher: boolean
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
      <PageTitle
        icon={<Lightbulb className="size-9 text-mint-ink" />}
        title="생각 상자"
        right={classes.length > 0 && <ClassPicker />}
      />
      {classes.length === 0 || !selectedClassId ? <NoClassYet /> : <ClassThoughtTopics key={selectedClassId} classId={selectedClassId} />}
    </>
  )
}

function ClassThoughtTopics({ classId }: { classId: string }) {
  const [topics, setTopics] = useState<Topic[]>([])
  const [title, setTitle] = useState('')
  const [maxVotes, setMaxVotes] = useState('1')
  const [maxItems, setMaxItems] = useState('3')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [items, setItems] = useState<TeacherThoughtItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [candidateDraft, setCandidateDraft] = useState('')
  const [candidateBusy, setCandidateBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('thought_topics')
      .select('id, class_id, title, is_open, results_visible, max_votes, max_items_per_student, created_at')
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
    const itemLimit = Number(maxItems)
    if (!t) return setError('생각 주제를 적어 주세요.')
    if (!Number.isInteger(votes) || votes < 1 || votes > 10) return setError('투표 개수는 1~10개로 정해 주세요.')
    if (!Number.isInteger(itemLimit) || itemLimit < 0 || itemLimit > 10) return setError('학생 생각 등록 수는 0~10개로 정해 주세요.')
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('thought_topics').insert({ class_id: classId, title: t, max_votes: votes, max_items_per_student: itemLimit })
    setSaving(false)
    if (err) return setError(toMessage(err))
    setTitle('')
    setMaxVotes('1')
    setMaxItems('3')
    await load()
  }

  const remove = async (topic: Topic) => {
    if (!window.confirm(`「${topic.title}」 생각 주제를 삭제할까요?\n\n올라온 생각과 투표도 함께 삭제돼요.`)) return
    const { error: err } = await supabase.from('thought_topics').delete().eq('id', topic.id)
    if (err) return setError(toMessage(err))
    if (expandedId === topic.id) {
      setExpandedId(null)
      setItems([])
      setCandidateDraft('')
    }
    await load()
  }

  const fetchItems = async (topic: Topic) => {
    setItemsLoading(true)
    const [itemResult, voteResult, studentResult] = await Promise.all([
      supabase.from('thought_items').select('id, topic_id, student_id, content, is_hidden, created_by_teacher, created_at').eq('topic_id', topic.id).order('created_at'),
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
      const s = i.student_id ? students.get(i.student_id as string) : undefined
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
      setCandidateDraft('')
      return
    }
    setExpandedId(topic.id)
    setCandidateDraft('')
    await fetchItems(topic)
  }

  const addTeacherCandidate = async (topic: Topic) => {
    const content = candidateDraft.trim()
    if (!content) return setError('후보 내용을 적어 주세요.')
    if (content.length > 120) return setError('후보는 120자까지 쓸 수 있어요.')
    setCandidateBusy(true)
    setError(null)
    const { error: err } = await supabase.rpc('create_teacher_thought_item', { p_topic_id: topic.id, p_content: content })
    setCandidateBusy(false)
    if (err) return setError(toMessage(err))
    setCandidateDraft('')
    await fetchItems(topic)
  }

  const toggleHidden = async (item: TeacherThoughtItem) => {
    const { error: err } = await supabase.from('thought_items').update({ is_hidden: !item.is_hidden }).eq('id', item.id)
    if (err) return setError(toMessage(err))
    const topic = topics.find((t) => t.id === item.topic_id)
    if (topic) await fetchItems(topic)
  }

  const deleteItem = async (item: TeacherThoughtItem) => {
    if (!window.confirm('이 생각 후보를 삭제할까요?')) return
    const { error: err } = await supabase.from('thought_items').delete().eq('id', item.id)
    if (err) return setError(toMessage(err))
    const topic = topics.find((t) => t.id === item.topic_id)
    if (topic) await fetchItems(topic)
  }

  if (loading) return <Spinner />

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg text-ink-soft">주제를 만들고 학생 생각 또는 선생님 후보를 모아 투표할 수 있어요.</p>
        <Link to="/teacher/thought-settings"><Button variant="secondary"><Settings className="size-5" aria-hidden />생각 상자 설정</Button></Link>
      </div>
      <ErrorBox message={error} />

      <Card className="bg-mint-soft/40">
        <form onSubmit={create} className="grid gap-4 lg:grid-cols-[1fr_9rem_9rem_auto] lg:items-end">
          <div>
            <Label htmlFor="thought-topic-title">새 생각 주제</Label>
            <Input id="thought-topic-title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} maxLength={120} placeholder="예: 우리 반 파티에서 먹고 싶은 음식은?" />
          </div>
          <div>
            <Label htmlFor="thought-max-items">1인당 생각</Label>
            <Input id="thought-max-items" type="number" min={0} max={10} value={maxItems} onChange={(e) => setMaxItems(e.target.value)} />
            <p className="mt-1 text-xs text-ink-soft">0 = 교사 후보만</p>
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
                    <Badge className="bg-lilac-soft text-lilac-ink">학생 생각 {topic.max_items_per_student}개</Badge>
                  </div>
                </div>
                <Button variant="danger" size="sm" onClick={() => remove(topic)}><Trash2 className="size-4" aria-hidden />삭제</Button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => toggleItems(topic)}>{expandedId === topic.id ? '후보 닫기' : '생각 후보·투표 보기'}</Button>
                <Link to="/teacher/thought-settings"><Button variant="ghost" size="sm"><Settings className="size-4" aria-hidden />참여·투표 설정</Button></Link>
              </div>

              {expandedId === topic.id && (
                <div className="mt-4 border-t-2 border-line pt-4">
                  <div className="mb-4 rounded-2xl bg-mint-soft/40 p-4">
                    <p className="mb-2 font-bold">선생님 후보 추가</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input value={candidateDraft} onChange={(e) => setCandidateDraft(e.target.value.slice(0, 120))} maxLength={120} placeholder="학생 발표를 듣고 후보를 직접 적어도 돼요." />
                      <Button variant="mint" onClick={() => addTeacherCandidate(topic)} loading={candidateBusy}><Plus className="size-4" aria-hidden />후보 추가</Button>
                    </div>
                    {topic.max_items_per_student === 0 && <p className="mt-2 text-sm font-bold text-mint-ink">학생 생각 등록은 0개예요. 학생은 선생님이 올린 후보에 투표만 해요.</p>}
                  </div>

                  {itemsLoading ? <Spinner /> : items.length === 0 ? (
                    <p className="text-ink-soft">아직 올라온 생각 후보가 없어요.</p>
                  ) : (
                    <ul className="grid gap-2 md:grid-cols-2">
                      {[...items].sort((a, b) => b.vote_count - a.vote_count).map((item) => (
                        <li key={item.id} className={`rounded-2xl border-2 p-4 ${item.is_hidden ? 'border-pink bg-pink-soft/30' : 'border-line bg-cream'}`}>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="font-bold">{item.created_by_teacher ? '선생님 후보' : `${item.student_number ?? '?'}번 ${item.student_name ?? '학생'}`}</span>
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
