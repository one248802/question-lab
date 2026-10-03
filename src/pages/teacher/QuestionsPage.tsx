import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Eye, EyeOff, Folder, Heart, Inbox, MessageCircleQuestion, RefreshCw, Trash2, UserRound } from 'lucide-react'
import { ClassPicker, NoClassYet } from '../../components/ClassPicker'
import { FolderBar, SelectionBar } from '../../components/QuestionFolders'
import { Badge, Button, ChoiceChips, EmptyState, ErrorBox, Input, PageTitle, Spinner, cx } from '../../components/ui'
import { useTeacher } from '../../contexts/TeacherContext'
import { formatDateTime, localDateKey, startOfWeek } from '../../lib/date'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { NO_FOLDER_FILTER, type QuestionFolder, type TeacherQuestion } from '../../lib/types'

const POLL_MS = 15_000

type Sort = 'new' | 'votes'
type Visibility = 'all' | 'visible' | 'hidden'
// 날짜별 보기 (질문의 created_at, 브라우저 시간 기준)
type DateFilter = 'all' | 'today' | 'week' | 'date'

interface FolderRow extends Omit<QuestionFolder, 'question_ids'> {
  question_folder_items: Array<{ question_id: string }>
}

function folderError(err: unknown) {
  const msg = toMessage(err)
  return msg.includes('duplicate key') ? '이미 같은 이름의 폴더가 있어요.' : msg
}

interface Row extends Omit<TeacherQuestion, 'vote_count'> {
  votes: Array<{ count: number }>
}

export default function QuestionsPage() {
  const { classes, loading: classesLoading, selectedClassId, reload: reloadStats } = useTeacher()

  const [questions, setQuestions] = useState<TeacherQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<Visibility>('all')
  const [sort, setSort] = useState<Sort>('new')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [pickedDate, setPickedDate] = useState(() => localDateKey(new Date()))
  const [folders, setFolders] = useState<QuestionFolder[]>([])
  const [folderLoadError, setFolderLoadError] = useState<string | null>(null)
  const [folderFilter, setFolderFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [notice, setNotice] = useState<string | null>(null)
  // 「오늘」「이번 주」 기준 시각. 목록을 새로 불러올 때마다 갱신 (자정이 지나도 다음 새로고침 때 맞춰짐)
  const [now, setNow] = useState(() => Date.now())
  const todayKey = localDateKey(new Date(now))

  // 폴더는 질문 목록과 따로 불러옴: 폴더를 못 불러와도 질문 보기·숨기기·삭제는 그대로 쓸 수 있게
  const loadFolders = useCallback(async () => {
    if (!selectedClassId) return
    const { data, error: err } = await supabase
      .from('question_folders')
      .select('id, class_id, name, created_at, question_folder_items(question_id)')
      .eq('class_id', selectedClassId)
      .order('created_at', { ascending: true })
    if (err) return setFolderLoadError(`폴더를 불러오지 못했어요. ${toMessage(err)}`)
    setFolderLoadError(null)
    setFolders(
      ((data ?? []) as unknown as FolderRow[]).map(({ question_folder_items, ...f }) => ({
        ...f,
        question_ids: (question_folder_items ?? []).map((i) => i.question_id),
      })),
    )
  }, [selectedClassId])

  const load = useCallback(async () => {
    if (!selectedClassId) return
    loadFolders()
    const { data, error: err } = await supabase
      .from('questions')
      .select(
        'id, class_id, student_id, content, is_hidden, created_at, student:students(student_number, name), votes(count)',
      )
      .eq('class_id', selectedClassId)
      .order('created_at', { ascending: false })
    setNow(Date.now())
    if (err) setError(toMessage(err))
    else {
      setError(null)
      setQuestions(
        ((data ?? []) as unknown as Row[]).map(({ votes, ...q }) => ({ ...q, vote_count: votes?.[0]?.count ?? 0 })),
      )
    }
    setLoading(false)
  }, [selectedClassId, loadFolders])

  useEffect(() => {
    setLoading(true)
    load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  // 다른 학급으로 바꾸면 그 학급에 없는 폴더는 자동으로 「전체 질문」
  const currentFolder = folders.find((f) => f.id === folderFilter) ?? null
  const noFolderFilter = folderFilter === NO_FOLDER_FILTER
  // 어느 폴더에든 들어 있는 질문 id
  const inSomeFolder = useMemo(() => new Set(folders.flatMap((f) => f.question_ids)), [folders])
  const unfolderedCount = useMemo(() => questions.filter((q) => !inSomeFolder.has(q.id)).length, [questions, inSomeFolder])

  // 날짜·폴더·공개 여부 필터를 함께 적용
  const shown = useMemo(() => {
    let list = questions
    if (dateFilter === 'today') {
      list = list.filter((q) => localDateKey(q.created_at) === todayKey)
    } else if (dateFilter === 'week') {
      const from = startOfWeek(new Date(now)).getTime()
      list = list.filter((q) => new Date(q.created_at).getTime() >= from)
    } else if (dateFilter === 'date' && pickedDate) {
      list = list.filter((q) => localDateKey(q.created_at) === pickedDate)
    }
    if (currentFolder) {
      const ids = new Set(currentFolder.question_ids)
      list = list.filter((q) => ids.has(q.id))
    } else if (noFolderFilter) {
      list = list.filter((q) => !inSomeFolder.has(q.id))
    }
    if (visibility === 'visible') list = list.filter((q) => !q.is_hidden)
    if (visibility === 'hidden') list = list.filter((q) => q.is_hidden)
    if (sort === 'votes') list = [...list].sort((a, b) => b.vote_count - a.vote_count)
    return list
  }, [questions, dateFilter, todayKey, now, pickedDate, currentFolder, noFolderFilter, inSomeFolder, visibility, sort])

  // 선택은 지금 보이는 질문 중에서만 셈 (필터를 바꾸면 안 보이는 질문은 선택에서 빠짐)
  const selectedShown = useMemo(() => shown.filter((q) => selected.has(q.id)), [shown, selected])
  const folderNamesOf = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const f of folders) for (const id of f.question_ids) map.set(id, [...(map.get(id) ?? []), f.name])
    return map
  }, [folders])

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice((m) => (m === message ? null : m)), 2500)
  }

  const createFolder = async (name: string): Promise<QuestionFolder | null> => {
    setError(null)
    const { data, error: err } = await supabase
      .from('question_folders')
      .insert({ class_id: selectedClassId, name })
      .select('id, class_id, name, created_at')
      .single()
    if (err) {
      setError(folderError(err))
      return null
    }
    const folder = { ...(data as Omit<QuestionFolder, 'question_ids'>), question_ids: [] }
    setFolders((list) => [...list, folder])
    return folder
  }

  // 질문을 폴더에 넣기: 연결만 추가 (질문은 그대로, 이미 든 질문은 건너뜀)
  const putInFolder = async (folder: QuestionFolder) => {
    setError(null)
    const already = new Set(folder.question_ids)
    const ids = selectedShown.map((q) => q.id).filter((id) => !already.has(id))
    if (ids.length) {
      const { error: err } = await supabase.from('question_folder_items').insert(ids.map((question_id) => ({ folder_id: folder.id, question_id })))
      if (err && !toMessage(err).includes('duplicate key')) {
        setError(folderError(err))
        await loadFolders()
        return
      }
    }
    await loadFolders()
    setSelected(new Set())
    flash(`「${folder.name}」 폴더에 ${ids.length}개 넣었어요${ids.length < selectedShown.length ? ` (이미 든 ${selectedShown.length - ids.length}개 제외)` : ''}.`)
  }

  const createAndPut = async (name: string) => {
    const folder = await createFolder(name)
    if (!folder) return false
    await putInFolder(folder)
    return true
  }

  // 폴더에서 빼기: 연결만 지움 (질문 원본은 그대로)
  const takeOutOfFolder = async () => {
    if (!currentFolder) return
    setError(null)
    const ids = selectedShown.map((q) => q.id)
    const { error: err } = await supabase.from('question_folder_items').delete().eq('folder_id', currentFolder.id).in('question_id', ids)
    if (err) setError(folderError(err))
    else {
      setSelected(new Set())
      flash(`「${currentFolder.name}」 폴더에서 ${ids.length}개 뺐어요. 질문은 그대로 남아 있어요.`)
    }
    await loadFolders()
  }

  const renameFolder = async (folder: QuestionFolder) => {
    const next = window.prompt('폴더 이름을 바꿔 주세요. (1~30자)', folder.name)?.trim()
    if (!next || next === folder.name) return
    setError(null)
    const { error: err } = await supabase.from('question_folders').update({ name: next.slice(0, 30) }).eq('id', folder.id)
    if (err) setError(folderError(err))
    await loadFolders()
  }

  const deleteFolder = async (folder: QuestionFolder) => {
    const ok = window.confirm(
      `「${folder.name}」 폴더를 지울까요?\n\n폴더만 지워지고, 안에 있던 질문 ${folder.question_ids.length}개는 지워지지 않고 그대로 남아요.`,
    )
    if (!ok) return
    setError(null)
    const { error: err } = await supabase.from('question_folders').delete().eq('id', folder.id)
    if (err) setError(folderError(err))
    else {
      setFolderFilter(null)
      flash(`「${folder.name}」 폴더를 지웠어요. 질문은 그대로예요.`)
    }
    await loadFolders()
  }

  const update = async (id: string, patch: Pick<TeacherQuestion, 'is_hidden'>) => {
    setQuestions((list) => list.map((q) => (q.id === id ? { ...q, ...patch } : q)))
    const { error: err } = await supabase.from('questions').update(patch).eq('id', id)
    if (err) setError(toMessage(err))
    await load()
  }

  // 삭제: 질문과 그 질문에 받은 표가 함께 지워집니다 (votes 는 on delete cascade).
  // 학생 화면에서만 감추려면 숨기기를 씁니다.
  const remove = async (q: TeacherQuestion) => {
    const preview = q.content.length > 40 ? `${q.content.slice(0, 40)}…` : q.content
    const ok = window.confirm(
      `이 질문을 삭제할까요?\n\n「${preview}」\n\n삭제하면 되돌릴 수 없고, 이 질문에 받은 투표 ${q.vote_count}표도 함께 지워져요.\n학생 화면에서만 감추려면 '숨기기'를 눌러 주세요.`,
    )
    if (!ok) return
    setError(null)
    setQuestions((list) => list.filter((x) => x.id !== q.id))
    const { data, error: err } = await supabase.from('questions').delete().eq('id', q.id).select('id')
    if (err) setError(toMessage(err))
    else if (!data?.length) setError('질문을 삭제하지 못했어요. 새로고침 후 다시 시도해 주세요.')
    await Promise.all([load(), reloadStats()])
  }

  const refresh = async () => {
    setRefreshing(true)
    await Promise.all([load(), reloadStats()])
    setRefreshing(false)
  }

  if (classesLoading) return <Spinner />

  return (
    <>
      <PageTitle
        icon={<MessageCircleQuestion className="size-9 text-lilac-ink" />}
        title="우리반 질문 상자"
        right={
          classes.length > 0 && (
            <div className="flex items-center gap-2">
              <ClassPicker />
              <Button variant="secondary" size="sm" onClick={refresh} aria-label="새로고침" className="min-h-12">
                <RefreshCw className={cx('size-5', refreshing && 'animate-spin')} aria-hidden />
              </Button>
            </div>
          )
        }
      />

      {classes.length === 0 ? (
        <NoClassYet />
      ) : (
        <div className="@container flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <ChoiceChips<Visibility>
              size="sm"
              options={[
                { value: 'all', label: '모두' },
                { value: 'visible', label: '공개' },
                { value: 'hidden', label: '숨김' },
              ]}
              value={visibility}
              onChange={setVisibility}
            />
            <span className="hidden h-8 w-0.5 bg-line sm:block" />
            <ChoiceChips<Sort>
              size="sm"
              options={[
                { value: 'new', label: '최신순' },
                { value: 'votes', label: '투표순' },
              ]}
              value={sort}
              onChange={setSort}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-base font-bold text-ink-soft">날짜</span>
            <ChoiceChips<DateFilter>
              size="sm"
              options={[
                { value: 'all', label: '전체' },
                { value: 'today', label: '오늘' },
                { value: 'week', label: '이번 주' },
                { value: 'date', label: '날짜 선택' },
              ]}
              value={dateFilter}
              onChange={setDateFilter}
            />
            {dateFilter === 'date' && (
              <Input
                type="date"
                value={pickedDate}
                max={todayKey}
                onChange={(e) => setPickedDate(e.target.value)}
                aria-label="질문 날짜"
                className="min-h-10 w-auto text-base"
              />
            )}
          </div>

          {folderLoadError ? (
            <ErrorBox message={folderLoadError} />
          ) : (
            <FolderBar
              folders={folders}
              total={questions.length}
              unfoldered={unfolderedCount}
              value={currentFolder?.id ?? (noFolderFilter ? NO_FOLDER_FILTER : null)}
              onChange={(id) => setFolderFilter(id)}
              onCreate={async (name) => Boolean(await createFolder(name))}
              onRename={renameFolder}
              onDelete={deleteFolder}
            />
          )}

          {!folderLoadError && (
            <SelectionBar
              selectedCount={selectedShown.length}
              shownCount={shown.length}
              folders={folders}
              currentFolder={currentFolder}
              onSelectAll={() => setSelected(new Set(shown.map((q) => q.id)))}
              onClear={() => setSelected(new Set())}
              onPut={putInFolder}
              onCreateAndPut={createAndPut}
              onTakeOut={takeOutOfFolder}
            />
          )}

          <ErrorBox message={error} />
          {notice && (
            <p className="rounded-2xl bg-mint-soft px-4 py-3 text-lg font-bold text-mint-ink" role="status">
              {notice}
            </p>
          )}

          {loading ? (
            <Spinner />
          ) : shown.length === 0 ? (
            <EmptyState
              icon={<Inbox className="size-14" />}
              title={questions.length === 0 ? '질문이 없어요' : '조건에 맞는 질문이 없어요'}
            />
          ) : (
            // 목록이 차지하는 폭에 따라 1~3열 (왼쪽 메뉴가 있어 화면 폭 대신 목록 폭 기준). 글자 크기는 그대로
            <ul className="grid gap-4 @min-[34rem]:grid-cols-2 @min-[54rem]:grid-cols-3">
              {shown.map((q) => (
                <QuestionItem
                  key={q.id}
                  q={q}
                  folderNames={folderNamesOf.get(q.id) ?? []}
                  selected={selected.has(q.id)}
                  onToggleSelect={toggleSelect}
                  onUpdate={update}
                  onDelete={remove}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}

function QuestionItem({
  q,
  folderNames,
  selected,
  onToggleSelect,
  onUpdate,
  onDelete,
}: {
  q: TeacherQuestion
  folderNames: string[]
  selected: boolean
  onToggleSelect: (id: string) => void
  onUpdate: (id: string, patch: Pick<TeacherQuestion, 'is_hidden'>) => Promise<void>
  onDelete: (q: TeacherQuestion) => Promise<void>
}) {
  return (
    <li
      className={cx(
        'flex min-w-0 flex-col gap-3 rounded-3xl border-2 p-5 shadow-pop',
        q.is_hidden ? 'border-dashed border-line-strong bg-cream opacity-80' : 'border-line bg-paper',
        selected && 'ring-4 ring-sky',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl py-1 pr-2 text-base font-bold text-ink-soft">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(q.id)}
            className="size-5 shrink-0 accent-[#7fb6ec]"
            aria-label={`질문 선택: ${q.content.slice(0, 30)}`}
          />
          선택
        </label>
        {q.is_hidden && <Badge className="bg-line text-ink-soft">숨김</Badge>}
        {folderNames.map((name) => (
          <Badge key={name} className="inline-flex items-center gap-1 bg-lilac-soft text-lilac-ink">
            <Folder className="size-3.5" aria-hidden />
            {name}
          </Badge>
        ))}
      </div>

      <p className={cx('text-xl leading-relaxed font-medium break-words whitespace-pre-wrap', q.is_hidden && 'line-through decoration-ink-soft/40')}>
        {q.content}
      </p>

      {/* 같은 줄의 카드 높이가 맞춰지므로 작성자·버튼은 카드 아래쪽에 모음 */}
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-ink-soft">
        <span className="inline-flex items-center gap-1 font-bold text-ink">
          <UserRound className="size-5" aria-hidden />
          {q.student ? `${q.student.student_number}번 ${q.student.name}` : '알 수 없음'}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-5" aria-hidden />
          {formatDateTime(q.created_at)}
        </span>
        <span className="inline-flex items-center gap-1 font-bold text-pink-ink">
          <Heart className="size-5 fill-current" aria-hidden />
          {q.vote_count}표
        </span>
      </div>

      <div className="mt-1 flex flex-wrap gap-2">
        <Button size="sm" variant={q.is_hidden ? 'mint' : 'secondary'} onClick={() => onUpdate(q.id, { is_hidden: !q.is_hidden })}>
          {q.is_hidden ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
          {q.is_hidden ? '다시 공개' : '숨기기'}
        </Button>
        <Button size="sm" variant="danger" onClick={() => onDelete(q)} className="sm:ml-auto">
          <Trash2 className="size-4" aria-hidden />
          삭제
        </Button>
      </div>
    </li>
  )
}
