import { Link } from 'react-router-dom'
import { Backpack, GraduationCap } from 'lucide-react'
import { QuestionBoxIcon } from '../components/Logo'

export default function Home() {
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
