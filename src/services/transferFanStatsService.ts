import { supabase } from './supabase'
import { TransferFanOrder } from '@/types/database'

export const transferFanStatsService = {
  // 获取所有工单（用于统计）
  getAllOrders: async (): Promise<TransferFanOrder[]> => {
    const { data, error } = await supabase
      .from('transfer_fan_orders')
      .select(`
        *,
        target_user:jkb_users!transfer_fan_orders_target_user_id_fkey(id, display_name, phone, avatar_url),
        creator:jkb_users!transfer_fan_orders_created_by_fkey(id, display_name, phone, avatar_url),
        processor:jkb_users!transfer_fan_orders_processed_by_fkey(id, display_name, phone, avatar_url)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as any) || []
  },
}
