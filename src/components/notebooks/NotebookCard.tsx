import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { Card } from '../ui/Card'
import { ConfirmModal } from '../ui/Modal'
import { useNotebooks } from '../../hooks/useNotebooks'
import { formatRelativeDate } from '../../lib/utils'
import type { Notebook } from '../../types'

interface NotebookCardProps {
  notebook: Notebook
  onEdit?: (notebook: Notebook) => void
}

export function NotebookCard({ notebook, onEdit }: NotebookCardProps) {
  const navigate = useNavigate()
  const { deleteNotebook } = useNotebooks()
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    await deleteNotebook(notebook.id)
    setIsDeleting(false)
    setShowDeleteConfirm(false)
  }

  return (
    <>
      <Card
        hoverable
        onClick={() => navigate(`/notebooks/${notebook.id}`)}
        className="p-4 relative group"
      >
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
            style={{ backgroundColor: `${notebook.color}20` }}
          >
            {notebook.icon}
          </div>
          <div
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <MoreVertical size={15} />
            </button>
            {showMenu && (
              <div
                className="absolute right-4 top-14 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10"
                onMouseLeave={() => setShowMenu(false)}
              >
                <button
                  onClick={() => { onEdit?.(notebook); setShowMenu(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <Pencil size={14} />
                  Editar
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(true); setShowMenu(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <Trash2 size={14} />
                  Excluir
                </button>
              </div>
            )}
          </div>
        </div>

        <div
          className="w-full h-1 rounded-full mb-3"
          style={{ backgroundColor: notebook.color }}
        />

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-1 truncate">
          {notebook.name}
        </h3>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Atualizado {formatRelativeDate(notebook.updated_at)}
        </p>
      </Card>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Excluir caderno"
        description={`Tem certeza que deseja excluir "${notebook.name}"? As notas dentro dele não serão excluídas.`}
        isLoading={isDeleting}
      />
    </>
  )
}
