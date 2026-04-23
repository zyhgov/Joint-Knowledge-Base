import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

interface ThemeStore {
  theme: Theme
  setTheme: (theme: Theme) => void
  actualTheme: 'light' | 'dark' // 实际应用的主题（考虑 system）
  updateActualTheme: () => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: 'system',
      actualTheme: 'light',

      setTheme: (theme: Theme) => {
        set({ theme })
        get().updateActualTheme()
      },

      updateActualTheme: () => {
        const { theme } = get()
        let actualTheme: 'light' | 'dark' = 'light'

        if (theme === 'system') {
          actualTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
        } else {
          actualTheme = theme
        }

        // 应用到 DOM
        if (actualTheme === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }

        set({ actualTheme })
      },
    }),
    {
      name: 'theme-store',
      onRehydrateStorage: () => (state) => {
        state?.updateActualTheme()
      },
    }
  )
)

// 监听系统主题变化
if (typeof window !== 'undefined') {
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      useThemeStore.getState().updateActualTheme()
    })
}