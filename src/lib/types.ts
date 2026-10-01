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
  voting_open: boolean
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
  voting_open: boolean
  allow_vote_change: boolean
  /** 지금 학생 화면에 투표 수를 보여 주는지 (투표 중/종료 후 설정을 반영한 값) */
  show_vote_counts: boolean
  /** 숨겨지지 않은 질문에 한 내 표 수 */
  my_vote_count: number
}
