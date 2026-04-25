import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil } from 'lucide-react'
import { Layout } from '../../components/layout/Layout'
import { NoteList } from '../../components/notes/NoteList'
import { NotebookForm } from '../../components/notebooks/NotebookForm'
import { Button } from '../../components/ui/Button'
import { useNotesStore } from '../../store/useNotesStore'
import { useNotes } from '../../hooks/useNotes'
import { useNotebooks } from '../../hooks/useNotebooks'
import type { Notebook } from '../../types'

export function NotebookDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const notebooks = useNotesStore((s) => s.notebooks)
  const notes = useNotesStore((s) => s.notes)
  const { fetchNotes, isLoading } = useNotes()
  const { fetchNotebooks } = useNotebooks()
  const [isFormOpen, setIsFormOpen] = useState(false)

  const notebook = notebooks.find((nb) => nb.id === id) as Notebook | undefined

  useEffect(() => {
    if (id) fetchNotes(id)
    if (!notebook) fetchNotebooks()
  }, [id, fetchNotes, fetchNotebooks, notebook])

  const handleNewNote = () => navigate(`/notes/new?notebook=${id}`)

  if (!notebook && !isLoading) {
    return (
      <Layout title="Caderno não encontrado">
        <div className="flex flex-col items-center py-16">
          <p className="text-gray-500 dark:text-gray-400 mb-4">Caderno não encontrado.</p>
          <Button variant="secondary" onClick={() => navigate('/notebooks')}>
            <ArrowLeft size={16} />
            Voltar para cadernos
          </Button>
        </div>
      </Layout>
    )
  }

  return (
    <Layout title={notebook?.name ?? 'Carregando...'}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/notebooks')}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          {notebook && (
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
              style={{ backgroundColor: `${notebook.color}20` }}
            >
              {notebook.icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
              {notebook?.name ?? 'Caderno'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {notes.length} {notes.length === 1 ? 'nota' : 'notas'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setIsFormOpen(true)}>
              <Pencil size={14} />
            </Button>
            <Button size="sm" onClick={handleNewNote}>
              <Plus size={16} />
              Nova nota
            </Button>
          </div>
        </div>

        <NoteList
          notes={notes}
          isLoading={isLoading}
          onNewNote={handleNewNote}
          emptyTitle="Caderno vazio"
          emptyDescription="Adicione notas a este caderno para organizar seus estudos."
        />
      </div>

      {notebook && (
        <NotebookForm
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          notebook={notebook}
        />
      )}
    </Layout>
  )
}
