import { Routes, Route, Navigate } from 'react-router-dom'
import { DashboardLayout } from './layouts/DashboardLayout'
import { FilesPage } from './pages/FilesPage'
import { ViewerPage } from './pages/ViewerPage'
import { ReviewPage } from './pages/ReviewPage'
import { ExportPage } from './pages/ExportPage'

function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route path="/" element={<FilesPage />} />
        <Route path="/viewer" element={<ViewerPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/export" element={<ExportPage />} />
        {/* Redirect old routes */}
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/analytics" element={<Navigate to="/viewer" replace />} />
        <Route path="/methodology" element={<Navigate to="/viewer" replace />} />
        <Route path="/exports" element={<Navigate to="/export" replace />} />
      </Route>
    </Routes>
  )
}

export default App
