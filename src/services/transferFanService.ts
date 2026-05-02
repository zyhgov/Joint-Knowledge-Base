import { supabase } from './supabase'
import { TransferFanOrder } from '@/types/database'

export const transferFanService = {
  // 创建转粉工单
  create: async (orders: {
    source_user_ids: string[]
    target_user_id: string
    remark?: string
    created_by: string
  }[]): Promise<TransferFanOrder[]> => {
    const payload = orders.map(o => ({
      source_user_ids: o.source_user_ids,
      target_user_id: o.target_user_id,
      remark: o.remark || null,
      created_by: o.created_by,
    }))

    const { data, error } = await supabase
      .from('transfer_fan_orders')
      .insert(payload)
      .select()

    if (error) throw error
    return data || []
  },

  // 获取当前用户的工单统计
  getUserOrderStats: async (userId: string): Promise<{
    total: number
    submitted: number
    pending: number
    processed: number
    cancelled: number
    rejected: number
  }> => {
    const { data, error } = await supabase
      .from('transfer_fan_orders')
      .select('status')
      .eq('created_by', userId)

    if (error) throw error

    const orders = data || []
    return {
      total: orders.length,
      submitted: orders.filter(o => o.status === 'submitted').length,
      pending: orders.filter(o => o.status === 'pending').length,
      processed: orders.filter(o => o.status === 'processed').length,
      cancelled: orders.filter(o => o.status === 'cancelled').length,
      rejected: orders.filter(o => o.status === 'rejected').length,
    }
  },
  list: async (params: {
    status?: string
    target_user_id?: string
    created_by?: string
    page?: number
    page_size?: number
    current_user_id?: string
    is_admin?: boolean
    source_user_id?: string
    created_from?: string
    created_to?: string
    updated_from?: string
    updated_to?: string
    created_by_ids?: string[]
  } = {}): Promise<{ data: TransferFanOrder[]; total: number }> => {
    const { status, target_user_id, created_by, page = 1, page_size = 20, current_user_id, is_admin, source_user_id, created_from, created_to, updated_from, updated_to, created_by_ids } = params

    let query = supabase
      .from('transfer_fan_orders')
      .select(`
        *,
        target_user:jkb_users!transfer_fan_orders_target_user_id_fkey(id, display_name, phone, avatar_url),
        creator:jkb_users!transfer_fan_orders_created_by_fkey(id, display_name, phone, avatar_url),
        processor:jkb_users!transfer_fan_orders_processed_by_fkey(id, display_name, phone, avatar_url)
      `, { count: 'exact' })

    // 权限控制：非管理员只能看自己创建的工单
    if (current_user_id && !is_admin) {
      query = query.eq('created_by', current_user_id)
    }

    // 状态筛选（"all"表示不过滤）
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    // 目标用户筛选（"all"或空表示不过滤）
    if (target_user_id && target_user_id !== 'all') {
      query = query.eq('target_user_id', target_user_id)
    }

    // 创建人筛选（"all"或空表示不过滤）
    if (created_by && created_by !== 'all') {
      query = query.eq('created_by', created_by)
    }

    // 多创建人筛选（用于部门筛选）
    if (created_by_ids && created_by_ids.length > 0) {
      query = query.in('created_by', created_by_ids)
    }

    // 源用户ID筛选（在数组中搜索）
    if (source_user_id && source_user_id.trim()) {
      query = query.contains('source_user_ids', [source_user_id.trim()])
    }

    // 创建时间范围筛选
    if (created_from) {
      query = query.gte('created_at', created_from)
    }
    if (created_to) {
      query = query.lte('created_at', created_to + 'T23:59:59.999Z')
    }

    // 更新时间范围筛选
    if (updated_from) {
      query = query.gte('updated_at', updated_from)
    }
    if (updated_to) {
      query = query.lte('updated_at', updated_to + 'T23:59:59.999Z')
    }

    // 排序和分页
    const from = (page - 1) * page_size
    const to = from + page_size - 1

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error
    return { data: (data as any) || [], total: count || 0 }
  },

  // 更新工单状态
  updateStatus: async (
    ids: string[],
    status: string,
    processed_by?: string,
    reject_reason?: string
  ): Promise<void> => {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    }

    // 如果是处理相关的状态变更，记录处理人
    if (['processed', 'rejected', 'pending'].includes(status)) {
      updateData.processed_by = processed_by
      updateData.processed_at = new Date().toISOString()
    }

    if (status === 'rejected' && reject_reason) {
      updateData.reject_reason = reject_reason
    }

    const { error } = await supabase
      .from('transfer_fan_orders')
      .update(updateData)
      .in('id', ids)

    if (error) throw error
  },

  // 重新提交已取消的工单
  resubmit: async (ids: string[]): Promise<void> => {
    const { error } = await supabase
      .from('transfer_fan_orders')
      .update({
        status: 'submitted',
        processed_by: null,
        processed_at: null,
        reject_reason: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)

    if (error) throw error
  },

  // 取消工单（创建人自己取消）
  cancel: async (ids: string[], userId: string): Promise<void> => {
    const { error } = await supabase
      .from('transfer_fan_orders')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)
      .eq('created_by', userId)

    if (error) throw error
  },

  // 更新工单（修改源用户ID或目标用户）
  update: async (
    id: string,
    data: {
      source_user_ids?: string[]
      target_user_id?: string
    }
  ): Promise<void> => {
    const updateData: any = {
      ...data,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('transfer_fan_orders')
      .update(updateData)
      .eq('id', id)

    if (error) throw error
  },

  // 删除工单
  delete: async (ids: string[]): Promise<void> => {
    const { error } = await supabase
      .from('transfer_fan_orders')
      .delete()
      .in('id', ids)

    if (error) throw error
  },
}
