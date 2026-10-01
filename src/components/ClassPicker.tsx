import { Link } from 'react-router-dom'
import { School } from 'lucide-react'
import { useTeacher } from '../contexts/TeacherContext'
import { EmptyState, Select } from './ui'

/** 교사 화면 상단의 "학급 고르기" */
export function ClassPicker() {
  const { classes, selectedClassId, setSelectedClassId } = useTeacher()
  if (classes.length === 0) return null
  return (
    <div className="flex items-center gap-2">
      <School className="size-6 shrink-0 text-ink-soft" aria-hidden />
      <Select
        aria-label="학급 선택"
        value={selectedClassId ?? ''}
        onChange={(e) => setSelectedClassId(e.target.value)}
        className="min-h-12 w-auto max-w-[16rem] font-bold"
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </div>
  )
}

export function NoClassYet() {
  return (
    <EmptyState icon={<School className="size-14" />} title="먼저 학급을 만들어 주세요">
      <Link
        to="/teacher/classes"
        className="mt-2 inline-flex min-h-12 items-center rounded-2xl border-2 border-[#e8c34f] bg-butter px-5 text-lg font-bold shadow-pop-sm"
      >
        학급 만들기
      </Link>
    </EmptyState>
  )
}
