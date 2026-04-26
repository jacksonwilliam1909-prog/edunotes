import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useAuthStore } from './store/useAuthStore'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { Login } from './pages/Auth/Login'
import { Register } from './pages/Auth/Register'
import { Home } from './pages/Home/Home'
import { Notebooks } from './pages/Notebooks/Notebooks'
import { NotebookDetail } from './pages/Notebooks/NotebookDetail'
import { NoteEditorPage } from './pages/Note/NoteEditor'
import { Search } from './pages/Search/Search'
import { Favorites } from './pages/Favorites/Favorites'

export default function App() {
  const initialize = useAuthStore((s) => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <HashRouter>
      <Toaster position="top-right" richColors duration={3000} />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Home />} />
          <Route path="/notebooks" element={<Notebooks />} />
          <Route path="/notebooks/:id" element={<NotebookDetail />} />
          <Route path="/notes/:id" element={<NoteEditorPage />} />
          <Route path="/search" element={<Search />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/profile" element={<Navigate to="/" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
