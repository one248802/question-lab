import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Inbox, MessageSquareText, Settings, Star, Trash2 } from 'lucide-react'
import { Badge, Button, EmptyState, ErrorBox, Spinner, Textarea, cx } from '../../components/ui'
import { formatDateTime } from '../../lib/date'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { Student, ThoughtAuthorMode } from '../../lib/types'

type StudentQuestion = {
  id: string
  class_id: string
  student_id: string
  content: string
  is_hidden: boolean
  created_at: string
  parent_question_id: string | null
  superseded_at: string | null
}

type Feedback = { liked: boolean; comment: string | null }
type FeedbackSettings = {
  teacher_like_enabled: boolean
  teacher_comment_enabled: boolean
  thought_sharing_enabled: boolean
  thought_author_mode: ThoughtAuthorMode
}

type TeacherThought = {
  id: string
  question_id: string
  student_id: string
  content: string
  is_hidden: boolean
  created_at: string
  student_number: number | null
  student_name: string | null
}

export default function StudentQuestionsPage() {
  const { studentId = '' } = useParams()
  const [student, setStudent] = useState<Student | null>(null)
  const [questions, setQuestions] = useState<StudentQuestion[]>([])
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [thoughts, setThoughts] = useState<Record<string, TeacherThought[]>>({})
  const [settings, setSettings] = useState<FeedbackSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const studentResult = await supabase
      .from('students')
      .select('id, class_id, student_number, name, created_at')
      .eq('id', studentId)
      .maybeSingle()

    if (studentResult.error) {
      setError(toMessage(studentResult.error))
      setLoading(false)
      return
    }
    if (!studentResult.data) {
      setError('학생을 찾을 수 없어요.')
      setStudent(null)
      setQuestions([])
      setFeedback({})
      setThoughts({})
      setSettings(null)
      setLoading(false)
      return
    }

    const s = studentResult.data as Student
    const [classResult, questionResult, classmatesResult] = await Promise.all([
      supabase
        .from('classes')
        .select('teacher_like_enabled, teacher_comment_enabled, thought_sharing_enabled, thought_author_mode')
        .eq('id', s.class_id)
        .single(),
      supabase
        .from('questions')
        .select('id, class_id, student_id, content, is_hidden, created_at, parent_question_id, superseded_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false }),
      supabase.from('students').select('id, student_number, name').eq('class_id', s.class_id),
    ])

    if (classResult.error || questionResult.error || classmatesResult.error) {
      setError(toMessage(classResult.error ?? questionResult.error ?? classmatesResult.error))
      setStudent(s)
      setLoading(false)
      return
    }

    const list = (questionResult.data ?? []) as StudentQuestion[]
    setStudent(s)
    setSettings(classResult.data as FeedbackSettings)
    setQuestions(list)

    if (list.length === 0) {
      setFeedback({})
      setDrafts({})
      setThoughts({})
      setError(null)
      setLoading(false)
      return
    }

    const ids = list.map((q) => q.id)
    const [feedbackResult, thoughtResult] = await Promise.all([
      supabase.from('teacher_question_feedback').select('question_id, liked, comment').in('question_id', ids),
      supabase.from('question_thoughts').select('id, question_id, student_id, content, is_hidden, created_at').in('question_id', ids).order('created_at'),
    ])

    if (feedbackResult.error || thoughtResult.error) {
      setError(toMessage(feedbackResult.error ?? thoughtResult.error))
    } else {
      const next: Record<string, Feedback> = {}
      const nextDrafts: Record<string, string> = {}
      for (const row of feedbackResult.data ?? []) {
        next[row.question_id as string] = { liked: Boolean(row.liked), comment: (row.comment as string | null) ?? null }
        nextDrafts[row.question_id as string] = (row.comment as string | null) ?? ''
      }
      setFeedback(next)
      setDrafts(nextDrafts)

      const studentById = new Map((classmatesResult.data ?? []).map((row) => [row.id as string, row]))
      const nextThoughts: Record<string, TeacherThought[]> = {}
      for (const row of thoughtResult.data ?? []) {
        const qid = row.question_id as string
        const writer = studentById.get(row.student_id as string)
        const item: TeacherThought = {
          id: row.id as string,
          question_id: qid,
          student_id: row.student_id as string,
          content: row.content as string,
          is_hidden: Boolean(row.is_hidden),
          created_at: row.created_at as string,
          student_number: writer?.student_number ?? null,
          student_name: writer?.name ?? null,
        }
        nextThoughts[qid] = [...(nextThoughts[qid] ?? []), item]
      }
      setThoughts(nextThoughts)
      setError(null)
    }
    setLoading(false)
  }, [studentId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 2200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const saveFeedback = async (questionId: string, liked: boolean, comment: string | null, successMessage: string) => {
    if (pending.has(questionId)) return false
    setPending((current) => new Set(current).add(questionId))
    setError(null)
    const { data, error: err } = await supabase.rpc('set_teacher_question_feedback', {
      p_question_id: questionId,
      p_liked: liked,
      p_comment: comment,
    })
    setPending((current) => {
      const next = new Set(current)
      next.delete(questionId)
      return next
    })
    if (err) {
      setError(toMessage(err))
      return false
    }
    const saved = data as { liked?: boolean; comment?: string | null } | null
    setFeedback((current) => ({ ...current, [questionId]: { liked: Boolean(saved?.liked), comment: saved?.comment ?? null } }))
    setDrafts((current) => ({ ...current, [questionId]: saved?.comment ?? '' }))
    setNotice(successMessage)
    return true
  }

  const toggleLike = async (questionId: string) => {
    if (!settings?.teacher_like_enabled) return
    const current = feedback[questionId] ?? { liked: false, comment: null }
    await saveFeedback(questionId, !current.liked, current.comment, current.liked ? '좋아요를 취소했어요.' : '좋아요를 표시했어요.')
  }

  const saveComment = async (questionId: string) => {
    if (!settings?.teacher_comment_enabled) return
    const text = (drafts[questionId] ?? '').trim()
    if (text.length > 500) return setError('코멘트는 500자까지 쓸 수 있어요.')
    const current = feedback[questionId] ?? { liked: false, comment: null }
    await saveFeedback(questionId, current.liked, text || null, text ? '코멘트를 저장했어요.' : '코멘트를 지웠어요.')
  }

  const toggleThoughtHidden = async (thought: TeacherThought) => {
    const { error: err } = await supabase.from('question_thoughts').update({ is_hidden: !thought.is_hidden }).eq('id', thought.id)
    if (err) return setError(toMessage(err))
    setNotice(thought.is_hidden ? '생각을 다시 보이게 했어요.' : '학생 화면에서 생각을 숨겼어요.')
    await load()
  }

  const deleteThought = async (thought: TeacherThought) => {
    if (!window.confirm(`${thought.student_number ?? ''}번 ${thought.student_name ?? '학생'}의 생각을 삭제할까요?`)) return
    const { error: err } = await supabase.from('question_thoughts').delete().eq('id', thought.id)
    if (err) return setError(toMessage(err))
    setNotice('생각을 삭제했어요.')
    await load()
  }

  if (loading) return <Spinner />
  const anyFeedbackEnabled = Boolean(settings?.teacher_like_enabled || settings?.teacher_comment_enabled)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/teacher/students" className="mb-2 inline-flex items-center gap-1 text-base font-bold text-ink-soft hover:text-ink">
            <ArrowLeft className="size-5" aria-hidden />학생 관리로 돌아가기
          </Link>
          <h1 className="font-display text-3xl sm:text-4xl">{student ? `${student.student_number}번 ${student.name}의 질문` : '학생 질문'}</h1>
          {student && <p className="mt-1 text-base text-ink-soft">질문 성장 이력, 교사 피드백, 질문에 달린 학생 생각을 함께 볼 수 있어요.</p>}
        </div>
        {student && (
          <Link to="/teacher/settings" className="inline-flex min-h-11 items-center gap-2 rounded-2xl border-2 border-line bg-paper px-3 font-bold text-ink-soft hover:border-line-strong">
            <Settings className="size-5" aria-hidden />피드백·생각 설정
          </Link>
        )}
      </div>

      <ErrorBox message={error} />
      {notice && <p role="status" className="rounded-2xl border-2 border-[#6fc9a4] bg-mint-soft px-4 py-3 font-bold text-mint-ink">{notice}</p>}

      {student && settings && !anyFeedbackEnabled && (
        <div className="rounded-2xl border-2 border-dashed border-line-strong bg-paper px-4 py-3 text-ink-soft">
          이 학급은 선생님 좋아요와 코멘트가 모두 꺼져 있어요. <Link to="/teacher/settings" className="font-bold underline">설정에서 필요한 기능만 켤 수 있어요.</Link>
        </div>
      )}

      {!student ? (
        <EmptyState icon={<Inbox className="size-14" />} title="학생을 찾을 수 없어요" />
      ) : questions.length === 0 ? (
        <EmptyState icon={<Inbox className="size-14" />} title="아직 이 학생이 만든 질문이 없어요" />
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {questions.map((q) => {
            const current = feedback[q.id] ?? { liked: false, comment: null }
            const draft = drafts[q.id] ?? current.comment ?? ''
            const isOld = q.superseded_at !== null
            const busy = pending.has(q.id)
            const questionThoughts = thoughts[q.id] ?? []
            return (
              <li key={q.id} className={cx('flex min-w-0 flex-col gap-4 rounded-3xl border-2 bg-paper p-5 shadow-pop', settings?.teacher_like_enabled && current.liked ? 'border-butter bg-butter-soft/30' : 'border-line')}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    {q.is_hidden && <Badge className="bg-pink-soft text-pink-ink">숨김</Badge>}
                    <Badge className={isOld ? 'bg-line text-ink-soft' : 'bg-mint-soft text-mint-ink'}>{isOld ? '이전 버전' : '현재 질문'}</Badge>
                    {q.parent_question_id && <Badge className="bg-lilac-soft text-lilac-ink">업그레이드</Badge>}
                    {settings?.teacher_like_enabled && current.liked && <Badge className="bg-butter-soft text-butter-ink">선생님이 좋아한 질문</Badge>}
                  </div>
                  {settings?.teacher_like_enabled && (
                    <Button variant={current.liked ? 'primary' : 'secondary'} size="sm" onClick={() => toggleLike(q.id)} loading={busy} disabled={q.is_hidden} className="shrink-0">
                      {!busy && <Star className={cx('size-5', current.liked && 'fill-current')} aria-hidden />}{current.liked ? '좋아요 취소' : '좋아요'}
                    </Button>
                  )}
                </div>

                <p className="text-xl leading-relaxed font-medium break-words whitespace-pre-wrap">{q.content}</p>
                <p className="text-sm text-ink-soft">{formatDateTime(q.created_at)}</p>

                {settings?.teacher_comment_enabled && (
                  <div className="flex flex-col gap-2 border-t-2 border-line pt-3">
                    <label htmlFor={`comment-${q.id}`} className="flex items-center gap-2 font-bold"><MessageSquareText className="size-5 text-lilac-ink" aria-hidden />선생님 코멘트</label>
                    <Textarea id={`comment-${q.id}`} value={draft} onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value.slice(0, 500) }))} maxLength={500} disabled={q.is_hidden || busy} className="min-h-24 text-base" />
                    <div className="flex items-center justify-between gap-2"><span className="text-xs text-ink-soft">{draft.length}/500</span><Button variant="secondary" size="sm" onClick={() => saveComment(q.id)} loading={busy} disabled={q.is_hidden || draft.trim() === (current.comment ?? '')}>코멘트 저장</Button></div>
                  </div>
                )}

                <div className="border-t-2 border-line pt-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-bold"><MessageSquareText className="size-5 text-lilac-ink" aria-hidden />학생 생각 {questionThoughts.length}</p>
                    {settings && <span className="text-xs text-ink-soft">학생끼리는 {settings.thought_author_mode === 'named' ? '실명' : '익명'} 표시</span>}
                  </div>
                  {questionThoughts.length === 0 ? <p className="text-sm text-ink-soft">아직 이 질문에 남긴 생각이 없어요.</p> : (
                    <ul className="flex flex-col gap-2">
                      {questionThoughts.map((thought) => (
                        <li key={thought.id} className={cx('rounded-2xl border-2 px-3 py-3', thought.is_hidden ? 'border-pink bg-pink-soft/30' : 'border-line bg-cream')}>
                          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                            <strong>{thought.student_number ?? '?'}번 {thought.student_name ?? '학생'}</strong>
                            {thought.is_hidden && <Badge className="bg-pink-soft text-pink-ink">숨김</Badge>}
                          </div>
                          <p className="whitespace-pre-wrap break-words">{thought.content}</p>
                          <div className="mt-2 flex gap-2">
                            <Button variant="secondary" size="sm" onClick={() => toggleThoughtHidden(thought)}>{thought.is_hidden ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}{thought.is_hidden ? '다시 보이기' : '숨기기'}</Button>
                            <Button variant="danger" size="sm" onClick={() => deleteThought(thought)}><Trash2 className="size-4" aria-hidden />삭제</Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
