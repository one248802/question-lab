import { useState } from 'react'
import { Heart, MessageSquareText, Play, RotateCcw, Settings, Square, Star } from 'lucide-react'
import { NoClassYet } from '../../components/ClassPicker'
import { Button, Card, ChoiceChips, ErrorBox, Input, PageTitle, Spinner, Toggle } from '../../components/ui'
import { useTeacher } from '../../contexts/TeacherContext'
import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { ClassRoom, ThoughtAuthorMode, VotingStatus } from '../../lib/types'

type VoteSettingsPatch = Partial<Pick<ClassRoom, 'max_votes' | 'allow_self_vote' | 'voting_status' | 'allow_vote_change' | 'show_results_during_voting' | 'show_results_after_voting'>>
type FeedbackSettingsPatch = Partial<Pick<ClassRoom, 'teacher_like_enabled' | 'teacher_comment_enabled'>>
type ThoughtSettingsPatch = Partial<Pick<ClassRoom, 'thought_sharing_enabled' | 'thought_author_mode'>>
type ClassSettingsPatch = VoteSettingsPatch & FeedbackSettingsPatch & ThoughtSettingsPatch

const MAX_VOTES_PRESETS = [1, 2, 3, 5]
const MAX_VOTES_LIMIT = 20
const VOTING_STEPS: Record<VotingStatus, { text: string; next: VotingStatus; action: string }> = {
  before: { text: '투표 시작 전이에요 (투표 불가, 결과 비공개)', next: 'open', action: '투표 시작' },
  open: { text: '투표 중이에요', next: 'closed', action: '투표 종료' },
  closed: { text: '투표가 종료되었어요 (투표·취소 불가)', next: 'open', action: '투표 다시 열기' },
}

export default function QuestionSettingsPage() {
  const { classes, loading, reload } = useTeacher()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const updateClass = async (c: ClassRoom, patch: ClassSettingsPatch) => {
    setBusyId(c.id)
    setError(null)
    setNotice(null)
    const { error: err } = await supabase.from('classes').update(patch).eq('id', c.id)
    if (err) setError(toMessage(err))
    await reload()
    setBusyId(null)
  }

  const resetVotes = async (c: ClassRoom) => {
    if (!window.confirm(`「${c.name}」의 질문 투표를 모두 초기화할까요?\n\n학생들이 한 표가 모두 지워지고 되돌릴 수 없어요.`)) return
    setBusyId(c.id)
    const { data, error: err } = await supabase.rpc('reset_class_votes', { p_class_id: c.id })
    if (err) setError(toMessage(err))
    else setNotice(`「${c.name}」의 투표 ${data ?? 0}표를 초기화했어요.`)
    setBusyId(null)
  }

  if (loading) return <Spinner />

  return (
    <>
      <PageTitle icon={<Settings className="size-9 text-sky-ink" />} title="질문 상자 설정" />
      <div className="flex flex-col gap-6">
        <ErrorBox message={error} />
        {notice && <p className="rounded-2xl border-2 border-[#6fc9a4] bg-mint-soft px-4 py-3 text-lg font-bold text-mint-ink">{notice}</p>}

        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-display text-2xl"><Heart className="size-7 text-pink-ink" aria-hidden />질문 투표 설정</h2>
          <p className="mb-4 text-ink-soft">질문 상자의 투표 수, 공개 여부, 투표 상태를 학급별로 정해요.</p>
          {classes.length === 0 ? <NoClassYet /> : (
            <ul className="flex flex-col divide-y-2 divide-line">
              {classes.map((c) => <ClassVoteSettings key={`${c.id}:${c.max_votes}`} c={c} busy={busyId === c.id} onChange={(patch) => updateClass(c, patch)} onReset={() => resetVotes(c)} />)}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-display text-2xl"><MessageSquareText className="size-7 text-lilac-ink" aria-hidden />질문 생각 나누기 설정</h2>
          <p className="mb-4 text-ink-soft">질문에 학생이 생각을 남길지, 학생끼리 작성자를 익명/실명 중 어떻게 볼지 정해요.</p>
          {classes.length === 0 ? <NoClassYet /> : (
            <ul className="flex flex-col divide-y-2 divide-line">
              {classes.map((c) => (
                <li key={`thought:${c.id}`} className="flex flex-col gap-3 py-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><p className="text-xl font-bold">{c.name}</p><p className="text-sm text-ink-soft">질문에 대한 자기 생각·친구 생각 나누기</p></div>
                    <Toggle label={`${c.name} 생각 나누기`} checked={c.thought_sharing_enabled} disabled={busyId === c.id} onChange={(next) => updateClass(c, { thought_sharing_enabled: next })} />
                  </div>
                  <div className="rounded-2xl bg-cream px-4 py-3">
                    <p className="mb-2 font-bold">학생 화면 작성자 표시</p>
                    <ChoiceChips<ThoughtAuthorMode>
                      size="sm"
                      options={[{ value: 'anonymous', label: '익명으로 보이기' }, { value: 'named', label: '번호·이름으로 보이기' }]}
                      value={c.thought_author_mode}
                      onChange={(next) => updateClass(c, { thought_author_mode: next })}
                    />
                    <p className="mt-2 text-sm text-ink-soft">선생님에게는 설정과 관계없이 작성자가 항상 보여요.</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-display text-2xl"><Star className="size-7 text-butter-ink" aria-hidden />교사 피드백 설정</h2>
          <p className="mb-4 text-ink-soft">질문에 남기는 선생님 좋아요와 코멘트를 각각 켜고 끌 수 있어요.</p>
          {classes.length === 0 ? <NoClassYet /> : (
            <ul className="flex flex-col divide-y-2 divide-line">
              {classes.map((c) => (
                <li key={`feedback:${c.id}`} className="flex flex-col gap-3 py-5">
                  <p className="text-xl font-bold">{c.name}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
                      <div><p className="font-bold">선생님 좋아요</p><p className="text-sm text-ink-soft">질문에 별표를 남겨요.</p></div>
                      <Toggle label={`${c.name} 선생님 좋아요`} checked={c.teacher_like_enabled} disabled={busyId === c.id} onChange={(next) => updateClass(c, { teacher_like_enabled: next })} />
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
                      <div><p className="font-bold">선생님 코멘트</p><p className="text-sm text-ink-soft">질문마다 글 피드백을 남겨요.</p></div>
                      <Toggle label={`${c.name} 선생님 코멘트`} checked={c.teacher_comment_enabled} disabled={busyId === c.id} onChange={(next) => updateClass(c, { teacher_comment_enabled: next })} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

function ClassVoteSettings({ c, busy, onChange, onReset }: { c: ClassRoom; busy: boolean; onChange: (patch: VoteSettingsPatch) => Promise<void>; onReset: () => Promise<void> }) {
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
    { key: 'show_results_during_voting', label: '투표 중 결과 공개', hint: '투표 중 학생 화면에 투표 수가 보여요.' },
    { key: 'show_results_after_voting', label: '투표 종료 후 결과 공개', hint: '투표 종료 뒤 학생 화면에 투표 수가 보여요.' },
  ]

  return (
    <li className="flex flex-col gap-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xl font-bold">{c.name}</p><p className="text-ink-soft">{step.text}</p></div>
        <Button variant={c.voting_status === 'open' ? 'danger' : 'mint'} loading={busy} onClick={() => onChange({ voting_status: step.next })}>
          {c.voting_status === 'open' ? <Square className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}{step.action}
        </Button>
      </div>
      <div>
        <p className="mb-2 text-lg font-bold">1인당 투표 개수</p>
        <div className="flex flex-wrap items-center gap-2">
          <ChoiceChips<string>
            size="sm"
            options={[...MAX_VOTES_PRESETS.map((n) => ({ value: String(n), label: `${n}개` })), { value: 'custom', label: '직접 입력' }]}
            value={custom ? 'custom' : String(c.max_votes)}
            onChange={(v) => { if (v === 'custom') return setCustom(true); setCustom(false); if (Number(v) !== c.max_votes) onChange({ max_votes: Number(v) }) }}
          />
          {custom && <Input type="number" min={1} max={MAX_VOTES_LIMIT} value={customValue} onChange={(e) => setCustomValue(e.target.value)} onBlur={saveCustom} onKeyDown={(e) => e.key === 'Enter' && saveCustom()} className="w-24" />}
        </div>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {toggles.map((t) => (
          <li key={t.key} className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
            <div><p className="font-bold">{t.label}</p><p className="text-sm text-ink-soft">{t.hint}</p></div>
            <Toggle label={`${c.name} ${t.label}`} checked={Boolean(c[t.key])} disabled={busy} onChange={(next) => onChange({ [t.key]: next })} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-line px-4 py-3">
        <p className="text-sm text-ink-soft">학생들이 한 질문 투표를 모두 지워요.</p>
        <Button size="sm" variant="danger" disabled={busy} onClick={onReset}><RotateCcw className="size-4" aria-hidden />투표 초기화</Button>
      </div>
    </li>
  )
}
