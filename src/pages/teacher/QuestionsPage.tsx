import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Eye, EyeOff, Heart, Inbox, MessageCircleQuestion, RefreshCw, Trash2, UserRound } from 'lucide-react'
import { ClassPicker, NoClassYet } from '../../components/ClassPicker'
import { Badge, Button, ChoiceChips, EmptyState, ErrorBox, PageTitle, Spinner, cx } from '../../components/ui'
import { useTeacher } from '../../contexts/TeacherContext'
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

  const [questions, setQuestions] = useState<TeacherQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<Visibility>('all')
  const [sort, setSort] = useState<Sort>('new')

  const load = useCallback(async () => {
    if (!selectedClassId) return
    const { data, error: err } = await supabase
      .from('questions')
      .select(
        'id, class_id, student_id, content, is_hidden, created_at, student:students(student_number, name), votes(count)',
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

  const shown = useMemo(() => {
    let list = questions
    if (visibility === 'visible') list = list.filter((q) => !q.is_hidden)
    if (visibility === 'hidden') list = list.filter((q) => q.is_hidden)
    if (sort === 'votes') list = [...list].sort((a, b) => b.vote_count - a.vote_count)
    return list
  }, [questions, visibility, sort])

  const update = async (id: string, patch: Pick<TeacherQuestion, 'is_hidden'>) => {
    setQuestions((list) => list.map((q) => (q.id === id ? { ...q, ...patch } : q)))
    const { error: err } = await supabase.from('questions').update(patch).eq('id', id)
    if (err) setError(toMessage(err))
    await load()
  }

  // 삭제: 질문과 그 질문에 받은 표가 함께 지워집니다 (votes 는 on delete cascade).
  // 학생 화면에서만 감추려면 숨기기를 씁니다.
  const remove = async (q: TeacherQuestion) => {
    const preview = q.content.length > 40 ? `${q.content.slice(0, 40)}…` : q.content
    const ok = window.confirm(
      `이 질문을 삭제할까요?\n\n「${preview}」\n\n삭제하면 되돌릴 수 없고, 이 질문에 받은 투표 ${q.vote_count}표도 함께 지워져요.\n학생 화면에서만 감추려면 '숨기기'를 눌러 주세요.`,
    )
    if (!ok) return
    setError(null)
    setQuestions((list) => list.filter((x) => x.id !== q.id))
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
            // 목록이 차지하는 폭에 따라 1~3열 (왼쪽 메뉴가 있어 화면 폭 대신 목록 폭 기준). 글자 크기는 그대로
            <ul className="grid gap-4 @min-[34rem]:grid-cols-2 @min-[54rem]:grid-cols-3">
              {shown.map((q) => (
                <QuestionItem key={q.id} q={q} onUpdate={update} onDelete={remove} />
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
  onUpdate,
  onDelete,
}: {
  q: TeacherQuestion
  onUpdate: (id: string, patch: Pick<TeacherQuestion, 'is_hidden'>) => Promise<void>
  onDelete: (q: TeacherQuestion) => Promise<void>
}) {
  return (
    <li
      className={cx(
        'flex min-w-0 flex-col gap-3 rounded-3xl border-2 p-5 shadow-pop',
        q.is_hidden ? 'border-dashed border-line-strong bg-cream opacity-80' : 'border-line bg-paper',
      )}
    >
      {q.is_hidden && <Badge className="self-start bg-line text-ink-soft">숨김</Badge>}

      <p className={cx('text-xl leading-relaxed font-medium break-words whitespace-pre-wrap', q.is_hidden && 'line-through decoration-ink-soft/40')}>
        {q.content}
      </p>

      {/* 같은 줄의 카드 높이가 맞춰지므로 작성자·버튼은 카드 아래쪽에 모음 */}
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-ink-soft">
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
        <Button size="sm" variant="danger" onClick={() => onDelete(q)} className="sm:ml-auto">
          <Trash2 className="size-4" aria-hidden />
          삭제
        </Button>
      </div>
    </li>
  )
}
