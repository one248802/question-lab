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
  show_vote_results: boolean
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
  question_scope: string
  question_type: string
  is_hidden: boolean
  created_at: string
  student: { student_number: number; name: string } | null
  vote_count: number
}

/** 학생 화면용 질문 (작성자 정보 없음) */
export interface BoardQuestion {
  id: string
  content: string
  question_scope: string
  question_type: string
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
  show_vote_results: boolean
}

export interface CategoryOption {
  code: string
  label: string
  sort_order: number
}
