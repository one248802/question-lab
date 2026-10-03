import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Archive,
  Clock,
  Eye,
  EyeOff,
  Heart,
  Inbox,
  MessageCircleQuestion,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
} from 'lucide-react'
import { ClassPicker, NoClassYet } from '../../components/ClassPicker'
import { Badge, Button, ChoiceChips, EmptyState, ErrorBox, Input, PageTitle, Spinner, cx } from '../../components/ui'
import { useTeacher } from '../../contexts/TeacherContext'
import { formatDateTime, localDateKey, startOfWeek } from '../../lib/date'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { QuestionTopic, QuestionTopicStatus, TeacherQuestion } from '../../lib/types'

const POLL_MS = 15_000

type Sort = 'new' | 'votes'
type Visibility = 'all' | 'visible' | 'hidden'
type DateFilter = 'all' | 'today' | 'week' | 'date'

interface Row extends Omit<TeacherQuestion, 'vote_count'> {
  votes: Array<{ count: number }>
}

const STATUS_META: Record<QuestionTopicStatus, { label: string; description: string; className: string }> = {
  active: {
    label: '진행 중',
    description: '현재 학생 활동용',
    className: 'bg-mint-soft text-mint-ink',
  },
  archived: {
    label: '보관',
    description: '작성 종료, 기록 유지',
    className: 'bg-sky-soft text-sky-ink',
  },
  hidden: {
    label: '숨김',
    description: '학생에게 완전히 숨김',
    className: 'bg-line text-ink-soft',
  },
}

function topicError(err: unknown) {
  const msg = toMessage(err)
  if (msg.includes('duplicate key')) return '이미 같은 이름의 질문 주제가 있어요.'
  return msg
}

export default function QuestionsPage() {
  const { classes, loading: classesLoading, selectedClassId, reload: reloadStats } = useTeacher()

  const [questions, setQuestions] = useState<TeacherQuestion[]>([])
  const [topics, setTopics] = useState<QuestionTopic[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<Visibility>('all')
  const [sort, setSort] = useState<Sort>('new')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [pickedDate, setPickedDate] = useState(() => localDateKey(new Date()))
  const [topicFilter, setTopicFilter] = useState<string | null>(null)
  const [newTopicName, setNewTopicName] = useState('')
  const [topicBusy, setTopicBusy] = useState<string | null>(null)
  const [creatingTopic, setCreatingTopic] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const todayKey = localDateKey(new Date(now))

  const loadTopics = useCallback(async () => {
    if (!selectedClassId) return
    const { data, error: err } = await supabase
      .from('question_topics')
      .select('id, class_id, name, status, created_at, updated_at')
      .eq('class_id', selectedClassId)
      .order('created_at', { ascending: true })

    if (err) {
      setError(`질문 주제를 불러오지 못했어요. ${toMessage(err)}`)
      return
    }
    setTopics((data ?? []) as QuestionTopic[])
  }, [selectedClassId])

  const load = useCallback(async () => {
    if (!selectedClassId) return
    const [topicResult, questionResult] = await Promise.all([
      supabase
        .from('question_topics')
        .select('id, class_id, name, status, created_at, updated_at')
        .eq('class_id', selectedClassId)
        .order('created_at', { ascending: true }),
      supabase
        .from('questions')
        .select('id, class_id, student_id, topic_id, content, is_hidden, created_at, student:students(student_number, name), votes(count)')
        .eq('class_id', selectedClassId)
        .is('superseded_at', null)
        .order('created_at', { ascending: false }),
    ])

    setNow(Date.now())
    if (topicResult.error) setError(`질문 주제를 불러오지 못했어요. ${toMessage(topicResult.error)}`)
    else setTopics((topicResult.data ?? []) as QuestionTopic[])

    if (questionResult.error) setError(toMessage(questionResult.error))
    else {
      setQuestions(
        ((questionResult.data ?? []) as unknown as Row[]).map(({ votes, ...q }) => ({
          ...q,
          vote_count: votes?.[0]?.count ?? 0,
        })),
      )
      if (!topicResult.error) setError(null)
    }
    setLoading(false)
  }, [selectedClassId])

  useEffect(() => {
    setLoading(true)
    setTopicFilter(null)
    load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const currentTopic = topics.find((topic) => topic.id === topicFilter) ?? null
  const topicNames = useMemo(() => new Map(topics.map((topic) => [topic.id, topic.name])), [topics])
  const topicCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const question of questions) {
      if (!question.topic_id) continue
      counts.set(question.topic_id, (counts.get(question.topic_id) ?? 0) + 1)
    }
    return counts
  }, [questions])

  const shown = useMemo(() => {
    let list = questions
    if (dateFilter === 'today') {
      list = list.filter((q) => localDateKey(q.created_at) === todayKey)
    } else if (dateFilter === 'week') {
      const from = startOfWeek(new Date(now)).getTime()
      list = list.filter((q) => new Date(q.created_at).getTime() >= from)
    } else if (dateFilter === 'date' && pickedDate) {
      list = list.filter((q) => localDateKey(q.created_at) === pickedDate)
    }
    if (currentTopic) list = list.filter((q) => q.topic_id === currentTopic.id)
    if (visibility === 'visible') list = list.filter((q) => !q.is_hidden)
    if (visibility === 'hidden') list = list.filter((q) => q.is_hidden)
    if (sort === 'votes') list = [...list].sort((a, b) => b.vote_count - a.vote_count)
    return list
  }, [questions, dateFilter, todayKey, now, pickedDate, currentTopic, visibility, sort])

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 2500)
  }

  const createTopic = async () => {
    if (!selectedClassId || creatingTopic) return
    const name = newTopicName.trim()
    if (!name) return setError('질문 주제 이름을 입력해 주세요.')
    if (name.length > 40) return setError('질문 주제 이름은 40자까지 입력할 수 있어요.')

    setCreatingTopic(true)
    setError(null)
    const { error: err } = await supabase
      .from('question_topics')
      .insert({ class_id: selectedClassId, name, status: 'hidden' })
    setCreatingTopic(false)

    if (err) return setError(topicError(err))
    setNewTopicName('')
    flash(`「${name}」 질문 주제를 만들었어요. 처음에는 숨김 상태예요.`)
    await loadTopics()
  }

  const renameTopic = async (topic: QuestionTopic) => {
    const next = window.prompt('질문 주제 이름을 바꿔 주세요. (1~40자)', topic.name)?.trim()
    if (!next || next === topic.name) return
    if (next.length > 40) return setError('질문 주제 이름은 40자까지 입력할 수 있어요.')

    setTopicBusy(topic.id)
    setError(null)
    const { error: err } = await supabase.from('question_topics').update({ name: next }).eq('id', topic.id)
    setTopicBusy(null)
    if (err) return setError(topicError(err))
    flash('질문 주제 이름을 바꿨어요.')
    await loadTopics()
  }

  const changeTopicStatus = async (topic: QuestionTopic, status: QuestionTopicStatus) => {
    if (topic.status === status || topicBusy) return
    setTopicBusy(topic.id)
    setError(null)
    const { error: err } = await supabase.from('question_topics').update({ status }).eq('id', topic.id)
    setTopicBusy(null)
    if (err) return setError(topicError(err))
    flash(`「${topic.name}」을(를) ${STATUS_META[status].label} 상태로 바꿨어요.`)
    await loadTopics()
  }

  const deleteTopic = async (topic: QuestionTopic) => {
    if (topicBusy) return
    const count = topicCounts.get(topic.id) ?? 0
    const ok = window.confirm(
      `「${topic.name}」 질문 주제를 삭제할까요?\n\n이 주제의 질문과 모든 관련 기록이 함께 삭제됩니다.\n현재 질문 ${count}개와 질문 성장 이력, 투표, 생각 나눔, 선생님 피드백도 함께 삭제되며 복구할 수 없습니다.`,
    )
    if (!ok) return

    const confirmAgain = window.confirm('정말로 삭제할까요? 이 주제의 질문과 기록은 되돌릴 수 없습니다.')
    if (!confirmAgain) return

    setTopicBusy(topic.id)
    setError(null)
    const { data, error: err } = await supabase.rpc('delete_question_topic', { p_topic_id: topic.id })
    setTopicBusy(null)
    if (err) return setError(topicError(err))

    if (topicFilter === topic.id) setTopicFilter(null)
    flash(`「${topic.name}」 주제와 질문 기록 ${Number(data ?? 0)}개를 삭제했어요.`)
    await Promise.all([load(), reloadStats()])
  }

  const updateQuestion = async (id: string, patch: Pick<TeacherQuestion, 'is_hidden'>) => {
    setQuestions((list) => list.map((q) => (q.id === id ? { ...q, ...patch } : q)))
    const { error: err } = await supabase.from('questions').update(patch).eq('id', id)
    if (err) setError(toMessage(err))
    await load()
  }

  const removeQuestion = async (q: TeacherQuestion) => {
    const preview = q.content.length > 40 ? `${q.content.slice(0, 40)}…` : q.content
    const ok = window.confirm(
      `이 질문을 삭제할까요?\n\n「${preview}」\n\n삭제하면 되돌릴 수 없고, 이 질문에 받은 투표 ${q.vote_count}표도 함께 지워져요.`,
    )
    if (!ok) return

    setError(null)
    const { data, error: err } = await supabase.from('questions').delete().eq('id', q.id).select('id')
    if (err) setError(toMessage(err))
    else if (!data?.length) setError('질문을 삭제하지 못했어요. 새로고침 후 다시 시도해 주세요.')
    await Promise.all([load(), reloadStats()])
  }

  const refresh = async () => {
    setRefreshing(true)
    await Promise.all([load(), reloadStats()])
    setRefreshing(false)
  }

  if (classesLoading) return <Spinner />

  return (
    <>
      <PageTitle
        icon={<MessageCircleQuestion className="size-9 text-lilac-ink" />}
        title="우리반 질문 상자"
        right={
          classes.length > 0 && (
            <div className="flex items-center gap-2">
              <ClassPicker />
              <Button variant="secondary" size="sm" onClick={refresh} aria-label="새로고침" className="min-h-12">
                <RefreshCw className={cx('size-5', refreshing && 'animate-spin')} aria-hidden />
              </Button>
            </div>
          )
        }
      />

      {classes.length === 0 ? (
        <NoClassYet />
      ) : (
        <div className="@container flex flex-col gap-5">
          <section className="rounded-3xl border-2 border-line bg-paper p-4 shadow-pop sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <h2 className="font-display text-2xl sm:text-3xl">질문 주제 관리</h2>
              <div className="flex w-full gap-2 sm:w-auto">
                <Input
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value.slice(0, 40))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createTopic()
                  }}
                  placeholder="새 질문 주제"
                  aria-label="새 질문 주제"
                  className="min-w-0 sm:w-64"
                />
                <Button variant="sky" onClick={createTopic} loading={creatingTopic} disabled={!newTopicName.trim()}>
                  {!creatingTopic && <Plus className="size-5" aria-hidden />}
                  주제 만들기
                </Button>
              </div>
            </div>

            <div className="mb-4 grid gap-2 text-sm text-ink-soft sm:grid-cols-2 lg:grid-cols-4">
              <p className="rounded-2xl bg-mint-soft px-3 py-2"><strong className="text-mint-ink">진행 중</strong> · 현재 학생 활동용</p>
              <p className="rounded-2xl bg-sky-soft px-3 py-2"><strong className="text-sky-ink">보관</strong> · 작성 종료, 기록 유지</p>
              <p className="rounded-2xl bg-cream px-3 py-2"><strong className="text-ink">숨김</strong> · 학생에게 완전히 숨김</p>
              <p className="rounded-2xl bg-pink-soft px-3 py-2"><strong className="text-pink-ink">삭제</strong> · 주제와 관련 기록 삭제</p>
            </div>

            {topics.length === 0 ? (
              <p className="rounded-2xl bg-cream px-4 py-4 text-ink-soft">아직 질문 주제가 없어요. 새 주제를 만들어 주세요.</p>
            ) : (
              <div className="max-h-[24rem] overflow-y-auto rounded-2xl border-2 border-line bg-cream/30">
                <ul className="divide-y-2 divide-line">
                  {topics.map((topic) => {
                    const busy = topicBusy === topic.id
                    const meta = STATUS_META[topic.status]
                    const selectedTopic = topicFilter === topic.id
                    return (
                      <li
                        key={topic.id}
                        className={cx(
                          'flex flex-wrap items-center gap-3 px-3 py-3 transition sm:flex-nowrap',
                          selectedTopic ? 'bg-sky-soft/60' : 'hover:bg-paper/70',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setTopicFilter(selectedTopic ? null : topic.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-sky-soft/50 focus:outline-none focus:ring-2 focus:ring-sky"
                          aria-pressed={selectedTopic}
                          aria-label={`${topic.name} 질문 ${topicCounts.get(topic.id) ?? 0}개 보기`}
                        >
                          <span className="truncate text-lg font-bold">{topic.name}</span>
                          <Badge className={meta.className}>{meta.label}</Badge>
                          <span className="shrink-0 text-sm text-ink-soft">질문 {topicCounts.get(topic.id) ?? 0}개</span>
                        </button>

                        <Button variant="ghost" size="sm" onClick={() => renameTopic(topic)} disabled={busy} className="shrink-0">
                          <Pencil className="size-4" aria-hidden />이름 수정
                        </Button>

                        <div className="flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto">
                          <Button size="sm" variant={topic.status === 'active' ? 'mint' : 'secondary'} onClick={() => changeTopicStatus(topic, 'active')} disabled={busy || topic.status === 'active'}>
                            <PlayCircle className="size-4" aria-hidden />진행 중
                          </Button>
                          <Button size="sm" variant={topic.status === 'archived' ? 'sky' : 'secondary'} onClick={() => changeTopicStatus(topic, 'archived')} disabled={busy || topic.status === 'archived'}>
                            <Archive className="size-4" aria-hidden />보관
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => changeTopicStatus(topic, 'hidden')} disabled={busy || topic.status === 'hidden'}>
                            <EyeOff className="size-4" aria-hidden />숨김
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => deleteTopic(topic)} disabled={busy}>
                            <Trash2 className="size-4" aria-hidden />삭제
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl sm:text-3xl">{currentTopic ? `「${currentTopic.name}」 질문` : '전체 질문'}</h2>
            {currentTopic && (
              <Button size="sm" variant="secondary" onClick={() => setTopicFilter(null)}>
                전체 질문 보기
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ChoiceChips<Visibility>
              size="sm"
              options={[
                { value: 'all', label: '모두' },
                { value: 'visible', label: '공개' },
                { value: 'hidden', label: '숨김 질문' },
              ]}
              value={visibility}
              onChange={setVisibility}
            />
            <span className="hidden h-8 w-0.5 bg-line sm:block" />
            <ChoiceChips<Sort>
              size="sm"
              options={[
                { value: 'new', label: '최신순' },
                { value: 'votes', label: '투표순' },
              ]}
              value={sort}
              onChange={setSort}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-base font-bold text-ink-soft">날짜</span>
            <ChoiceChips<DateFilter>
              size="sm"
              options={[
                { value: 'all', label: '전체' },
                { value: 'today', label: '오늘' },
                { value: 'week', label: '이번 주' },
                { value: 'date', label: '날짜 선택' },
              ]}
              value={dateFilter}
              onChange={setDateFilter}
            />
            {dateFilter === 'date' && (
              <Input
                type="date"
                value={pickedDate}
                max={todayKey}
                onChange={(e) => setPickedDate(e.target.value)}
                aria-label="질문 날짜"
                className="min-h-10 w-auto text-base"
              />
            )}
          </div>

          <ErrorBox message={error} />
          {notice && <p className="rounded-2xl bg-mint-soft px-4 py-3 text-lg font-bold text-mint-ink" role="status">{notice}</p>}

          {loading ? (
            <Spinner />
          ) : shown.length === 0 ? (
            <EmptyState icon={<Inbox className="size-14" />} title={questions.length === 0 ? '질문이 없어요' : '조건에 맞는 질문이 없어요'} />
          ) : (
            <ul className="grid gap-4 @min-[34rem]:grid-cols-2 @min-[54rem]:grid-cols-3">
              {shown.map((q) => (
                <QuestionItem
                  key={q.id}
                  q={q}
                  topicName={q.topic_id ? topicNames.get(q.topic_id) ?? '알 수 없는 주제' : '주제 없음'}
                  onUpdate={updateQuestion}
                  onDelete={removeQuestion}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}

function QuestionItem({
  q,
  topicName,
  onUpdate,
  onDelete,
}: {
  q: TeacherQuestion
  topicName: string
  onUpdate: (id: string, patch: Pick<TeacherQuestion, 'is_hidden'>) => Promise<void>
  onDelete: (q: TeacherQuestion) => Promise<void>
}) {
  return (
    <li className={cx('flex min-w-0 flex-col gap-3 rounded-3xl border-2 p-5 shadow-pop', q.is_hidden ? 'border-dashed border-line-strong bg-cream opacity-80' : 'border-line bg-paper')}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-lilac-soft text-lilac-ink">{topicName}</Badge>
        {q.is_hidden && <Badge className="bg-line text-ink-soft">질문 숨김</Badge>}
      </div>

      <p className={cx('text-xl leading-relaxed font-medium break-words whitespace-pre-wrap', q.is_hidden && 'line-through decoration-ink-soft/40')}>
        {q.content}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-ink-soft">
        <span className="inline-flex items-center gap-1 font-bold text-ink">
          <UserRound className="size-5" aria-hidden />
          {q.student ? `${q.student.student_number}번 ${q.student.name}` : '알 수 없음'}
        </span>
        <span className="inline-flex items-center gap-1"><Clock className="size-5" aria-hidden />{formatDateTime(q.created_at)}</span>
        <span className="inline-flex items-center gap-1 font-bold text-pink-ink"><Heart className="size-5 fill-current" aria-hidden />{q.vote_count}표</span>
      </div>

      <div className="mt-1 flex flex-wrap gap-2">
        <Button size="sm" variant={q.is_hidden ? 'mint' : 'secondary'} onClick={() => onUpdate(q.id, { is_hidden: !q.is_hidden })}>
          {q.is_hidden ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
          {q.is_hidden ? '다시 공개' : '질문 숨기기'}
        </Button>
        <Button size="sm" variant="danger" onClick={() => onDelete(q)} className="sm:ml-auto">
          <Trash2 className="size-4" aria-hidden />삭제
        </Button>
      </div>
    </li>
  )
}