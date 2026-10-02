/**
 * 질문 분류 결과를 PNG 이미지로 만들고 학생 기기에 저장합니다.
 * - 화면(DOM)을 캡처하지 않고 Canvas 2D 로 직접 그립니다. (글꼴·CSS 차이 없이 항상 같은 모양)
 * - 이미지는 서버로 보내지 않습니다. 다운로드하거나(컴퓨터), 기기의 공유 화면으로 넘깁니다(휴대폰·태블릿).
 */

export interface ClassificationImageData {
  title: string
  className: string
  studentNumber: number
  studentName: string
  date: Date
  areas: Array<{ name: string; questions: string[] }>
  unsorted: string[]
}

const C = {
  bg: '#fffbf2',
  paper: '#ffffff',
  ink: '#34334a',
  inkSoft: '#6b6a80',
  line: '#e4ddd0',
  lineStrong: '#cfc6b6',
  mint: '#8fdcbc',
  mintSoft: '#e2f6ec',
  mintInk: '#1f7a55',
  butterSoft: '#fff4cc',
}
const SANS = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
const DISPLAY = `"Jua", ${SANS}`

const WIDTH = 1600 // 이미지 너비 (CSS px 기준, 실제 픽셀은 SCALE 배)
const PAD = 64
const GAP = 28
const BOX_PAD = 24
const CARD_PAD_X = 20
const CARD_PAD_Y = 14
const CARD_GAP = 12
const CARD_FONT = `500 24px ${SANS}`
const CARD_LINE = 36
const MAX_PIXELS = 16_000_000 // 휴대폰 브라우저 캔버스 한도 안쪽

/** 글자 폭에 맞춰 줄바꿈 (띄어쓰기 기준, 너무 긴 낱말은 글자 단위로 자름) */
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

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke: string, dashed = false) {
  roundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.setLineDash(dashed ? [10, 8] : [])
  ctx.lineWidth = 2
  ctx.strokeStyle = stroke
  ctx.stroke()
  ctx.setLineDash([])
}

/** 질문 카드 목록의 높이를 재고(draw=false), 그립니다(draw=true). 반환값: 높이 */
function cards(ctx: CanvasRenderingContext2D, draw: boolean, x: number, y: number, w: number, questions: string[], emptyText: string) {
  ctx.font = CARD_FONT
  if (questions.length === 0) {
    if (draw) {
      ctx.fillStyle = C.inkSoft
      ctx.fillText(emptyText, x, y + 28)
    }
    return 40
  }
  let top = y
  for (const q of questions) {
    const lines = wrap(ctx, q, w - CARD_PAD_X * 2)
    const h = lines.length * CARD_LINE + CARD_PAD_Y * 2
    if (draw) {
      box(ctx, x, top, w, h, 14, C.paper, C.line)
      ctx.fillStyle = C.ink
      lines.forEach((line, i) => ctx.fillText(line, x + CARD_PAD_X, top + CARD_PAD_Y + 26 + i * CARD_LINE))
    }
    top += h + CARD_GAP
  }
  return top - y - CARD_GAP
}

/** 영역(또는 미분류) 상자 하나. 반환값: 높이 */
function section(
  ctx: CanvasRenderingContext2D,
  draw: boolean,
  x: number,
  y: number,
  w: number,
  name: string,
  questions: string[],
  opts: { columns: number; fill: string; stroke: string; dashed?: boolean; emptyText: string },
  boxHeight?: number,
) {
  const inner = w - BOX_PAD * 2
  ctx.font = `700 30px ${SANS}`
  const nameLines = wrap(ctx, name, inner - 70)
  const headerH = nameLines.length * 40
  const colW = (inner - (opts.columns - 1) * GAP) / opts.columns
  // 카드를 열마다 위에서 아래로 채움
  const perCol = Math.ceil(questions.length / opts.columns) || 1
  const columns = Array.from({ length: opts.columns }, (_, i) => questions.slice(i * perCol, (i + 1) * perCol))
  const bodyH = Math.max(
    ...columns.map((list, i) => (i === 0 || list.length > 0 ? cards(ctx, false, 0, 0, colW, list, opts.emptyText) : 0)),
  )
  const h = boxHeight ?? BOX_PAD + headerH + 16 + bodyH + BOX_PAD
  if (draw) {
    box(ctx, x, y, w, h, 24, opts.fill, opts.stroke, opts.dashed)
    ctx.font = `700 30px ${SANS}`
    ctx.fillStyle = C.ink
    nameLines.forEach((line, i) => ctx.fillText(line, x + BOX_PAD, y + BOX_PAD + 30 + i * 40))
    // 질문 수
    const count = String(questions.length)
    ctx.font = `700 22px ${SANS}`
    const cw = Math.max(40, ctx.measureText(count).width + 24)
    roundRect(ctx, x + w - BOX_PAD - cw, y + BOX_PAD + 2, cw, 34, 17)
    ctx.fillStyle = C.line
    ctx.fill()
    ctx.fillStyle = C.inkSoft
    ctx.textAlign = 'center'
    ctx.fillText(count, x + w - BOX_PAD - cw / 2, y + BOX_PAD + 27)
    ctx.textAlign = 'left'
    columns.forEach((list, i) => {
      if (i === 0 || list.length > 0) cards(ctx, true, x + BOX_PAD + i * (colW + GAP), y + BOX_PAD + headerH + 16, colW, list, opts.emptyText)
    })
  }
  return h
}

function formatDate(d: Date) {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

/** 전체를 그리거나(draw=true) 높이만 잽니다. 반환값: 전체 높이 */
function layout(ctx: CanvasRenderingContext2D, draw: boolean, data: ClassificationImageData) {
  const contentW = WIDTH - PAD * 2
  let y = PAD

  // 제목
  ctx.font = `52px ${DISPLAY}`
  const titleLines = wrap(ctx, data.title, contentW)
  if (draw) {
    ctx.fillStyle = C.ink
    titleLines.forEach((line, i) => ctx.fillText(line, PAD, y + 52 + i * 66))
  }
  y += titleLines.length * 66 + 8

  // 학급 · 번호 이름 · 날짜
  ctx.font = `500 26px ${SANS}`
  const meta = `${data.className}  ·  ${data.studentNumber}번 ${data.studentName}  ·  ${formatDate(data.date)}`
  const metaLines = wrap(ctx, meta, contentW)
  if (draw) {
    ctx.fillStyle = C.inkSoft
    metaLines.forEach((line, i) => ctx.fillText(line, PAD, y + 28 + i * 38))
  }
  y += metaLines.length * 38 + 36

  // 분류 영역: 한 줄에 최대 3개 (4개면 2개씩)
  const n = data.areas.length
  const perRow = n <= 3 ? n : n === 4 ? 2 : 3
  for (let start = 0; start < n; start += perRow) {
    const row = data.areas.slice(start, start + perRow)
    const w = (contentW - (perRow - 1) * GAP) / perRow
    const opts = { columns: 1, fill: C.paper, stroke: C.lineStrong, emptyText: '(비어 있음)' }
    const rowH = Math.max(...row.map((a) => section(ctx, false, 0, 0, w, a.name, a.questions, opts)))
    if (draw) row.forEach((a, i) => section(ctx, true, PAD + i * (w + GAP), y, w, a.name, a.questions, opts, rowH))
    y += rowH + GAP
  }

  // 미분류 질문
  const trayOpts = { columns: 2, fill: C.bg, stroke: C.lineStrong, dashed: true, emptyText: '모든 질문을 분류했어요.' }
  y += section(ctx, draw, PAD, y, contentW, '아직 분류하지 않은 질문', data.unsorted, trayOpts) + 24

  // 꼬리말
  if (draw) {
    ctx.font = `500 20px ${SANS}`
    ctx.fillStyle = C.inkSoft
    ctx.textAlign = 'right'
    ctx.fillText('우리반 질문 상자', WIDTH - PAD, y + 20)
    ctx.textAlign = 'left'
  }
  return y + 20 + PAD
}

/** 그림에 쓰는 글자들의 웹 글꼴을 미리 불러옴 (한글 글꼴은 글자 묶음별로 나뉘어 있음) */
async function loadFonts(data: ClassificationImageData) {
  if (!document.fonts) return
  const text = [data.title, data.className, data.studentName, ...data.areas.flatMap((a) => [a.name, ...a.questions]), ...data.unsorted].join('')
  const sample = `${text}0123456789년월일번아직분류하지않은질문모든했어요비어있음우리반상자()·`
  await Promise.all(
    [`52px "Jua"`, `500 26px "Noto Sans KR"`, `700 30px "Noto Sans KR"`, `500 24px "Noto Sans KR"`, `700 22px "Noto Sans KR"`].map((f) =>
      document.fonts.load(f, sample).catch(() => []),
    ),
  )
}

/** 분류 결과 PNG 만들기 */
export async function renderClassificationPng(data: ClassificationImageData): Promise<Blob> {
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

/** 파일 이름: 질문분류_활동제목_3번_홍길동_2026-10-02.png */
export function classificationFileName(data: ClassificationImageData) {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30)
  const d = data.date
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `질문분류_${safe(data.title)}_${data.studentNumber}번_${safe(data.studentName)}_${ymd}.png`
}

/**
 * 학생 기기에 저장. 서버로 보내지 않습니다.
 * - 휴대폰·태블릿(터치 화면)에서 파일 공유를 지원하면 공유 화면을 엽니다 (사진에 저장 등).
 * - 그 밖에는 파일로 다운로드합니다.
 */
export async function savePngOnDevice(blob: Blob, fileName: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], fileName, { type: 'image/png' })
  const touchDevice = window.matchMedia?.('(pointer: coarse)').matches
  if (touchDevice && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // 공유가 안 되면 아래 다운로드로
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
