import { useState, type FormEvent } from 'react'
import { Pencil, Send } from 'lucide-react'
import { Button, Card, ErrorBox, Textarea } from './ui'

const MAX = 300

export function QuestionComposer({
  onSubmit,
}: {
  /** 성공하면 null, 실패하면 오류 문장 */
  onSubmit: (content: string) => Promise<string | null>
}) {
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handle = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!content.trim()) return setError('질문을 써 주세요.')
    setSending(true)
    const result = await onSubmit(content.trim())
    setSending(false)
    if (result) return setError(result)
    setContent('')
  }

  return (
    <Card className="bg-butter-soft/60">
      <form onSubmit={handle} className="flex flex-col gap-5">
        <h2 className="flex items-center gap-2 font-display text-2xl">
          <Pencil className="size-7 text-butter-ink" aria-hidden />
          질문 쓰기
        </h2>
        <div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, MAX))}
            placeholder="궁금한 것을 써 보세요"
            aria-label="질문 내용"
            className="text-xl"
          />
          <p className="mt-1 text-right text-sm text-ink-soft">
            {content.length} / {MAX}
          </p>
        </div>

        <ErrorBox message={error} />
        <Button type="submit" size="lg" loading={sending} className="self-stretch sm:self-end">
          <Send className="size-6" aria-hidden />
          질문 올리기
        </Button>
      </form>
    </Card>
  )
}
