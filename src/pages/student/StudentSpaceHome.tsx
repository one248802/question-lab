import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Lightbulb, LogOut, MessageCircleQuestion, NotebookTabs, UserRound } from 'lucide-react'
import { Button, Card, ErrorBox, Spinner } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { StudentContext } from '../../lib/types'

export default function StudentSpaceHome() {
  const navigate = useNavigate()
  const { user, isAnonymous, loading: authLoading } = useAuth()
  const [me, setMe] = useState<StudentContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('get_my_student')
    if (err) {
      setError(toMessage(err))
      setLoading(false)
      return
    }
    if (!data) {
      navigate('/student', { replace: true })
      return
    }
    setMe(data as StudentContext)
    setError(null)
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

  const leave = async () => {
    if (!window.confirm('생각 놀이터에서 나갈까요?')) return
    await supabase.rpc('leave_class')
    navigate('/', { replace: true, state: { signingOut: true } })
    await supabase.auth.signOut()
  }

  if (loading) return <Spinner />
  if (!me) return <main className="mx-auto max-w-lg px-4 py-8"><ErrorBox message={error} /></main>

  return (
    <div className="min-h-dvh">
      <header className="border-b-2 border-line bg-cream/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="font-display text-3xl">🌱 생각 놀이터</h1>
            <p className="text-ink-soft">생각이 자라는 교실</p>
          </div>
          <Button variant="secondary" size="sm" onClick={leave}>
            <LogOut className="size-5" aria-hidden />나가기
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg text-ink-soft">{me.class_name}</p>
            <p className="flex items-center gap-2 text-xl font-bold">
              <UserRound className="size-5" aria-hidden />{me.student_number}번 {me.student_name}
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/student/my-questions')}>
            <NotebookTabs className="size-5" aria-hidden />내 질문 모아보기
          </Button>
        </div>

        <div className="text-center">
          <h2 className="font-display text-3xl sm:text-4xl">오늘은 어디에서 생각을 나눌까요?</h2>
          <p className="mt-2 text-lg text-ink-soft">질문을 키우거나, 의견과 아이디어를 함께 모아 보세요.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Card className="flex min-h-80 flex-col items-center justify-center gap-5 bg-sky-soft/50 p-7 text-center">
            <div className="flex size-20 items-center justify-center rounded-full bg-sky text-white">
              <MessageCircleQuestion className="size-10" aria-hidden />
            </div>
            <div>
              <h3 className="font-display text-3xl">❓ 질문 상자</h3>
              <p className="mt-2 text-lg text-ink-soft">궁금한 것을 질문하고, 친구 생각을 만나며 질문을 발전시켜요.</p>
            </div>
            <Button size="lg" variant="sky" onClick={() => navigate('/student/board')}>
              질문 상자 들어가기 <ArrowRight className="size-5" aria-hidden />
            </Button>
          </Card>

          <Card className="flex min-h-80 flex-col items-center justify-center gap-5 bg-mint-soft/60 p-7 text-center">
            <div className="flex size-20 items-center justify-center rounded-full bg-mint text-mint-ink">
              <Lightbulb className="size-10" aria-hidden />
            </div>
            <div>
              <h3 className="font-display text-3xl">💭 생각 상자</h3>
              <p className="mt-2 text-lg text-ink-soft">의견과 아이디어를 나누고, 함께 투표해서 우리 반의 생각을 모아요.</p>
            </div>
            <Button size="lg" variant="mint" onClick={() => navigate('/student/thoughts')}>
              생각 상자 들어가기 <ArrowRight className="size-5" aria-hidden />
            </Button>
          </Card>
        </div>
      </main>
    </div>
  )
}
