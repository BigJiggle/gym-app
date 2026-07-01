import { create } from 'zustand'

export interface CardioEntry {
  date: string
  type: string
  minutes: number
}

interface CardioStore {
  cardioLog: CardioEntry[]
  logToday: (type: string, minutes: number) => void
  removeToday: () => void
}

function loadInitial(): CardioEntry[] {
  try {
    return JSON.parse(localStorage.getItem('cardio_log') ?? '[]')
  } catch {
    return []
  }
}

function persist(entries: CardioEntry[]) {
  localStorage.setItem('cardio_log', JSON.stringify(entries))
}

function today(): string {
  return new Date().toLocaleDateString('en-CA')
}

export const useCardioStore = create<CardioStore>((set) => ({
  cardioLog: loadInitial(),

  logToday: (type, minutes) =>
    set((s) => {
      const next = [...s.cardioLog.filter((e) => e.date !== today()), { date: today(), type, minutes }]
      persist(next)
      return { cardioLog: next }
    }),

  removeToday: () =>
    set((s) => {
      const next = s.cardioLog.filter((e) => e.date !== today())
      persist(next)
      return { cardioLog: next }
    }),
}))
