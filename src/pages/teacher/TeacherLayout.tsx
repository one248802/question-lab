import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, LayoutGrid, LogOut, Menu, MessageCircleQuestion, School, Settings, Users, X } from 'lucide-react'
import { QuestionBoxIcon } from '../../components/Logo'
import { Spinner, cx } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { TeacherProvider, useTeacher } from '../../contexts/TeacherContext'
import { supabase } from '../../lib/supabase'

const MENU = [
  { to: '/teacher', label: '대시보드', icon: LayoutDashboard, end: true },
  { to: '/teacher/classes', label: '학급 관리', icon: School },
  { to: '/teacher/questions', label: '우리반 질문 상자', icon: MessageCircleQuestion },
  { to: '/teacher/activities', label: '질문 분류 활동', icon: LayoutGrid },
  { to: '/teacher/students', label: '학생 관리', icon: Users },
  { to: '/teacher/settings', label: '설정', icon: Settings },
]

export default function TeacherLayout() {
  const { user, isAnonymous, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user || isAnonymous) return <Navigate to="/teacher/login" replace />
  return (
    <TeacherProvider userId={user.id}>
      <Shell />
    </TeacherProvider>
  )
}

function Shell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useTeacher()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)

  useEffect(() => setOpen(false), [location.pathname])

  const logout = async () => {
    // 첫 화면으로 먼저 옮긴 뒤 세션을 끝냄 (첫 화면의 자동 재진입이 끼어들지 않도록 signingOut 표시)
    navigate('/', { replace: true, state: { signingOut: true } })
    await supabase.auth.signOut()
  }

  const nav = (
    <nav className="flex flex-col gap-2">
      {MENU.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cx(
              'flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 text-lg font-bold transition',
              isActive ? 'border-[#e8c34f] bg-butter shadow-pop-sm' : 'border-transparent text-ink-soft hover:bg-ink/5 hover:text-ink',
            )
          }
        >
          <Icon className="size-6 shrink-0" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  )

  const footer = (
    <div className="mt-auto flex flex-col gap-2 border-t-2 border-line pt-4">
      <p className="truncate px-2 text-sm text-ink-soft">{profile?.display_name || user?.email}</p>
      <button
        type="button"
        onClick={logout}
        className="flex min-h-12 items-center gap-3 rounded-2xl px-4 text-lg font-bold text-ink-soft hover:bg-ink/5 hover:text-ink"
      >
        <LogOut className="size-6" aria-hidden />
        로그아웃
      </button>
    </div>
  )

  const brand = (
    <div className="mb-6 flex items-center gap-2 px-2">
      <QuestionBoxIcon className="size-11 shrink-0" />
      <span className="font-display text-xl leading-tight">우리반 질문 상자</span>
    </div>
  )

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[17rem_1fr]">
      {/* PC/태블릿: 왼쪽 메뉴 */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r-2 border-line bg-paper/70 p-4 md:flex">
        {brand}
        {nav}
        {footer}
      </aside>

      {/* 모바일: 위쪽 막대 + 펼침 메뉴 */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b-2 border-line bg-cream/90 px-4 py-2 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <QuestionBoxIcon className="size-9" />
          <span className="font-display text-xl">우리반 질문 상자</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="메뉴 열기"
          className="flex size-12 items-center justify-center rounded-2xl border-2 border-line-strong bg-paper"
        >
          <Menu className="size-7" aria-hidden />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-30 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-cream p-4 shadow-pop-lg">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="메뉴 닫기"
                className="flex size-12 items-center justify-center rounded-2xl hover:bg-ink/5"
              >
                <X className="size-7" aria-hidden />
              </button>
            </div>
            {brand}
            {nav}
            {footer}
          </div>
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
