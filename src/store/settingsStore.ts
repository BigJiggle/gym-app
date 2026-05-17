import { create } from 'zustand'
import type { AppSettings } from '../types'

interface SettingsStore {
  settings: AppSettings
  loaded: boolean
  loadSettings: () => Promise<void>
  setSetting: (key: keyof AppSettings, value: string) => Promise<void>
}

const DEFAULTS: AppSettings = {
  theme: 'dark',
  units: 'metric',
  notifications_enabled: 'true',
  checkin_day: '1',
  checkin_interval_days: '7',
  checkin_schedule_type: 'day',
  checkin_biweekly: 'false',
  ui_zoom: '100',
  theme_name: 'default',
  claude_api_key: ''
}

function applyThemeName(themeName: string) {
  document.documentElement.classList.remove('theme-light', 'theme-monotone', 'theme-light-monotone')
  if (themeName === 'light') {
    document.documentElement.classList.add('theme-light')
    document.documentElement.classList.remove('dark')
  } else if (themeName === 'monotone') {
    document.documentElement.classList.add('theme-monotone')
    document.documentElement.classList.add('dark')
  } else if (themeName === 'light-monotone') {
    document.documentElement.classList.add('theme-light-monotone')
    document.documentElement.classList.remove('dark')
  } else {
    // default — orange brand, dark
    document.documentElement.classList.add('dark')
  }
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: DEFAULTS,
  loaded: false,

  loadSettings: async () => {
    const settings = await window.api.getAllSettings()
    set({ settings: { ...DEFAULTS, ...settings }, loaded: true })
    const theme = settings.theme ?? 'dark'
    document.documentElement.classList.toggle('dark', theme === 'dark')
    const zoom = (settings.ui_zoom ?? '100')
    document.documentElement.style.zoom = zoom + '%'
    applyThemeName(settings.theme_name ?? 'default')
  },

  setSetting: async (key, value) => {
    await window.api.setSetting(key, value)
    set((s) => {
      const next = { ...s.settings, [key]: value }
      if (key === 'theme') {
        document.documentElement.classList.toggle('dark', value === 'dark')
      }
      if (key === 'ui_zoom') {
        document.documentElement.style.zoom = value + '%'
      }
      if (key === 'theme_name') {
        applyThemeName(value)
      }
      return { settings: next }
    })
  }
}))
