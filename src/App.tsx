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
import StudentQuestionGallery from './pages/student/StudentQuestionGallery'
import StudentSpaceHome from './pages/student/StudentSpaceHome'
import StudentThoughtTopic from './pages/student/StudentThoughtTopic'
import StudentThoughtTopics from './pages/student/StudentThoughtTopics'
import ActivitiesPage from './pages/teacher/ActivitiesPage'
import ClassesPage from './pages/teacher/ClassesPage'
import QuestionDashboardPage from './pages/teacher/QuestionDashboardPage'
import QuestionSettingsPage from './pages/teacher/QuestionSettingsPage'
import QuestionsPage from './pages/teacher/QuestionsPage'
import ResetPassword from './pages/teacher/ResetPassword'
import SettingsPage from './pages/teacher/SettingsPage'
import StudentQuestionsPage from './pages/teacher/StudentQuestionsPage'
import StudentsPage from './pages/teacher/StudentsPage'
import TeacherLayout from './pages/teacher/TeacherLayout'
import TeacherLogin from './pages/teacher/TeacherLogin'
import ThoughtSettingsPage from './pages/teacher/ThoughtSettingsPage'
import ThoughtTopicsPage from './pages/teacher/ThoughtTopicsPage'

// 분류 활동 화면은 학생이 활동을 열 때만 불러옵니다.
const StudentActivity = lazy(() => import('./pages/student/StudentActivity'))

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
            <Route path="/student/home" element={<StudentSpaceHome />} />
            <Route path="/student/board" element={<StudentBoard />} />
            <Route path="/student/my-questions" element={<StudentMyQuestions />} />
            <Route path="/student/question-gallery" element={<StudentQuestionGallery />} />
            <Route path="/student/thoughts" element={<StudentThoughtTopics />} />
            <Route path="/student/thoughts/:topicId" element={<StudentThoughtTopic />} />
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
              <Route index element={<Navigate to="classes" replace />} />
              <Route path="classes" element={<ClassesPage />} />
              <Route path="questions" element={<QuestionsPage />} />
              <Route path="question-dashboard" element={<QuestionDashboardPage />} />
              <Route path="question-settings" element={<QuestionSettingsPage />} />
              <Route path="activities" element={<ActivitiesPage />} />
              <Route path="thoughts" element={<ThoughtTopicsPage />} />
              <Route path="thought-settings" element={<ThoughtSettingsPage />} />
              <Route path="students" element={<StudentsPage />} />
              <Route path="students/:studentId" element={<StudentQuestionsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RecoveryGate>
      </BrowserRouter>
    </AuthProvider>
  )
}
