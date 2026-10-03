import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Heart, Lightbulb, Trash2, Trophy } from 'lucide-react'
import { Badge, Button, EmptyState, ErrorBox, Input, Spinner, cx } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { ThoughtItem, ThoughtTopicDetail } from '../../lib/types'

export default function StudentThoughtTopic() {
  const { topicId = '' } = useParams()
  const navigate = useNavigate()
  const { user, isAnonymous, loading: authLoading } = useAuth()
  const [topic, setTopic] = useState<ThoughtTopicDetail | null>(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pendingVote, setPendingVote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('get_thought_topic', { p_topic_id: topicId })
    if (err) {
      setError(toMessage(err))
      setLoading(false)
      return
    }
    setTopic(data as ThoughtTopicDetail)
    setError(null)
    setLoading(false)
  }, [topicId])

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
    const timer = window.setTimeout(() => setNotice(null), 2200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!topic || topic.max_items_per_student === 0 || topic.my_item_count >= topic.max_items_per_student) return
    const content = draft.trim()
    if (!content) return setError('내 생각을 적어 주세요.')
    if (content.length > 120) return setError('생각은 120자까지 쓸 수 있어요.')
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.rpc('create_thought_item', { p_topic_id: topicId, p_content: content })
    setBusy(false)
    if (err) return setError(toMessage(err))
    setDraft('')
    setNotice('생각을 올렸어요!')
    await load()
  }

  const toggleVote = async (item: ThoughtItem) => {
    if (!topic?.is_open || pendingVote) return
    setPendingVote(item.id)
    setError(null)
    const { error: err } = await supabase.rpc('toggle_thought_vote', { p_item_id: item.id })
    if (err) setError(toMessage(err))
    await load()
    setPendingVote(null)
  }

  const remove = async (item: ThoughtItem) => {
    if (!item.is_mine || !window.confirm('내 생각을 삭제할까요?')) return
    setBusy(true)
    const { error: err } = await supabase.rpc('delete_my_thought_item', { p_item_id: item.id })
    setBusy(false)
    if (err) return setError(toMessage(err))
    setNotice('내 생각을 삭제했어요.')
    await load()
  }

  const ranked = useMemo(() => {
    if (!topic?.results_visible) return []
    return [...topic.items].sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }, [topic])

  if (loading) return <Spinner />
  if (!topic) return <main className="mx-auto max-w-3xl px-4 py-8"><ErrorBox message={error} /></main>

  const remaining = Math.max(0, topic.max_votes - topic.my_vote_count)
  const canAddThought = topic.is_open && topic.max_items_per_student > 0 && topic.my_item_count < topic.max_items_per_student

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b-2 border-line bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/student/thoughts" className="inline-flex min-h-11 items-center gap-2 rounded-2xl px-2 font-bold hover:bg-ink/5">
            <ArrowLeft className="size-5" aria-hidden />생각 상자
          </Link>
          <Button variant="secondary" size="sm" onClick={() => navigate('/student/board')}>❓ 질문 상자</Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            {topic.is_open && <Badge className="bg-mint-soft text-mint-ink">참여 중</Badge>}
            {topic.results_visible && <Badge className="bg-butter-soft text-butter-ink">결과 공개</Badge>}
            <Badge className="bg-lilac-soft text-lilac-ink">생각 {topic.max_items_per_student}개까지</Badge>
          </div>
          <h1 className="flex items-start gap-2 font-display text-3xl sm:text-4xl">
            <Lightbulb className="mt-1 size-9 shrink-0 text-mint-ink" aria-hidden />{topic.title}
          </h1>
        </div>

        <ErrorBox message={error} />
        {notice && <p role="status" className="rounded-2xl bg-mint-soft px-4 py-3 font-bold text-mint-ink">{notice}</p>}

        {topic.is_open && topic.max_items_per_student === 0 && (
          <p className="rounded-2xl border-2 border-mint bg-mint-soft/50 px-4 py-3 text-lg font-bold text-mint-ink">선생님이 후보를 올리는 활동이에요. 친구 발표를 듣고 후보에 투표해 보세요.</p>
        )}

        {canAddThought && (
          <form onSubmit={submit} className="flex flex-col gap-2 rounded-3xl border-2 border-line bg-paper p-4 shadow-pop sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="thought-item" className="mb-2 block text-lg font-bold">내 생각 적기 <span className="text-sm font-normal text-ink-soft">({topic.my_item_count}/{topic.max_items_per_student})</span></label>
              <Input id="thought-item" value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 120))} maxLength={120} placeholder="의견이나 아이디어를 적어 보세요." />
              <p className="mt-1 text-right text-xs text-ink-soft">{draft.length}/120</p>
            </div>
            <Button type="submit" variant="mint" loading={busy}>올리기</Button>
          </form>
        )}

        {topic.is_open && topic.max_items_per_student > 0 && topic.my_item_count >= topic.max_items_per_student && (
          <p className="rounded-2xl bg-paper px-4 py-3 text-ink-soft">내 생각을 {topic.max_items_per_student}개 모두 올렸어요. 내 생각을 하나 삭제하면 새 생각을 다시 올릴 수 있어요.</p>
        )}

        {topic.results_visible && ranked.length > 0 && (
          <section className="rounded-3xl border-2 border-butter bg-butter-soft/40 p-5 shadow-pop">
            <h2 className="mb-4 flex items-center justify-center gap-2 font-display text-3xl"><Trophy className="size-8 text-butter-ink" aria-hidden />결과</h2>
            <div className="grid items-end gap-3 sm:grid-cols-3">
              {ranked.slice(0, 3).map((item, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'
                return (
                  <div key={item.id} className={cx('rounded-2xl bg-paper p-4 text-center shadow-pop-sm', index === 0 && 'sm:order-2 sm:py-7', index === 1 && 'sm:order-1', index === 2 && 'sm:order-3')}>
                    <div className="text-4xl">{medal}</div>
                    <p className="mt-2 break-words text-lg font-bold">{item.content}</p>
                    <p className="mt-1 text-ink-soft">{item.vote_count ?? 0}표</p>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl">우리 반 생각 {topic.items.length}</h2>
          <p className="font-bold text-ink-soft">{topic.is_open ? `남은 표 ${remaining} / ${topic.max_votes}` : '참여가 종료되었어요.'}</p>
        </div>

        {topic.items.length === 0 ? (
          <EmptyState icon={<Lightbulb className="size-14" />} title="아직 올라온 생각이 없어요" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {topic.items.map((item) => (
              <li key={item.id} className="flex min-w-0 flex-col gap-3 rounded-3xl border-2 border-line bg-paper p-4 shadow-pop-sm">
                <div className="flex flex-wrap gap-2">
                  {item.is_mine && <Badge className="bg-sky-soft text-sky-ink">내 생각</Badge>}
                  {item.is_teacher_candidate && <Badge className="bg-mint-soft text-mint-ink">선생님 후보</Badge>}
                </div>
                <p className="text-xl leading-relaxed break-words">{item.content}</p>
                <div className="mt-auto flex items-center justify-between gap-2">
                  {item.is_mine ? (
                    <Button variant="ghost" size="sm" onClick={() => remove(item)} disabled={busy}>
                      <Trash2 className="size-4" aria-hidden />삭제
                    </Button>
                  ) : <span />}
                  <Button
                    variant={item.voted_by_me ? 'primary' : 'secondary'}
                    size="sm"
                    disabled={!topic.is_open || pendingVote === item.id || (!item.voted_by_me && remaining <= 0)}
                    onClick={() => toggleVote(item)}
                  >
                    <Heart className={cx('size-5', item.voted_by_me && 'fill-current')} aria-hidden />
                    {item.vote_count !== null ? item.vote_count : item.voted_by_me ? '투표함' : '투표'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
