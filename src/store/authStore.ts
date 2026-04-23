import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authService } from '@/services/auth'
import { JkbUserProfile } from '@/types/database'

interface AuthStore {
  user: JkbUserProfile | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  userDepartmentIds: string[]
  userPermissions: string[]
  initAuth: () => Promise<void>
  login: (phone: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateUser: (data: Partial<JkbUserProfile>) => void
  refreshUser: () => Promise<void>
  reset: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: true,
      isAuthenticated: false,
      userDepartmentIds: [],
      userPermissions: [],

      // 定期验证 session 是否有效（用于检测管理员停用用户的即时下线）
      _sessionCheckTimer: null as ReturnType<typeof setInterval> | null,

      _startSessionCheck: () => {
        // 每 15 秒检查一次 session 是否仍然有效
        const existing = (get() as any)._sessionCheckTimer
        if (existing) clearInterval(existing)

        const timer = setInterval(async () => {
          const { token, isAuthenticated } = get()
          if (!token || !isAuthenticated) return

          try {
            const result = await authService.verifyToken(token)
            if (!result) {
              // session 已失效（被删除或用户被停用），强制登出
              console.log('[Auth] Session invalidated, forcing logout')
              clearInterval(timer)
              set({
                user: null,
                token: null,
                isAuthenticated: false,
                userPermissions: [],
                isLoading: false,
              })
            } else {
              // 同步最新的权限和用户状态
              set({ user: result.user, userPermissions: result.permissions })
            }
          } catch {
            // 网络错误等不强制登出
          }
        }, 15000)

        set({ _sessionCheckTimer: timer } as any)
      },

      initAuth: async () => {
        try {
          const token = get().token
          if (token) {
            const result = await authService.verifyToken(token)
            if (result) {
              set({ user: result.user, userPermissions: result.permissions, isAuthenticated: true })
              // 启动 session 定期检查
              ;(get() as any)._startSessionCheck?.()
            } else {
              set({ token: null, user: null, isAuthenticated: false, userPermissions: [] })
            }
          }
        } catch (error) {
          console.error('初始化认证失败:', error)
          set({ token: null, user: null, isAuthenticated: false, userPermissions: [] })
        } finally {
          set({ isLoading: false })
        }
      },

      login: async (phone: string, password: string) => {
        set({ isLoading: true })
        try {
          const result = await authService.login(phone, password)
          set({ user: result.user, token: result.token, userPermissions: result.permissions, isAuthenticated: true, isLoading: false })
          // 启动 session 定期检查
          ;(get() as any)._startSessionCheck?.()
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      logout: async () => {
        set({ isLoading: true })
        try {
          const token = get().token
          // 停止 session 检查
          const timer = (get() as any)._sessionCheckTimer
          if (timer) clearInterval(timer)

          if (token) {
            await authService.logout(token)
          }
          set({ user: null, token: null, isAuthenticated: false, isLoading: false, userPermissions: [] })
        } catch (error) {
          console.error('登出失败:', error)
          set({ isLoading: false })
        }
      },

      // 本地更新用户信息（不请求数据库，立即生效）
      updateUser: (data: Partial<JkbUserProfile>) => {
        const currentUser = get().user
        if (currentUser) {
          set({ user: { ...currentUser, ...data } })
        }
      },

      // 刷新用户信息（从数据库重新获取，包含最新的角色/部门/权限）
      refreshUser: async () => {
        const token = get().token
        if (!token) return
        try {
          const result = await authService.verifyToken(token)
          if (result) {
            set({ user: result.user, userPermissions: result.permissions, isAuthenticated: true })
          }
        } catch {
          // 静默失败，不影响当前会话
        }
      },

      reset: () => {
        const timer = (get() as any)._sessionCheckTimer
        if (timer) clearInterval(timer)
        set({ user: null, token: null, isLoading: false, isAuthenticated: false, userPermissions: [] })
      },
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({
        token: state.token,
        // 缓存用户信息和权限，刷新后立即可用
        user: state.user,
        userPermissions: state.userPermissions,
      }),
    }
  )
)