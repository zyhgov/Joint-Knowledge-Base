import { supabase } from './supabase'
import { useAuthStore } from '@/store/authStore'

const HEARTBEAT_INTERVAL = 30000 // 30s

// 在线状态管理
export const presenceService = {
  // 上线
  goOnline: async (userId: string): Promise<void> => {
    await supabase
      .from('chat_presence')
      .upsert({
        user_id: userId,
        last_seen_at: new Date().toISOString(),
        is_online: true,
      }, { onConflict: 'user_id' })
  },

  // 下线
  goOffline: async (userId: string): Promise<void> => {
    await supabase
      .from('chat_presence')
      .upsert({
        user_id: userId,
        last_seen_at: new Date().toISOString(),
        is_online: false,
      }, { onConflict: 'user_id' })
  },

  // 心跳
  heartbeat: async (userId: string): Promise<void> => {
    await supabase
      .from('chat_presence')
      .update({
        last_seen_at: new Date().toISOString(),
        is_online: true,
      })
      .eq('user_id', userId)
  },

  // 启动心跳定时器
  startHeartbeat: (userId: string): (() => void) => {
    // 先上线
    presenceService.goOnline(userId)

    const interval = setInterval(() => {
      presenceService.heartbeat(userId)
    }, HEARTBEAT_INTERVAL)

    // 页面关闭时下线
    const handleBeforeUnload = () => {
      presenceService.goOffline(userId)
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    // 标签页可见性变化
    const handleVisibility = () => {
      if (document.hidden) {
        presenceService.goOffline(userId)
      } else {
        presenceService.goOnline(userId)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // 返回清理函数
    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibility)
      presenceService.goOffline(userId)
    }
  },

  // 订阅所有在线状态变化
  subscribePresence: (callback: (payload: any) => void) => {
    return supabase
      .channel('chat-presence-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_presence',
        },
        callback
      )
      .subscribe()
  },

  // 获取所有在线状态
  getAllPresence: async (): Promise<Record<string, boolean>> => {
    const { data, error } = await supabase
      .from('chat_presence')
      .select('user_id, is_online')

    if (error) throw error

    const map: Record<string, boolean> = {}
    data?.forEach(p => {
      map[p.user_id] = p.is_online
    })
    return map
  },
}
