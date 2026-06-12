import { supabase } from './supabase'
import { TransferFanOrder, UrgentLog } from '@/types/database'

export const transferFanStatsService = {
  // 获取所有加急按钮点击记录（用于统计）
  getUrgentLogs: async (): Promise<UrgentLog[]> => {
    const { data, error } = await supabase
      .from('transfer_fan_urgent_logs')
      .select(`
        *,
        user:jkb_users!transfer_fan_urgent_logs_user_id_fkey(id, display_name, phone, avatar_url)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as any) || []
  },

  // 获取所有工单（用于统计）- 分页获取全部数据
  getAllOrders: async (): Promise<TransferFanOrder[]> => {
    // 先获取总行数
    const { count } = await supabase
      .from('transfer_fan_orders')
      .select('*', { count: 'exact', head: true })

    const totalCount = count || 0
    const allData: any[] = []
    const pageSize = 1000

    for (let offset = 0; offset < totalCount; offset += pageSize) {
      const { data, error } = await supabase
        .from('transfer_fan_orders')
        .select(`
          *,
          target_user:jkb_users!transfer_fan_orders_target_user_id_fkey(id, display_name, phone, avatar_url),
          creator:jkb_users!transfer_fan_orders_created_by_fkey(id, display_name, phone, avatar_url),
          processor:jkb_users!transfer_fan_orders_processed_by_fkey(id, display_name, phone, avatar_url),
          seat_user:jkb_users!transfer_fan_orders_seat_user_id_fkey(id, display_name, phone)
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1)

      if (error) throw error
      allData.push(...(data || []))
    }

    return allData
  },

  // 获取截图附件每日统计
  getAttachmentStats: async (): Promise<{
    dailyStats: Array<{ date: string; count: number; sizeBytes: number }>
    totalCount: number
    totalSizeBytes: number
  }> => {
    // 尝试通过 R2 服务端获取（含真实文件大小）
    // 优先尝试相对路径（Vite proxy 代理到 collab-server）
    const tryFetch = async (url: string) => {
      try {
        const res = await fetch(url)
        if (res.ok) return await res.json()
      } catch {}
      return null
    }

    const wsUrl = import.meta.env.VITE_COLLAB_SERVER_URL || 'ws://localhost:8787'
    const serverUrl = wsUrl.replace(/^ws(s?):\/\//, 'http$1://')

    // 依次尝试：相对路径 → 完整 URL
    const r2Result = await tryFetch('/api/transfer-attachment-stats')
      || await tryFetch(`${serverUrl}/api/transfer-attachment-stats`)

    if (r2Result) return r2Result

    // 降级：从数据库统计附件数量与大小
    const { data, error } = await supabase
      .from('transfer_fan_orders')
      .select('attachment_urls, created_at')
      .not('attachment_urls', 'is', null)
      .not('attachment_urls', 'eq', '[]')

    if (error) throw error

    const dailyMap = new Map<string, { count: number; sizeBytes: number }>()
    let totalCount = 0
    let totalSizeBytes = 0

    for (const row of data || []) {
      const urls = row.attachment_urls as Array<{ size?: number }> | null
      if (!urls || urls.length === 0) continue

      const date = (row.created_at || '').slice(0, 10)
      if (date) {
        const existing = dailyMap.get(date) || { count: 0, sizeBytes: 0 }
        for (const att of urls) {
          existing.count++
          existing.sizeBytes += att.size || 0
          totalSizeBytes += att.size || 0
        }
        dailyMap.set(date, existing)
        totalCount += urls.length
      }
    }

    const dailyStats = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return { dailyStats, totalCount, totalSizeBytes }
  },
}
