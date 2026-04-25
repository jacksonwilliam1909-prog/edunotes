import { NavLink, useNavigate } from 'react-router-dom'
import { Home, BookOpen, PenSquare, Star, User } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Início' },
  { to: '/notebooks', icon: BookOpen, label: 'Cadernos' },
  { to: '/favorites', icon: Star, label: 'Favoritos' },
  { to: '/profile', icon: User, label: 'Perfil' },
]

export function BottomNav() {
  const navigate = useNavigate()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-30 safe-area-pb">
      <div className="flex items-center justify-around h-16">
        {NAV_ITEMS.slice(0, 2).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all duration-200 ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`
            }
          >
            <Icon size={20} />
            <span className="text-xs font-medium">{label}</span>
          </NavLink>
        ))}

        {/* New Note center button */}
        <button
          onClick={() => navigate('/notes/new')}
          className="flex flex-col items-center gap-1 -mt-6 px-4"
        >
          <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-900">
            <PenSquare size={20} className="text-white" />
          </div>
          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mt-0.5">
            Nova
          </span>
        </button>

        {NAV_ITEMS.slice(2).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all duration-200 ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`
            }
          >
            <Icon size={20} />
            <span className="text-xs font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
