import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

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
