import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cx } from './ui'

/** 클래스 코드 크게 보여 주기 + 복사 */
export function ClassCode({ code, size = 'md' }: { code: string; size?: 'md' | 'lg' }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 복사를 지원하지 않는 환경 */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="코드 복사"
      className={cx(
        'inline-flex items-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-cream font-display tracking-[0.2em] transition hover:border-sky',
        size === 'lg' ? 'px-5 py-3 text-4xl' : 'px-3 py-1.5 text-2xl',
      )}
    >
      {code}
      {copied ? <Check className="size-5 text-mint-ink" aria-label="복사됨" /> : <Copy className="size-5 text-ink-soft" aria-hidden />}
    </button>
  )
}
