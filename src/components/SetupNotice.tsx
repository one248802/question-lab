import { Card } from './ui'

/** .env 가 비어 있을 때 보여 주는 안내 (개발자용) */
export function SetupNotice() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl items-center px-4 py-10">
      <Card className="w-full">
        <h1 className="mb-3 font-display text-3xl">Supabase 연결이 필요해요</h1>
        <p className="mb-4 text-lg text-ink-soft">
          프로젝트 폴더에 <code className="rounded bg-butter-soft px-1">.env</code> 파일을 만들고 아래 값을 넣은 뒤 다시 실행해 주세요.
        </p>
        <pre className="overflow-x-auto rounded-2xl bg-cream p-4 text-sm">
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=anon-public-key`}
        </pre>
      </Card>
    </div>
  )
}
