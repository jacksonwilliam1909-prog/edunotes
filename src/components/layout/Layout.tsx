import { type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Navbar } from './Navbar'

interface LayoutProps {
  children: ReactNode
  title?: string
  showNewNote?: boolean
}

export function Layout({ children, title, showNewNote }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="pl-[260px] flex flex-col min-h-screen">
        <Navbar title={title} showNewNote={showNewNote} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
