import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, MessageSquareText, Search, Star, ThumbsUp, TrendingUp } from 'lucide-react'
import { ClassPicker, NoClassYet } from '../../components/ClassPicker'
import { Badge, Card, ChoiceChips, EmptyState, ErrorBox, Input, PageTitle, Select, Spinner } from '../../components/ui'
import { useTeacher } from '../../contexts/TeacherContext'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { Student } from '../../lib/types'

type Period = 'all' | 'today' | 'month' | 'range'

type QuestionRow = {
  id: string
  student_id: string
  content: string
  created_at: string
  parent_question_id: string | null
}

type VoteRow = { question_id: string; student_id: string; created_at: string }
type ThoughtRow = { question_id: string; student_id: string; created_at: string; updated_at: string }
type FeedbackRow = { question_id: string; liked: boolean; comment: string | null; created_at: string; updated_at: string }

type DashboardRow = {
  student: Student
  registered: number
  upgraded: number
  thoughts: number
  friendVotes: number
  teacherStars: number
  teacherFeedback: number
  recentAt: string | null
  recentLabel: string | null
}

function isoDateLocal(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatRecent(value: string | null) {
  if (!value) return '활동 없음'
  const d = new Date(value)
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(d)
}

export default function QuestionDashboardPage() {
  const { classes, selectedClass, loading: teacherLoading } = useTeacher()
  const [students, setStudents] = useState<Student[]>([])
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [votes, setVotes] = useState<VoteRow[]>([])
  const [thoughts, setThoughts] = useState<ThoughtRow[]>([])
  const [feedback, setFeedback] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('all')
  const [fromDate, setFromDate] = useState(isoDateLocal(new Date()))
  const [toDate, setToDate] = useState(isoDateLocal(new Date()))
  const [questionId, setQuestionId] = useState('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    if (!selectedClass) {
      setStudents([])
      setQuestions([])
      setVotes([])
      setThoughts([])
      setFeedback([])
      return
    }
    setLoading(true)
    setError(null)

    const [studentResult, questionResult] = await Promise.all([
      supabase.from('students').select('id, class_id, student_number, name, created_at').eq('class_id', selectedClass.id).order('student_number'),
      supabase.from('questions').select('id, student_id, content, created_at, parent_question_id').eq('class_id', selectedClass.id).order('created_at', { ascending: false }),
    ])

    if (studentResult.error || questionResult.error) {
      setError(toMessage(studentResult.error ?? questionResult.error))
      setLoading(false)
      return
    }

    const studentList = (studentResult.data ?? []) as Student[]
    const questionList = (questionResult.data ?? []) as QuestionRow[]
    setStudents(studentList)
    setQuestions(questionList)

    if (questionList.length === 0) {
      setVotes([])
      setThoughts([])
      setFeedback([])
      setLoading(false)
      return
    }

    const ids = questionList.map((q) => q.id)
    const [voteResult, thoughtResult, feedbackResult] = await Promise.all([
      supabase.from('votes').select('question_id, student_id, created_at').in('question_id', ids),
      supabase.from('question_thoughts').select('question_id, student_id, created_at, updated_at').in('question_id', ids),
      supabase.from('teacher_question_feedback').select('question_id, liked, comment, created_at, updated_at').in('question_id', ids),
    ])

    if (voteResult.error || thoughtResult.error || feedbackResult.error) {
      setError(toMessage(voteResult.error ?? thoughtResult.error ?? feedbackResult.error))
    } else {
      setVotes((voteResult.data ?? []) as VoteRow[])
      setThoughts((thoughtResult.data ?? []) as ThoughtRow[])
      setFeedback((feedbackResult.data ?? []) as FeedbackRow[])
    }
    setLoading(false)
  }, [selectedClass])

  useEffect(() => { load() }, [load])
  useEffect(() => { setQuestionId('all') }, [selectedClass?.id])

  const inPeriod = useCallback((value: string) => {
    if (period === 'all') return true
    const d = new Date(value)
    const now = new Date()
    if (period === 'today') {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    }
    if (period === 'month') {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    }
    const start = new Date(`${fromDate}T00:00:00`)
    const end = new Date(`${toDate}T23:59:59.999`)
    return d >= start && d <= end
  }, [period, fromDate, toDate])

  const dashboardRows = useMemo<DashboardRow[]>(() => {
    const questionById = new Map(questions.map((q) => [q.id, q]))
    const selectedQuestion = (id: string) => questionId === 'all' || id === questionId
    const recent = new Map<string, { at: string; label: string }>()
    const bump = (studentId: string, at: string, label: string) => {
      if (!inPeriod(at)) return
      const prev = recent.get(studentId)
      if (!prev || new Date(at) > new Date(prev.at)) recent.set(studentId, { at, label })
    }

    for (const q of questions) if (selectedQuestion(q.id) && inPeriod(q.created_at)) bump(q.student_id, q.created_at, q.parent_question_id ? '질문 발전' : '질문 등록')
    for (const t of thoughts) if (selectedQuestion(t.question_id)) bump(t.student_id, t.updated_at || t.created_at, '생각 나눔 등록')
    for (const v of votes) {
      const q = questionById.get(v.question_id)
      if (q && selectedQuestion(v.question_id) && q.student_id !== v.student_id) bump(q.student_id, v.created_at, '친구에게 표 받음')
    }
    for (const f of feedback) {
      const q = questionById.get(f.question_id)
      if (!q || !selectedQuestion(f.question_id)) continue
      if (f.liked) bump(q.student_id, f.updated_at || f.created_at, '선생님 별 받음')
      if (f.comment) bump(q.student_id, f.updated_at || f.created_at, '선생님 피드백 받음')
    }

    return students.map((student) => {
      const ownQuestions = questions.filter((q) => q.student_id === student.id && selectedQuestion(q.id))
      const ownIds = new Set(ownQuestions.map((q) => q.id))
      const registered = ownQuestions.filter((q) => q.parent_question_id === null && inPeriod(q.created_at)).length
      const upgraded = ownQuestions.filter((q) => q.parent_question_id !== null && inPeriod(q.created_at)).length
      const thoughtCount = thoughts.filter((t) => t.student_id === student.id && selectedQuestion(t.question_id) && inPeriod(t.created_at)).length
      const friendVotes = votes.filter((v) => ownIds.has(v.question_id) && v.student_id !== student.id && inPeriod(v.created_at)).length
      const teacherStars = feedback.filter((f) => ownIds.has(f.question_id) && f.liked && inPeriod(f.updated_at || f.created_at)).length
      const teacherFeedback = feedback.filter((f) => ownIds.has(f.question_id) && Boolean(f.comment) && inPeriod(f.updated_at || f.created_at)).length
      const last = recent.get(student.id)
      return {
        student,
        registered,
        upgraded,
        thoughts: thoughtCount,
        friendVotes,
        teacherStars,
        teacherFeedback,
        recentAt: last?.at ?? null,
        recentLabel: last?.label ?? null,
      }
    })
  }, [students, questions, votes, thoughts, feedback, questionId, inPeriod])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return dashboardRows
    return dashboardRows.filter((row) => row.student.name.toLowerCase().includes(q) || String(row.student.student_number).includes(q))
  }, [dashboardRows, search])

  const totals = useMemo(() => dashboardRows.reduce((acc, row) => ({
    registered: acc.registered + row.registered,
    upgraded: acc.upgraded + row.upgraded,
    thoughts: acc.thoughts + row.thoughts,
    friendVotes: acc.friendVotes + row.friendVotes,
    teacherStars: acc.teacherStars + row.teacherStars,
    teacherFeedback: acc.teacherFeedback + row.teacherFeedback,
  }), { registered: 0, upgraded: 0, thoughts: 0, friendVotes: 0, teacherStars: 0, teacherFeedback: 0 }), [dashboardRows])

  if (teacherLoading) return <Spinner />
  if (classes.length === 0) return <NoClassYet />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon={<BarChart3 className="size-9 text-sky-ink" />} title="질문 활동 대시보드" />
          <p className="-mt-4 text-ink-soft">학생별 질문 만들기·발전·생각 나눔과 받은 반응을 한눈에 봐요.</p>
        </div>
        <ClassPicker />
      </div>

      <ErrorBox message={error} />

      <Card className="flex flex-col gap-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="mb-2 font-bold">기간</p>
            <ChoiceChips<Period>
              size="sm"
              options={[
                { value: 'all', label: '전체' },
                { value: 'today', label: '오늘' },
                { value: 'month', label: '이번 달' },
                { value: 'range', label: '기간 선택' },
              ]}
              value={period}
              onChange={setPeriod}
            />
          </div>
          {period === 'range' && (
            <div className="flex flex-wrap items-center gap-2">
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="!w-40" aria-label="시작일" />
              <span className="font-bold text-ink-soft">~</span>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="!w-40" aria-label="종료일" />
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-2 font-bold">질문 선택</p>
            <Select value={questionId} onChange={(e) => setQuestionId(e.target.value)}>
              <option value="all">전체 질문</option>
              {questions.map((q) => <option key={q.id} value={q.id}>{q.content.length > 55 ? `${q.content.slice(0, 55)}…` : q.content}</option>)}
            </Select>
          </div>
          <div>
            <p className="mb-2 font-bold">학생 찾기</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-soft" aria-hidden />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름 또는 번호 검색" className="pl-11" />
            </div>
          </div>
        </div>
      </Card>

      {loading ? <Spinner /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MiniStat label="등록한 질문" value={totals.registered} icon={<MessageSquareText className="size-6" />} />
            <MiniStat label="발전시킨 질문" value={totals.upgraded} icon={<TrendingUp className="size-6" />} />
            <MiniStat label="생각 나눔 댓글" value={totals.thoughts} icon={<MessageSquareText className="size-6" />} />
            <MiniStat label="친구에게 받은 표" value={totals.friendVotes} icon={<ThumbsUp className="size-6" />} />
            <MiniStat label="선생님 별" value={totals.teacherStars} icon={<Star className="size-6" />} />
            <MiniStat label="선생님 피드백" value={totals.teacherFeedback} icon={<MessageSquareText className="size-6" />} />
          </div>

          {filteredRows.length === 0 ? (
            <EmptyState icon={<BarChart3 className="size-14" />} title="조건에 맞는 학생 활동이 없어요" />
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[72rem] border-collapse text-left">
                <thead className="bg-butter-soft/60">
                  <tr className="border-b-2 border-line">
                    <Th>학생</Th><Th>등록 질문</Th><Th>질문 발전</Th><Th>생각 나눔</Th><Th>친구 표</Th><Th>⭐ 선생님 별</Th><Th>💬 피드백</Th><Th>최근 활동</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.student.id} className="border-b-2 border-line/70 last:border-b-0">
                      <td className="px-4 py-4"><span className="font-bold">{row.student.student_number}번 {row.student.name}</span></td>
                      <Td value={row.registered} /><Td value={row.upgraded} /><Td value={row.thoughts} /><Td value={row.friendVotes} /><Td value={row.teacherStars} /><Td value={row.teacherFeedback} />
                      <td className="px-4 py-4">
                        {row.recentAt ? <div><Badge>{row.recentLabel}</Badge><p className="mt-1 text-sm text-ink-soft">{formatRecent(row.recentAt)}</p></div> : <span className="text-ink-soft">활동 없음</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function MiniStat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="flex items-center gap-3 rounded-3xl border-2 border-line bg-paper p-4 shadow-pop"><div className="flex size-11 items-center justify-center rounded-2xl bg-cream">{icon}</div><div><p className="text-sm text-ink-soft">{label}</p><p className="font-display text-3xl">{value}</p></div></div>
}

function Th({ children }: { children: React.ReactNode }) { return <th className="whitespace-nowrap px-4 py-3 font-bold">{children}</th> }
function Td({ value }: { value: number }) { return <td className="px-4 py-4 text-center text-lg font-bold">{value}</td> }
