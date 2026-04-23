import { create } from 'zustand'
import { notificationService } from '@/services/notificationService'
import { supabase } from '@/services/supabase'
import { JkbNotification } from '@/types/files'

interface NotificationStore {
  notifications: JkbNotification[]
  unreadCount: number
  isOpen: boolean
  isLoading: boolean
  subscription: any | null

  setOpen: (open: boolean) => void
  loadNotifications: (userId: string) => Promise<void>
  markAsRead: (notificationId: string, userId: string) => Promise<void>
  markAllAsRead: (userId: string) => Promise<void>
  refresh: (userId: string) => Promise<void>
  subscribeRealtime: (userId: string) => () => void
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isOpen: false,
  isLoading: false,
  subscription: null,

  setOpen: (open: boolean) => set({ isOpen: open }),

  loadNotifications: async (userId: string) => {
    set({ isLoading: true })
    try {
      const [notifications, unreadCount] = await Promise.all([
        notificationService.getMyNotifications(userId),
        notificationService.getUnreadCount(userId),
      ])
      set({ notifications, unreadCount })
    } catch (error) {
      console.error('加载通知失败:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  markAsRead: async (notificationId: string, userId: string) => {
    await notificationService.markAsRead(notificationId, userId)
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === notificationId ? { ...n, is_read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }))
  },

  markAllAsRead: async (userId: string) => {
    await notificationService.markAllAsRead(userId)
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    }))
  },

  refresh: async (userId: string) => {
    await get().loadNotifications(userId)
  },

  // 订阅 Supabase Realtime，当有新通知时自动刷新
  subscribeRealtime: (userId: string) => {
    // 清除旧的订阅
    const oldSub = get().subscription
    if (oldSub) {
      supabase.removeChannel(oldSub)
    }

    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'jkb_notifications',
        },
        async (payload) => {
          console.log('[NotificationStore] 收到新通知:', payload)
          // 重新加载通知列表
          await get().loadNotifications(userId)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jkb_notifications',
        },
        async (payload) => {
          console.log('[NotificationStore] 通知更新:', payload)
          await get().loadNotifications(userId)
        }
      )
      .subscribe((status: string) => {
        console.log('[NotificationStore] Realtime 状态:', status)
      })

    set({ subscription: channel })

    // 返回取消订阅函数
    return () => {
      supabase.removeChannel(channel)
      set({ subscription: null })
    }
  },
}))