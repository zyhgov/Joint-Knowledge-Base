import { supabase } from './supabase'
import {
  ChatConversation,
  ChatConversationWithDetails,
  ChatMessage,
  ChatMessageWithSender,
  ChatParticipant,
  ChatMute,
  ChatMuteWithDetails,
  ChatMessageRead,
} from '@/types/database'

export const chatService = {
  // ====== 会话 ======

  // 获取当前用户的所有会话（含最后一条消息和未读数）
  getMyConversations: async (userId: string): Promise<ChatConversationWithDetails[]> => {
    const { data: participants, error } = await supabase
      .from('chat_participants')
      .select(`
        conversation_id,
        last_read_at,
        is_muted,
        conversation:chat_conversations(
          id, type, name, description, avatar_url, created_by, created_at, updated_at, disbanded_at,
          participants:chat_participants(
            last_read_at, is_muted,
            user:jkb_users(id, display_name, avatar_url, phone)
          )
        )
      `)
      .eq('user_id', userId)

    if (error) throw error

    const results: ChatConversationWithDetails[] = []

    for (const p of participants || []) {
      const conv = p.conversation as any
      if (!conv) continue

     // 获取最后一条消息
      const { data: lastMsgRaw } = await supabase
        .from('chat_messages')
        .select('content, created_at, sender_id, message_type, recalled_at')
        .eq('conversation_id', conv.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      // 如果消息已撤回，预览显示"已撤回"
      let lastMsg = lastMsgRaw || null
      if (lastMsg?.recalled_at) {
        lastMsg = {
          ...lastMsg,
          content: '已撤回的消息',
        }
      }

      // 计算未读消息数
      let unreadCount = 0
      if (p.last_read_at) {
        const { count } = await supabase
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .eq('is_deleted', false)
          .neq('sender_id', userId)
          .gt('created_at', p.last_read_at)
        unreadCount = count || 0
      } else {
        const { count } = await supabase
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .eq('is_deleted', false)
          .neq('sender_id', userId)
        unreadCount = count || 0
      }

      results.push({
        id: conv.id,
        type: conv.type,
        name: conv.name,
        description: conv.description,
        avatar_url: conv.avatar_url,
        created_by: conv.created_by,
        disbanded_at: conv.disbanded_at,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        participants: (conv.participants || []).map((cp: any) => ({
          user: cp.user,
          last_read_at: cp.last_read_at,
          is_muted: cp.is_muted,
        })),
        last_message: lastMsg || null,
        unread_count: unreadCount,
      })
    }

    // 按最后消息时间排序
    results.sort((a, b) => {
      const aTime = a.last_message?.created_at || a.created_at
      const bTime = b.last_message?.created_at || b.created_at
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })

    return results
  },

  // 查找或创建私聊
  findOrCreateDirectConversation: async (userId: string, targetUserId: string): Promise<string> => {
    // 查找已有的私聊
    // 先找到 user1 参与的所有 conversation_id
    const { data: userConvs } = await supabase
      .from('chat_participants')
      .select('conversation_id')
      .eq('user_id', userId)

    if (userConvs && userConvs.length > 0) {
      const convIds = userConvs.map(c => c.conversation_id)

      // 检查 targetUserId 是否也在同一会话中，并且该会话是 direct 类型
      const { data: shared } = await supabase
        .from('chat_participants')
        .select('conversation_id')
        .in('conversation_id', convIds)
        .eq('user_id', targetUserId)

      if (shared && shared.length > 0) {
        // 验证是否为私聊
        for (const s of shared) {
          const { data: conv } = await supabase
            .from('chat_conversations')
            .select('id')
            .eq('id', s.conversation_id)
            .eq('type', 'direct')
            .single()

          if (conv) return conv.id
        }
      }
    }

    // 创建新私聊
    const { data: newConv, error: convError } = await supabase
      .from('chat_conversations')
      .insert({ type: 'direct', created_by: userId })
      .select()
      .single()

    if (convError || !newConv) throw convError || new Error('创建会话失败')

    // 添加双方为参与者
    const { error: partError } = await supabase
      .from('chat_participants')
      .insert([
        { conversation_id: newConv.id, user_id: userId },
        { conversation_id: newConv.id, user_id: targetUserId },
      ])

    if (partError) throw partError

    return newConv.id
  },

  // 创建群聊
  createGroupConversation: async (
    name: string,
    createdBy: string,
    memberIds: string[],
    description?: string
  ): Promise<string> => {
    const { data: newConv, error: convError } = await supabase
      .from('chat_conversations')
      .insert({ type: 'group', name, description: description || null, created_by: createdBy })
      .select()
      .single()

    if (convError || !newConv) throw convError || new Error('创建群聊失败')

    // 插入所有参与者（去重 + 包含创建者）
    const allMembers = [...new Set([createdBy, ...memberIds])]
    const { error: partError } = await supabase
      .from('chat_participants')
      .insert(
        allMembers.map(uid => ({
          conversation_id: newConv.id,
          user_id: uid,
        }))
      )

    if (partError) throw partError

    // 发送系统消息
    await chatService.sendSystemMessage(newConv.id, '群聊已创建')

    return newConv.id
  },

  // ====== 消息 ======

  // 获取会话消息（分页，倒序加载）
  getMessages: async (
    conversationId: string,
    options?: { limit?: number; before?: string }
  ): Promise<ChatMessageWithSender[]> => {
    let query = supabase
      .from('chat_messages')
      .select(`
        id, conversation_id, sender_id, content, message_type,
        created_at, edited_at, is_deleted, status, recalled_at,
        sender:jkb_users(id, display_name, avatar_url)
      `)
      .eq('conversation_id', conversationId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(options?.limit || 50)

    if (options?.before) {
      query = query.lt('created_at', options.before)
    }

    const { data, error } = await query
    if (error) throw error

    // 反转使按时间正序
    return (data as any as ChatMessageWithSender[]).reverse()
  },

  // 发送消息
  sendMessage: async (
    conversationId: string,
    senderId: string,
    content: string,
    messageType: 'text' | 'system' = 'text'
  ): Promise<ChatMessage> => {
    // 检查是否被禁言
    if (messageType === 'text') {
      const isMuted = await chatService.checkMuted(senderId, conversationId)
      if (isMuted) throw new Error('你已被禁言，无法发送消息')
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content: content.trim(),
        message_type: messageType,
      })
      .select()
      .single()

    if (error) throw error

    // 更新会话更新时间
    await supabase
      .from('chat_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)

    // 更新发送者的 last_read_at
    await supabase
      .from('chat_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', senderId)

    return data
  },

  // 发送图片消息（先标记 sending，上传完成后更新为 sent）
  sendImageMessage: async (
    conversationId: string,
    senderId: string,
    imageUrl: string,
    imageKey: string,
    width: number,
    height: number
  ): Promise<ChatMessage> => {
    // 检查是否被禁言
    const isMuted = await chatService.checkMuted(senderId, conversationId)
    if (isMuted) throw new Error('你已被禁言，无法发送消息')

    const content = JSON.stringify({ url: imageUrl, key: imageKey, width, height })

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        message_type: 'image',
        status: 'sent',
      })
      .select()
      .single()

    if (error) throw error

    await supabase
      .from('chat_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)

    await supabase
      .from('chat_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', senderId)

    return data
  },

  // 解析图片消息内容
  parseImageContent: (content: string): { url: string; key: string; width: number; height: number } | null => {
    try {
      return JSON.parse(content)
    } catch {
      return null
    }
  },

  // ====== 已读状态 ======

  // 标记消息为已读
  markMessageRead: async (messageId: string, userId: string): Promise<void> => {
    await supabase.from('chat_message_reads').upsert({
      message_id: messageId,
      user_id: userId,
      read_at: new Date().toISOString(),
    }, { onConflict: 'message_id,user_id' })
  },

  // 获取消息已读用户列表
  getMessageReadUsers: async (messageId: string): Promise<Array<{ user_id: string; read_at: string }>> => {
    const { data, error } = await supabase
      .from('chat_message_reads')
      .select('user_id, read_at')
      .eq('message_id', messageId)

    if (error) throw error
    return data || []
  },

  // ====== 群组管理 ======

  // 获取群成员列表
  getGroupMembers: async (conversationId: string): Promise<Array<{
    user: { id: string; display_name: string | null; avatar_url: string | null; phone: string | null }
    is_muted: boolean
    joined_at: string
  }>> => {
    const { data, error } = await supabase
      .from('chat_participants')
      .select(`
        is_muted,
        joined_at,
        user:jkb_users(id, display_name, avatar_url, phone)
      `)
      .eq('conversation_id', conversationId)

    if (error) throw error
    return (data || []).map((p: any) => ({
      user: p.user,
      is_muted: p.is_muted,
      joined_at: p.joined_at,
    }))
  },

  // 移除群成员
  removeParticipant: async (conversationId: string, targetUserId: string): Promise<void> => {
    const { error } = await supabase
      .from('chat_participants')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', targetUserId)

    if (error) throw error
  },

  // 添加群成员
  addParticipant: async (conversationId: string, targetUserId: string): Promise<void> => {
    const { error } = await supabase
      .from('chat_participants')
      .insert({
        conversation_id: conversationId,
        user_id: targetUserId,
      })

    if (error) throw error
  },

  // 检查用户是否是群主
  isGroupOwner: async (conversationId: string, userId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('created_by')
      .eq('id', conversationId)
      .single()

    if (error || !data) return false
    return data.created_by === userId
  },

  // 转让群主
  transferOwnership: async (conversationId: string, newOwnerId: string): Promise<void> => {
    const { error } = await supabase
      .from('chat_conversations')
      .update({ created_by: newOwnerId })
      .eq('id', conversationId)

    if (error) throw error
    await chatService.sendSystemMessage(conversationId, '群主已变更')
  },

  // 更新群头像
  updateGroupAvatar: async (conversationId: string, avatarUrl: string): Promise<void> => {
    const { error } = await supabase
      .from('chat_conversations')
      .update({ avatar_url: avatarUrl })
      .eq('id', conversationId)

    if (error) throw error
  },

  // 更新群信息（名称、简介）
  updateGroupInfo: async (
    conversationId: string,
    data: { name?: string; description?: string | null }
  ): Promise<void> => {
    const updateData: Record<string, any> = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (Object.keys(updateData).length === 0) return

    const { error } = await supabase
      .from('chat_conversations')
      .update(updateData)
      .eq('id', conversationId)

    if (error) throw error
  },

  // 批量添加群成员
  addParticipants: async (conversationId: string, userIds: string[]): Promise<void> => {
    if (userIds.length === 0) return

    const inserts = userIds.map(userId => ({
      conversation_id: conversationId,
      user_id: userId,
    }))

    const { error } = await supabase
      .from('chat_participants')
      .insert(inserts)

    if (error) throw error
  },

  // 解散群聊
  disbandGroup: async (conversationId: string): Promise<void> => {
    const { error } = await supabase
      .from('chat_conversations')
      .update({ disbanded_at: new Date().toISOString() })
      .eq('id', conversationId)

    if (error) throw error
    await chatService.sendSystemMessage(conversationId, '群聊已被解散')
  },

  // 检查群聊是否已解散
  isGroupDisbanded: async (conversationId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('disbanded_at')
      .eq('id', conversationId)
      .single()

    if (error || !data) return false
    return data.disbanded_at !== null
  },

  // ====== 消息状态更新 ======

  // 更新消息状态
  updateMessageStatus: async (messageId: string, status: string): Promise<void> => {
    const { error } = await supabase
      .from('chat_messages')
      .update({ status })
      .eq('id', messageId)

    if (error) throw error
  },

  // 撤回消息
  recallMessage: async (messageId: string, userId: string): Promise<void> => {
    // 先查消息确认是自己的
    const { data: msg, error: fetchErr } = await supabase
      .from('chat_messages')
      .select('sender_id, created_at')
      .eq('id', messageId)
      .single()

    if (fetchErr || !msg) throw new Error('消息不存在')
    if (msg.sender_id !== userId) throw new Error('只能撤回自己的消息')

    // 只允许撤回 1 分钟内的消息
    const elapsed = Date.now() - new Date(msg.created_at).getTime()
    if (elapsed > 60 * 1000) {
      throw new Error('发送超过 1 分钟的消息无法撤回')
    }

    const { error } = await supabase
      .from('chat_messages')
      .update({ recalled_at: new Date().toISOString() })
      .eq('id', messageId)

    if (error) throw error
  },

  // 发送系统消息
  sendSystemMessage: async (conversationId: string, content: string): Promise<void> => {
    await supabase.from('chat_messages').insert({
      conversation_id: conversationId,
      sender_id: '00000000-0000-0000-0000-000000000000',
      content,
      message_type: 'system',
    })
  },

  // 标记已读
  markAsRead: async (conversationId: string, userId: string): Promise<void> => {
    await supabase
      .from('chat_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
  },

  // ====== 禁言 ======

  // 检查用户是否被禁言
  checkMuted: async (userId: string, conversationId: string): Promise<boolean> => {
    const now = new Date().toISOString()

    // 全局禁言
    const { data: globalMute } = await supabase
      .from('chat_mutes')
      .select('id')
      .eq('user_id', userId)
      .is('conversation_id', null)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .limit(1)

    if (globalMute && globalMute.length > 0) return true

    // 群组禁言
    const { data: groupMute } = await supabase
      .from('chat_mutes')
      .select('id')
      .eq('user_id', userId)
      .eq('conversation_id', conversationId)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .limit(1)

    return !!(groupMute && groupMute.length > 0)
  },

  // 获取禁言列表
  getMutes: async (): Promise<ChatMuteWithDetails[]> => {
    // 先查标量字段（避免联表查询因 null FK 或语法问题报错）
    const { data: mutes, error } = await supabase
      .from('chat_mutes')
      .select('id, user_id, conversation_id, muted_by, reason, expires_at, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    if (!mutes || mutes.length === 0) return []

    // 收集所有 user_id
    const allUserIds = new Set<string>()
    mutes.forEach(m => {
      allUserIds.add(m.user_id)
      allUserIds.add(m.muted_by)
    })
    const userIds = Array.from(allUserIds)

    // 批量查用户
    const { data: users } = await supabase
      .from('jkb_users')
      .select('id, display_name, phone')
      .in('id', userIds)
    const userMap = (users || []).reduce<Record<string, { id: string; display_name: string | null; phone: string | null }>>((acc, u) => {
      acc[u.id] = u
      return acc
    }, {})

    // 批量查会话（只查有 conversation_id 的）
    const convIds = mutes
      .filter(m => m.conversation_id)
      .map(m => m.conversation_id!)
    let convMap: Record<string, { id: string; name: string | null; type: string }> = {}
    if (convIds.length > 0) {
      const { data: convs } = await supabase
        .from('chat_conversations')
        .select('id, name, type')
        .in('id', convIds)
      ;(convs || []).forEach(c => { convMap[c.id] = c })
    }

    // 组装结果
    return mutes.map(m => ({
      ...m,
      user: userMap[m.user_id] || { id: m.user_id, display_name: null, phone: null },
      muted_by_user: userMap[m.muted_by] || { id: m.muted_by, display_name: null },
      conversation: m.conversation_id ? (convMap[m.conversation_id] || null) : null,
    })) as any as ChatMuteWithDetails[]
  },

  // 添加禁言
  addMute: async (data: {
    user_id: string
    conversation_id?: string | null
    muted_by: string
    reason?: string
    expires_at?: string | null
  }): Promise<ChatMute> => {
    const { data: mute, error } = await supabase
      .from('chat_mutes')
      .insert({
        user_id: data.user_id,
        conversation_id: data.conversation_id || null,
        muted_by: data.muted_by,
        reason: data.reason || null,
        expires_at: data.expires_at || null,
      })
      .select()
      .single()

    if (error) throw error
    return mute
  },

  // 移除禁言
  removeMute: async (muteId: string): Promise<void> => {
    const { error } = await supabase
      .from('chat_mutes')
      .delete()
      .eq('id', muteId)

    if (error) throw error
  },

  // 获取用户的禁言状态（供客户端校验）
  getUserMuteStatus: async (userId: string): Promise<{
    is_globally_muted: boolean
    group_mutes: string[]
  }> => {
    const now = new Date().toISOString()

    const { data: mutes } = await supabase
      .from('chat_mutes')
      .select('conversation_id')
      .eq('user_id', userId)
      .or(`expires_at.is.null,expires_at.gt.${now}`)

    const globalMuted = mutes?.some(m => m.conversation_id === null) || false
    const groupMutes = (mutes || [])
      .filter(m => m.conversation_id !== null)
      .map(m => m.conversation_id!)

    return { is_globally_muted: globalMuted, group_mutes: groupMutes }
  },
}
