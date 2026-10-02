import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Inbox, LayoutGrid, RefreshCw, RotateCcw } from 'lucide-react'
import { Button, ErrorBox, EmptyState, Spinner, cx } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { ActivityForStudent, StudentContext } from '../../lib/types'

/** 질문 id → 영역 번호 (null 이면 아직 분류하지 않음) */
type Placement = Record<string, number | null>

// 배치는 DB 에 저장하지 않고, 새로고침에 대비해 이 탭의 sessionStorage 에만 둡니다 (탭을 닫으면 사라짐).
const storageKey = (studentId: string, activityId: string) => `qlab:classify:${studentId}:${activityId}`

function readPlacement(key: string): Placement {
  try {
    const raw = window.sessionStorage.getItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as Placement) : {}
  } catch {
    return {}
  }
}

function writePlacement(key: string, placement: Placement) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(placement))
  } catch {
    /* 저장할 수 없는 환경이면 화면 상태만 유지 */
  }
}

/** 저장된 배치를 현재 활동에 맞춤: 없어진 질문은 버리고, 새 질문과 없어진 영역의 질문은 미분류로 */
function mergePlacement(saved: Placement, activity: ActivityForStudent): Placement {
  const next: Placement = {}
  for (const q of activity.questions) {
    const v = saved[q.id]
    next[q.id] = typeof v === 'number' && v >= 0 && v < activity.area_names.length ? v : null
  }
  return next
}

function fetchActivity(activityId: string) {
  return Promise.all([
    supabase.rpc('get_my_student'),
    supabase.rpc('get_classification_activity', { p_activity_id: activityId }),
  ])
}

export default function StudentActivity() {
  const { activityId = '' } = useParams()
  const navigate = useNavigate()
  const { user, isAnonymous, loading: authLoading } = useAuth()

  const [me, setMe] = useState<StudentContext | null>(null)
  const [activity, setActivity] = useState<ActivityForStudent | null>(null)
  const [placement, setPlacement] = useState<Placement>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apply = useCallback(([ctx, act]: Awaited<ReturnType<typeof fetchActivity>>) => {
    if (!ctx.data) {
      navigate('/student', { replace: true })
      return
    }
    const student = ctx.data as StudentContext
    setMe(student)
    if (act.error) {
      setActivity(null)
      setError(toMessage(act.error))
    } else {
      const data = act.data as ActivityForStudent
      setError(null)
      setActivity(data)
      setPlacement(mergePlacement(readPlacement(storageKey(student.student_id, data.id)), data))
    }
    setLoading(false)
  }, [navigate])

  useEffect(() => {
    if (authLoading) return
    if (!user || !isAnonymous) {
      navigate('/student', { replace: true })
      return
    }
    let alive = true
    fetchActivity(activityId).then((result) => {
      if (alive) apply(result)
    })
    return () => {
      alive = false
    }
  }, [authLoading, user, isAnonymous, activityId, apply, navigate])

  const update = (next: Placement) => {
    setPlacement(next)
    if (me && activity) writePlacement(storageKey(me.student_id, activity.id), next)
  }

  const moveSelected = (area: number | null) => {
    if (!selectedId) return
    update({ ...placement, [selectedId]: area })
    setSelectedId(null)
  }

  const resetAll = () => {
    if (!activity || !window.confirm('모든 질문 카드를 처음 자리로 되돌릴까요?')) return
    update(Object.fromEntries(activity.questions.map((q) => [q.id, null])))
    setSelectedId(null)
  }

  const refresh = async () => {
    setRefreshing(true)
    apply(await fetchActivity(activityId))
    setRefreshing(false)
  }

  if (loading || !me) return <Spinner />

  const zones: Array<{ area: number | null; name: string }> = [
    { area: null, name: '아직 분류하지 않은 질문' },
    ...(activity?.area_names ?? []).map((name, i) => ({ area: i, name })),
  ]
  const selectedArea = selectedId ? (placement[selectedId] ?? null) : undefined

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b-2 border-line bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/student/board" className="inline-flex min-h-12 items-center gap-2 rounded-2xl px-2 text-lg font-bold hover:bg-ink/5">
            <ArrowLeft className="size-6" aria-hidden />
            우리 반 질문
          </Link>
          <p className="truncate text-base text-ink-soft">{me.class_name}</p>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6">
        {!activity ? (
          <>
            <ErrorBox message={error} />
            <EmptyState icon={<LayoutGrid className="size-14" />} title="분류 활동을 열 수 없어요">
              <Link to="/student/board" className="mt-2 text-lg font-bold underline">
                우리 반 질문으로 돌아가기
              </Link>
            </EmptyState>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="flex items-center gap-2 font-display text-3xl break-words">
                <LayoutGrid className="size-8 shrink-0 text-mint-ink" aria-hidden />
                {activity.title}
              </h1>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={resetAll}>
                  <RotateCcw className="size-5" aria-hidden />
                  처음으로
                </Button>
                <Button variant="secondary" size="sm" onClick={refresh} aria-label="새로고침">
                  <RefreshCw className={cx('size-5', refreshing && 'animate-spin')} aria-hidden />
                </Button>
              </div>
            </div>
            <p className="rounded-2xl bg-paper px-4 py-3 text-lg">
              {selectedId ? '옮길 영역의 「여기에 놓기」를 누르세요.' : '질문 카드를 누른 다음, 옮길 영역을 고르세요.'}
            </p>
            <ErrorBox message={error} />

            {activity.questions.length === 0 ? (
              <EmptyState icon={<Inbox className="size-14" />} title="분류할 질문이 없어요" />
            ) : (
              <div className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
                {zones.map((zone) => {
                  const cards = activity.questions.filter((q) => (placement[q.id] ?? null) === zone.area)
                  const canDropHere = selectedId !== null && selectedArea !== zone.area
                  return (
                    <section
                      key={zone.area ?? 'tray'}
                      aria-label={zone.name}
                      className={cx(
                        'flex min-h-40 flex-col gap-3 rounded-3xl border-2 p-4',
                        zone.area === null ? 'border-dashed border-line-strong bg-cream md:col-span-full' : 'border-line bg-paper shadow-pop',
                        canDropHere && 'border-mint ring-4 ring-mint/40',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-xl font-bold break-words">{zone.name}</h2>
                        <span className="shrink-0 rounded-full bg-line px-2 text-base font-bold text-ink-soft">{cards.length}</span>
                      </div>
                      {canDropHere && (
                        <Button variant="mint" size="sm" onClick={() => moveSelected(zone.area)}>
                          여기에 놓기
                        </Button>
                      )}
                      <ul className={cx('flex flex-col gap-2', zone.area === null && 'sm:grid sm:grid-cols-2 lg:grid-cols-3')}>
                        {cards.map((q) => (
                          <li key={q.id}>
                            <button
                              type="button"
                              aria-pressed={selectedId === q.id}
                              onClick={() => setSelectedId((id) => (id === q.id ? null : q.id))}
                              className={cx(
                                'w-full rounded-2xl border-2 px-4 py-3 text-left text-lg leading-relaxed font-medium break-words transition',
                                selectedId === q.id
                                  ? 'border-[#e8c34f] bg-butter shadow-pop-sm'
                                  : 'border-line bg-paper hover:border-line-strong',
                              )}
                            >
                              {q.content}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )
                })}
              </div>
            )}
            <p className="text-sm text-ink-soft">분류 결과는 저장되지 않아요. 이 탭을 닫으면 사라져요.</p>
          </>
        )}
      </main>
    </div>
  )
}
