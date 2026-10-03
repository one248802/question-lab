import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronRight, LayoutDashboard, MessageCircleQuestion, Plus, Users } from 'lucide-react'
import { ClassCode } from '../../components/ClassCode'
import { NoClassYet } from '../../components/ClassPicker'
import { Card, ErrorBox, PageTitle, Spinner } from '../../components/ui'
import { useTeacher } from '../../contexts/TeacherContext'

export default function Dashboard() {
  const { classes, stats, loading, error, profile, setSelectedClassId } = useTeacher()

  if (loading) return <Spinner />

  const total = Object.values(stats).reduce(
    (acc, s) => ({
      students: acc.students + s.student_count,
      questions: acc.questions + s.question_count,
      today: acc.today + s.today_question_count,
    }),
    { students: 0, questions: 0, today: 0 },
  )

  return (
    <>
      <PageTitle icon={<LayoutDashboard className="size-9 text-butter-ink" />} title="대시보드" />
      {profile?.display_name && <p className="-mt-4 mb-6 text-lg text-ink-soft">{profile.display_name} 선생님, 안녕하세요!</p>}
      <ErrorBox message={error} />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* 학생 관리 화면은 학급별이므로 지금 선택된 학급으로 열림 (화면 위에서 학급을 바꿀 수 있음) */}
        <Stat icon={<Users className="size-7" />} label="전체 학생" value={total.students} color="bg-sky-soft" to="/teacher/students" linkLabel="명단 보기" />
        <Stat icon={<MessageCircleQuestion className="size-7" />} label="전체 질문" value={total.questions} color="bg-lilac-soft" />
        <Stat icon={<CalendarDays className="size-7" />} label="오늘 질문" value={total.today} color="bg-mint-soft" />
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl sm:text-3xl">학급 목록</h2>
        <Link
          to="/teacher/classes"
          className="inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 border-[#e8c34f] bg-butter px-4 text-lg font-bold shadow-pop-sm"
        >
          <Plus className="size-5" aria-hidden />
          학급 만들기
        </Link>
      </div>

      {classes.length === 0 ? (
        <NoClassYet />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classes.map((c) => {
            const s = stats[c.id]
            return (
              <Card key={c.id} className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-2xl">{c.name}</p>
                    {c.grade && <p className="text-ink-soft">{c.grade}학년</p>}
                  </div>
                  <ClassCode code={c.class_code} />
                </div>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <MiniStat
                    label="학생"
                    value={s?.student_count ?? 0}
                    to="/teacher/students"
                    onClick={() => setSelectedClassId(c.id)}
                    ariaLabel={`${c.name} 학생 ${s?.student_count ?? 0}명, 명단 보기`}
                  />
                  <MiniStat label="질문" value={s?.question_count ?? 0} />
                  <MiniStat label="오늘" value={s?.today_question_count ?? 0} highlight />
                </dl>
                <Link
                  to="/teacher/questions"
                  onClick={() => setSelectedClassId(c.id)}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-line-strong bg-paper text-lg font-bold shadow-pop-sm hover:-translate-y-0.5"
                >
                  <MessageCircleQuestion className="size-5" aria-hidden />
                  질문 보기
                </Link>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

function Stat({ icon, label, value, color, to, linkLabel }: { icon: ReactNode; label: string; value: number; color: string; to?: string; linkLabel?: string }) {
  const body = (
    <>
      <div className="flex size-14 items-center justify-center rounded-2xl bg-paper">{icon}</div>
      <div>
        <p className="text-lg text-ink-soft">{label}</p>
        <p className="font-display text-4xl">{value}</p>
      </div>
      {to && (
        <span className="ml-auto inline-flex items-center gap-0.5 self-end text-base font-bold text-ink-soft">
          {linkLabel}
          <ChevronRight className="size-5" aria-hidden />
        </span>
      )}
    </>
  )
  const className = `flex items-center gap-4 rounded-3xl border-2 border-line p-5 shadow-pop ${color}`
  if (!to) return <div className={className}>{body}</div>
  return (
    <Link to={to} className={`${className} transition hover:-translate-y-0.5 hover:shadow-pop-lg`}>
      {body}
    </Link>
  )
}

function MiniStat({
  label,
  value,
  highlight,
  to,
  onClick,
  ariaLabel,
}: {
  label: string
  value: number
  highlight?: boolean
  to?: string
  onClick?: () => void
  ariaLabel?: string
}) {
  const color = highlight ? 'bg-mint-soft' : 'bg-cream'
  if (!to)
    return (
      <div className={`rounded-2xl py-2 ${color}`}>
        <dt className="text-sm text-ink-soft">{label}</dt>
        <dd className="font-display text-3xl">{value}</dd>
      </div>
    )
  // 누르면 이 학급이 선택된 학생 관리 화면으로 (링크가 칸 전체를 덮도록 after 사용)
  return (
    <div className={`relative rounded-2xl border-2 border-transparent py-1.5 transition hover:border-line-strong hover:bg-paper ${color}`}>
      <dt className="inline-flex items-center gap-0.5 text-sm text-ink-soft">
        {label}
        <ChevronRight className="size-4" aria-hidden />
      </dt>
      <dd className="font-display text-3xl">
        <Link
          to={to}
          onClick={onClick}
          aria-label={ariaLabel}
          className="underline decoration-line-strong decoration-2 underline-offset-4 after:absolute after:inset-0 after:rounded-2xl"
        >
          {value}
        </Link>
      </dd>
    </div>
  )
}
