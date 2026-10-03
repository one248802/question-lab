import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { LayoutGrid, Pencil, Plus, Trash2 } from 'lucide-react'
import { ClassPicker, NoClassYet } from '../../components/ClassPicker'
import { Badge, Button, Card, ChoiceChips, EmptyState, ErrorBox, Input, Label, PageTitle, Spinner, Toggle, cx } from '../../components/ui'
import { useTeacher } from '../../contexts/TeacherContext'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { ClassificationActivity } from '../../lib/types'

interface PickableQuestion {
  id: string
  content: string
  is_hidden: boolean
}

type Editing = { mode: 'new' } | { mode: 'edit'; activity: ClassificationActivity } | null

function fetchClassData(classId: string) {
  return Promise.all([
    supabase
      .from('classification_activities')
      .select('id, class_id, title, area_names, is_open, student_can_edit_area_names, created_at, classification_activity_questions(question_id, sort_order)')
      .eq('class_id', classId)
      .order('created_at', { ascending: false }),
    supabase
      .from('questions')
      .select('id, content, is_hidden')
      .eq('class_id', classId)
      .is('superseded_at', null)
      .order('created_at', { ascending: true }),
  ])
}

export default function ActivitiesPage() {
  const { classes, loading: classesLoading, selectedClassId } = useTeacher()
  if (classesLoading) return <Spinner />

  return (
    <>
      <PageTitle icon={<LayoutGrid className="size-9 text-mint-ink" />} title="질문 분류 활동" right={classes.length > 0 && <ClassPicker />} />
      {classes.length === 0 || !selectedClassId ? <NoClassYet /> : <ClassActivities key={selectedClassId} classId={selectedClassId} />}
    </>
  )
}

function ClassActivities({ classId }: { classId: string }) {
  const [activities, setActivities] = useState<ClassificationActivity[]>([])
  const [questions, setQuestions] = useState<PickableQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const apply = useCallback(([a, q]: Awaited<ReturnType<typeof fetchClassData>>) => {
    if (a.error || q.error) setError(toMessage(a.error ?? q.error))
    else {
      setError(null)
      setActivities((a.data ?? []) as ClassificationActivity[])
      setQuestions((q.data ?? []) as PickableQuestion[])
    }
    setLoading(false)
  }, [])

  const load = useCallback(async () => apply(await fetchClassData(classId)), [apply, classId])

  useEffect(() => {
    let alive = true
    fetchClassData(classId).then((result) => alive && apply(result))
    return () => { alive = false }
  }, [apply, classId])

  const questionById = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions])

  const save = async (
    activityId: string | null,
    title: string,
    areaNames: string[],
    questionIds: string[],
    studentCanEditAreaNames: boolean,
  ) => {
    const { error: err } = await supabase.rpc('save_classification_activity', {
      p_activity_id: activityId,
      p_class_id: classId,
      p_title: title,
      p_area_names: areaNames,
      p_question_ids: questionIds,
      p_student_can_edit_area_names: studentCanEditAreaNames,
    })
    if (err) return toMessage(err)
    setEditing(null)
    await load()
    return null
  }

  const setOpen = async (a: ClassificationActivity, next: boolean) => {
    setBusyId(a.id)
    setError(null)
    const { data, error: err } = await supabase.from('classification_activities').update({ is_open: next }).eq('id', a.id).select('id')
    if (err) setError(toMessage(err))
    else if (!data?.length) setError('공개 상태를 바꾸지 못했어요. 새로고침 후 다시 시도해 주세요.')
    await load()
    setBusyId(null)
  }

  const remove = async (a: ClassificationActivity) => {
    if (!window.confirm(`「${a.title}」 분류 활동을 삭제할까요?\n\n질문과 투표는 그대로 남고, 이 활동만 지워져요.`)) return
    setBusyId(a.id)
    setError(null)
    const { data, error: err } = await supabase.from('classification_activities').delete().eq('id', a.id).select('id')
    if (err) setError(toMessage(err))
    else if (!data?.length) setError('활동을 삭제하지 못했어요. 새로고침 후 다시 시도해 주세요.')
    await load()
    setBusyId(null)
  }

  if (loading) return <Spinner />

  return (
    <div className="flex flex-col gap-5">
      <p className="text-lg text-ink-soft">
        2개 또는 3개의 기준으로 질문을 나누게 할 수 있어요. 「학생이 기준 수정」을 켜면 영역 수는 그대로 두고 각 학생이 자기 관점에 맞게 기준 이름을 바꿀 수 있어요.
      </p>
      <ErrorBox message={error} />

      {editing ? (
        <ActivityEditor
          key={editing.mode === 'edit' ? editing.activity.id : 'new'}
          initial={editing.mode === 'edit' ? editing.activity : null}
          questions={questions}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <Button size="lg" onClick={() => setEditing({ mode: 'new' })} className="self-start"><Plus className="size-6" aria-hidden />새 분류 활동</Button>
      )}

      {activities.length === 0 ? (
        !editing && <EmptyState icon={<LayoutGrid className="size-14" />} title="아직 분류 활동이 없어요" />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {activities.map((a) => {
            const picked = a.classification_activity_questions
            const hiddenCount = picked.filter((p) => questionById.get(p.question_id)?.is_hidden).length
            return (
              <li key={a.id} className="flex flex-col gap-3 rounded-3xl border-2 border-line bg-paper p-5 shadow-pop">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xl font-bold break-words">{a.title}</p>
                    <p className="text-ink-soft">질문 {picked.length}개{hiddenCount > 0 && ` · 숨긴 질문 ${hiddenCount}개는 학생에게 안 보여요`}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-ink-soft">{a.is_open ? '학생에게 공개' : '비공개'}</span>
                    <Toggle label={`${a.title} 학생에게 공개`} checked={a.is_open} disabled={busyId === a.id} onChange={(next) => setOpen(a, next)} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {a.area_names.map((n) => <Badge key={n} className="bg-mint-soft text-mint-ink">{n}</Badge>)}
                  {a.student_can_edit_area_names && <Badge className="bg-lilac-soft text-lilac-ink">학생 기준 수정 가능</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing({ mode: 'edit', activity: a })} disabled={busyId === a.id}><Pencil className="size-4" aria-hidden />수정</Button>
                  <Button size="sm" variant="danger" onClick={() => remove(a)} disabled={busyId === a.id} className="sm:ml-auto"><Trash2 className="size-4" aria-hidden />삭제</Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function ActivityEditor({
  initial,
  questions,
  onSave,
  onCancel,
}: {
  initial: ClassificationActivity | null
  questions: PickableQuestion[]
  onSave: (activityId: string | null, title: string, areaNames: string[], questionIds: string[], studentCanEditAreaNames: boolean) => Promise<string | null>
  onCancel: () => void
}) {
  const initialAreas = initial?.area_names ?? ['', '']
  const [title, setTitle] = useState(initial?.title ?? '')
  const [areas, setAreas] = useState<string[]>(initialAreas)
  const [studentCanEdit, setStudentCanEdit] = useState(initial?.student_can_edit_area_names ?? false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial?.classification_activity_questions.map((q) => q.question_id) ?? []))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (id: string) => setSelected((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const allSelected = questions.length > 0 && questions.every((q) => selected.has(q.id))

  const setAreaCount = (count: '2' | '3') => {
    const n = Number(count)
    setAreas((current) => Array.from({ length: n }, (_, i) => current[i] ?? ''))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const t = title.trim()
    const names = areas.map((a) => a.trim())
    if (!t) return setError('활동 제목을 써 주세요.')
    if (![2, 3].includes(names.length)) return setError('분류 영역은 2개 또는 3개로 정해 주세요.')
    if (names.some((n) => !n)) return setError('분류 기준 이름을 모두 써 주세요.')
    if (new Set(names).size !== names.length) return setError('분류 기준 이름이 서로 달라야 해요.')
    const ids = questions.filter((q) => selected.has(q.id)).map((q) => q.id)
    if (ids.length === 0) return setError('분류할 질문을 하나 이상 골라 주세요.')
    setSaving(true)
    const result = await onSave(initial?.id ?? null, t, names, ids, studentCanEdit)
    setSaving(false)
    if (result) setError(result)
  }

  return (
    <Card className="bg-mint-soft/40">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <h2 className="font-display text-2xl">{initial ? '분류 활동 수정' : '새 분류 활동'}</h2>

        <div>
          <Label htmlFor="activity-title">활동 제목</Label>
          <Input id="activity-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="우리 반 질문 나눠 보기" />
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-lg font-bold">몇 개의 기준으로 나눌까요?</legend>
          <ChoiceChips<'2' | '3'>
            options={[{ value: '2', label: '2개로 분류' }, { value: '3', label: '3개로 분류' }]}
            value={areas.length === 3 ? '3' : '2'}
            onChange={setAreaCount}
          />
          <div className="grid gap-2 sm:grid-cols-3">
            {areas.map((name, i) => (
              <div key={i}>
                <Label htmlFor={`area-${i}`}>기준 {i + 1}</Label>
                <Input id={`area-${i}`} value={name} onChange={(e) => setAreas((list) => list.map((v, j) => (j === i ? e.target.value : v)))} maxLength={20} placeholder={i === 0 ? '예: 원인' : i === 1 ? '예: 결과' : '예: 해결'} />
              </div>
            ))}
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-paper px-4 py-3">
            <input type="checkbox" checked={studentCanEdit} onChange={(e) => setStudentCanEdit(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[#77b99c]" />
            <span><strong className="block">학생이 분류 기준을 수정할 수 있음</strong><span className="text-sm text-ink-soft">영역 개수는 그대로이고, 학생마다 자기 기준 이름을 만들어 저장할 수 있어요.</span></span>
          </label>
        </fieldset>

        <fieldset>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <legend className="text-lg font-bold">분류할 질문 <span className="text-ink-soft">({selected.size}개 선택)</span></legend>
            {questions.length > 0 && <Button type="button" size="sm" variant="secondary" onClick={() => setSelected(allSelected ? new Set() : new Set(questions.map((q) => q.id)))}>{allSelected ? '모두 해제' : '모두 선택'}</Button>}
          </div>
          {questions.length === 0 ? (
            <p className="rounded-2xl bg-paper px-4 py-3 text-ink-soft">이 학급에 아직 질문이 없어요.</p>
          ) : (
            <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto rounded-2xl bg-paper p-2">
              {questions.map((q) => (
                <li key={q.id}>
                  <label className={cx('flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2 hover:bg-cream', selected.has(q.id) && 'bg-butter-soft')}>
                    <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggle(q.id)} className="mt-1 size-5 shrink-0 accent-[#e8c34f]" />
                    <span className="min-w-0 flex-1 text-lg break-words">{q.content}</span>
                    {q.is_hidden && <Badge className="shrink-0 bg-line text-ink-soft">숨김 · 학생에게 안 보임</Badge>}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <ErrorBox message={error} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="lg" variant="mint" loading={saving}>저장</Button>
          <Button type="button" size="lg" variant="secondary" onClick={onCancel}>취소</Button>
        </div>
        {!initial && <p className="text-ink-soft">저장하면 비공개 상태로 만들어져요. 준비가 되면 「학생에게 공개」를 켜 주세요.</p>}
      </form>
    </Card>
  )
}
