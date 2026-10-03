import type { ReactNode } from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'
import { Button, Card } from './ui'

/** 일시적인 연결 문제로 학생 정보를 못 불러왔을 때. 입장 정보는 지우지 않고 다시 시도하게 합니다. */
export function ConnectionRetry({
  message,
  retrying,
  onRetry,
  children,
}: {
  message?: string | null
  retrying: boolean
  onRetry: () => void
  children?: ReactNode
}) {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2 font-display text-2xl">
        <WifiOff className="size-7 text-pink-ink" aria-hidden />
        연결이 잠시 불안정해요
      </h2>
      <p className="text-lg">입장 정보는 그대로 남아 있어요. 인터넷 연결을 확인하고 다시 시도해 주세요.</p>
      {message && <p className="text-sm text-ink-soft">{message}</p>}
      <Button size="lg" block onClick={onRetry} loading={retrying}>
        {!retrying && <RefreshCw className="size-5" aria-hidden />}
        다시 시도
      </Button>
      {children}
    </Card>
  )
}
