import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckSquare2, ImageDown, Inbox, RefreshCw, Square } from 'lucide-react'
import { ConnectionRetry } from '../../components/ConnectionRetry'
import { Button, ChoiceChips, EmptyState, ErrorBox, Input, Spinner, cx } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { localDateKey, startOfWeek } from '../../lib/date'
import { toMessage } from '../../lib/errors'
import {
  questionPortfolioFileName,
  renderQuestionPortfolioPng,
  type QuestionPortfolioImageData,
} from '../../lib/questionPortfolioPng'
import { savePngOnDevice } from '../../lib/classificationPng'
import { supabase } from '../../lib/supabase'
import type { BoardQuestion, StudentContext } from '../../lib/types'

type DateFilter = 'all' | 'today' | 'week' | 'date'

function fetchMyQuestions() {
  return Promise.all([supabase.rpc('get_my_student'), supabase.rpc('list_class_questions')])
}

export default function StudentMyQuestions() {
  const navigate = useNavigate()
  const { user, isAnonymous, loading: authLoading } = useAuth()

  const [me, setMe] = useState<StudentContext | null>(null)
  const [questions, setQuestions] = useState<BoardQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [pickedDate, setPickedDate] = useState(localDateKey(new Date()))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [ctx, list] = await fetchMyQuestions()
    if (ctx.error) {
      setConnectionError(toMessage(ctx.error))
      setLoading(false)
      return
    }
    if (!ctx.data) {
      navigate('/student', { replace: true })
      return
    }
    setConnectionError(null)
    setMe(ctx.data as StudentContext)
    if (list.error) {
      setError(toMessage(list.error))
    } else {
      setError(null)
      setQuestions(((list.data ?? []) as BoardQuestion[]).filter((q) => q.is_mine))
    }
    setLoading(false)
  }, [navigate])

  useEffect(() => {
    if (authLoading) return
    if (!user || !isAnonymous) {
      navigate('/student', { replace: true })
      return
    }
    load()
  }, [authLoading, user, isAnonymous, load, navigate])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 2500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const filtered = useMemo(() => {
    if (dateFilter === 'all') return questions
    const today = localDateKey(new Date())
    if (dateFilter === 'today') return questions.filter((q) => localDateKey(q.created_at) === today)
    if (dateFilter === 'date') return questions.filter((q) => localDateKey(q.created_at) === pickedDate)
    const weekStart = startOfWeek().getTime()
    return questions.filter((q) => new Date(q.created_at).getTime() >= weekStart)
  }, [questions, dateFilter, pickedDate])

  useEffect(() => {
    const visibleIds = new Set(questions.map((q) => q.id))
    setSelected((current) => new Set([...current].filter((id) => visibleIds.has(id))))
  }, [questions])

  const selectedQuestions = useMemo(
    () => questions.filter((q) => selected.has(q.id)).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [questions, selected],
  )

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectVisible = () => setSelected((current) => new Set([...current, ...filtered.map((q) => q.id)]))
  const clearSelected = () => setSelected(new Set())

  const refresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const savePng = async () => {
    if (!me || selectedQuestions.length === 0) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const data: QuestionPortfolioImageData = {
        className: me.class_name,
        studentNumber: me.student_number,
        studentName: me.student_name,
        date: new Date(),
        questions: selectedQuestions.map((q) => ({ content: q.content, createdAt: q.created_at })),
      }
      const result = await savePngOnDevice(await renderQuestionPortfolioPng(data), questionPortfolioFileName(data))
      if (result === 'downloaded') setNotice('선택한 질문을 PNG로 저장했어요.')
      else if (result === 'shared') setNotice('선택한 질문 PNG를 만들었어요.')
    } catch {
      setError('PNG를 만들지 못했어요. 다시 시도해 주세요.')
    }
    setSaving(false)
  }

  if (loading) return <Spinner />
  if (!me) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-6">
        <ConnectionRetry message={connectionError} retrying={refreshing} onRetry={refresh} />
      </main>
    )
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b-2 border-line bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/student/board" className="inline-flex min-h-12 items-center gap-2 rounded-2xl px-2 text-lg font-bold hover:bg-ink/5">
            <ArrowLeft className="size-6" aria-hidden />
            우리 반 질문
          </Link>
          <p className="truncate text-base text-ink-soft">{me.student_number}번 {me.student_name}</p>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl">내 질문 모아보기</h1>
            <p className="mt-1 text-base text-ink-soft">내가 만든 질문을 날짜별로 보고, 골라서 PNG로 저장할 수 있어요.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={refresh} aria-label="새로고침">
            <RefreshCw className={cx('size-5', refreshing && 'animate-spin')} aria-hidden />
            새로고침
          </Button>
        </div>

        {connectionError && <ErrorBox message="연결이 잠시 불안정해요. 새로고침 버튼으로 다시 시도해 주세요." />}
        <ErrorBox message={error} />

        <section className="flex flex-col gap-3 rounded-3xl border-2 border-line bg-paper p-4 shadow-pop sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
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
                onChange={(e) => setPickedDate(e.target.value)}
                className="w-auto min-w-44"
                aria-label="질문 날짜 선택"
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-line pt-3">
            <p className="font-bold">
              {selected.size > 0 ? `${selected.size}개 질문 선택됨` : `내 질문 ${questions.length}개 · 지금 ${filtered.length}개`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={selectVisible} disabled={filtered.length === 0}>
                <CheckSquare2 className="size-5" aria-hidden />
                지금 보이는 질문 전체 선택
              </Button>
              <Button variant="ghost" size="sm" onClick={clearSelected} disabled={selected.size === 0}>
                선택 해제
              </Button>
              <Button variant="mint" size="sm" onClick={savePng} loading={saving} disabled={selected.size === 0}>
                {!saving && <ImageDown className="size-5" aria-hidden />}
                선택 질문 PNG 저장
              </Button>
            </div>
          </div>
        </section>

        {filtered.length === 0 ? (
          <EmptyState icon={<Inbox className="size-14" />} title={questions.length === 0 ? '아직 내가 만든 질문이 없어요' : '이 날짜에는 내 질문이 없어요'} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((q) => {
              const active = selected.has(q.id)
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => toggle(q.id)}
                    aria-pressed={active}
                    className={cx(
                      'flex h-full min-h-40 w-full flex-col gap-3 rounded-3xl border-2 bg-paper p-5 text-left shadow-pop transition',
                      active ? 'border-sky bg-sky-soft' : 'border-line hover:border-line-strong',
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-bold text-ink-soft">
                      {active ? <CheckSquare2 className="size-5 text-sky-ink" aria-hidden /> : <Square className="size-5" aria-hidden />}
                      {active ? '선택됨' : '선택'} · {new Date(q.created_at).toLocaleDateString('ko-KR')}
                    </span>
                    <span className="text-xl leading-relaxed font-medium break-words whitespace-pre-wrap">{q.content}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </main>

      {notice && (
        <div className="fixed inset-x-0 bottom-6 z-20 flex justify-center px-4" role="status">
          <div className="rounded-2xl border-2 border-[#6fc9a4] bg-mint px-6 py-3 text-xl font-bold shadow-pop">{notice}</div>
        </div>
      )}
    </div>
  )
}
