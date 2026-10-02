import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { ArrowLeft, ImageDown, Inbox, LayoutGrid, RefreshCw, RotateCcw } from 'lucide-react'
import { Button, ErrorBox, EmptyState, Spinner, cx } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { classificationFileName, renderClassificationPng, savePngOnDevice } from '../../lib/classificationPng'
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

// drag & drop 에서 영역을 구분하는 id. 미분류 칸은 'tray'
const zoneId = (area: number | null) => (area === null ? 'tray' : `area-${area}`)
const areaOfZone = (id: string): number | null => (id === 'tray' ? null : Number(id.slice('area-'.length)))

// 화면 읽기 프로그램 안내 (키보드 끌기는 쓰지 않고, 카드 선택 → 「여기에 놓기」 버튼으로 옮김)
const SCREEN_READER_INSTRUCTIONS = {
  draggable: '카드를 누르면 선택돼요. 그다음 옮길 영역의 「여기에 놓기」 버튼을 누르세요. 마우스나 손가락으로 끌어서 옮길 수도 있어요.',
}
const ANNOUNCEMENTS: Announcements = {
  onDragStart: () => '질문 카드를 집었어요.',
  onDragOver: () => undefined,
  onDragEnd: ({ over }) => (over ? '질문 카드를 옮겼어요.' : '질문 카드를 제자리에 두었어요.'),
  onDragCancel: () => '옮기기를 취소했어요.',
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
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

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

  // tap-to-move 와 drag & drop 이 함께 쓰는 이동 함수 (같은 placement, 같은 sessionStorage)
  const moveCard = (questionId: string, area: number | null) => {
    update({ ...placement, [questionId]: area })
    setSelectedId(null)
  }

  const moveSelected = (area: number | null) => {
    if (selectedId) moveCard(selectedId, area)
  }

  // 마우스: 6px 이상 움직이면 끌기 (짧은 클릭은 카드 선택)
  // 터치: 0.2초 길게 누르면 끌기 (짧게 누르면 카드 선택, 그냥 밀면 화면 스크롤)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )
  const onDragStart = (e: DragStartEvent) => {
    setDraggingId(String(e.active.id))
    setSelectedId(null)
  }
  const onDragEnd = (e: DragEndEvent) => {
    setDraggingId(null)
    if (!e.over) return
    const area = areaOfZone(String(e.over.id))
    const questionId = String(e.active.id)
    if ((placement[questionId] ?? null) !== area) moveCard(questionId, area)
  }

  const resetAll = () => {
    if (!activity || !window.confirm('모든 질문 카드를 처음 자리로 되돌릴까요?')) return
    update(Object.fromEntries(activity.questions.map((q) => [q.id, null])))
    setSelectedId(null)
  }

  // 분류 결과 PNG: 학생 기기에만 저장 (서버 업로드 없음, 분류 결과는 DB 에 저장하지 않음)
  const savePng = async () => {
    if (!me || !activity) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const data = {
        title: activity.title,
        className: me.class_name,
        studentNumber: me.student_number,
        studentName: me.student_name,
        date: new Date(),
        areas: activity.area_names.map((name, i) => ({
          name,
          questions: activity.questions.filter((q) => placement[q.id] === i).map((q) => q.content),
        })),
        unsorted: activity.questions.filter((q) => (placement[q.id] ?? null) === null).map((q) => q.content),
      }
      const result = await savePngOnDevice(await renderClassificationPng(data), classificationFileName(data))
      if (result === 'downloaded') setNotice('분류 결과 PNG를 이 기기에 저장했어요.')
      else if (result === 'shared') setNotice('분류 결과 PNG를 만들었어요.')
    } catch {
      setError('PNG를 만들지 못했어요. 다시 시도해 주세요.')
    }
    setSaving(false)
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
  const draggingQuestion = activity?.questions.find((q) => q.id === draggingId) ?? null

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
                {activity.questions.length > 0 && (
                  <Button variant="mint" size="sm" onClick={savePng} loading={saving}>
                    {!saving && <ImageDown className="size-5" aria-hidden />}
                    분류 결과 PNG로 저장
                  </Button>
                )}
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
              {selectedId
                ? '옮길 영역의 「여기에 놓기」를 누르세요.'
                : '질문 카드를 끌어서 영역에 놓거나, 카드를 누른 다음 옮길 영역을 고르세요.'}
            </p>
            <ErrorBox message={error} />
            {notice && (
              <p role="status" className="rounded-2xl border-2 border-[#6fc9a4] bg-mint-soft px-4 py-3 text-lg font-bold text-mint-ink">
                {notice}
              </p>
            )}

            {activity.questions.length === 0 ? (
              <EmptyState icon={<Inbox className="size-14" />} title="분류할 질문이 없어요" />
            ) : (
              <DndContext
                sensors={sensors}
                accessibility={{ screenReaderInstructions: SCREEN_READER_INSTRUCTIONS, announcements: ANNOUNCEMENTS }}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragCancel={() => setDraggingId(null)}
              >
                {/* 미분류 칸은 한 줄 전체, 영역들은 줄 너비를 나눠 채움 (좁으면 다음 줄로) */}
                <div className="flex flex-wrap gap-4">
                  {zones.map((zone) => (
                    <Zone
                      key={zoneId(zone.area)}
                      area={zone.area}
                      name={zone.name}
                      canDropHere={selectedId !== null && selectedArea !== zone.area}
                      onDropHere={() => moveSelected(zone.area)}
                    >
                      {activity.questions
                        .filter((q) => (placement[q.id] ?? null) === zone.area)
                        .map((q) => (
                          <QuestionCard
                            key={q.id}
                            id={q.id}
                            content={q.content}
                            selected={selectedId === q.id}
                            onToggle={() => setSelectedId((id) => (id === q.id ? null : q.id))}
                          />
                        ))}
                    </Zone>
                  ))}
                </div>
                <DragOverlay>
                  {draggingQuestion && (
                    <div className="rotate-2 rounded-2xl border-2 border-[#e8c34f] bg-butter px-4 py-3 text-lg leading-relaxed font-medium break-words shadow-pop-lg">
                      {draggingQuestion.content}
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            )}
            <p className="text-sm text-ink-soft">
              분류 결과는 서버에 저장되지 않아요. 이 탭을 닫으면 사라지니, 필요하면 「분류 결과 PNG로 저장」으로 내 기기에 저장하세요.
            </p>
          </>
        )}
      </main>
    </div>
  )
}

/** 분류 영역(또는 미분류 칸). 카드를 끌어다 놓을 수 있고, tap-to-move 의 「여기에 놓기」도 여기서 */
function Zone({
  area,
  name,
  canDropHere,
  onDropHere,
  children,
}: {
  area: number | null
  name: string
  canDropHere: boolean
  onDropHere: () => void
  children: ReactNode[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id: zoneId(area) })
  return (
    <section
      ref={setNodeRef}
      aria-label={name}
      className={cx(
        'flex min-h-40 flex-col gap-3 rounded-3xl border-2 p-4 transition',
        area === null ? 'w-full border-dashed border-line-strong bg-cream' : 'min-w-0 flex-1 basis-60 border-line bg-paper shadow-pop',
        (canDropHere || isOver) && 'border-mint ring-4 ring-mint/40',
        isOver && 'bg-mint-soft',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold break-words">{name}</h2>
        <span className="shrink-0 rounded-full bg-line px-2 text-base font-bold text-ink-soft">{children.length}</span>
      </div>
      {canDropHere && (
        <Button variant="mint" size="sm" onClick={onDropHere}>
          여기에 놓기
        </Button>
      )}
      <ul className={cx('flex flex-col gap-2', area === null && 'sm:grid sm:grid-cols-2 lg:grid-cols-3')}>{children}</ul>
    </section>
  )
}

/** 질문 카드: 누르면 선택(tap-to-move), 끌면 drag & drop */
function QuestionCard({
  id,
  content,
  selected,
  onToggle,
}: {
  id: string
  content: string
  selected: boolean
  onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id })
  return (
    <li>
      <button
        ref={setNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-pressed={selected}
        onClick={onToggle}
        className={cx(
          'w-full cursor-grab touch-manipulation rounded-2xl border-2 px-4 py-3 text-left text-lg leading-relaxed font-medium break-words transition select-none',
          selected ? 'border-[#e8c34f] bg-butter shadow-pop-sm' : 'border-line bg-paper hover:border-line-strong',
          isDragging && 'opacity-40',
        )}
      >
        {content}
      </button>
    </li>
  )
}
