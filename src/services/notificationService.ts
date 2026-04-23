import { supabase } from './supabase'
import { JkbNotification, NotificationType, NotificationTargetType } from '@/types/files'

// 安全查询辅助函数：如果 is_hidden 列不存在则降级查询
async function safeSelectFromNotifications(queryBuilder: any, useIsHidden: boolean = true) {
  let q = queryBuilder
  if (useIsHidden) {
    q = q.eq('is_hidden', false)
  }
  const result = await q
  if (result.error && useIsHidden && result.error.message?.includes('is_hidden')) {
    // is_hidden 列不存在，去掉该条件重新查询
    console.warn('[notificationService] is_hidden 列不存在，降级查询')
    // 重新构建不带 is_hidden 的查询（这里需要重新构建整个查询）
    return null // 返回 null 表示需要降级
  }
  return result
}

export const notificationService = {
  // 获取当前用户的通知
  getMyNotifications: async (userId: string): Promise<JkbNotification[]> => {
    const now = new Date().toISOString()

    const buildQuery = (withIsHidden: boolean) => {
      let q = supabase
        .from('jkb_notifications')
        .select(`
          *,
          sender:jkb_users!jkb_notifications_sender_id_fkey(id, display_name, avatar_url)
        `)
        .or(`target_type.eq.all,target_ids.cs.{${userId}}`)
        .or(`expires_at.is.null,expires_at.gt.${now}`)

      if (withIsHidden) {
        q = q.eq('is_hidden', false)
      }

      q = q.order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50)

      return q
    }

    // 先尝试带 is_hidden 过滤
    let notifications: any[] | null = null
    let error: any = null
    const res1 = await buildQuery(true)
    if (res1.error && res1.error.message?.includes('is_hidden')) {
      console.warn('[notificationService] is_hidden 列不存在，降级查询')
      const res2 = await buildQuery(false)
      notifications = res2.data
      error = res2.error
    } else if (res1.error) {
      error = res1.error
    } else {
      notifications = res1.data
    }

    if (error) throw error


    // 获取已读状态
    const { data: reads } = await supabase
      .from('jkb_notification_reads')
      .select('notification_id, is_read')
      .eq('user_id', userId)

    const readMap = new Map(
      reads?.map((r: any) => [r.notification_id, r.is_read]) || []
    )

    return (notifications || []).map((n: any) => ({
      ...n,
      sender: n.sender || null,
      is_read: readMap.get(n.id) || false,
    }))
  },

  // 获取未读数量
  getUnreadCount: async (userId: string): Promise<number> => {
    const now = new Date().toISOString()

    const buildQuery = (withIsHidden: boolean) => {
      let q = supabase
        .from('jkb_notifications')
        .select('id')
        .or(`target_type.eq.all,target_ids.cs.{${userId}}`)
        .or(`expires_at.is.null,expires_at.gt.${now}`)

      if (withIsHidden) {
        q = q.eq('is_hidden', false)
      }

      return q
    }

    let notifications: any[] | null = null
    const res1 = await buildQuery(true)
    if (res1.error && res1.error.message?.includes('is_hidden')) {
      const res2 = await buildQuery(false)
      notifications = res2.data
    } else {
      notifications = res1.data
    }

    if (!notifications || notifications.length === 0) return 0

    const notificationIds = notifications.map((n: any) => n.id)

    const { data: reads } = await supabase
      .from('jkb_notification_reads')
      .select('notification_id')
      .eq('user_id', userId)
      .eq('is_read', true)
      .in('notification_id', notificationIds)

    const readCount = reads?.length || 0
    return notificationIds.length - readCount
  },

  // 标记为已读
  markAsRead: async (notificationId: string, userId: string): Promise<void> => {
    const { error } = await supabase
      .from('jkb_notification_reads')
      .upsert({
        notification_id: notificationId,
        user_id: userId,
        is_read: true,
        read_at: new Date().toISOString(),
      }, {
        onConflict: 'notification_id,user_id',
      })

    if (error) throw error
  },

  // 全部标记为已读
  markAllAsRead: async (userId: string): Promise<void> => {
    const now = new Date().toISOString()

    // 不使用 is_hidden 过滤，标记所有通知
    const { data: notifications } = await supabase
      .from('jkb_notifications')
      .select('id')
      .or(`target_type.eq.all,target_ids.cs.{${userId}}`)
      .or(`expires_at.is.null,expires_at.gt.${now}`)

    if (!notifications || notifications.length === 0) return

    const upsertData = notifications.map((n: any) => ({
      notification_id: n.id,
      user_id: userId,
      is_read: true,
      read_at: now,
    }))

    const { error } = await supabase
      .from('jkb_notification_reads')
      .upsert(upsertData, { onConflict: 'notification_id,user_id' })

    if (error) throw error
  },

  // 发送通知（管理员）
  sendNotification: async (data: {
    title: string
    content: string
    type: NotificationType
    target_type: NotificationTargetType
    target_ids?: string[]
    is_pinned?: boolean
    expires_at?: string | null
    sender_id: string
  }): Promise<JkbNotification> => {
    const { data: notification, error } = await supabase
      .from('jkb_notifications')
      .insert({
        title: data.title,
        content: data.content,
        type: data.type,
        target_type: data.target_type,
        target_ids: data.target_ids || null,
        is_pinned: data.is_pinned || false,
        expires_at: data.expires_at || null,
        sender_id: data.sender_id,
      })
      .select()
      .single()

    if (error) throw error
    return notification
  },

  // 获取所有通知（管理员）
  getAllNotifications: async (): Promise<JkbNotification[]> => {
    const { data, error } = await supabase
      .from('jkb_notifications')
      .select(`
        *,
        sender:jkb_users!jkb_notifications_sender_id_fkey(id, display_name, avatar_url)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  // 删除通知（管理员）
  deleteNotification: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('jkb_notifications')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // 更新通知（管理员）
  updateNotification: async (
    id: string,
    data: Partial<{
      title: string
      content: string
      type: NotificationType
      is_pinned: boolean
      is_hidden: boolean
      expires_at: string | null
    }>
  ): Promise<void> => {
    const { error } = await supabase
      .from('jkb_notifications')
      .update(data)
      .eq('id', id)

    if (error) throw error
  },
}