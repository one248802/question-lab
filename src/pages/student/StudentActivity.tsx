import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { ArrowLeft, ImageDown, Inbox, LayoutGrid, RefreshCw, RotateCcw, Save } from 'lucide-react'
import { ConnectionRetry } from '../../components/ConnectionRetry'
import { Button, ErrorBox, EmptyState, Input, Spinner, cx } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { classificationFileName, renderClassificationPng, savePngOnDevice } from '../../lib/classificationPng'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { ActivityForStudent, StudentContext } from '../../lib/types'

type Placement = Record<string, number | null>
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

function mergePlacement(saved: Placement, activity: ActivityForStudent): Placement {
  const next: Placement = {}
  for (const q of activity.questions) {
    const v = saved[q.id]
    next[q.id] = typeof v === 'number' && v >= 0 && v < activity.area_names.length ? v : null
  }
  return next
}

const zoneId = (area: number | null) => (area === null ? 'tray' : `area-${area}`)
const areaOfZone = (id: string): number | null => (id === 'tray' ? null : Number(id.slice('area-'.length)))

const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length > 0 ? hits : rectIntersection(args)
}

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
  return Promise.all([supabase.rpc('get_my_student'), supabase.rpc('get_classification_activity', { p_activity_id: activityId })])
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
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [areaDrafts, setAreaDrafts] = useState<string[]>([])
  const [savingAreas, setSavingAreas] = useState(false)

  const apply = useCallback(([ctx, act]: Awaited<ReturnType<typeof fetchActivity>>) => {
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
    const student = ctx.data as StudentContext
    setMe(student)
    if (act.error) {
      setActivity(null)
      setError(toMessage(act.error))
    } else {
      const data = act.data as ActivityForStudent
      setError(null)
      setActivity(data)
      setAreaDrafts(data.area_names)
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
    fetchActivity(activityId).then((result) => { if (alive) apply(result) })
    return () => { alive = false }
  }, [authLoading, user, isAnonymous, activityId, apply, navigate])

  const update = (next: Placement) => {
    setPlacement(next)
    if (me && activity) writePlacement(storageKey(me.student_id, activity.id), next)
  }

  const moveCard = (questionId: string, area: number | null) => {
    update({ ...placement, [questionId]: area })
    setSelectedId(null)
  }
  const moveSelected = (area: number | null) => { if (selectedId) moveCard(selectedId, area) }

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

  const saveAreaNames = async () => {
    if (!activity?.student_can_edit_area_names) return
    const names = areaDrafts.map((n) => n.trim())
    if (names.some((n) => !n)) return setError('분류 기준 이름을 모두 적어 주세요.')
    if (new Set(names).size !== names.length) return setError('분류 기준 이름은 서로 달라야 해요.')
    setSavingAreas(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('save_my_classification_area_names', {
      p_activity_id: activity.id,
      p_area_names: names,
    })
    setSavingAreas(false)
    if (err) return setError(toMessage(err))
    const saved = (data ?? names) as string[]
    setActivity({ ...activity, area_names: saved })
    setAreaDrafts(saved)
    setNotice('나의 분류 기준을 저장했어요.')
  }

  const resetAreaNames = async () => {
    if (!activity) return
    setAreaDrafts(activity.teacher_area_names)
  }

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

  if (loading) return <Spinner />
  if (!me) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-6">
        <ConnectionRetry message={connectionError} retrying={refreshing} onRetry={refresh} />
      </main>
    )
  }

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
            <ArrowLeft className="size-6" aria-hidden />우리 반 질문
          </Link>
          <p className="truncate text-base text-ink-soft">{me.class_name}</p>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6">
        {!activity ? (
          <>
            <ErrorBox message={error} />
            <EmptyState icon={<LayoutGrid className="size-14" />} title="분류 활동을 열 수 없어요">
              <Button variant="secondary" onClick={refresh} loading={refreshing} className="mt-2">다시 시도</Button>
              <Link to="/student/board" className="mt-2 text-lg font-bold underline">우리 반 질문으로 돌아가기</Link>
            </EmptyState>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="flex items-center gap-2 font-display text-3xl break-words">
                <LayoutGrid className="size-8 shrink-0 text-mint-ink" aria-hidden />{activity.title}
              </h1>
              <div className="flex flex-wrap gap-2">
                {activity.questions.length > 0 && <Button variant="mint" size="sm" onClick={savePng} loading={saving}>{!saving && <ImageDown className="size-5" aria-hidden />}분류 결과 PNG로 저장</Button>}
                <Button variant="secondary" size="sm" onClick={resetAll}><RotateCcw className="size-5" aria-hidden />처음으로</Button>
                <Button variant="secondary" size="sm" onClick={refresh} aria-label="새로고침"><RefreshCw className={cx('size-5', refreshing && 'animate-spin')} aria-hidden /></Button>
              </div>
            </div>

            {activity.student_can_edit_area_names && (
              <section className="rounded-3xl border-2 border-lilac bg-lilac-soft/30 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xl font-bold">나의 분류 기준</h2>
                    <p className="text-sm text-ink-soft">영역 수는 같게 두고, 내가 생각한 기준 이름으로 바꿀 수 있어요.</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={resetAreaNames}>선생님 기준 불러오기</Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {areaDrafts.map((name, i) => (
                    <Input key={i} value={name} onChange={(e) => setAreaDrafts((current) => current.map((v, j) => j === i ? e.target.value.slice(0, 20) : v))} maxLength={20} aria-label={`분류 기준 ${i + 1}`} />
                  ))}
                </div>
                <Button className="mt-3" variant="secondary" size="sm" onClick={saveAreaNames} loading={savingAreas}><Save className="size-4" aria-hidden />내 기준 저장</Button>
              </section>
            )}

            <p className="rounded-2xl bg-paper px-4 py-3 text-lg">{selectedId ? '옮길 영역의 「여기에 놓기」를 누르세요.' : '질문 카드를 끌어서 영역에 놓거나, 카드를 누른 다음 옮길 영역을 고르세요.'}</p>
            {connectionError && <ErrorBox message="연결이 잠시 불안정해요. 새로고침 버튼으로 다시 시도해 주세요. 지금 배치는 그대로예요." />}
            <ErrorBox message={error} />
            {notice && <p role="status" className="rounded-2xl border-2 border-[#6fc9a4] bg-mint-soft px-4 py-3 text-lg font-bold text-mint-ink">{notice}</p>}

            {activity.questions.length === 0 ? (
              <EmptyState icon={<Inbox className="size-14" />} title="분류할 질문이 없어요" />
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={collisionDetection}
                accessibility={{ screenReaderInstructions: SCREEN_READER_INSTRUCTIONS, announcements: ANNOUNCEMENTS }}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragCancel={() => setDraggingId(null)}
              >
                <div className="flex flex-wrap gap-4">
                  {zones.map((zone) => (
                    <Zone key={zoneId(zone.area)} area={zone.area} name={zone.name} canDropHere={selectedId !== null && selectedArea !== zone.area} onDropHere={() => moveSelected(zone.area)}>
                      {activity.questions
                        .filter((q) => (placement[q.id] ?? null) === zone.area)
                        .map((q) => <QuestionCard key={q.id} id={q.id} content={q.content} selected={selectedId === q.id} onToggle={() => setSelectedId((id) => id === q.id ? null : q.id)} />)}
                    </Zone>
                  ))}
                </div>
                <DragOverlay dropAnimation={null}>
                  {draggingQuestion && <div className="rotate-2 rounded-2xl border-2 border-[#e8c34f] bg-butter px-4 py-3 text-lg leading-relaxed font-medium break-words shadow-pop-lg">{draggingQuestion.content}</div>}
                </DragOverlay>
              </DndContext>
            )}
            <p className="text-sm text-ink-soft">질문 카드 배치는 서버에 저장되지 않아요. 필요하면 「분류 결과 PNG로 저장」으로 내 기기에 저장하세요. 내가 만든 분류 기준 이름은 다음에 다시 들어와도 남아 있어요.</p>
          </>
        )}
      </main>
    </div>
  )
}

function Zone({ area, name, canDropHere, onDropHere, children }: { area: number | null; name: string; canDropHere: boolean; onDropHere: () => void; children: ReactNode[] }) {
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
      <div className="flex items-center justify-between gap-2"><h2 className="text-xl font-bold break-words">{name}</h2><span className="shrink-0 rounded-full bg-line px-2 text-base font-bold text-ink-soft">{children.length}</span></div>
      {canDropHere && <Button variant="mint" size="sm" onClick={onDropHere}>여기에 놓기</Button>}
      <ul className={cx('flex flex-col gap-2', area === null && 'sm:grid sm:grid-cols-2 lg:grid-cols-3')}>{children}</ul>
    </section>
  )
}

function QuestionCard({ id, content, selected, onToggle }: { id: string; content: string; selected: boolean; onToggle: () => void }) {
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
      >{content}</button>
    </li>
  )
}
