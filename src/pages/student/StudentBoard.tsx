import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarDays, Heart, Inbox, LogOut, MessageSquareText, NotebookTabs, RefreshCw, UserRound, X } from 'lucide-react'
import { ConnectionRetry } from '../../components/ConnectionRetry'
import { OpenActivities } from '../../components/OpenActivities'
import { QuestionComposer } from '../../components/QuestionComposer'
import { Button, ChoiceChips, ErrorBox, EmptyState, Spinner, Textarea, cx } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo } from '../../lib/date'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { BoardQuestion, QuestionThought, StudentContext } from '../../lib/types'

const POLL_MS = 10_000

type Sort = 'new' | 'votes'

export default function StudentBoard() {
  const navigate = useNavigate()
  const { user, isAnonymous, loading: authLoading } = useAuth()

  const [me, setMe] = useState<StudentContext | null>(null)
  const [questions, setQuestions] = useState<BoardQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('new')
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const [thoughtQuestion, setThoughtQuestion] = useState<BoardQuestion | null>(null)
  const [thoughts, setThoughts] = useState<QuestionThought[]>([])
  const [thoughtDraft, setThoughtDraft] = useState('')
  const [thoughtLoading, setThoughtLoading] = useState(false)
  const [thoughtBusy, setThoughtBusy] = useState(false)

  const load = useCallback(async () => {
    const [ctx, list] = await Promise.all([supabase.rpc('get_my_student'), supabase.rpc('list_class_questions')])
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
    if (list.error) setError(toMessage(list.error))
    else {
      setError(null)
      setQuestions((list.data ?? []) as BoardQuestion[])
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
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !thoughtQuestion) load()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [authLoading, user, isAnonymous, load, navigate, thoughtQuestion])

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 2500)
    return () => window.clearTimeout(t)
  }, [notice])

  const showVotes = Boolean(me?.show_vote_counts)
  const myVotes = questions.filter((q) => q.voted_by_me).length

  const voteBlockedReason = (q: BoardQuestion): string | null => {
    if (!me) return null
    if (me.voting_status === 'before') return '투표가 아직 시작되지 않았어요.'
    if (me.voting_status === 'closed') return '투표가 종료되었습니다.'
    if (q.voted_by_me) return !me.allow_vote_change && myVotes <= me.max_votes ? '이번 투표는 바꿀 수 없어요.' : null
    if (q.is_mine && !me.allow_self_vote) return '내 질문에는 투표할 수 없어요.'
    if (myVotes >= me.max_votes) return '투표할 수 있는 개수를 다 썼어요.'
    return null
  }

  const activeSort: Sort = showVotes ? sort : 'new'
  const sorted = useMemo(() => {
    if (activeSort === 'new') return questions
    return [...questions].sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
  }, [questions, activeSort])

  const refresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const submitQuestion = async (content: string) => {
    const { error: err } = await supabase.rpc('create_question', { p_content: content })
    if (err) return toMessage(err)
    setNotice('질문이 올라갔어요!')
    await load()
    return null
  }

  const toggleVote = async (q: BoardQuestion) => {
    if (pending.has(q.id)) return
    setPending((s) => new Set(s).add(q.id))
    const delta = q.voted_by_me ? -1 : 1
    setQuestions((list) => list.map((x) => x.id === q.id ? { ...x, voted_by_me: !x.voted_by_me, vote_count: x.vote_count === null ? null : x.vote_count + delta } : x))
    const { error: err } = await supabase.rpc('toggle_vote', { p_question_id: q.id })
    if (err) setError(toMessage(err))
    await load()
    setPending((s) => {
      const next = new Set(s)
      next.delete(q.id)
      return next
    })
  }

  const openThoughts = async (q: BoardQuestion) => {
    if (!me?.thought_sharing_enabled) return
    setThoughtQuestion(q)
    setThoughtLoading(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('list_question_thoughts', { p_question_id: q.id })
    setThoughtLoading(false)
    if (err) {
      setError(toMessage(err))
      return
    }
    const list = (data ?? []) as QuestionThought[]
    setThoughts(list)
    setThoughtDraft(list.find((t) => t.is_mine)?.content ?? '')
  }

  const closeThoughts = () => {
    setThoughtQuestion(null)
    setThoughts([])
    setThoughtDraft('')
  }

  const saveThought = async () => {
    if (!thoughtQuestion) return
    const content = thoughtDraft.trim()
    if (!content) return setError('내 생각을 적어 주세요.')
    if (content.length > 500) return setError('생각은 500자까지 쓸 수 있어요.')
    setThoughtBusy(true)
    setError(null)
    const { error: err } = await supabase.rpc('upsert_my_question_thought', {
      p_question_id: thoughtQuestion.id,
      p_content: content,
    })
    setThoughtBusy(false)
    if (err) return setError(toMessage(err))
    setNotice('생각을 저장했어요.')
    await openThoughts(thoughtQuestion)
    await load()
  }

  const deleteThought = async () => {
    if (!thoughtQuestion || !window.confirm('이 질문에 남긴 내 생각을 삭제할까요?')) return
    setThoughtBusy(true)
    const { error: err } = await supabase.rpc('delete_my_question_thought', { p_question_id: thoughtQuestion.id })
    setThoughtBusy(false)
    if (err) return setError(toMessage(err))
    setThoughtDraft('')
    setNotice('내 생각을 삭제했어요.')
    await openThoughts(thoughtQuestion)
    await load()
  }

  const leave = async () => {
    if (!window.confirm('나갈까요?')) return
    await supabase.rpc('leave_class')
    navigate('/', { replace: true, state: { signingOut: true } })
    await supabase.auth.signOut()
  }

  const retry = async () => {
    setRetrying(true)
    await load()
    setRetrying(false)
  }

  if (loading) return <Spinner />
  if (!me) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-6">
        <ConnectionRetry message={connectionError} retrying={retrying} onRetry={retry} />
      </main>
    )
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b-2 border-line bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/student/home" className="min-w-0 rounded-xl px-2 py-1 hover:bg-ink/5">
            <p className="truncate font-display text-2xl sm:text-3xl">🌱 생각 놀이터</p>
            <p className="truncate text-base text-ink-soft">{me.class_name}</p>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="sky" size="sm" disabled>❓ 질문 상자</Button>
            <Button variant="secondary" size="sm" onClick={() => navigate('/student/thoughts')}>💭 생각 상자</Button>
            <span className="hidden items-center gap-1 rounded-full bg-paper px-3 py-2 text-base font-bold sm:inline-flex">
              <UserRound className="size-5" aria-hidden />{me.student_number}번 {me.student_name}
            </span>
            <Button variant="secondary" size="sm" onClick={leave}><LogOut className="size-5" aria-hidden />나가기</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[90rem] gap-6 px-4 py-6 lg:grid-cols-[22rem_1fr] lg:items-start">
        <div className="flex flex-col gap-6 lg:sticky lg:top-24">
          <QuestionComposer onSubmit={submitQuestion} />
          <Button variant="sky" block onClick={() => navigate('/student/my-questions')}>
            <NotebookTabs className="size-5" aria-hidden />내 질문 모아보기
          </Button>
          <Button variant="secondary" block onClick={() => navigate('/student/question-gallery')}>
            <CalendarDays className="size-5" aria-hidden />지난 질문 갤러리
          </Button>
          <OpenActivities />
          {me.thought_sharing_enabled && (
            <button
              type="button"
              onClick={() => document.getElementById('class-questions')?.scrollIntoView({ behavior: 'smooth' })}
              className="flex min-h-20 items-center gap-3 rounded-3xl border-2 border-line bg-paper px-5 text-left shadow-pop transition hover:border-lilac"
            >
              <MessageSquareText className="size-8 shrink-0 text-lilac-ink" aria-hidden />
              <span><strong className="block text-xl">생각 나누기</strong><span className="text-sm text-ink-soft">질문 카드에서 내 생각을 남겨 보세요.</span></span>
            </button>
          )}
        </div>

        <section id="class-questions" className="@container flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-3xl">우리 반 질문 <span className="text-ink-soft">{questions.length}</span></h2>
            <div className="flex items-center gap-2">
              {showVotes && (
                <ChoiceChips<Sort>
                  size="sm"
                  options={[{ value: 'new', label: '최신순' }, { value: 'votes', label: '인기순' }]}
                  value={sort}
                  onChange={setSort}
                />
              )}
              <Button variant="secondary" size="sm" onClick={refresh} aria-label="새로고침"><RefreshCw className={cx('size-5', refreshing && 'animate-spin')} aria-hidden /></Button>
            </div>
          </div>

          <VoteStatus me={me} myVotes={myVotes} />
          {connectionError && <ErrorBox message="연결이 잠시 불안정해요. 잠시 후 자동으로 다시 불러와요." />}
          <ErrorBox message={error} />

          {sorted.length === 0 ? (
            <EmptyState icon={<Inbox className="size-14" />} title="아직 질문이 없어요" />
          ) : (
            <ul className="grid gap-4 @min-[34rem]:grid-cols-2 @min-[54rem]:grid-cols-3">
              {sorted.map((q) => {
                const blocked = voteBlockedReason(q)
                return (
                  <li key={q.id} className="flex min-w-0 flex-col gap-4 rounded-3xl border-2 border-line bg-paper p-5 shadow-pop">
                    {q.is_mine && <span className="self-start rounded-full bg-butter-soft px-2 py-1 text-sm font-bold text-butter-ink">내 질문</span>}
                    <p className="text-xl leading-relaxed font-medium break-words whitespace-pre-wrap">{q.content}</p>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-ink-soft">익명의 질문 · {timeAgo(q.created_at)}</span>
                      <div className="flex gap-2">
                        {me.thought_sharing_enabled && (
                          <button
                            type="button"
                            onClick={() => openThoughts(q)}
                            className="inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 border-line-strong bg-paper px-3 font-bold text-lilac-ink hover:border-lilac"
                          >
                            <MessageSquareText className="size-5" aria-hidden />생각 {q.thought_count ?? 0}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleVote(q)}
                          disabled={blocked !== null}
                          title={blocked ?? undefined}
                          aria-pressed={q.voted_by_me}
                          aria-label={q.voted_by_me ? '투표 취소' : '투표하기'}
                          className={cx(
                            'inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 px-4 text-lg font-bold transition active:scale-95',
                            'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
                            q.voted_by_me ? 'border-pink bg-pink-soft text-pink-ink shadow-pop-sm' : 'border-line-strong bg-paper text-ink-soft enabled:hover:border-pink',
                          )}
                        >
                          <Heart className={cx('size-6', q.voted_by_me && 'fill-current')} aria-hidden />
                          {q.vote_count !== null ? q.vote_count : q.voted_by_me ? '투표함' : '투표'}
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>

      {thoughtQuestion && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/30 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="생각 나누기">
          <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border-2 border-line bg-cream p-5 shadow-pop-lg sm:rounded-3xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="mb-1 font-bold text-lilac-ink">💬 생각 나누기</p>
                <h3 className="text-2xl font-bold leading-snug">{thoughtQuestion.content}</h3>
              </div>
              <button type="button" onClick={closeThoughts} aria-label="닫기" className="flex size-11 shrink-0 items-center justify-center rounded-2xl hover:bg-ink/5"><X className="size-6" /></button>
            </div>

            <div className="mb-5 rounded-2xl border-2 border-line bg-paper p-4">
              <label htmlFor="my-thought" className="mb-2 block font-bold">이 질문에 대한 내 생각</label>
              <Textarea
                id="my-thought"
                value={thoughtDraft}
                onChange={(e) => setThoughtDraft(e.target.value.slice(0, 500))}
                maxLength={500}
                placeholder="정답이 아니어도 괜찮아요. 지금 떠오르는 생각을 적어 보세요."
                className="min-h-28"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-ink-soft">{thoughtDraft.length}/500</span>
                <div className="flex gap-2">
                  {thoughts.some((t) => t.is_mine) && <Button variant="danger" size="sm" onClick={deleteThought} disabled={thoughtBusy}>삭제</Button>}
                  <Button variant="secondary" size="sm" onClick={saveThought} loading={thoughtBusy}>{thoughts.some((t) => t.is_mine) ? '내 생각 수정' : '생각 남기기'}</Button>
                </div>
              </div>
            </div>

            <h4 className="mb-2 text-lg font-bold">친구들의 생각 {thoughts.length}</h4>
            {thoughtLoading ? <Spinner /> : thoughts.length === 0 ? (
              <p className="rounded-2xl bg-paper px-4 py-4 text-ink-soft">아직 남긴 생각이 없어요. 첫 생각을 남겨 보세요.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {thoughts.map((t) => (
                  <li key={t.id} className={cx('rounded-2xl border-2 border-line bg-paper px-4 py-3', t.is_mine && 'border-sky bg-sky-soft/30')}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-bold text-ink-soft">{t.author_label}</span>
                      <span className="text-xs text-ink-soft">{timeAgo(t.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-lg">{t.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {notice && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4" role="status">
          <div className="rounded-2xl border-2 border-[#6fc9a4] bg-mint px-6 py-3 text-xl font-bold shadow-pop">{notice}</div>
        </div>
      )}
    </div>
  )
}

function VoteStatus({ me, myVotes }: { me: StudentContext; myVotes: number }) {
  if (me.voting_status !== 'open') {
    return <p className="rounded-2xl border-2 border-line bg-paper px-4 py-3 text-lg font-bold text-ink-soft">{me.voting_status === 'before' ? '투표가 아직 시작되지 않았어요.' : '투표가 종료되었습니다.'}</p>
  }
  const over = myVotes - me.max_votes
  return (
    <div className="flex flex-col gap-1 rounded-2xl border-2 border-pink bg-pink-soft px-4 py-3 text-lg font-bold text-pink-ink">
      <p className="inline-flex items-center gap-2"><Heart className="size-5 fill-current" aria-hidden />투표 중 · 남은 표 {Math.max(0, me.max_votes - myVotes)} / {me.max_votes}</p>
      {over > 0 && <p className="text-base">투표 개수가 줄었어요. 투표 {over}개를 취소해 주세요.</p>}
    </div>
  )
}
