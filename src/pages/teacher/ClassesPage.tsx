import { useState, type FormEvent } from 'react'
import { Pencil, Plus, School, Shuffle, Trash2 } from 'lucide-react'
import { ClassCode } from '../../components/ClassCode'
import { Button, Card, ErrorBox, Input, Label, PageTitle, Select, Spinner } from '../../components/ui'
import { useTeacher } from '../../contexts/TeacherContext'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { ClassRoom } from '../../lib/types'

const GRADES = [1, 2, 3, 4, 5, 6]

export default function ClassesPage() {
  const { classes, stats, loading, reload, setSelectedClassId } = useTeacher()
  const [name, setName] = useState('')
  const [grade, setGrade] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<ClassRoom | null>(null)

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('학급 이름을 넣어 주세요.')
    setCreating(true)
    const { data, error: err } = await supabase
      .from('classes')
      .insert({ name: name.trim(), grade: grade ? Number(grade) : null })
      .select()
      .single()
    setCreating(false)
    if (err) return setError(toMessage(err))
    setName('')
    setGrade('')
    setCreated(data as ClassRoom)
    setSelectedClassId((data as ClassRoom).id)
    await reload()
  }

  return (
    <>
      <PageTitle icon={<School className="size-9 text-sky-ink" />} title="학급 관리" />

      <Card className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 font-display text-2xl">
          <Plus className="size-7" aria-hidden />새 학급 만들기
        </h2>
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <div>
            <Label htmlFor="class-name">학급 이름</Label>
            <Input id="class-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="5학년 1반" maxLength={40} />
          </div>
          <div>
            <Label htmlFor="class-grade">학년 (선택)</Label>
            <Select id="class-grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">선택 안 함</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}학년
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" size="lg" loading={creating}>
            만들기
          </Button>
        </form>
        <div className="mt-4">
          <ErrorBox message={error} />
        </div>
        {created && (
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl bg-mint-soft p-4">
            <p className="text-lg font-bold text-mint-ink">「{created.name}」 클래스 코드</p>
            <ClassCode code={created.class_code} size="lg" />
          </div>
        )}
      </Card>

      {loading ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-4">
          {classes.map((c) => (
            <ClassRow key={c.id} item={c} studentCount={stats[c.id]?.student_count ?? 0} questionCount={stats[c.id]?.question_count ?? 0} onChanged={reload} />
          ))}
        </div>
      )}
    </>
  )
}

function ClassRow({
  item,
  studentCount,
  questionCount,
  onChanged,
}: {
  item: ClassRoom
  studentCount: number
  questionCount: number
  onChanged: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const [grade, setGrade] = useState(item.grade ? String(item.grade) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => PromiseLike<{ error: unknown }>) => {
    setBusy(true)
    setError(null)
    const { error: err } = await fn()
    setBusy(false)
    if (err) {
      setError(toMessage(err))
      return false
    }
    await onChanged()
    return true
  }

  const save = async () => {
    if (!name.trim()) return setError('학급 이름을 넣어 주세요.')
    const ok = await run(() =>
      supabase
        .from('classes')
        .update({ name: name.trim(), grade: grade ? Number(grade) : null })
        .eq('id', item.id),
    )
    if (ok) setEditing(false)
  }

  const regenerate = () => {
    if (!window.confirm('클래스 코드를 새로 만들까요?\n이전 코드로는 더 이상 입장할 수 없어요.')) return
    run(() => supabase.rpc('regenerate_class_code', { p_class_id: item.id }))
  }

  const remove = () => {
    if (!window.confirm(`「${item.name}」 학급을 지울까요?\n학생과 질문도 모두 지워지고 되돌릴 수 없어요.`)) return
    run(() => supabase.from('classes').delete().eq('id', item.id))
  }

  return (
    <Card className="flex flex-col gap-4">
      {editing ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="학급 이름" />
          <Select value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="학년">
            <option value="">선택 안 함</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}학년
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-2xl">{item.name}</p>
            <p className="text-ink-soft">
              {item.grade ? `${item.grade}학년 · ` : ''}학생 {studentCount}명 · 질문 {questionCount}개
            </p>
          </div>
          <ClassCode code={item.class_code} size="lg" />
        </div>
      )}

      <ErrorBox message={error} />

      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button size="sm" variant="mint" onClick={save} loading={busy}>
              저장
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditing(false)
                setName(item.name)
                setGrade(item.grade ? String(item.grade) : '')
              }}
            >
              취소
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden />
              이름 바꾸기
            </Button>
            <Button size="sm" variant="secondary" onClick={regenerate} disabled={busy}>
              <Shuffle className="size-4" aria-hidden />
              코드 새로 만들기
            </Button>
            <Button size="sm" variant="danger" onClick={remove} disabled={busy} className="sm:ml-auto">
              <Trash2 className="size-4" aria-hidden />
              학급 지우기
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}
