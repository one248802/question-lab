import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Lightbulb, Trophy, Vote } from 'lucide-react'
import { Badge, Button, EmptyState, ErrorBox, Spinner } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { StudentContext, ThoughtTopicSummary } from '../../lib/types'

export default function StudentThoughtTopics() {
  const navigate = useNavigate()
  const { user, isAnonymous, loading: authLoading } = useAuth()
  const [me, setMe] = useState<StudentContext | null>(null)
  const [topics, setTopics] = useState<ThoughtTopicSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [ctx, list] = await Promise.all([supabase.rpc('get_my_student'), supabase.rpc('list_open_thought_topics')])
    if (ctx.error) {
      setError(toMessage(ctx.error))
      setLoading(false)
      return
    }
    if (!ctx.data) {
      navigate('/student', { replace: true })
      return
    }
    setMe(ctx.data as StudentContext)
    if (list.error) setError(toMessage(list.error))
    else {
      setError(null)
      setTopics((list.data ?? []) as ThoughtTopicSummary[])
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

  if (loading) return <Spinner />

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b-2 border-line bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/student/home" className="inline-flex min-h-11 items-center gap-2 rounded-2xl px-2 font-bold hover:bg-ink/5">
            <ArrowLeft className="size-5" aria-hidden />🌱 생각 놀이터
          </Link>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate('/student/board')}>❓ 질문 상자</Button>
            <Button variant="mint" size="sm" disabled>💭 생각 상자</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6">
        <div>
          <p className="text-base text-ink-soft">{me?.class_name}</p>
          <h1 className="flex items-center gap-2 font-display text-3xl sm:text-4xl">
            <Lightbulb className="size-9 text-mint-ink" aria-hidden />생각 상자
          </h1>
          <p className="mt-1 text-lg text-ink-soft">선생님이 연 주제에 내 생각을 적고 친구들과 함께 골라요.</p>
        </div>

        <ErrorBox message={error} />
        {topics.length === 0 ? (
          <EmptyState icon={<Lightbulb className="size-14" />} title="지금 열린 생각 주제가 없어요" />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {topics.map((topic) => (
              <li key={topic.id} className="flex min-h-56 flex-col gap-4 rounded-3xl border-2 border-line bg-paper p-5 shadow-pop">
                <div className="flex flex-wrap gap-2">
                  {topic.is_open && <Badge className="bg-mint-soft text-mint-ink"><Vote className="mr-1 size-4" aria-hidden />참여 중</Badge>}
                  {topic.results_visible && <Badge className="bg-butter-soft text-butter-ink"><Trophy className="mr-1 size-4" aria-hidden />결과 공개</Badge>}
                </div>
                <h2 className="text-2xl font-bold leading-snug">{topic.title}</h2>
                <p className="text-ink-soft">생각 {topic.item_count}개 · 1인당 {topic.max_votes}표</p>
                <Button
                  className="mt-auto self-start"
                  variant={topic.is_open ? 'mint' : 'secondary'}
                  onClick={() => navigate(`/student/thoughts/${topic.id}`)}
                >
                  {topic.is_open ? '참여하기' : '결과 보기'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
