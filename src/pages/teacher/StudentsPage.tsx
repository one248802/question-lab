import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, Pencil, Plus, Trash2, Users, X } from 'lucide-react'
import { ClassPicker, NoClassYet } from '../../components/ClassPicker'
import { ClassCode } from '../../components/ClassCode'
import { Button, Card, EmptyState, ErrorBox, Input, PageTitle, Spinner } from '../../components/ui'
import { useTeacher } from '../../contexts/TeacherContext'
import { formatDateTime } from '../../lib/date'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { Student } from '../../lib/types'

interface StudentRow extends Student {
  question_count: number
}

function friendly(err: unknown) {
  const msg = toMessage(err)
  return msg.includes('duplicate key') ? '이미 같은 번호의 학생이 있어요.' : msg
}

export default function StudentsPage() {
  const { classes, loading: classesLoading, selectedClassId, selectedClass, reload: reloadStats } = useTeacher()
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    if (!selectedClassId) return
    const { data, error: err } = await supabase
      .from('students')
      .select('id, class_id, student_number, name, created_at, questions(count)')
      .eq('class_id', selectedClassId)
      .order('student_number')
    if (err) setError(toMessage(err))
    else {
      setError(null)
      type Raw = Student & { questions: Array<{ count: number }> }
      setStudents(((data ?? []) as unknown as Raw[]).map(({ questions, ...s }) => ({ ...s, question_count: questions?.[0]?.count ?? 0 })))
    }
    setLoading(false)
  }, [selectedClassId])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const n = Number(number)
    if (!Number.isInteger(n) || n < 1 || n > 99) return setError('번호는 1~99 사이로 넣어 주세요.')
    if (!name.trim()) return setError('이름을 넣어 주세요.')
    setAdding(true)
    const { error: err } = await supabase.from('students').insert({ class_id: selectedClassId, student_number: n, name: name.trim() })
    setAdding(false)
    if (err) return setError(friendly(err))
    setNumber('')
    setName('')
    await Promise.all([load(), reloadStats()])
  }

  const changed = async () => {
    await Promise.all([load(), reloadStats()])
  }

  if (classesLoading) return <Spinner />

  return (
    <>
      <PageTitle icon={<Users className="size-9 text-mint-ink" />} title="학생 관리" right={<ClassPicker />} />

      {classes.length === 0 || !selectedClass ? (
        <NoClassYet />
      ) : (
        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-lg font-bold">클래스 코드</span>
              <ClassCode code={selectedClass.class_code} />
            </div>
            <form onSubmit={add} className="grid grid-cols-[6rem_1fr] gap-3 sm:grid-cols-[6rem_1fr_auto]">
              <Input value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" placeholder="번호" aria-label="번호" className="text-center" />
              <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} placeholder="이름" aria-label="이름" />
              <Button type="submit" size="lg" loading={adding} className="col-span-2 sm:col-span-1">
                <Plus className="size-5" aria-hidden />
                학생 추가
              </Button>
            </form>
          </Card>

          <ErrorBox message={error} />

          {loading ? (
            <Spinner />
          ) : students.length === 0 ? (
            <EmptyState icon={<Users className="size-14" />} title="아직 입장한 학생이 없어요" />
          ) : (
            <div className="overflow-hidden rounded-3xl border-2 border-line bg-paper shadow-pop">
              <div className="flex items-center justify-between border-b-2 border-line px-5 py-3">
                <span className="text-lg font-bold">학생 {students.length}명</span>
              </div>
              <ul className="divide-y-2 divide-line">
                {students.map((s) => (
                  <StudentItem key={s.id} s={s} onChanged={changed} onError={setError} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function StudentItem({ s, onChanged, onError }: { s: StudentRow; onChanged: () => Promise<void>; onError: (m: string | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [number, setNumber] = useState(String(s.student_number))
  const [name, setName] = useState(s.name)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const n = Number(number)
    if (!Number.isInteger(n) || n < 1 || n > 99 || !name.trim()) return onError('번호와 이름을 확인해 주세요.')
    setBusy(true)
    const { error } = await supabase.from('students').update({ student_number: n, name: name.trim() }).eq('id', s.id)
    setBusy(false)
    if (error) return onError(friendly(error))
    onError(null)
    setEditing(false)
    await onChanged()
  }

  const remove = async () => {
    if (!window.confirm(`${s.student_number}번 ${s.name} 학생을 지울까요?\n이 학생의 질문과 투표도 함께 지워져요.`)) return
    setBusy(true)
    const { error } = await supabase.from('students').delete().eq('id', s.id)
    setBusy(false)
    if (error) return onError(toMessage(error))
    await onChanged()
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      {editing ? (
        <>
          <Input value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" aria-label="번호" className="min-h-12 w-20 text-center" />
          <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} aria-label="이름" className="min-h-12 w-auto flex-1" />
          <Button size="sm" variant="mint" onClick={save} loading={busy} aria-label="저장">
            <Check className="size-5" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setEditing(false)
              setNumber(String(s.student_number))
              setName(s.name)
            }}
            aria-label="취소"
          >
            <X className="size-5" aria-hidden />
          </Button>
        </>
      ) : (
        <>
          <span className="flex size-12 items-center justify-center rounded-2xl bg-sky-soft font-display text-2xl">{s.student_number}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-bold">{s.name}</p>
            <p className="text-sm text-ink-soft">
              질문 {s.question_count}개 · 등록 {formatDateTime(s.created_at)}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="수정">
            <Pencil className="size-5" aria-hidden />
          </Button>
          <Button size="sm" variant="ghost" onClick={remove} disabled={busy} aria-label="삭제" className="text-pink-ink">
            <Trash2 className="size-5" aria-hidden />
          </Button>
        </>
      )}
    </li>
  )
}
