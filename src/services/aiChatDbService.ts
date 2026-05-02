import { supabase } from './supabase'
import { AIChatConversation, AIChatMessage, AIUserBan, AIKnowledgeBase } from '@/types/database'

export const aiChatDbService = {
  // ─── 封禁检查 ───────────────────────────
  checkUserBan: async (userId: string): Promise<{ banned: boolean; reason?: string }> => {
    const { data } = await supabase
      .from('ai_user_bans')
      .select('reason')
      .eq('user_id', userId)
      .maybeSingle()
    return { banned: !!data, reason: data?.reason || undefined }
  },

  // ─── 会话管理 ───────────────────────────
  createConversation: async (userId: string, title = '新对话'): Promise<AIChatConversation> => {
    const { data, error } = await supabase
      .from('ai_chat_conversations')
      .insert({ user_id: userId, title })
      .select()
      .single()
    if (error) throw error
    return data
  },

  getUserConversations: async (userId: string): Promise<AIChatConversation[]> => {
    const { data, error } = await supabase
      .from('ai_chat_conversations')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  updateConversationTitle: async (id: string, title: string): Promise<void> => {
    const { error } = await supabase
      .from('ai_chat_conversations')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  touchConversation: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('ai_chat_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  deleteConversation: async (id: string): Promise<void> => {
    // 软删除：前端用户删除只是标记
    const { error } = await supabase
      .from('ai_chat_conversations')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  // 硬删除（管理员使用）
  hardDeleteConversation: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('ai_chat_conversations')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  // ─── 消息管理 ───────────────────────────
  getMessages: async (conversationId: string): Promise<AIChatMessage[]> => {
    const { data, error } = await supabase
      .from('ai_chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data || []
  },

  saveMessage: async (
    conversationId: string,
    role: 'user' | 'assistant' | 'system',
    content: string
  ): Promise<void> => {
    const { error } = await supabase
      .from('ai_chat_messages')
      .insert({ conversation_id: conversationId, role, content })
    if (error) throw error
  },

  // ─── 管理员：所有对话（含已删） ─────────
  getAllConversations: async (params: {
    userId?: string
    deletedOnly?: boolean
    page?: number
    pageSize?: number
  } = {}): Promise<{ data: any[]; total: number }> => {
    const { userId, deletedOnly, page = 1, pageSize = 20 } = params

    let query = supabase
      .from('ai_chat_conversations')
      .select(`
        *,
        user:jkb_users!ai_chat_conversations_user_id_fkey(id, display_name, phone)
      `, { count: 'exact' })

    if (userId) {
      query = query.eq('user_id', userId)
    }
    if (deletedOnly) {
      query = query.eq('is_deleted', true)
    }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, error, count } = await query
      .order('updated_at', { ascending: false })
      .range(from, to)

    if (error) throw error
    return { data: (data as any) || [], total: count || 0 }
  },

  // ─── 管理员：封禁管理 ───────────────────
  getBannedUsers: async (): Promise<AIUserBan[]> => {
    const { data, error } = await supabase
      .from('ai_user_bans')
      .select(`
        *,
        user:jkb_users!ai_user_bans_user_id_fkey(id, display_name, phone),
        banned_by_user:jkb_users!ai_user_bans_banned_by_fkey(id, display_name)
      `)
      .order('banned_at', { ascending: false })
    if (error) throw error
    return (data as any) || []
  },

  banUser: async (userId: string, bannedBy: string, reason?: string): Promise<void> => {
    const { error } = await supabase
      .from('ai_user_bans')
      .upsert({ user_id: userId, banned_by: bannedBy, reason: reason || null }, { onConflict: 'user_id' })
    if (error) throw error
  },

  unbanUser: async (userId: string): Promise<void> => {
    const { error } = await supabase
      .from('ai_user_bans')
      .delete()
      .eq('user_id', userId)
    if (error) throw error
  },

  // ─── 知识预设 ───────────────────────────
  getKnowledgeBase: async (): Promise<string> => {
    const { data } = await supabase
      .from('ai_knowledge_base')
      .select('content')
      .limit(1)
      .maybeSingle()
    return (data as any)?.content || ''
  },

  updateKnowledgeBase: async (content: string, updatedBy: string): Promise<void> => {
    // 先检查是否有数据，没有则插入，有则更新
    const { data: existing } = await supabase
      .from('ai_knowledge_base')
      .select('id')
      .limit(1)
      .maybeSingle()

    if ((existing as any)?.id) {
      const { error } = await supabase
        .from('ai_knowledge_base')
        .update({ content, updated_by: updatedBy, updated_at: new Date().toISOString() })
        .eq('id', (existing as any).id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('ai_knowledge_base')
        .insert({ content, updated_by: updatedBy })
      if (error) throw error
    }
  },
}
