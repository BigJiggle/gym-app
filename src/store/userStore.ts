import { create } from 'zustand'
import type { User, CreateUserInput, Show } from '../types'

interface UserStore {
  user: User | null
  shows: Show[]
  loading: boolean
  error: string | null
  loadUser: () => Promise<void>
  createUser: (data: CreateUserInput) => Promise<User>
  updateUser: (data: Partial<User> & { id: number }) => Promise<void>
  loadShows: (userId: number) => Promise<void>
  addShow: (userId: number, data: Partial<Show>) => Promise<Show>
  deleteShow: (showId: number) => Promise<{ needs_goal_selection?: boolean }>
  setPrimaryShow: (showId: number, userId: number) => Promise<void>
  resetAllData: () => Promise<void>
}

export const useUserStore = create<UserStore>((set, get) => ({
  user: null,
  shows: [],
  loading: false,
  error: null,

  loadUser: async () => {
    set({ loading: true, error: null })
    try {
      const user = await window.api.getUser()
      set({ user, loading: false })
      if (user?.id) {
        const shows = await window.api.listShows(user.id) as Show[]
        set({ shows })
        // Run startup refresh: auto-transition shows, update plans for current weeks_out
        // Lazy import avoids circular dependency between userStore and planStore
        const { usePlanStore } = await import('./planStore')
        usePlanStore.getState().startupRefresh(user.id)
      }
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  createUser: async (data) => {
    set({ loading: true, error: null })
    try {
      const user = await window.api.createUser(data)
      set({ user, loading: false })
      return user
    } catch (e) {
      set({ error: String(e), loading: false })
      throw e
    }
  },

  updateUser: async (data) => {
    set({ loading: true, error: null })
    try {
      const user = await window.api.updateUser(data)
      set({ user, loading: false })
    } catch (e) {
      set({ error: String(e), loading: false })
      throw e
    }
  },

  loadShows: async (userId) => {
    const shows = await window.api.listShows(userId) as Show[]
    set({ shows })
  },

  addShow: async (userId, data) => {
    // Handler returns full updated shows list + immediately regenerates diet
    const shows = await window.api.addShow(userId, data) as Show[]
    const user = await window.api.getUser()
    set({ shows, user })
    // Fetch the freshly generated diet and update the plan store
    try {
      const { usePlanStore } = await import('./planStore')
      const diet = await window.api.getDietPlan(userId)
      usePlanStore.setState({ dietPlan: diet })
    } catch { /* non-fatal */ }
    return shows[0] // caller rarely uses return value
  },

  deleteShow: async (showId) => {
    const result = await window.api.deleteShow(showId) as any
    const user = await window.api.getUser()
    const shows: Show[] = Array.isArray(result) ? result : (result?.shows ?? [])
    set({ shows, user })
    if (result?.message || result?.needs_goal_selection) {
      const { usePlanStore } = await import('./planStore')
      const training = await window.api.getTrainingPlan(user?.id ?? 0)
      // Only refresh diet if it was actually regenerated (not waiting for goal selection)
      if (!result?.needs_goal_selection) {
        const diet = await window.api.getDietPlan(user?.id ?? 0)
        usePlanStore.setState({ trainingPlan: training, dietPlan: diet, lastRefreshMessage: result.message })
      } else {
        usePlanStore.setState({ trainingPlan: training, lastRefreshMessage: result.message })
      }
    }
    return { needs_goal_selection: result?.needs_goal_selection ?? false }
  },

  setPrimaryShow: async (showId, userId) => {
    const shows = await window.api.setPrimaryShow(showId, userId) as Show[]
    const user = await window.api.getUser()
    set({ shows: Array.isArray(shows) ? shows : [], user })
  },

  resetAllData: async () => {
    await window.api.resetAllData()
    set({ user: null, shows: [] })
  },
}))
