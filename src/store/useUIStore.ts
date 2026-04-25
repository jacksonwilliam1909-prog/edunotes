import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  isDarkMode: boolean
  isSidebarOpen: boolean
  toggleDarkMode: () => void
  setSidebarOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isDarkMode: false,
      isSidebarOpen: true,

      toggleDarkMode: () =>
        set((state) => {
          const next = !state.isDarkMode
          if (next) {
            document.documentElement.classList.add('dark')
          } else {
            document.documentElement.classList.remove('dark')
          }
          return { isDarkMode: next }
        }),

      setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
    }),
    {
      name: 'edunotes-ui',
      partialize: (state) => ({ isDarkMode: state.isDarkMode }),
      onRehydrateStorage: () => (state) => {
        if (state?.isDarkMode) {
          document.documentElement.classList.add('dark')
        }
      },
    }
  )
)
