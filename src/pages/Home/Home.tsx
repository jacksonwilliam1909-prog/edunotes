import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../../components/layout/Layout'
import { NoteList } from '../../components/notes/NoteList'
import { SearchBar } from '../../components/search/SearchBar'
import { useNotesStore } from '../../store/useNotesStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useNotes } from '../../hooks/useNotes'
import { useState } from 'react'

export function Home() {
  const navigate = useNavigate()
  const { profile } = useAuthStore()
  const notes = useNotesStore((s) => s.notes)
  const { fetchRecentNotes, isLoading } = useNotes()
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchRecentNotes()
  }, [fetchRecentNotes])

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query)}`)
  }

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Bom dia'
    if (hour < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  return (
    <Layout title="Início">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {greeting()}{profile ? `, ${profile.name.split(' ')[0]}` : ''}! 👋
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            O que vamos estudar hoje?
          </p>
        </div>

        <SearchBar
          value={searchQuery}
          onChange={handleSearch}
          placeholder="Buscar em todas as notas..."
        />

        <div>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Notas recentes
          </h3>
          <NoteList
            notes={notes}
            isLoading={isLoading}
            onNewNote={() => navigate('/notes/new')}
            emptyTitle="Nenhuma nota ainda"
            emptyDescription="Comece criando sua primeira nota de estudo."
          />
        </div>
      </div>
    </Layout>
  )
}
