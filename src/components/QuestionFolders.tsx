import { useState, type FormEvent } from 'react'
import { CheckSquare, Folder, FolderInput, FolderMinus, FolderPlus, Pencil, Square, Trash2, X } from 'lucide-react'
import { NO_FOLDER_FILTER, type QuestionFolder } from '../lib/types'
import { Button, Input, cx } from './ui'

/** 폴더 필터: 전체 질문 + 폴더 없음 + 학급의 폴더들 + 새 폴더 */
export function FolderBar({
  folders,
  total,
  unfoldered,
  value,
  onChange,
  onCreate,
  onRename,
  onDelete,
}: {
  folders: QuestionFolder[]
  total: number
  /** 어느 폴더에도 들지 않은 질문 수 */
  unfoldered: number
  /** null = 전체 질문, NO_FOLDER_FILTER = 폴더 없음, 그 밖에는 폴더 id */
  value: string | null
  onChange: (value: string | null) => void
  onCreate: (name: string) => Promise<boolean>
  onRename: (folder: QuestionFolder) => void
  onDelete: (folder: QuestionFolder) => void
}) {
  const [creating, setCreating] = useState(false)
  const current = folders.find((f) => f.id === value) ?? null
  const chip = (active: boolean) =>
    cx(
      'inline-flex min-h-10 items-center gap-1.5 rounded-2xl border-2 px-3 text-base font-bold transition',
      active ? 'border-ink/40 bg-lilac-soft shadow-pop-sm' : 'border-line bg-paper text-ink-soft hover:border-line-strong',
    )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="폴더">
        <span className="mr-1 text-base font-bold text-ink-soft">폴더</span>
        <button type="button" role="radio" aria-checked={value === null} onClick={() => onChange(null)} className={chip(value === null)}>
          전체 질문 <span className="text-ink-soft">{total}</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value === NO_FOLDER_FILTER}
          onClick={() => onChange(NO_FOLDER_FILTER)}
          className={chip(value === NO_FOLDER_FILTER)}
        >
          폴더 없음 <span className="text-ink-soft">{unfoldered}</span>
        </button>
        {folders.map((f) => (
          <button key={f.id} type="button" role="radio" aria-checked={value === f.id} onClick={() => onChange(f.id)} className={chip(value === f.id)}>
            <Folder className="size-4" aria-hidden />
            {f.name} <span className="text-ink-soft">{f.question_ids.length}</span>
          </button>
        ))}
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-2xl border-2 border-dashed border-line-strong px-3 text-base font-bold text-ink-soft hover:bg-ink/5"
          >
            <FolderPlus className="size-4" aria-hidden />새 폴더
          </button>
        )}
      </div>
      {creating && (
        <NewFolderForm
          onSubmit={async (name) => {
            const ok = await onCreate(name)
            if (ok) setCreating(false)
            return ok
          }}
          onCancel={() => setCreating(false)}
          submitLabel="폴더 만들기"
        />
      )}
      {current && (
        <div className="flex flex-wrap items-center gap-2 text-base text-ink-soft">
          <span>
            「{current.name}」 폴더를 보고 있어요. 폴더에서 빼거나 폴더를 지워도 질문은 그대로 남아요.
          </span>
          <Button size="sm" variant="ghost" onClick={() => onRename(current)}>
            <Pencil className="size-4" aria-hidden />
            이름 바꾸기
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(current)} className="text-pink-ink">
            <Trash2 className="size-4" aria-hidden />
            폴더 지우기
          </Button>
        </div>
      )}
    </div>
  )
}

function NewFolderForm({
  onSubmit,
  onCancel,
  submitLabel,
}: {
  onSubmit: (name: string) => Promise<boolean>
  onCancel: () => void
  submitLabel: string
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const ok = await onSubmit(name.trim())
    setBusy(false)
    if (ok) setName('')
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 30))}
        placeholder="새 폴더 이름 (예: 과학 질문)"
        aria-label="새 폴더 이름"
        className="min-h-10 max-w-xs flex-1 text-base"
        autoFocus
      />
      <Button type="submit" size="sm" loading={busy} disabled={!name.trim()}>
        {submitLabel}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel} aria-label="취소">
        <X className="size-4" aria-hidden />
      </Button>
    </form>
  )
}

/** 질문 선택 도구: 선택 수, 전체 선택/해제, 폴더에 넣기, (폴더 보기 중) 폴더에서 빼기 */
export function SelectionBar({
  selectedCount,
  shownCount,
  folders,
  currentFolder,
  onSelectAll,
  onClear,
  onPut,
  onCreateAndPut,
  onTakeOut,
}: {
  selectedCount: number
  shownCount: number
  folders: QuestionFolder[]
  currentFolder: QuestionFolder | null
  onSelectAll: () => void
  onClear: () => void
  onPut: (folder: QuestionFolder) => Promise<void>
  onCreateAndPut: (name: string) => Promise<boolean>
  onTakeOut: () => Promise<void>
}) {
  const [picking, setPicking] = useState(false)
  const none = selectedCount === 0
  const allSelected = shownCount > 0 && selectedCount === shownCount

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-line bg-paper px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-2 inline-flex items-center gap-1.5 text-lg font-bold" aria-live="polite">
          {none ? <Square className="size-5 text-ink-soft" aria-hidden /> : <CheckSquare className="size-5 text-sky-ink" aria-hidden />}
          {selectedCount}개 질문 선택됨
        </span>
        <Button size="sm" variant="secondary" onClick={onSelectAll} disabled={shownCount === 0 || allSelected}>
          전체 선택
        </Button>
        <Button size="sm" variant="secondary" onClick={onClear} disabled={none}>
          선택 해제
        </Button>
        <span className="hidden h-8 w-0.5 bg-line sm:block" />
        <Button size="sm" variant="sky" onClick={() => setPicking((v) => !v)} disabled={none} aria-expanded={picking && !none}>
          <FolderInput className="size-4" aria-hidden />
          폴더에 넣기
        </Button>
        {currentFolder && (
          <Button size="sm" variant="secondary" onClick={onTakeOut} disabled={none}>
            <FolderMinus className="size-4" aria-hidden />
            이 폴더에서 빼기
          </Button>
        )}
      </div>
      {picking && !none && (
        <div className="flex flex-col gap-2 border-t-2 border-line pt-3">
          <p className="text-base text-ink-soft">선택한 {selectedCount}개 질문을 넣을 폴더를 고르세요. 이미 든 질문은 그대로 둬요.</p>
          {folders.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {folders.map((f) => (
                <Button
                  key={f.id}
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await onPut(f)
                    setPicking(false)
                  }}
                >
                  <Folder className="size-4" aria-hidden />
                  {f.name}
                </Button>
              ))}
            </div>
          )}
          <NewFolderForm
            submitLabel="새 폴더 만들고 넣기"
            onSubmit={async (name) => {
              const ok = await onCreateAndPut(name)
              if (ok) setPicking(false)
              return ok
            }}
            onCancel={() => setPicking(false)}
          />
        </div>
      )}
    </div>
  )
}
