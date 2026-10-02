const MESSAGES: Record<string, string> = {
  CLASS_NOT_FOUND: '클래스 코드를 다시 확인해 주세요.',
  NAME_MISMATCH: '이 번호는 다른 이름으로 들어와 있어요. 선생님께 알려 주세요.',
  INVALID_NUMBER: '번호를 확인해 주세요. (1~99)',
  INVALID_NAME: '이름을 확인해 주세요.',
  INVALID_CONTENT: '질문은 1~300자로 써 주세요.',
  TOO_FAST: '잠깐! 조금 뒤에 다시 올려 주세요.',
  NOT_JOINED: '다시 입장해 주세요.',
  QUESTION_NOT_FOUND: '질문을 찾을 수 없어요.',
  VOTING_NOT_STARTED: '투표가 아직 시작되지 않았어요.',
  VOTING_CLOSED: '투표가 종료되었습니다.',
  INVALID_VOTING_TRANSITION: '투표 상태를 바꿀 수 없어요. 새로고침해 주세요.',
  VOTE_LIMIT_REACHED: '투표할 수 있는 개수를 다 썼어요.',
  SELF_VOTE_NOT_ALLOWED: '내 질문에는 투표할 수 없어요.',
  VOTE_CHANGE_NOT_ALLOWED: '이번 투표는 바꿀 수 없어요.',
  STUDENT_ONLY: '학생 입장 화면에서 들어와 주세요.',
  FORBIDDEN: '권한이 없어요.',
  'Invalid login credentials': '이메일 또는 비밀번호가 맞지 않아요.',
  'Email not confirmed': '이메일 인증을 먼저 완료해 주세요.',
  'User already registered': '이미 가입된 이메일이에요.',
  'Anonymous sign-ins are disabled': 'Supabase에서 익명 로그인(Anonymous Sign-ins)을 켜 주세요.',
}

/** Supabase/Postgres 오류를 사용자에게 보여줄 한국어 문장으로 바꿉니다. */
export function toMessage(error: unknown): string {
  const raw =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : ''
  for (const key of Object.keys(MESSAGES)) {
    if (raw.includes(key)) return MESSAGES[key]
  }
  if (raw.includes('Failed to fetch')) return '인터넷 연결을 확인해 주세요.'
  if (raw.includes('Password should be')) return '비밀번호는 6자 이상이어야 해요.'
  return raw ? `문제가 생겼어요: ${raw}` : '문제가 생겼어요. 다시 시도해 주세요.'
}
