/** 투표 상태: 시작 전 → 투표 중 → 종료 (종료 후 다시 열 수 있음) */
export type VotingStatus = 'before' | 'open' | 'closed'

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  created_at: string
}

export interface ClassRoom {
  id: string
  teacher_id: string
  name: string
  grade: number | null
  class_code: string
  /** 1인당 투표 가능 개수 */
  max_votes: number
  allow_self_vote: boolean
  voting_status: VotingStatus
  allow_vote_change: boolean
  show_results_during_voting: boolean
  show_results_after_voting: boolean
  created_at: string
}

export interface ClassStats {
  class_id: string
  student_count: number
  question_count: number
  today_question_count: number
}

export interface Student {
  id: string
  class_id: string
  student_number: number
  name: string
  created_at: string
}

/** 교사 화면용 질문 (작성자 / 투표 수 포함) */
export interface TeacherQuestion {
  id: string
  class_id: string
  student_id: string
  content: string
  is_hidden: boolean
  created_at: string
  student: { student_number: number; name: string } | null
  vote_count: number
}

/** 교사 질문 폴더 (질문 ↔ 폴더 연결 방식, 한 질문이 여러 폴더에 들어갈 수 있음) */
export interface QuestionFolder {
  id: string
  class_id: string
  name: string
  created_at: string
  /** 이 폴더에 든 질문 id */
  question_ids: string[]
}

/** 교사 질문 화면 폴더 필터에서 「폴더 없음」(어느 폴더에도 들지 않은 질문)을 뜻하는 값 */
export const NO_FOLDER_FILTER = 'no-folder'

/** 학생 화면용 질문 (작성자 정보 없음) */
export interface BoardQuestion {
  id: string
  content: string
  created_at: string
  is_mine: boolean
  voted_by_me: boolean
  /** 투표 결과 비공개면 null */
  vote_count: number | null
}

/** 학생 입장 정보 */
export interface StudentContext {
  student_id: string
  student_number: number
  student_name: string
  class_id: string
  class_name: string
  grade: number | null
  max_votes: number
  allow_self_vote: boolean
  voting_status: VotingStatus
  allow_vote_change: boolean
  /** 지금 학생 화면에 투표 수를 보여 주는지 (투표 중/종료 후 설정을 반영한 값) */
  show_vote_counts: boolean
  /** 숨겨지지 않은 질문에 한 내 표 수 */
  my_vote_count: number
}

/** 질문 분류 활동 (교사 화면) */
export interface ClassificationActivity {
  id: string
  class_id: string
  title: string
  area_names: string[]
  is_open: boolean
  created_at: string
  classification_activity_questions: Array<{ question_id: string; sort_order: number }>
}

/** 학생에게 공개된 분류 활동 목록의 한 줄 */
export interface OpenActivity {
  id: string
  title: string
  area_count: number
  question_count: number
  created_at: string
}

/** 학생이 받는 분류 활동 (질문은 id 와 내용만) */
export interface ActivityForStudent {
  id: string
  title: string
  area_names: string[]
  questions: Array<{ id: string; content: string }>
}
