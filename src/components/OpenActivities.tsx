import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, LayoutGrid } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { OpenActivity } from '../lib/types'
import { Card } from './ui'

const POLL_MS = 15_000

/** 학생 게시판의 "분류 활동" 카드. 공개된 활동이 없으면 아무것도 보여 주지 않습니다. */
export function OpenActivities() {
  const [activities, setActivities] = useState<OpenActivity[]>([])

  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data, error } = await supabase.rpc('list_open_classification_activities')
      if (alive && !error) setActivities((data ?? []) as OpenActivity[])
    }
    load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  if (activities.length === 0) return null

  return (
    <Card className="bg-mint-soft/60">
      <h2 className="mb-3 flex items-center gap-2 font-display text-2xl">
        <LayoutGrid className="size-7 text-mint-ink" aria-hidden />
        분류 활동
      </h2>
      <ul className="flex flex-col gap-2">
        {activities.map((a) => (
          <li key={a.id}>
            <Link
              to={`/student/activity/${a.id}`}
              className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border-2 border-[#6fc9a4] bg-paper px-4 py-2 shadow-pop-sm transition hover:bg-mint-soft"
            >
              <span className="min-w-0">
                <span className="block text-lg font-bold break-words">{a.title}</span>
                <span className="block text-sm text-ink-soft">
                  질문 {a.question_count}개 · 영역 {a.area_count}개
                </span>
              </span>
              <ChevronRight className="size-6 shrink-0 text-mint-ink" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
