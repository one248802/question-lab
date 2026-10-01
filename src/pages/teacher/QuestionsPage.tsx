import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Eye, EyeOff, Heart, Inbox, MessageCircleQuestion, Pencil, RefreshCw, UserRound } from 'lucide-react'
import { ClassPicker, NoClassYet } from '../../components/ClassPicker'
import { QuestionBadges } from '../../components/QuestionBadges'
import { Badge, Button, ChoiceChips, EmptyState, ErrorBox, PageTitle, Select, Spinner, cx } from '../../components/ui'
import { useTeacher } from '../../contexts/TeacherContext'
import { useCategories, type Categories } from '../../lib/categories'
import { formatDateTime } from '../../lib/date'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { TeacherQuestion } from '../../lib/types'

const POLL_MS = 15_000

type Sort = 'new' | 'votes'
type Visibility = 'all' | 'visible' | 'hidden'

interface Row extends Omit<TeacherQuestion, 'vote_count'> {
  votes: Array<{ count: number }>
}

export default function QuestionsPage() {
  const { classes, loading: classesLoading, selectedClassId, reload: reloadStats } = useTeacher()
  const categories = useCategories()

  const [questions, setQuestions] = useState<TeacherQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [visibility, setVisibility] = useState<Visibility>('all')
  const [sort, setSort] = useState<Sort>('new')

  const load = useCallback(async () => {
    if (!selectedClassId) return
    const { data, error: err } = await supabase
      .from('questions')
      .select(
        'id, class_id, student_id, content, question_scope, question_type, is_hidden, created_at, student:students(student_number, name), votes(count)',
      )
      .eq('class_id', selectedClassId)
      .order('created_at', { ascending: false })
    if (err) setError(toMessage(err))
    else {
      setError(null)
      setQuestions(
        ((data ?? []) as unknown as Row[]).map(({ votes, ...q }) => ({ ...q, vote_count: votes?.[0]?.count ?? 0 })),
      )
    }
    setLoading(false)
  }, [selectedClassId])

  useEffect(() => {
    setLoading(true)
    load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const filterOptions = useMemo(
    () => [
      { value: 'all', label: '전체' },
      ...categories.scopes.map((s) => ({ value: `scope:${s.code}`, label: s.label })),
      ...categories.types.map((t) => ({ value: `type:${t.code}`, label: t.label })),
    ],
    [categories],
  )

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: questions.length }
    for (const q of questions) {
      map[`scope:${q.question_scope}`] = (map[`scope:${q.question_scope}`] ?? 0) + 1
      map[`type:${q.question_type}`] = (map[`type:${q.question_type}`] ?? 0) + 1
    }
    return map
  }, [questions])

  const shown = useMemo(() => {
    let list = questions
    if (filter.startsWith('scope:')) list = list.filter((q) => q.question_scope === filter.slice(6))
    else if (filter.startsWith('type:')) list = list.filter((q) => q.question_type === filter.slice(5))
    if (visibility === 'visible') list = list.filter((q) => !q.is_hidden)
    if (visibility === 'hidden') list = list.filter((q) => q.is_hidden)
    if (sort === 'votes') list = [...list].sort((a, b) => b.vote_count - a.vote_count)
    return list
  }, [questions, filter, visibility, sort])

  const update = async (id: string, patch: Partial<Pick<TeacherQuestion, 'is_hidden' | 'question_scope' | 'question_type'>>) => {
    setQuestions((list) => list.map((q) => (q.id === id ? { ...q, ...patch } : q)))
    const { error: err } = await supabase.from('questions').update(patch).eq('id', id)
    if (err) setError(toMessage(err))
    await load()
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
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="질문 유형">
            {filterOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={filter === o.value}
                onClick={() => setFilter(o.value)}
                className={cx(
                  'inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 px-4 text-lg font-bold transition',
                  filter === o.value ? 'border-[#e8c34f] bg-butter shadow-pop-sm' : 'border-line bg-paper text-ink-soft hover:border-line-strong',
                )}
              >
                {o.label}
                <span className="rounded-full bg-paper/80 px-2 text-sm">{counts[o.value] ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ChoiceChips<Visibility>
              size="sm"
              options={[
                { value: 'all', label: '모두' },
                { value: 'visible', label: '공개' },
                { value: 'hidden', label: '숨김' },
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

          <ErrorBox message={error} />

          {loading ? (
            <Spinner />
          ) : shown.length === 0 ? (
            <EmptyState icon={<Inbox className="size-14" />} title="질문이 없어요" />
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {shown.map((q) => (
                <QuestionItem key={q.id} q={q} categories={categories} onUpdate={update} />
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
  categories,
  onUpdate,
}: {
  q: TeacherQuestion
  categories: Categories
  onUpdate: (id: string, patch: Partial<Pick<TeacherQuestion, 'is_hidden' | 'question_scope' | 'question_type'>>) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)

  return (
    <li
      className={cx(
        'flex flex-col gap-3 rounded-3xl border-2 p-5 shadow-pop',
        q.is_hidden ? 'border-dashed border-line-strong bg-cream opacity-80' : 'border-line bg-paper',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editing ? (
          <div className="flex flex-wrap gap-2">
            <Select
              aria-label="질문의 형태"
              value={q.question_scope}
              onChange={(e) => onUpdate(q.id, { question_scope: e.target.value })}
              className="min-h-10 w-auto text-base"
            >
              {categories.scopes.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="질문의 역할"
              value={q.question_type}
              onChange={(e) => onUpdate(q.id, { question_type: e.target.value })}
              className="min-h-10 w-auto text-base"
            >
              {categories.types.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <QuestionBadges scope={q.question_scope} type={q.question_type} categories={categories} />
        )}
        {q.is_hidden && <Badge className="bg-line text-ink-soft">숨김</Badge>}
      </div>

      <p className={cx('text-xl leading-relaxed font-medium break-words whitespace-pre-wrap', q.is_hidden && 'line-through decoration-ink-soft/40')}>
        {q.content}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-ink-soft">
        <span className="inline-flex items-center gap-1 font-bold text-ink">
          <UserRound className="size-5" aria-hidden />
          {q.student ? `${q.student.student_number}번 ${q.student.name}` : '알 수 없음'}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-5" aria-hidden />
          {formatDateTime(q.created_at)}
        </span>
        <span className="inline-flex items-center gap-1 font-bold text-pink-ink">
          <Heart className="size-5 fill-current" aria-hidden />
          {q.vote_count}표
        </span>
      </div>

      <div className="mt-1 flex flex-wrap gap-2">
        <Button size="sm" variant={q.is_hidden ? 'mint' : 'secondary'} onClick={() => onUpdate(q.id, { is_hidden: !q.is_hidden })}>
          {q.is_hidden ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
          {q.is_hidden ? '다시 공개' : '숨기기'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
          <Pencil className="size-4" aria-hidden />
          {editing ? '유형 수정 끝' : '유형 수정'}
        </Button>
      </div>
    </li>
  )
}
