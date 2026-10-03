import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, Inbox, LogOut, RefreshCw, UserRound } from 'lucide-react'
import { ConnectionRetry } from '../../components/ConnectionRetry'
import { OpenActivities } from '../../components/OpenActivities'
import { QuestionComposer } from '../../components/QuestionComposer'
import { Button, ChoiceChips, ErrorBox, EmptyState, Spinner, cx } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo } from '../../lib/date'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { BoardQuestion, StudentContext } from '../../lib/types'

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
  // get_my_student 가 일시적으로 실패한 경우 (네트워크·토큰 갱신 중). 입장 화면으로 보내지 않음
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const load = useCallback(async () => {
    const [ctx, list] = await Promise.all([supabase.rpc('get_my_student'), supabase.rpc('list_class_questions')])
    if (ctx.error) {
      // 일시적인 오류: 지금 화면과 입장 정보는 그대로 두고, 다시 시도(또는 다음 자동 새로고침)를 기다림
      setConnectionError(toMessage(ctx.error))
      setLoading(false)
      return
    }
    if (!ctx.data) {
      // 실제로 연결된 학생이 없을 때만 입장 화면으로
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
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [authLoading, user, isAnonymous, load, navigate])

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 2500)
    return () => window.clearTimeout(t)
  }, [notice])

  const showVotes = Boolean(me?.show_vote_counts)
  // 목록에는 숨겨지지 않은 질문만 있으므로 서버의 my_vote_count 와 같은 기준입니다.
  const myVotes = questions.filter((q) => q.voted_by_me).length

  /** 이 질문의 투표 버튼을 누를 수 없는 이유 (누를 수 있으면 null). 서버도 같은 규칙으로 검사합니다. */
  const voteBlockedReason = (q: BoardQuestion): string | null => {
    if (!me) return null
    if (me.voting_status === 'before') return '투표가 아직 시작되지 않았어요.'
    if (me.voting_status === 'closed') return '투표가 종료되었습니다.'
    if (q.voted_by_me) {
      return !me.allow_vote_change && myVotes <= me.max_votes ? '이번 투표는 바꿀 수 없어요.' : null
    }
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
    // 화면 먼저 바꾸기
    const delta = q.voted_by_me ? -1 : 1
    setQuestions((list) =>
      list.map((x) =>
        x.id === q.id
          ? { ...x, voted_by_me: !x.voted_by_me, vote_count: x.vote_count === null ? null : x.vote_count + delta }
          : x,
      ),
    )
    const { error: err } = await supabase.rpc('toggle_vote', { p_question_id: q.id })
    if (err) setError(toMessage(err))
    await load()
    setPending((s) => {
      const next = new Set(s)
      next.delete(q.id)
      return next
    })
  }

  const leave = async () => {
    if (!window.confirm('나갈까요?')) return
    await supabase.rpc('leave_class')
    await supabase.auth.signOut()
    navigate('/', { replace: true })
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
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-display text-2xl sm:text-3xl">우리반 질문 상자</p>
            <p className="truncate text-base text-ink-soft">{me.class_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1 rounded-full bg-paper px-3 py-2 text-base font-bold sm:inline-flex">
              <UserRound className="size-5" aria-hidden />
              {me.student_number}번 {me.student_name}
            </span>
            <Button variant="secondary" size="sm" onClick={leave}>
              <LogOut className="size-5" aria-hidden />
              나가기
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[22rem_1fr] lg:items-start">
        <div className="flex flex-col gap-6 lg:sticky lg:top-24">
          <QuestionComposer onSubmit={submitQuestion} />
          <OpenActivities />
        </div>

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-3xl">
              우리 반 질문 <span className="text-ink-soft">{questions.length}</span>
            </h2>
            <div className="flex items-center gap-2">
              {showVotes && (
                <ChoiceChips<Sort>
                  size="sm"
                  options={[
                    { value: 'new', label: '최신순' },
                    { value: 'votes', label: '인기순' },
                  ]}
                  value={sort}
                  onChange={setSort}
                />
              )}
              <Button variant="secondary" size="sm" onClick={refresh} aria-label="새로고침">
                <RefreshCw className={cx('size-5', refreshing && 'animate-spin')} aria-hidden />
              </Button>
            </div>
          </div>

          <VoteStatus me={me} myVotes={myVotes} />

          {connectionError && <ErrorBox message="연결이 잠시 불안정해요. 잠시 후 자동으로 다시 불러와요." />}
          <ErrorBox message={error} />

          {sorted.length === 0 ? (
            <EmptyState icon={<Inbox className="size-14" />} title="아직 질문이 없어요" />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {sorted.map((q) => {
                const blocked = voteBlockedReason(q)
                return (
                <li key={q.id} className="flex flex-col gap-4 rounded-3xl border-2 border-line bg-paper p-5 shadow-pop">
                  {q.is_mine && (
                    <span className="self-start rounded-full bg-butter-soft px-2 py-1 text-sm font-bold text-butter-ink">내 질문</span>
                  )}
                  <p className="text-xl leading-relaxed font-medium break-words whitespace-pre-wrap">{q.content}</p>
                  <div className="mt-auto flex items-center justify-between gap-3">
                    <span className="text-sm text-ink-soft">익명의 질문 · {timeAgo(q.created_at)}</span>
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
                        q.voted_by_me
                          ? 'border-pink bg-pink-soft text-pink-ink shadow-pop-sm'
                          : 'border-line-strong bg-paper text-ink-soft enabled:hover:border-pink',
                      )}
                    >
                      <Heart className={cx('size-6', q.voted_by_me && 'fill-current')} aria-hidden />
                      {q.vote_count !== null ? q.vote_count : q.voted_by_me ? '투표함' : '투표'}
                    </button>
                  </div>
                </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>

      {notice && (
        <div className="fixed inset-x-0 bottom-6 z-20 flex justify-center px-4" role="status">
          <div className="rounded-2xl border-2 border-[#6fc9a4] bg-mint px-6 py-3 text-xl font-bold shadow-pop">{notice}</div>
        </div>
      )}
    </div>
  )
}

/** 투표 진행 상태와 남은 표 */
function VoteStatus({ me, myVotes }: { me: StudentContext; myVotes: number }) {
  if (me.voting_status !== 'open') {
    return (
      <p className="rounded-2xl border-2 border-line bg-paper px-4 py-3 text-lg font-bold text-ink-soft">
        {me.voting_status === 'before' ? '투표가 아직 시작되지 않았어요.' : '투표가 종료되었습니다.'}
      </p>
    )
  }
  const over = myVotes - me.max_votes
  return (
    <div className="flex flex-col gap-1 rounded-2xl border-2 border-pink bg-pink-soft px-4 py-3 text-lg font-bold text-pink-ink">
      <p className="inline-flex items-center gap-2">
        <Heart className="size-5 fill-current" aria-hidden />
        투표 중 · 남은 표 {Math.max(0, me.max_votes - myVotes)} / {me.max_votes}
      </p>
      {over > 0 && <p className="text-base">투표 개수가 줄었어요. 투표 {over}개를 취소해 주세요.</p>}
    </div>
  )
}
