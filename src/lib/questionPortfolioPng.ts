/**
 * 학생이 선택한 자기 질문을 PNG 이미지로 만듭니다.
 * - 화면(DOM)을 캡처하지 않고 Canvas 2D 로 직접 그립니다.
 * - 이미지는 서버로 보내지 않고 학생 기기에만 저장/공유합니다.
 */

export interface QuestionPortfolioImageData {
  className: string
  studentNumber: number
  studentName: string
  date: Date
  questions: Array<{ content: string; createdAt: string }>
}

const C = {
  bg: '#fffbf2',
  paper: '#ffffff',
  ink: '#34334a',
  inkSoft: '#6b6a80',
  line: '#e4ddd0',
}
const SANS = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
const DISPLAY = `"Jua", ${SANS}`

const WIDTH = 1400
const PAD = 64
const CARD_PAD_X = 28
const CARD_PAD_Y = 22
const CARD_GAP = 18
const TEXT_LINE = 38
const MAX_PIXELS = 16_000_000

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(' ')) {
      const candidate = line ? `${line} ${word}` : word
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate
        continue
      }
      if (line) lines.push(line)
      line = ''
      for (const ch of word) {
        if (ctx.measureText(line + ch).width > maxWidth && line) {
          lines.push(line)
          line = ''
        }
        line += ch
      }
    }
    lines.push(line)
  }
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, stroke: string) {
  roundRect(ctx, x, y, w, h, 22)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = stroke
  ctx.stroke()
}

function formatDate(d: Date) {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

function formatQuestionDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function layout(ctx: CanvasRenderingContext2D, draw: boolean, data: QuestionPortfolioImageData) {
  const contentW = WIDTH - PAD * 2
  let y = PAD

  ctx.font = `52px ${DISPLAY}`
  if (draw) {
    ctx.fillStyle = C.ink
    ctx.fillText('나의 질문 모음', PAD, y + 52)
  }
  y += 76

  ctx.font = `500 26px ${SANS}`
  const meta = `${data.className}  ·  ${data.studentNumber}번 ${data.studentName}  ·  저장 ${formatDate(data.date)}`
  const metaLines = wrap(ctx, meta, contentW)
  if (draw) {
    ctx.fillStyle = C.inkSoft
    metaLines.forEach((line, i) => ctx.fillText(line, PAD, y + 28 + i * 38))
  }
  y += metaLines.length * 38 + 30

  ctx.font = `700 24px ${SANS}`
  if (draw) {
    ctx.fillStyle = C.inkSoft
    ctx.fillText(`선택한 질문 ${data.questions.length}개`, PAD, y + 26)
  }
  y += 52

  for (let i = 0; i < data.questions.length; i += 1) {
    const q = data.questions[i]
    ctx.font = `500 26px ${SANS}`
    const lines = wrap(ctx, q.content, contentW - CARD_PAD_X * 2)
    const bodyH = lines.length * TEXT_LINE
    const h = CARD_PAD_Y + 30 + 14 + bodyH + CARD_PAD_Y

    if (draw) {
      box(ctx, PAD, y, contentW, h, C.paper, C.line)
      ctx.font = `700 22px ${SANS}`
      ctx.fillStyle = C.inkSoft
      ctx.fillText(`${i + 1}.  ${formatQuestionDate(q.createdAt)}`, PAD + CARD_PAD_X, y + CARD_PAD_Y + 22)
      ctx.font = `500 26px ${SANS}`
      ctx.fillStyle = C.ink
      lines.forEach((line, lineIndex) =>
        ctx.fillText(line, PAD + CARD_PAD_X, y + CARD_PAD_Y + 30 + 14 + 28 + lineIndex * TEXT_LINE),
      )
    }
    y += h + CARD_GAP
  }

  if (draw) {
    ctx.font = `500 20px ${SANS}`
    ctx.fillStyle = C.inkSoft
    ctx.textAlign = 'right'
    ctx.fillText('우리반 질문 상자', WIDTH - PAD, y + 18)
    ctx.textAlign = 'left'
  }
  return y + 18 + PAD
}

async function loadFonts(data: QuestionPortfolioImageData) {
  if (!document.fonts) return
  const text = [data.className, data.studentName, ...data.questions.map((q) => q.content)].join('')
  const sample = `${text}0123456789년월일번나의질문모음선택한개우리반상자저장.`
  await Promise.all(
    [`52px "Jua"`, `500 26px "Noto Sans KR"`, `700 24px "Noto Sans KR"`, `700 22px "Noto Sans KR"`].map((f) =>
      document.fonts.load(f, sample).catch(() => []),
    ),
  )
}

export async function renderQuestionPortfolioPng(data: QuestionPortfolioImageData): Promise<Blob> {
  await loadFonts(data)
  const measure = document.createElement('canvas').getContext('2d')
  if (!measure) throw new Error('CANVAS_UNAVAILABLE')
  const height = Math.ceil(layout(measure, false, data))
  const scale = Math.min(2, Math.sqrt(MAX_PIXELS / (WIDTH * height)))

  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(WIDTH * scale)
  canvas.height = Math.floor(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('CANVAS_UNAVAILABLE')
  ctx.scale(scale, scale)
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, WIDTH, height)
  ctx.textBaseline = 'alphabetic'
  layout(ctx, true, data)

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG_FAILED'))), 'image/png'),
  )
}

export function questionPortfolioFileName(data: QuestionPortfolioImageData) {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30)
  const d = data.date
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `내질문_${data.studentNumber}번_${safe(data.studentName)}_${ymd}.png`
}
