import { useEffect, useState } from 'react'
import { Heart, Play, RotateCcw, Settings, Square, UserRound } from 'lucide-react'
import { NoClassYet } from '../../components/ClassPicker'
import { Button, Card, ChoiceChips, ErrorBox, Input, Label, PageTitle, Spinner, Toggle } from '../../components/ui'
import { useTeacher } from '../../contexts/TeacherContext'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { ClassRoom, VotingStatus } from '../../lib/types'

type VoteSettingsPatch = Partial<
  Pick<
    ClassRoom,
    | 'max_votes'
    | 'allow_self_vote'
    | 'voting_status'
    | 'allow_vote_change'
    | 'show_results_during_voting'
    | 'show_results_after_voting'
  >
>

const MAX_VOTES_PRESETS = [1, 2, 3, 5]
const MAX_VOTES_LIMIT = 20

/** 상태별 설명과 다음 단계 버튼 (before → open → closed, closed → open 다시 열기) */
const VOTING_STEPS: Record<VotingStatus, { text: string; next: VotingStatus; action: string }> = {
  before: { text: '투표 시작 전이에요 (투표 불가, 결과 비공개)', next: 'open', action: '투표 시작' },
  open: { text: '투표 중이에요', next: 'closed', action: '투표 종료' },
  closed: { text: '투표가 종료되었어요 (투표·취소 불가)', next: 'open', action: '투표 다시 열기' },
}

export default function SettingsPage() {
  const { classes, loading, reload, profile, reloadProfile } = useTeacher()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [displayName, setDisplayName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [savedName, setSavedName] = useState(false)

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '')
  }, [profile])

  const updateClass = async (c: ClassRoom, patch: VoteSettingsPatch) => {
    setBusyId(c.id)
    setError(null)
    setNotice(null)
    const { error: err } = await supabase.from('classes').update(patch).eq('id', c.id)
    if (err) setError(toMessage(err))
    await reload()
    setBusyId(null)
  }

  // 투표 초기화: 이 학급의 표만 지우고 질문과 투표 설정은 그대로 둡니다. 권한은 서버(RPC)에서 확인합니다.
  const resetVotes = async (c: ClassRoom) => {
    const ok = window.confirm(
      `「${c.name}」의 투표를 모두 초기화할까요?\n\n학생들이 한 표가 모두 지워지고 되돌릴 수 없어요.\n질문과 투표 설정(투표 상태, 투표 개수, 공개 설정 등)은 그대로 유지돼요.`,
    )
    if (!ok) return
    setBusyId(c.id)
    setError(null)
    setNotice(null)
    const { data, error: err } = await supabase.rpc('reset_class_votes', { p_class_id: c.id })
    if (err) setError(toMessage(err))
    else setNotice(`「${c.name}」의 투표 ${data ?? 0}표를 초기화했어요.`)
    setBusyId(null)
  }

  const saveName = async () => {
    if (!profile) return
    setSavingName(true)
    setError(null)
    const { error: err } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() || null })
      .eq('id', profile.id)
    setSavingName(false)
    if (err) return setError(toMessage(err))
    setSavedName(true)
    window.setTimeout(() => setSavedName(false), 1500)
    await reloadProfile()
  }

  if (loading) return <Spinner />

  return (
    <>
      <PageTitle icon={<Settings className="size-9 text-peach-ink" />} title="설정" />
      <div className="flex flex-col gap-6">
        <ErrorBox message={error} />
        {notice && (
          <p role="status" className="rounded-2xl border-2 border-[#6fc9a4] bg-mint-soft px-4 py-3 text-lg font-bold text-mint-ink">
            {notice}
          </p>
        )}

        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-display text-2xl">
            <Heart className="size-7 text-pink-ink" aria-hidden />
            투표 설정
          </h2>
          <p className="mb-4 text-ink-soft">학급마다 따로 정해요. 선생님 화면에서는 투표 수가 항상 보여요.</p>
          {classes.length === 0 ? (
            <NoClassYet />
          ) : (
            <ul className="flex flex-col divide-y-2 divide-line">
              {classes.map((c) => (
                <ClassVoteSettings
                  key={`${c.id}:${c.max_votes}`}
                  c={c}
                  busy={busyId === c.id}
                  onChange={(patch) => updateClass(c, patch)}
                  onReset={() => resetVotes(c)}
                />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-display text-2xl">
            <UserRound className="size-7 text-sky-ink" aria-hidden />내 정보
          </h2>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <Label htmlFor="display-name">이름</Label>
              <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} placeholder="김선생" />
            </div>
            <Button size="lg" variant="sky" onClick={saveName} loading={savingName}>
              {savedName ? '저장됨!' : '저장'}
            </Button>
          </div>
          <p className="mt-3 text-ink-soft">{profile?.email}</p>
        </Card>
      </div>
    </>
  )
}

function ClassVoteSettings({
  c,
  busy,
  onChange,
  onReset,
}: {
  c: ClassRoom
  busy: boolean
  onChange: (patch: VoteSettingsPatch) => Promise<void>
  onReset: () => Promise<void>
}) {
  const step = VOTING_STEPS[c.voting_status]
  const isPreset = MAX_VOTES_PRESETS.includes(c.max_votes)
  const [custom, setCustom] = useState(!isPreset)
  const [customValue, setCustomValue] = useState(String(c.max_votes))

  const saveCustom = () => {
    const n = Number(customValue)
    if (!Number.isInteger(n) || n < 1 || n > MAX_VOTES_LIMIT) return setCustomValue(String(c.max_votes))
    if (n !== c.max_votes) onChange({ max_votes: n })
  }

  const toggles: Array<{ key: keyof VoteSettingsPatch & string; label: string; hint: string }> = [
    { key: 'allow_self_vote', label: '내 질문에 투표', hint: '학생이 자기 질문에 투표할 수 있어요.' },
    { key: 'allow_vote_change', label: '투표 바꾸기', hint: '투표 중에 표를 취소하고 다시 고를 수 있어요.' },
    { key: 'show_results_during_voting', label: '투표 중 결과 공개', hint: '투표하는 동안 학생 화면에 투표 수가 보여요.' },
    { key: 'show_results_after_voting', label: '투표 종료 후 결과 공개', hint: '투표를 마치면 학생 화면에 투표 수가 보여요.' },
  ]

  return (
    <li className="flex flex-col gap-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xl font-bold">{c.name}</p>
          <p className="text-ink-soft">{step.text}</p>
        </div>
        <Button
          variant={c.voting_status === 'open' ? 'danger' : 'mint'}
          loading={busy}
          onClick={() => onChange({ voting_status: step.next })}
        >
          {c.voting_status === 'open' ? <Square className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}
          {step.action}
        </Button>
      </div>

      <div>
        <p className="mb-2 text-lg font-bold">1인당 투표 개수</p>
        <div className="flex flex-wrap items-center gap-2">
          <ChoiceChips<string>
            size="sm"
            options={[...MAX_VOTES_PRESETS.map((n) => ({ value: String(n), label: `${n}개` })), { value: 'custom', label: '직접 입력' }]}
            value={custom ? 'custom' : String(c.max_votes)}
            onChange={(v) => {
              if (v === 'custom') return setCustom(true)
              setCustom(false)
              if (Number(v) !== c.max_votes) onChange({ max_votes: Number(v) })
            }}
          />
          {custom && (
            <Input
              type="number"
              min={1}
              max={MAX_VOTES_LIMIT}
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onBlur={saveCustom}
              onKeyDown={(e) => e.key === 'Enter' && saveCustom()}
              aria-label={`${c.name} 1인당 투표 개수`}
              className="w-24"
            />
          )}
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          1~{MAX_VOTES_LIMIT}개. 개수를 줄여도 이미 한 표는 지워지지 않고, 학생이 줄인 개수까지 취소할 수 있어요.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {toggles.map((t) => (
          <li key={t.key} className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
            <div className="min-w-0">
              <p className="font-bold">{t.label}</p>
              <p className="text-sm text-ink-soft">{t.hint}</p>
            </div>
            <Toggle
              label={`${c.name} ${t.label}`}
              checked={Boolean(c[t.key])}
              disabled={busy}
              onChange={(next) => onChange({ [t.key]: next })}
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-line px-4 py-3">
        <p className="text-sm text-ink-soft">학생들이 한 표를 모두 지워요. 질문과 위 설정은 그대로예요.</p>
        <Button size="sm" variant="danger" disabled={busy} onClick={onReset}>
          <RotateCcw className="size-4" aria-hidden />
          투표 초기화
        </Button>
      </div>
    </li>
  )
}
