import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { SetupNotice } from './components/SetupNotice'
import { Spinner } from './components/ui'
import { AuthProvider } from './contexts/AuthContext'
import { isRecoveryRedirectPending } from './lib/authRedirect'
import { isSupabaseConfigured } from './lib/supabase'
import Home from './pages/Home'
import StudentBoard from './pages/student/StudentBoard'
import StudentJoin from './pages/student/StudentJoin'
import StudentMyQuestions from './pages/student/StudentMyQuestions'
import ActivitiesPage from './pages/teacher/ActivitiesPage'
import ClassesPage from './pages/teacher/ClassesPage'
import Dashboard from './pages/teacher/Dashboard'
import QuestionsPage from './pages/teacher/QuestionsPage'
import ResetPassword from './pages/teacher/ResetPassword'
import SettingsPage from './pages/teacher/SettingsPage'
import StudentsPage from './pages/teacher/StudentsPage'
import TeacherLayout from './pages/teacher/TeacherLayout'
import TeacherLogin from './pages/teacher/TeacherLogin'

// 분류 활동 화면은 학생이 활동을 열 때만 불러옵니다.
const StudentActivity = lazy(() => import('./pages/student/StudentActivity'))

/**
 * 비밀번호 재설정 링크로 들어왔는데 /reset-password 가 아닌 주소로 열린 경우(예: Redirect URL 미등록으로 Site URL 로 열림)
 * 첫 화면의 자동 이동(교사 대시보드 등)보다 먼저 재설정 화면으로 보냅니다. 링크의 # 값은 그대로 넘깁니다.
 */
function RecoveryGate({ children }: { children: ReactNode }) {
  const { pathname, hash } = useLocation()
  if (isRecoveryRedirectPending() && pathname !== '/reset-password') return <Navigate to={{ pathname: '/reset-password', hash }} replace />
  return children
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupNotice />

  return (
    <AuthProvider>
      <BrowserRouter>
        <RecoveryGate>
          <Routes>
            <Route path="/" element={<Home />} />

            <Route path="/student" element={<StudentJoin />} />
            <Route path="/student/board" element={<StudentBoard />} />
            <Route path="/student/my-questions" element={<StudentMyQuestions />} />
            <Route
              path="/student/activity/:activityId"
              element={
                <Suspense fallback={<Spinner />}>
                  <StudentActivity />
                </Suspense>
              }
            />

            <Route path="/teacher/login" element={<TeacherLogin />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/teacher" element={<TeacherLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="classes" element={<ClassesPage />} />
              <Route path="questions" element={<QuestionsPage />} />
              <Route path="activities" element={<ActivitiesPage />} />
              <Route path="students" element={<StudentsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RecoveryGate>
      </BrowserRouter>
    </AuthProvider>
  )
}
