import { NavLink } from 'react-router-dom'
import { BookOpen, Home, Star, Search, NotebookPen, PenSquare, LogOut, Moon, Sun } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useUIStore } from '../../store/useUIStore'
import { getInitials } from '../../lib/utils'
import { toast } from 'sonner'

const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Início' },
  { to: '/notebooks', icon: BookOpen, label: 'Cadernos' },
  { to: '/search', icon: Search, label: 'Buscar' },
  { to: '/favorites', icon: Star, label: 'Favoritos' },
]

export function Sidebar() {
  const { profile, signOut } = useAuthStore()
  const { isDarkMode, toggleDarkMode } = useUIStore()

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch {
      toast.error('Erro ao sair da conta')
    }
  }

  return (
    <aside className="flex flex-col w-[260px] h-screen fixed left-0 top-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 z-30">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <NotebookPen size={16} className="text-white" />
          </div>
          <span className="text-base font-bold text-gray-900 dark:text-white tracking-tight">
            EduNotes
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        <NavLink
          to="/notes/new"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-all duration-200 mt-2"
        >
          <PenSquare size={18} />
          Nova Nota
        </NavLink>
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-gray-200 dark:border-gray-800 space-y-1">
        <button
          onClick={toggleDarkMode}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200"
        >
          {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          {isDarkMode ? 'Modo claro' : 'Modo escuro'}
        </button>

        {profile && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
            <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">
                {getInitials(profile.name)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {profile.name}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors"
              title="Sair"
            >
              <LogOut size={15} />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
