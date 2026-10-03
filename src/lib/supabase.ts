import { createClient } from '@supabase/supabase-js'
// supabase-js 가 메일 링크 주소(#…)를 지우기 전에 먼저 읽어 두도록 가장 먼저 불러옴
import './authRedirect'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
// Supabase 대시보드의 publishable key(구 anon key). 예전 이름도 계속 지원합니다.
const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

/** .env 에 Supabase 주소와 anon key 가 들어 있는지 */
export const isSupabaseConfigured = Boolean(url && anonKey)

// 브라우저에는 anon(public) key 만 사용합니다. service_role key 는 절대 넣지 마세요.
export const supabase = createClient(
  url || 'http://localhost:54321',
  anonKey || 'missing-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
)
