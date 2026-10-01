import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { CategoryOption } from './types'

/**
 * 질문 유형 기본값.
 * 실제 목록은 DB의 question_scopes / question_types 테이블에서 불러오며,
 * 불러오지 못하면 이 값을 사용합니다.
 */
export const DEFAULT_SCOPES: CategoryOption[] = [
  { code: 'open', label: '열린 질문', sort_order: 1 },
  { code: 'closed', label: '닫힌 질문', sort_order: 2 },
]

export const DEFAULT_TYPES: CategoryOption[] = [
  { code: 'confirm', label: '확인 질문', sort_order: 1 },
  { code: 'clarify', label: '명료화 질문', sort_order: 2 },
  { code: 'deepen', label: '심화 질문', sort_order: 3 },
]

/** 유형별 색 (새 유형이 추가되면 순서대로 돌려 씀) */
const SCOPE_COLORS = ['bg-sky-soft text-sky-ink', 'bg-peach-soft text-peach-ink']
const TYPE_COLORS = [
  'bg-mint-soft text-mint-ink',
  'bg-lilac-soft text-lilac-ink',
  'bg-pink-soft text-pink-ink',
  'bg-butter-soft text-butter-ink',
]

export interface Categories {
  scopes: CategoryOption[]
  types: CategoryOption[]
  scopeLabel: (code: string) => string
  typeLabel: (code: string) => string
  scopeColor: (code: string) => string
  typeColor: (code: string) => string
}

function build(scopes: CategoryOption[], types: CategoryOption[]): Categories {
  const find = (list: CategoryOption[], code: string) => list.find((c) => c.code === code)
  const colorOf = (list: CategoryOption[], palette: string[], code: string) => {
    const i = list.findIndex((c) => c.code === code)
    return palette[(i < 0 ? 0 : i) % palette.length]
  }
  return {
    scopes,
    types,
    scopeLabel: (code) => find(scopes, code)?.label ?? code,
    typeLabel: (code) => find(types, code)?.label ?? code,
    scopeColor: (code) => colorOf(scopes, SCOPE_COLORS, code),
    typeColor: (code) => colorOf(types, TYPE_COLORS, code),
  }
}

let cache: Categories | null = null

export function useCategories(): Categories {
  const [value, setValue] = useState<Categories>(cache ?? build(DEFAULT_SCOPES, DEFAULT_TYPES))

  useEffect(() => {
    if (cache) return
    let alive = true
    Promise.all([
      supabase.from('question_scopes').select('code,label,sort_order').eq('is_active', true).order('sort_order'),
      supabase.from('question_types').select('code,label,sort_order').eq('is_active', true).order('sort_order'),
    ]).then(([s, t]) => {
      if (!alive || s.error || t.error || !s.data?.length || !t.data?.length) return
      cache = build(s.data as CategoryOption[], t.data as CategoryOption[])
      setValue(cache)
    })
    return () => {
      alive = false
    }
  }, [])

  return value
}
