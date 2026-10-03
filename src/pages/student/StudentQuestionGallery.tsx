import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Heart, MessageSquareText } from 'lucide-react'
import { Badge, Button, EmptyState, ErrorBox, Spinner, cx } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { QuestionGalleryItem, StudentContext } from '../../lib/types'

function localDateKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateLabel(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(y, m - 1, d))
}

export default function StudentQuestionGallery() {
  const navigate = useNavigate()
  const { user, isAnonymous, loading: authLoading } = useAuth()
  const [me, setMe] = useState<StudentContext | null>(null)
  const [items, setItems] = useState<QuestionGalleryItem[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [ctx, gallery] = await Promise.all([
      supabase.rpc('get_my_student'),
      supabase.rpc('list_class_question_gallery'),
    ])
    if (ctx.error || gallery.error) {
      setError(toMessage(ctx.error ?? gallery.error))
      setLoading(false)
      return
    }
    if (!ctx.data) {
      navigate('/student', { replace: true })
      return
    }
    const list = (gallery.data ?? []) as QuestionGalleryItem[]
    setMe(ctx.data as StudentContext)
    setItems(list)
    setSelectedDate((current) => current ?? (list[0] ? localDateKey(list[0].created_at) : null))
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

  const groups = useMemo(() => {
    const map = new Map<string, QuestionGalleryItem[]>()
    for (const item of items) {
      const key = localDateKey(item.created_at)
      map.set(key, [...(map.get(key) ?? []), item])
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [items])

  const selected = groups.find(([key]) => key === selectedDate)?.[1] ?? []

  if (loading) return <Spinner />
  if (!me) return <main className="mx-auto max-w-3xl px-4 py-8"><ErrorBox message={error} /></main>

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b-2 border-line bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/student/board" className="inline-flex min-h-11 items-center gap-2 rounded-2xl px-2 font-bold hover:bg-ink/5">
            <ArrowLeft className="size-5" aria-hidden />질문 상자
          </Link>
          <p className="text-sm text-ink-soft">{me.class_name}</p>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl sm:text-4xl"><CalendarDays className="size-9 text-sky-ink" aria-hidden />지난 질문 갤러리</h1>
          <p className="mt-2 text-lg text-ink-soft">질문을 올린 날짜가 자동으로 기록돼요. 질문을 업그레이드하기 전 버전도 지난 기록으로 남아요.</p>
        </div>
        <ErrorBox message={error} />

        {groups.length === 0 ? (
          <EmptyState icon={<CalendarDays className="size-14" />} title="아직 쌓인 질문 기록이 없어요" />
        ) : (
          <>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {groups.map(([key, questions]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                  className={cx(
                    'min-w-44 rounded-3xl border-2 px-4 py-4 text-left shadow-pop-sm transition',
                    selectedDate === key ? 'border-sky bg-sky-soft' : 'border-line bg-paper hover:border-sky',
                  )}
                >
                  <p className="font-bold">{dateLabel(key)}</p>
                  <p className="mt-1 text-sm text-ink-soft">질문 {questions.length}개</p>
                </button>
              ))}
            </div>

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-2xl">{selectedDate ? dateLabel(selectedDate) : ''}</h2>
                <Badge className="bg-sky-soft text-sky-ink">읽기 전용 기록</Badge>
              </div>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {selected.map((q) => (
                  <li key={q.id} className="flex min-w-0 flex-col gap-3 rounded-3xl border-2 border-line bg-paper p-5 shadow-pop-sm">
                    <div className="flex flex-wrap gap-2">
                      {q.is_mine && <Badge className="bg-butter-soft text-butter-ink">내 질문</Badge>}
                      <Badge className={q.is_current ? 'bg-mint-soft text-mint-ink' : 'bg-line text-ink-soft'}>{q.is_current ? '현재 버전' : '이전 버전'}</Badge>
                    </div>
                    <p className="text-xl leading-relaxed break-words whitespace-pre-wrap">{q.content}</p>
                    <div className="mt-auto flex flex-wrap gap-3 text-sm text-ink-soft">
                      {q.vote_count !== null && <span className="inline-flex items-center gap-1"><Heart className="size-4" aria-hidden />{q.vote_count}표</span>}
                      <span className="inline-flex items-center gap-1"><MessageSquareText className="size-4" aria-hidden />생각 {q.thought_count}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        <Button variant="secondary" className="self-start" onClick={() => navigate('/student/board')}>질문 상자로 돌아가기</Button>
      </main>
    </div>
  )
}
