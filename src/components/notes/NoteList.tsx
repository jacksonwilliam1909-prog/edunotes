import { FileText } from 'lucide-react'
import { NoteCard } from './NoteCard'
import { EmptyState } from '../ui/Card'
import { Button } from '../ui/Button'
import type { Note } from '../../types'

interface NoteListProps {
  notes: Note[]
  isLoading?: boolean
  onNewNote?: () => void
  emptyTitle?: string
  emptyDescription?: string
}

function NoteSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-3" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
    </div>
  )
}

export function NoteList({
  notes,
  isLoading,
  onNewNote,
  emptyTitle = 'Nenhuma nota ainda',
  emptyDescription = 'Crie sua primeira nota para começar.',
}: NoteListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <NoteSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (notes.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={emptyTitle}
        description={emptyDescription}
        action={
          onNewNote && (
            <Button onClick={onNewNote} size="sm">
              Nova nota
            </Button>
          )
        }
      />
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}
    </div>
  )
}
