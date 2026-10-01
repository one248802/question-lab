import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SetupNotice } from './components/SetupNotice'
import { AuthProvider } from './contexts/AuthContext'
import { isSupabaseConfigured } from './lib/supabase'
import Home from './pages/Home'
import StudentBoard from './pages/student/StudentBoard'
import StudentJoin from './pages/student/StudentJoin'
import ClassesPage from './pages/teacher/ClassesPage'
import Dashboard from './pages/teacher/Dashboard'
import QuestionsPage from './pages/teacher/QuestionsPage'
import SettingsPage from './pages/teacher/SettingsPage'
import StudentsPage from './pages/teacher/StudentsPage'
import TeacherLayout from './pages/teacher/TeacherLayout'
import TeacherLogin from './pages/teacher/TeacherLogin'

export default function App() {
  if (!isSupabaseConfigured) return <SetupNotice />

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />

          <Route path="/student" element={<StudentJoin />} />
          <Route path="/student/board" element={<StudentBoard />} />

          <Route path="/teacher/login" element={<TeacherLogin />} />
          <Route path="/teacher" element={<TeacherLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="classes" element={<ClassesPage />} />
            <Route path="questions" element={<QuestionsPage />} />
            <Route path="students" element={<StudentsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
