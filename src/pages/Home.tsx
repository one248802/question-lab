import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { Backpack, GraduationCap } from 'lucide-react'
import { Spinner } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { lookupMyStudent } from '../lib/studentSession'

export default function Home() {
  const { user, isAnonymous, loading } = useAuth()
  const signingOut = Boolean((useLocation().state as { signingOut?: boolean } | null)?.signingOut)
  const [studentRoute, setStudentRoute] = useState<'checking' | 'joined' | 'home'>('checking')

  useEffect(() => {
    if (loading || signingOut || !user || !isAnonymous) return
    let alive = true
    lookupMyStudent().then((result) => {
      if (!alive) return
      setStudentRoute(result.status === 'not_joined' ? 'home' : 'joined')
    })
    return () => { alive = false }
  }, [loading, signingOut, user, isAnonymous])

  if (loading && !signingOut) return <Spinner />
  if (!signingOut && user && !isAnonymous) return <Navigate to="/teacher" replace />
  if (!signingOut && user && isAnonymous) {
    if (studentRoute === 'checking') return <Spinner />
    if (studentRoute === 'joined') return <Navigate to="/student/home" replace />
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-5 flex size-32 items-center justify-center rounded-full border-2 border-[#e8c34f] bg-butter text-6xl shadow-pop sm:size-40 sm:text-7xl">🌱</div>
        <h1 className="font-display text-5xl leading-tight sm:text-6xl">생각 놀이터</h1>
        <p className="mb-10 mt-3 text-xl font-bold text-ink-soft">생각이 자라는 교실</p>

        <div className="flex w-full flex-col gap-4">
          <Link
            to="/student"
            className="flex min-h-20 items-center justify-center gap-3 rounded-3xl border-2 border-[#e8c34f] bg-butter px-6 text-2xl font-extrabold shadow-pop transition hover:-translate-y-0.5 hover:shadow-pop-lg active:translate-y-0.5 active:shadow-none"
          >
            <Backpack className="size-8" aria-hidden />학생으로 들어가기
          </Link>
          <Link
            to="/teacher/login"
            className="flex min-h-16 items-center justify-center gap-3 rounded-3xl border-2 border-line-strong bg-paper px-6 text-xl font-bold shadow-pop-sm transition hover:-translate-y-0.5 hover:shadow-pop active:translate-y-0.5 active:shadow-none"
          >
            <GraduationCap className="size-7" aria-hidden />교사 로그인
          </Link>
        </div>
      </div>
    </main>
  )
}
