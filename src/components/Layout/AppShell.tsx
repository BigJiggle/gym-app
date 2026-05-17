import type { ReactNode } from 'react'
import NavSidebar from './NavSidebar'

interface Props {
  children: ReactNode
}

export default function AppShell({ children }: Props) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      <NavSidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
