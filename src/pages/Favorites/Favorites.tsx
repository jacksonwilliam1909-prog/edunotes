import { useEffect } from 'react'
import { Star } from 'lucide-react'
import { Layout } from '../../components/layout/Layout'
import { NoteList } from '../../components/notes/NoteList'
import { useNotesStore } from '../../store/useNotesStore'
import { useNotes } from '../../hooks/useNotes'
import { useNavigate } from 'react-router-dom'

export function Favorites() {
  const navigate = useNavigate()
  const allNotes = useNotesStore((s) => s.notes)
  const { fetchNotes, isLoading } = useNotes()

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  const favorites = allNotes.filter((n) => n.is_favorite)

  return (
    <Layout title="Favoritos">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Star size={20} className="text-amber-500" fill="currentColor" />
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Notas favoritas</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {favorites.length} {favorites.length === 1 ? 'nota' : 'notas'} favoritadas
            </p>
          </div>
        </div>

        <NoteList
          notes={favorites}
          isLoading={isLoading}
          onNewNote={() => navigate('/notes/new')}
          emptyTitle="Nenhuma nota favorita"
          emptyDescription='Marque notas com ⭐ para acessá-las rapidamente aqui.'
        />
      </div>
    </Layout>
  )
}
