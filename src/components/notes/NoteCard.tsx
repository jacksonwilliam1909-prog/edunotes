import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star, Pin, MoreVertical, Trash2, BookOpen } from 'lucide-react'
import { Card } from '../ui/Card'
import { ConfirmModal } from '../ui/Modal'
import { useNotes } from '../../hooks/useNotes'
import { formatRelativeDate, truncate, extractTextFromTiptap } from '../../lib/utils'
import type { Note } from '../../types'

interface NoteCardProps {
  note: Note
}

export function NoteCard({ note }: NoteCardProps) {
  const navigate = useNavigate()
  const { toggleFavorite, togglePin, deleteNote } = useNotes()
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const preview = truncate(extractTextFromTiptap(note.content), 120)

  const handleDelete = async () => {
    setIsDeleting(true)
    await deleteNote(note.id)
    setIsDeleting(false)
    setShowDeleteConfirm(false)
  }

  return (
    <>
      <Card
        hoverable
        onClick={() => navigate(`/notes/${note.id}`)}
        className="p-4 relative group"
      >
        {/* Pin & Favorite badges */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {note.is_pinned && (
              <span className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded-md font-medium">
                <Pin size={10} />
                Fixada
              </span>
            )}
            {note.notebook && (
              <span
                className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md font-medium"
                style={{
                  backgroundColor: `${note.notebook.color}20`,
                  color: note.notebook.color,
                }}
              >
                <BookOpen size={10} />
                {note.notebook.name}
              </span>
            )}
          </div>

          {/* Actions */}
          <div
            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => toggleFavorite(note)}
              className={`p-1.5 rounded-lg transition-colors ${
                note.is_favorite
                  ? 'text-amber-500'
                  : 'text-gray-400 hover:text-amber-500'
              }`}
            >
              <Star size={15} fill={note.is_favorite ? 'currentColor' : 'none'} />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <MoreVertical size={15} />
              </button>
              {showMenu && (
                <div
                  className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10"
                  onMouseLeave={() => setShowMenu(false)}
                >
                  <button
                    onClick={() => { togglePin(note); setShowMenu(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <Pin size={14} />
                    {note.is_pinned ? 'Desafixar' : 'Fixar nota'}
                  </button>
                  <button
                    onClick={() => { setShowDeleteConfirm(true); setShowMenu(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    <Trash2 size={14} />
                    Excluir nota
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-1.5 line-clamp-1">
          {note.title || 'Nota sem título'}
        </h3>
        {preview && (
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{preview}</p>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {formatRelativeDate(note.updated_at)}
        </p>
      </Card>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Excluir nota"
        description={`Tem certeza que deseja excluir "${note.title || 'Nota sem título'}"? Esta ação não pode ser desfeita.`}
        isLoading={isDeleting}
      />
    </>
  )
}
