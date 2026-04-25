import { Moon, Sun, PenSquare } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useUIStore } from '../../store/useUIStore'
import { Button } from '../ui/Button'

interface NavbarProps {
  title?: string
  showNewNote?: boolean
}

export function Navbar({ title, showNewNote = true }: NavbarProps) {
  const navigate = useNavigate()
  const { isDarkMode, toggleDarkMode } = useUIStore()

  return (
    <header className="h-14 flex items-center justify-between px-4 md:px-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-20">
      <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
        {title}
      </h1>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200"
        >
          {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        {showNewNote && (
          <Button size="sm" onClick={() => navigate('/notes/new')}>
            <PenSquare size={15} />
            Nova nota
          </Button>
        )}
      </div>
    </header>
  )
}
