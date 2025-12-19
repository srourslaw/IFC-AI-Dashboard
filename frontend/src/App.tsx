import { Routes, Route, Navigate } from 'react-router-dom'
import { DashboardLayout } from './layouts/DashboardLayout'
import { FilesPage } from './pages/FilesPage'
import { ViewerPage } from './pages/ViewerPage'
import { ReviewPage } from './pages/ReviewPage'
import { ExportPage } from './pages/ExportPage'
import { ErectionSequenceBuilderPage } from './pages/ErectionSequenceBuilderPage'
import LoginPage from './pages/LoginPage'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <Routes>
      {/* Public route - Login */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected routes - require authentication */}
      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<FilesPage />} />
        <Route path="/viewer" element={<ViewerPage />} />
        <Route path="/methodology" element={<ErectionSequenceBuilderPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/export" element={<ExportPage />} />
        {/* Redirect old routes */}
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/analytics" element={<Navigate to="/viewer" replace />} />
        <Route path="/exports" element={<Navigate to="/export" replace />} />
      </Route>

      {/* Catch-all redirect to login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
