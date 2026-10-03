import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CheckSquare2,
  ImageDown,
  Inbox,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  Square,
  Star,
  ThumbsUp,
} from 'lucide-react'
import { ConnectionRetry } from '../../components/ConnectionRetry'
import { Badge, Button, ChoiceChips, EmptyState, ErrorBox, Input, Spinner, Textarea, cx } from '../../components/ui'
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
import type { MyQuestionHistory, StudentContext } from '../../lib/types'

type DateFilter = 'all' | 'today' | 'week' | 'date'
type FeedbackFilter = 'all' | 'liked' | 'commented'

function fetchMyQuestions() {
  return Promise.all([supabase.rpc('get_my_student'), supabase.rpc('list_my_question_history')])
}

export default function StudentMyQuestions() {
  const navigate = useNavigate()
  const { user, isAnonymous, loading: authLoading } = useAuth()

  const [me, setMe] = useState<StudentContext | null>(null)
  const [questions, setQuestions] = useState<MyQuestionHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>('all')
  const [pickedDate, setPickedDate] = useState(localDateKey(new Date()))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [upgradingId, setUpgradingId] = useState<string | null>(null)
  const [upgradeText, setUpgradeText] = useState('')
  const [upgradeBusy, setUpgradeBusy] = useState(false)

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
      setQuestions((list.data ?? []) as MyQuestionHistory[])
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
    let next = questions
    const today = localDateKey(new Date())
    if (dateFilter === 'today') next = next.filter((q) => localDateKey(q.created_at) === today)
    else if (dateFilter === 'date') next = next.filter((q) => localDateKey(q.created_at) === pickedDate)
    else if (dateFilter === 'week') {
      const weekStart = startOfWeek().getTime()
      next = next.filter((q) => new Date(q.created_at).getTime() >= weekStart)
    }
    if (feedbackFilter === 'liked') next = next.filter((q) => q.teacher_liked)
    if (feedbackFilter === 'commented') next = next.filter((q) => Boolean(q.teacher_comment))
    return next
  }, [questions, dateFilter, pickedDate, feedbackFilter])

  useEffect(() => {
    const visibleIds = new Set(questions.map((q) => q.id))
    setSelected((current) => new Set([...current].filter((id) => visibleIds.has(id))))
  }, [questions])

  useEffect(() => {
    if (feedbackFilter === 'liked' && !me?.teacher_like_enabled) setFeedbackFilter('all')
    if (feedbackFilter === 'commented' && !me?.teacher_comment_enabled) setFeedbackFilter('all')
  }, [me?.teacher_like_enabled, me?.teacher_comment_enabled, feedbackFilter])

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

  const startUpgrade = (q: MyQuestionHistory) => {
    setUpgradingId(q.id)
    setUpgradeText(q.content)
    setError(null)
  }

  const cancelUpgrade = () => {
    setUpgradingId(null)
    setUpgradeText('')
  }

  const upgrade = async (q: MyQuestionHistory) => {
    const content = upgradeText.trim()
    if (!content) return setError('업그레이드한 질문을 적어 주세요.')
    if (content === q.content.trim()) return setError('질문을 조금이라도 바꿔 주세요.')
    if (content.length > 300) return setError('질문은 300자까지 쓸 수 있어요.')
    setUpgradeBusy(true)
    setError(null)
    const { error: err } = await supabase.rpc('upgrade_question', { p_question_id: q.id, p_content: content })
    setUpgradeBusy(false)
    if (err) return setError(toMessage(err))
    cancelUpgrade()
    setNotice('질문을 업그레이드했어요! 이전 질문과 받은 표·피드백은 성장 이력에 그대로 남아요.')
    await load()
  }

  if (loading) return <Spinner />
  if (!me) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-6">
        <ConnectionRetry message={connectionError} retrying={refreshing} onRetry={refresh} />
      </main>
    )
  }

  const feedbackOptions: Array<{ value: FeedbackFilter; label: string }> = [{ value: 'all', label: '모든 내 질문' }]
  if (me.teacher_like_enabled) feedbackOptions.push({ value: 'liked', label: `선생님이 좋아한 질문 ${questions.filter((q) => q.teacher_liked).length}` })
  if (me.teacher_comment_enabled) feedbackOptions.push({ value: 'commented', label: `선생님 코멘트 ${questions.filter((q) => q.teacher_comment).length}` })

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
            <p className="mt-1 text-base text-ink-soft">내 질문이 어떻게 성장했는지 보고, 새 버전으로 업그레이드할 수 있어요.</p>
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

          {feedbackOptions.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 border-t-2 border-line pt-3">
              <ChoiceChips<FeedbackFilter> size="sm" options={feedbackOptions} value={feedbackFilter} onChange={setFeedbackFilter} />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-line pt-3">
            <p className="font-bold">
              {selected.size > 0 ? `${selected.size}개 질문 선택됨` : `질문 이력 ${questions.length}개 · 지금 ${filtered.length}개`}
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
          <EmptyState
            icon={feedbackFilter === 'all' ? <Inbox className="size-14" /> : feedbackFilter === 'liked' ? <Star className="size-14" /> : <MessageSquareText className="size-14" />}
            title={questions.length === 0 ? '아직 내가 만든 질문이 없어요' : '이 조건에 맞는 질문이 없어요'}
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((q) => {
              const active = selected.has(q.id)
              const upgrading = upgradingId === q.id
              return (
                <li
                  key={q.id}
                  className={cx(
                    'flex min-w-0 flex-col gap-3 rounded-3xl border-2 bg-paper p-5 shadow-pop',
                    active ? 'border-sky bg-sky-soft/40' : q.teacher_liked ? 'border-butter bg-butter-soft/20' : 'border-line',
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggle(q.id)}
                      aria-pressed={active}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-bold text-ink-soft hover:bg-ink/5"
                    >
                      {active ? <CheckSquare2 className="size-5 text-sky-ink" aria-hidden /> : <Square className="size-5" aria-hidden />}
                      {active ? '선택됨' : '선택'}
                    </button>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge className={q.is_current ? 'bg-mint-soft text-mint-ink' : 'bg-line text-ink-soft'}>
                        {q.is_current ? '현재 질문' : '이전 버전'}
                      </Badge>
                      {q.parent_question_id && <Badge className="bg-lilac-soft text-lilac-ink">업그레이드</Badge>}
                    </div>
                  </div>

                  <p className="text-xl leading-relaxed font-medium break-words whitespace-pre-wrap">{q.content}</p>
                  <p className="text-sm text-ink-soft">{new Date(q.created_at).toLocaleDateString('ko-KR')}</p>

                  <div className="flex flex-wrap gap-2">
                    {q.vote_count === null ? (
                      <Badge className="bg-line text-ink-soft">친구 득표 비공개</Badge>
                    ) : (
                      <Badge className="bg-sky-soft text-sky-ink">
                        <ThumbsUp className="mr-1 size-4" aria-hidden />친구 득표 {q.vote_count}표
                      </Badge>
                    )}
                    {me.teacher_like_enabled && q.teacher_liked && (
                      <Badge className="bg-butter-soft text-butter-ink">
                        <Star className="mr-1 size-4 fill-current" aria-hidden />선생님이 좋아한 질문
                      </Badge>
                    )}
                  </div>

                  {me.teacher_comment_enabled && q.teacher_comment && (
                    <div className="rounded-2xl bg-lilac-soft px-4 py-3 text-base text-lilac-ink">
                      <p className="mb-1 flex items-center gap-1.5 font-bold">
                        <MessageSquareText className="size-4" aria-hidden />선생님 코멘트
                      </p>
                      <p className="whitespace-pre-wrap break-words">{q.teacher_comment}</p>
                    </div>
                  )}

                  {q.is_current && !upgrading && (
                    <Button variant="secondary" size="sm" onClick={() => startUpgrade(q)} className="mt-auto self-start">
                      <Sparkles className="size-5" aria-hidden />
                      질문 업그레이드
                    </Button>
                  )}

                  {q.is_current && upgrading && (
                    <div className="mt-auto flex flex-col gap-2 border-t-2 border-line pt-3">
                      <p className="text-sm font-bold text-ink-soft">원래 질문은 지우지 않고 성장 이력에 남아요.</p>
                      <Textarea
                        value={upgradeText}
                        onChange={(e) => setUpgradeText(e.target.value.slice(0, 300))}
                        maxLength={300}
                        aria-label="업그레이드한 질문"
                        className="min-h-28 text-base"
                      />
                      <p className="text-right text-xs text-ink-soft">{upgradeText.length}/300</p>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="mint" size="sm" onClick={() => upgrade(q)} loading={upgradeBusy}>
                          <Sparkles className="size-4" aria-hidden />저장하고 새 질문으로 올리기
                        </Button>
                        <Button variant="ghost" size="sm" onClick={cancelUpgrade} disabled={upgradeBusy}>취소</Button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </main>

      {notice && (
        <div className="fixed inset-x-0 bottom-6 z-20 flex justify-center px-4" role="status">
          <div className="max-w-2xl rounded-2xl border-2 border-[#6fc9a4] bg-mint px-6 py-3 text-center text-lg font-bold shadow-pop">{notice}</div>
        </div>
      )}
    </div>
  )
}
