import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { startOfTodayISO } from '../lib/date'
import { toMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import type { ClassRoom, ClassStats, Profile } from '../lib/types'

const SELECTED_KEY = 'qbox:selected-class'

interface TeacherState {
  profile: Profile | null
  classes: ClassRoom[]
  stats: Record<string, ClassStats>
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  reloadProfile: () => Promise<void>
  /** 질문/학생/설정 화면에서 함께 쓰는 "지금 보고 있는 학급" */
  selectedClassId: string | null
  setSelectedClassId: (id: string) => void
  selectedClass: ClassRoom | null
}

const TeacherContext = createContext<TeacherState | null>(null)

function readSelected(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY)
  } catch {
    return null
  }
}

export function TeacherProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [classes, setClasses] = useState<ClassRoom[]>([])
  const [stats, setStats] = useState<Record<string, ClassStats>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(readSelected)

  const reloadProfile = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile((data as Profile | null) ?? null)
  }, [userId])

  const reload = useCallback(async () => {
    const [c, s] = await Promise.all([
      supabase.from('classes').select('*').order('created_at', { ascending: true }),
      supabase.rpc('teacher_class_stats', { p_today_start: startOfTodayISO() }),
    ])
    if (c.error) setError(toMessage(c.error))
    else {
      setError(null)
      setClasses((c.data ?? []) as ClassRoom[])
    }
    if (!s.error) {
      const map: Record<string, ClassStats> = {}
      for (const row of (s.data ?? []) as ClassStats[]) map[row.class_id] = row
      setStats(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
    reloadProfile()
  }, [reload, reloadProfile])

  const setSelectedClassId = useCallback((id: string) => {
    setSelected(id)
    try {
      localStorage.setItem(SELECTED_KEY, id)
    } catch {
      /* 저장 못 해도 괜찮음 */
    }
  }, [])

  // 선택한 학급이 없거나 지워졌으면 첫 학급으로
  const selectedClassId = classes.some((c) => c.id === selected) ? selected : (classes[0]?.id ?? null)
  const selectedClass = classes.find((c) => c.id === selectedClassId) ?? null

  const value = useMemo<TeacherState>(
    () => ({
      profile,
      classes,
      stats,
      loading,
      error,
      reload,
      reloadProfile,
      selectedClassId,
      setSelectedClassId,
      selectedClass,
    }),
    [profile, classes, stats, loading, error, reload, reloadProfile, selectedClassId, setSelectedClassId, selectedClass],
  )

  return <TeacherContext.Provider value={value}>{children}</TeacherContext.Provider>
}

export function useTeacher(): TeacherState {
  const ctx = useContext(TeacherContext)
  if (!ctx) throw new Error('useTeacher must be used inside TeacherProvider')
  return ctx
}
