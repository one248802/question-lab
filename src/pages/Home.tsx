import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Backpack, GraduationCap } from 'lucide-react'
import { QuestionBoxIcon } from '../components/Logo'
import { Spinner } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { lookupMyStudent } from '../lib/studentSession'

export default function Home() {
  const { user, isAnonymous, loading } = useAuth()
  // 학생(익명) 세션이 있을 때: 연결된 학생이 있으면 게시판으로 바로 이동
  const [studentRoute, setStudentRoute] = useState<'checking' | 'board' | 'home'>('checking')

  useEffect(() => {
    if (loading || !user || !isAnonymous) return
    let alive = true
    lookupMyStudent().then((result) => {
      if (!alive) return
      // 일시적인 오류면 게시판으로 보냄: 게시판이 다시 시도 화면을 보여 주고, 정말 입장 정보가 없을 때만 입장 화면으로 보냄
      setStudentRoute(result.status === 'not_joined' ? 'home' : 'board')
    })
    return () => {
      alive = false
    }
  }, [loading, user, isAnonymous])

  if (loading) return <Spinner />
  // 로그인한 교사는 대시보드로 (명시적으로 로그아웃해야 이 화면이 보임)
  if (user && !isAnonymous) return <Navigate to="/teacher" replace />
  if (user && isAnonymous) {
    if (studentRoute === 'checking') return <Spinner />
    if (studentRoute === 'board') return <Navigate to="/student/board" replace />
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center">
        <QuestionBoxIcon className="mb-4 size-32 sm:size-40" />
        <h1 className="mb-10 text-center font-display text-5xl leading-tight sm:text-6xl">우리반 질문 상자</h1>

        <div className="flex w-full flex-col gap-4">
          <Link
            to="/student"
            className="flex min-h-20 items-center justify-center gap-3 rounded-3xl border-2 border-[#e8c34f] bg-butter px-6 text-2xl font-extrabold shadow-pop transition hover:-translate-y-0.5 hover:shadow-pop-lg active:translate-y-0.5 active:shadow-none"
          >
            <Backpack className="size-8" aria-hidden />
            학생으로 들어가기
          </Link>
          <Link
            to="/teacher/login"
            className="flex min-h-16 items-center justify-center gap-3 rounded-3xl border-2 border-line-strong bg-paper px-6 text-xl font-bold shadow-pop-sm transition hover:-translate-y-0.5 hover:shadow-pop active:translate-y-0.5 active:shadow-none"
          >
            <GraduationCap className="size-7" aria-hidden />
            교사 로그인
          </Link>
        </div>
      </div>
    </main>
  )
}
