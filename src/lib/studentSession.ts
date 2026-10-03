import { toMessage } from './errors'
import { supabase } from './supabase'
import type { StudentContext } from './types'

/**
 * 현재 익명 세션에 연결된 학생 조회 결과.
 * - joined: student_sessions 에 연결된 학생이 있음
 * - not_joined: 요청은 성공했지만 연결된 학생이 없음 (나가기 했거나, 교사가 학생을 지운 경우 등)
 * - error: 네트워크 끊김, 토큰 갱신 중 오류 등 일시적인 문제. 세션과 학생 연결은 그대로일 수 있으므로
 *          '로그아웃'으로 처리하지 않고 다시 시도하게 합니다.
 */
export type StudentLookup =
  | { status: 'joined'; student: StudentContext }
  | { status: 'not_joined' }
  | { status: 'error'; message: string }

const RETRY_DELAYS_MS = [600, 1500]

/** get_my_student 를 부르고, 실패하면 잠깐 쉬었다가 몇 번 더 시도합니다. */
export async function lookupMyStudent(): Promise<StudentLookup> {
  let lastError: unknown = null
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const { data, error } = await supabase.rpc('get_my_student')
    if (!error) return data ? { status: 'joined', student: data as StudentContext } : { status: 'not_joined' }
    lastError = error
    if (attempt < RETRY_DELAYS_MS.length) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
  }
  return { status: 'error', message: toMessage(lastError) }
}
