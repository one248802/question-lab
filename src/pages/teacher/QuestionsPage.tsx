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
  Search,
  Trash2,
  UserRound,
} from 'lucide-react'
import { ClassPicker, NoClassYet } from '../../components/ClassPicker'
import { Badge, Button, ChoiceChips, EmptyState, ErrorBox, Input, PageTitle, Spinner, cx } from '../../components/ui'
import { useTeacher } from '../../contexts/TeacherContext'
import { formatDateTime, localDateKey } from '../../lib/date'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { QuestionTopic, QuestionTopicStatus, TeacherQuestion } from '../../lib/types'

const POLL_MS = 15_000

type Sort = 'new' | 'votes'
type DateFilter = 'all' | 'today' | 'month' | 'range'

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
    description: '우리반 질문 모아보기에 보관',
    className: 'bg-sky-soft text-sky-ink',
  },
  hidden: {
    label: '숨김',
    description: '교사만 보기, 우리반 질문에 표시되지 않음',
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
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>('new')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [rangeStart, setRangeStart] = useState(() => localDateKey(new Date()))
  const [rangeEnd, setRangeEnd] = useState(() => localDateKey(new Date()))
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(() => new Set())
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
    setSelectedTopicIds(new Set())
    setSearch('')
    setSort('new')
    setDateFilter('all')
    setRangeStart(localDateKey(new Date()))
    setRangeEnd(localDateKey(new Date()))
    load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    const validIds = new Set(topics.map((topic) => topic.id))
    setSelectedTopicIds((current) => new Set([...current].filter((id) => validIds.has(id))))
  }, [topics])

  const selectedTopics = useMemo(
    () => topics.filter((topic) => selectedTopicIds.has(topic.id)),
    [topics, selectedTopicIds],
  )
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
    if (selectedTopicIds.size === 0) return []
    let list = questions.filter((q) => Boolean(q.topic_id && selectedTopicIds.has(q.topic_id)))

    const keyword = search.trim().toLocaleLowerCase('ko-KR')
    if (keyword) {
      list = list.filter((q) => {
        const content = q.content.toLocaleLowerCase('ko-KR')
        const name = q.student?.name?.toLocaleLowerCase('ko-KR') ?? ''
        const number = q.student?.student_number != null ? String(q.student.student_number) : ''
        return content.includes(keyword) || name.includes(keyword) || number.includes(keyword)
      })
    }

    if (dateFilter === 'today') {
      list = list.filter((q) => localDateKey(q.created_at) === todayKey)
    } else if (dateFilter === 'month') {
      const monthKey = todayKey.slice(0, 7)
      list = list.filter((q) => localDateKey(q.created_at).slice(0, 7) === monthKey)
    } else if (dateFilter === 'range' && rangeStart && rangeEnd) {
      list = list.filter((q) => {
        const key = localDateKey(q.created_at)
        return key >= rangeStart && key <= rangeEnd
      })
    }

    if (sort === 'votes') {
      list = [...list].sort(
        (a, b) => b.vote_count - a.vote_count || new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
    }
    return list
  }, [questions, selectedTopicIds, search, dateFilter, todayKey, rangeStart, rangeEnd, sort])

  const filtersChanged = search.trim() !== '' || sort !== 'new' || dateFilter !== 'all'

  const resetFilters = () => {
    const today = localDateKey(new Date())
    setSearch('')
    setSort('new')
    setDateFilter('all')
    setRangeStart(today)
    setRangeEnd(today)
  }

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 2500)
  }

  const toggleTopicSelection = (topicId: string) => {
    setSelectedTopicIds((current) => {
      const next = new Set(current)
      if (next.has(topicId)) next.delete(topicId)
      else next.add(topicId)
      return next
    })
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

    setTopicBusy(topic.id)
    setError(null)
    const { data, error: err } = await supabase.rpc('delete_question_topic', { p_topic_id: topic.id })
    setTopicBusy(null)
    if (err) return setError(topicError(err))

    setSelectedTopicIds((current) => {
      const next = new Set(current)
      next.delete(topic.id)
      return next
    })
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

  const questionSectionTitle =
    selectedTopics.length === 0
      ? '질문 주제를 선택해 주세요'
      : selectedTopics.length === 1
        ? `「${selectedTopics[0].name}」 질문`
        : `선택한 질문 주제 ${selectedTopics.length}개`

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
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <h2 className="shrink-0 font-display text-2xl sm:text-3xl">질문 주제 관리</h2>
              <div className="ml-auto flex w-full gap-2 lg:w-[44rem]">
                <Input
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value.slice(0, 40))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createTopic()
                  }}
                  placeholder="새 질문 주제"
                  aria-label="새 질문 주제"
                  className="min-w-0 flex-1"
                />
                <Button variant="sky" onClick={createTopic} loading={creatingTopic} disabled={!newTopicName.trim()} className="shrink-0">
                  {!creatingTopic && <Plus className="size-5" aria-hidden />}
                  주제 만들기
                </Button>
              </div>
            </div>

            <div className="mb-4 grid gap-2 text-sm text-ink-soft sm:grid-cols-2">
              <p className="rounded-2xl bg-sky-soft px-3 py-2"><strong className="text-sky-ink">보관</strong> · 우리반 질문 모아보기에 보관</p>
              <p className="rounded-2xl bg-cream px-3 py-2"><strong className="text-ink">숨김</strong> · 교사만 보기, 우리반 질문에 표시되지 않음</p>
            </div>

            {topics.length === 0 ? (
              <p className="rounded-2xl bg-cream px-4 py-4 text-ink-soft">아직 질문 주제가 없어요. 새 주제를 만들어 주세요.</p>
            ) : (
              <div className="max-h-[24rem] overflow-y-auto rounded-2xl border-2 border-line bg-cream/30">
                <ul className="divide-y-2 divide-line">
                  {topics.map((topic) => {
                    const busy = topicBusy === topic.id
                    const meta = STATUS_META[topic.status]
                    const selectedTopic = selectedTopicIds.has(topic.id)
                    return (
                      <li
                        key={topic.id}
                        className={cx(
                          'flex flex-wrap items-center gap-3 px-3 py-3 transition sm:flex-nowrap',
                          selectedTopic ? 'bg-sky-soft/60' : 'hover:bg-paper/70',
                        )}
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-sky-soft/50">
                          <input
                            type="checkbox"
                            checked={selectedTopic}
                            onChange={() => toggleTopicSelection(topic.id)}
                            className="size-5 shrink-0 accent-[#7fb6ec]"
                            aria-label={`${topic.name} 질문 보기`}
                          />
                          <span className="truncate text-lg font-bold">{topic.name}</span>
                          <Badge className={meta.className}>{meta.label}</Badge>
                          <span className="shrink-0 text-sm text-ink-soft">질문 {topicCounts.get(topic.id) ?? 0}개</span>
                        </label>

                        <button
                          type="button"
                          onClick={() => renameTopic(topic)}
                          disabled={busy}
                          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-soft transition hover:bg-ink/5 hover:text-ink disabled:opacity-40"
                          aria-label={`${topic.name} 이름 수정`}
                          title="이름 수정"
                        >
                          <Pencil className="size-5" aria-hidden />
                        </button>

                        <div className="flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto">
                          <Button
                            size="sm"
                            variant={topic.status === 'active' ? 'mint' : 'secondary'}
                            onClick={() => changeTopicStatus(topic, 'active')}
                            disabled={busy || topic.status === 'active'}
                            className="w-28 shrink-0 justify-center whitespace-nowrap hover:translate-y-0 active:translate-y-0 active:shadow-pop-sm"
                          >
                            <PlayCircle className="size-4 shrink-0" aria-hidden />
                            <span className="whitespace-nowrap">진행 중</span>
                          </Button>
                          <Button
                            size="sm"
                            variant={topic.status === 'archived' ? 'sky' : 'secondary'}
                            onClick={() => changeTopicStatus(topic, 'archived')}
                            disabled={busy || topic.status === 'archived'}
                            className="w-28 shrink-0 justify-center whitespace-nowrap hover:translate-y-0 active:translate-y-0 active:shadow-pop-sm"
                          >
                            <Archive className="size-4 shrink-0" aria-hidden />
                            <span className="whitespace-nowrap">보관</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => changeTopicStatus(topic, 'hidden')}
                            disabled={busy || topic.status === 'hidden'}
                            className="w-28 shrink-0 justify-center whitespace-nowrap hover:translate-y-0 active:translate-y-0 active:shadow-pop-sm"
                          >
                            <EyeOff className="size-4 shrink-0" aria-hidden />
                            <span className="whitespace-nowrap">숨김</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => deleteTopic(topic)}
                            disabled={busy}
                            className="w-28 shrink-0 justify-center whitespace-nowrap hover:translate-y-0 active:translate-y-0 active:shadow-pop-sm"
                          >
                            <Trash2 className="size-4 shrink-0" aria-hidden />
                            <span className="whitespace-nowrap">삭제</span>
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
            <h2 className="font-display text-2xl sm:text-3xl">{questionSectionTitle}</h2>
            <div className="flex flex-wrap gap-2">
              {topics.length > 0 && selectedTopicIds.size < topics.length && (
                <Button size="sm" variant="secondary" onClick={() => setSelectedTopicIds(new Set(topics.map((topic) => topic.id)))}>
                  전체 질문 보기
                </Button>
              )}
              {selectedTopicIds.size > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setSelectedTopicIds(new Set())}>
                  선택 해제
                </Button>
              )}
            </div>
          </div>

          {selectedTopicIds.size > 0 && (
            <section className="flex flex-col gap-3 rounded-3xl border-2 border-line bg-paper p-4 shadow-pop">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[16rem] flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-soft" aria-hidden />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="질문 내용 또는 학생 이름·번호 검색"
                    aria-label="질문 내용 또는 학생 이름·번호 검색"
                    className="w-full pl-11"
                  />
                </div>
                {filtersChanged && (
                  <Button size="sm" variant="ghost" onClick={resetFilters}>
                    초기화
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="text-base font-bold text-ink-soft">정렬</span>
                <ChoiceChips<Sort>
                  size="sm"
                  options={[
                    { value: 'new', label: '최신순' },
                    { value: 'votes', label: '투표순' },
                  ]}
                  value={sort}
                  onChange={setSort}
                />
                <span className="hidden h-8 w-0.5 bg-line sm:block" />
                <span className="text-base font-bold text-ink-soft">기간</span>
                <ChoiceChips<DateFilter>
                  size="sm"
                  options={[
                    { value: 'all', label: '전체' },
                    { value: 'today', label: '오늘' },
                    { value: 'month', label: '이번 달' },
                    { value: 'range', label: '기간 선택' },
                  ]}
                  value={dateFilter}
                  onChange={setDateFilter}
                />
                {dateFilter === 'range' && (
                  <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
                    <Input
                      type="date"
                      value={rangeStart}
                      max={todayKey}
                      onChange={(e) => {
                        const next = e.target.value
                        setRangeStart(next)
                        if (rangeEnd && next > rangeEnd) setRangeEnd(next)
                      }}
                      aria-label="기간 시작일"
                      className="min-h-10 w-[10.5rem] shrink-0 text-sm"
                    />
                    <span className="font-bold text-ink-soft">~</span>
                    <Input
                      type="date"
                      value={rangeEnd}
                      min={rangeStart}
                      max={todayKey}
                      onChange={(e) => {
                        const next = e.target.value
                        setRangeEnd(next)
                        if (rangeStart && next < rangeStart) setRangeStart(next)
                      }}
                      aria-label="기간 종료일"
                      className="min-h-10 w-[10.5rem] shrink-0 text-sm"
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          <ErrorBox message={error} />
          {notice && <p className="rounded-2xl bg-mint-soft px-4 py-3 text-lg font-bold text-mint-ink" role="status">{notice}</p>}

          {loading ? (
            <Spinner />
          ) : selectedTopicIds.size === 0 ? (
            <EmptyState icon={<Inbox className="size-14" />} title="위에서 질문 주제를 선택해 주세요" />
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
