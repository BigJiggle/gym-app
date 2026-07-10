import { createLocalStore } from '../widgets/localStore'

// Persisted sidebar collapse state (true = collapsed to a narrow icon rail).
// Reuses the app's reactive localStorage factory so the toggle survives reloads
// and stays in sync across any consumer.
const sidebarStore = createLocalStore<boolean>('sidebar_collapsed', () => false)

export function useSidebarCollapsed(): boolean {
  return sidebarStore.useValue()
}

export function toggleSidebar(): void {
  sidebarStore.set(!sidebarStore.getSnapshot())
}

// Test-only handle for asserting/seeding persistence.
export const __sidebarStore = sidebarStore
