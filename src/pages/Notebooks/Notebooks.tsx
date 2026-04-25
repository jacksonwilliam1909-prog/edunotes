import { useEffect, useState } from 'react'
import { BookOpen, Plus } from 'lucide-react'
import { Layout } from '../../components/layout/Layout'
import { NotebookCard } from '../../components/notebooks/NotebookCard'
import { NotebookForm } from '../../components/notebooks/NotebookForm'
import { EmptyState } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useNotesStore } from '../../store/useNotesStore'
import { useNotebooks } from '../../hooks/useNotebooks'
import type { Notebook } from '../../types'

function NotebookSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
      <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-xl mb-3" />
      <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded w-full mb-3" />
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
    </div>
  )
}

export function Notebooks() {
  const notebooks = useNotesStore((s) => s.notebooks)
  const { fetchNotebooks, isLoading } = useNotebooks()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingNotebook, setEditingNotebook] = useState<Notebook | undefined>()

  useEffect(() => {
    fetchNotebooks()
  }, [fetchNotebooks])

  const handleEdit = (notebook: Notebook) => {
    setEditingNotebook(notebook)
    setIsFormOpen(true)
  }

  const handleClose = () => {
    setIsFormOpen(false)
    setEditingNotebook(undefined)
  }

  return (
    <Layout title="Cadernos">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Meus cadernos</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {notebooks.length} {notebooks.length === 1 ? 'caderno' : 'cadernos'}
            </p>
          </div>
          <Button onClick={() => setIsFormOpen(true)} size="sm">
            <Plus size={16} />
            Novo caderno
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <NotebookSkeleton key={i} />)}
          </div>
        ) : notebooks.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Nenhum caderno ainda"
            description="Organize suas notas criando cadernos por matéria ou tema."
            action={
              <Button onClick={() => setIsFormOpen(true)} size="sm">
                <Plus size={16} />
                Criar caderno
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {notebooks.map((nb) => (
              <NotebookCard key={nb.id} notebook={nb} onEdit={handleEdit} />
            ))}
          </div>
        )}
      </div>

      <NotebookForm
        isOpen={isFormOpen}
        onClose={handleClose}
        notebook={editingNotebook}
      />
    </Layout>
  )
}
