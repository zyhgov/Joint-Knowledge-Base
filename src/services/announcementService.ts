import { supabase } from './supabase'
import {
  JkbAnnouncement,
  JkbAnnouncementRead,
  AnnouncementType,
  AnnouncementTargetType,
  AnnouncementStatus,
} from '@/types/files'

export const announcementService = {
  // ===== 用户端 =====

  // 获取当前用户可见的公告/任务列表
  getMyAnnouncements: async (userId: string, userDeptIds: string[]): Promise<JkbAnnouncement[]> => {
    const now = new Date().toISOString()

    // 获取所有活跃状态的公告
    const { data: announcements, error } = await supabase
      .from('jkb_announcements')
      .select(`
        *,
        creator:jkb_users!jkb_announcements_created_by_fkey(id, display_name, avatar_url)
      `)
      .eq('status', 'active')
      .or(`start_at.is.null,start_at.lte.${now}`)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('is_pinned', { ascending: false })
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw error

    // 获取已读/完成状态
    const { data: reads } = await supabase
      .from('jkb_announcement_reads')
      .select('announcement_id, is_read, read_at, is_completed, completed_at')
      .eq('user_id', userId)

    const readMap = new Map(
      reads?.map((r: any) => [r.announcement_id, r]) || []
    )

    // 过滤：用户所在部门/工作区匹配的公告
    const filtered = (announcements || []).filter((a: any) => {
      if (a.target_type === 'all') return true
      if (!a.target_ids || a.target_ids.length === 0) return true
      return a.target_ids.some((id: string) => userDeptIds.includes(id))
    })

    return filtered.map((a: any) => {
      const readInfo = readMap.get(a.id)
      return {
        ...a,
        creator: a.creator || null,
        is_read: readInfo?.is_read || false,
        read_at: readInfo?.read_at || null,
        is_completed: readInfo?.is_completed || false,
        completed_at: readInfo?.completed_at || null,
      }
    })
  },

  // 标记公告已读
  markAsRead: async (announcementId: string, userId: string): Promise<void> => {
    const { error } = await supabase
      .from('jkb_announcement_reads')
      .upsert({
        announcement_id: announcementId,
        user_id: userId,
        is_read: true,
        read_at: new Date().toISOString(),
      }, {
        onConflict: 'announcement_id,user_id',
      })

    if (error) throw error
  },

  // 完成打卡/任务
  completeTask: async (announcementId: string, userId: string): Promise<void> => {
    const { error } = await supabase
      .from('jkb_announcement_reads')
      .upsert({
        announcement_id: announcementId,
        user_id: userId,
        is_read: true,
        read_at: new Date().toISOString(),
        is_completed: true,
        completed_at: new Date().toISOString(),
      }, {
        onConflict: 'announcement_id,user_id',
      })

    if (error) throw error
  },

  // 获取未读数量
  getUnreadCount: async (userId: string, userDeptIds: string[]): Promise<number> => {
    const announcements = await announcementService.getMyAnnouncements(userId, userDeptIds)
    return announcements.filter(a => !a.is_read).length
  },

  // ===== 管理端 =====

  // 获取所有公告（管理员）
  getAllAnnouncements: async (): Promise<JkbAnnouncement[]> => {
    const { data, error } = await supabase
      .from('jkb_announcements')
      .select(`
        *,
        creator:jkb_users!jkb_announcements_created_by_fkey(id, display_name, avatar_url)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    // 为每条公告统计已读数
    const announcements = data || []
    const announcementIds = announcements.map((a: any) => a.id)

    if (announcementIds.length > 0) {
      const { data: readStats } = await supabase
        .from('jkb_announcement_reads')
        .select('announcement_id, is_read, is_completed')
        .in('announcement_id', announcementIds)

      const statsMap = new Map<string, { reads: number; completes: number }>()
      ;(readStats || []).forEach((r: any) => {
        const cur = statsMap.get(r.announcement_id) || { reads: 0, completes: 0 }
        if (r.is_read) cur.reads++
        if (r.is_completed) cur.completes++
        statsMap.set(r.announcement_id, cur)
      })

      announcements.forEach((a: any) => {
        const stats = statsMap.get(a.id) || { reads: 0, completes: 0 }
        a.read_count = stats.reads
      })
    }

    return announcements
  },

  // 创建公告
  createAnnouncement: async (data: {
    title: string
    content: string
    type: AnnouncementType
    target_type: AnnouncementTargetType
    target_ids?: string[]
    priority?: number
    is_pinned?: boolean
    start_at?: string | null
    expires_at?: string | null
    created_by: string
  }): Promise<JkbAnnouncement> => {
    const { data: announcement, error } = await supabase
      .from('jkb_announcements')
      .insert({
        title: data.title,
        content: data.content,
        type: data.type,
        status: 'active' as AnnouncementStatus,
        target_type: data.target_type,
        target_ids: data.target_ids || null,
        priority: data.priority || 1,
        is_pinned: data.is_pinned || false,
        start_at: data.start_at || null,
        expires_at: data.expires_at || null,
        created_by: data.created_by,
      })
      .select()
      .single()

    if (error) throw error
    return announcement
  },

  // 更新公告
  updateAnnouncement: async (
    id: string,
    data: Partial<{
      title: string
      content: string
      type: AnnouncementType
      status: AnnouncementStatus
      target_type: AnnouncementTargetType
      target_ids: string[] | null
      priority: number
      is_pinned: boolean
      is_hidden: boolean
      start_at: string | null
      expires_at: string | null
    }>
  ): Promise<void> => {
    const { error } = await supabase
      .from('jkb_announcements')
      .update(data)
      .eq('id', id)

    if (error) throw error
  },

  // 删除公告
  deleteAnnouncement: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('jkb_announcements')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // 获取公告的已读/完成详情
  getAnnouncementReads: async (announcementId: string): Promise<JkbAnnouncementRead[]> => {
    const { data, error } = await supabase
      .from('jkb_announcement_reads')
      .select(`
        *,
        user:jkb_users!jkb_announcement_reads_user_id_fkey(id, display_name, avatar_url)
      `)
      .eq('announcement_id', announcementId)

    if (error) throw error
    return data || []
  },
}
