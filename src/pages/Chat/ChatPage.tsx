import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthStore } from '@/store/authStore'
import { chatService } from '@/services/chatService'
import { presenceService } from '@/services/presenceService'
import { departmentService } from '@/services/departmentService'
import {
  ChatConversationWithDetails,
  ChatMessageWithSender,
  DepartmentTreeNode,
  JkbUser,
} from '@/types/database'
import { supabase } from '@/services/supabase'
import { toast } from 'react-hot-toast'
import { triggerMessageNotification } from '@/hooks/useChatNotification'
import ContactsPanel from './ContactsPanel'
import ChatWindow from './ChatWindow'
import CreateGroupDialog from './CreateGroupDialog'
import { ChatBubbleLeftRightIcon, PlusIcon, UsersIcon } from '@heroicons/react/24/outline'

type TabType = 'contacts' | 'conversations'

export default function ChatPage() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<TabType>('conversations')
  const [conversations, setConversations] = useState<ChatConversationWithDetails[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>({})

  // 加载会话列表
  const loadConversations = useCallback(async () => {
    if (!user?.id) return
    try {
      const convs = await chatService.getMyConversations(user.id)
      setConversations(convs)
    } catch (err) {
      console.error('加载会话失败:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  // 加载在线状态
  const loadPresence = useCallback(async () => {
    try {
      const map = await presenceService.getAllPresence()
      setPresenceMap(map)
    } catch {
      // 表可能还没有创建
    }
  }, [])

  useEffect(() => {
    loadConversations()
    loadPresence()

    // 订阅新消息
    const msgChannel = supabase
      .channel('chat-messages-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        async (payload: any) => {
          const newMsg = payload.new
          // 刷新会话列表
          loadConversations()

          // 通知：不是自己的消息才触发
          if (!user?.id || newMsg.sender_id === user.id) return
          if (newMsg.message_type === 'system') return

          // 获取发送者名称
          let senderName = '新消息'
          try {
            const { data: sender } = await supabase
              .from('jkb_users')
              .select('display_name')
              .eq('id', newMsg.sender_id)
              .single()
            if (sender?.display_name) senderName = sender.display_name
          } catch {}

          // 截取预览内容
          let preview = newMsg.content
          if (newMsg.message_type === 'image') preview = '[图片]'
          if (preview.length > 50) preview = preview.slice(0, 50) + '…'

          const isCurrentConv = activeConvId === newMsg.conversation_id
          triggerMessageNotification(senderName, preview, false, isCurrentConv)
        }
      )
      .subscribe()

    // 订阅在线状态变化
    const presenceChannel = presenceService.subscribePresence((payload: any) => {
      if (payload.new) {
        setPresenceMap(prev => ({
          ...prev,
          [payload.new.user_id]: payload.new.is_online,
        }))
      }
    })

    return () => {
      supabase.removeChannel(msgChannel)
      supabase.removeChannel(presenceChannel)
    }
  }, [loadConversations, loadPresence])

  // 启动心跳
  useEffect(() => {
    if (!user?.id) return
    const cleanup = presenceService.startHeartbeat(user.id)
    return cleanup
  }, [user?.id])

  // 开始私聊
  const handleStartChat = async (targetUserId: string) => {
    if (!user?.id) return
    try {
      const convId = await chatService.findOrCreateDirectConversation(user.id, targetUserId)
      setActiveConvId(convId)
      setActiveTab('conversations')
      await loadConversations()
    } catch (err: any) {
      console.error('创建会话失败:', err)
      toast.error(err?.message || '创建会话失败，请检查数据库表是否已创建')
    }
  }

  // 选择会话
  const handleSelectConversation = async (convId: string) => {
    setActiveConvId(convId)
    // 标记已读
    if (user?.id) {
      await chatService.markAsRead(convId, user.id)
      loadConversations()
    }
  }

  // 群聊创建成功
  const handleGroupCreated = (convId: string) => {
    setActiveConvId(convId)
    setActiveTab('conversations')
    setShowCreateGroup(false)
    loadConversations()
  }

  // 会话的其他参与者名称
  const getConvDisplayName = (conv: ChatConversationWithDetails): string => {
    if (conv.type === 'group') return conv.name || '群聊'
    const other = conv.participants.find(p => p.user.id !== user?.id)
    return other?.user.display_name || other?.user.phone || '未知用户'
  }

  const getConvAvatarUrl = (conv: ChatConversationWithDetails): string | null => {
    if (conv.type === 'group') return null
    const other = conv.participants.find(p => p.user.id !== user?.id)
    return other?.user.avatar_url || null
  }

  // 截取最新消息预览
  const getLastMessagePreview = (conv: ChatConversationWithDetails): string => {
    if (!conv.last_message) return ''
    const content = conv.last_message.content
    const prefix = conv.last_message.sender_id === user?.id ? '我: ' : ''
    if (content === '已撤回的消息') return prefix + '[已撤回]'
    return prefix + content
  }

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0)

  return (
    <div className="flex h-full">
      {/* 左侧面板 */}
      <div className="w-80 flex-shrink-0 border-r border-border bg-card flex flex-col">
        {/* 标签页头 */}
        <div className="flex items-center border-b border-border px-4 py-3 gap-2">
          <button
            onClick={() => setActiveTab('conversations')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'conversations'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            <ChatBubbleLeftRightIcon className="h-4 w-4" />
            会话
            {totalUnread > 0 && (
              <span className="ml-1 bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('contacts')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'contacts'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            <UsersIcon className="h-4 w-4" />
            通讯录
          </button>

          <div className="flex-1" />

          <button
            onClick={() => setShowCreateGroup(true)}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent transition-all"
            title="创建群聊"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'contacts' ? (
            <ContactsPanel
              onStartChat={handleStartChat}
              presenceMap={presenceMap}
            />
          ) : (
            <div className="divide-y divide-border/50">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <span className="animate-spin h-5 w-5 border-b-2 border-primary rounded-full" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground px-4">
                  <ChatBubbleLeftRightIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p>暂无会话</p>
                  <p className="text-xs mt-1">从通讯录选择联系人开始对话</p>
                </div>
              ) : (
                conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors ${
                      activeConvId === conv.id ? 'bg-accent' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* 头像 */}
                      <div className="relative flex-shrink-0">
                        {conv.type === 'group' ? (
                          conv.avatar_url ? (
                            <div className="w-10 h-10 rounded-full overflow-hidden">
                              <img
                                src={conv.avatar_url}
                                alt={conv.name || '群头像'}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <UsersIcon className="h-5 w-5 text-primary" />
                            </div>
                          )
                        ) : (
                          (() => {
                            const other = conv.participants.find(p => p.user.id !== user?.id)
                            const name = other?.user.display_name || other?.user.phone || '?'
                            const initial = name.charAt(0).toUpperCase()
                            const avatarUrl = other?.user.avatar_url
                            const online = other ? presenceMap[other.user.id] : false
                            return (
                              <>
                                <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                                  {avatarUrl ? (
                                    <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
                                  ) : (
                                    initial
                                  )}
                                </div>
                                <span
                                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${
                                    online ? 'bg-green-500' : 'bg-gray-400'
                                  }`}
                                />
                              </>
                            )
                          })()
                        )}
                      </div>

                      {/* 内容 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">
                            {getConvDisplayName(conv)}
                          </span>
                          {conv.last_message && (
                            <span className="text-[10px] text-muted-foreground flex-shrink-0">
                              {formatTime(conv.last_message.created_at)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground truncate">
                            {conv.last_message
                              ? getLastMessagePreview(conv)
                              : conv.type === 'group' ? '群聊已创建' : '开始聊天'}
                          </span>
                          {conv.unread_count > 0 && (
                            <span className="ml-auto flex-shrink-0 bg-destructive text-destructive-foreground text-[11px] font-bold leading-none flex items-center justify-center rounded-full min-w-[20px] h-[20px] px-[5px]">
                              {conv.unread_count > 99 ? '99+' : conv.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* 右侧聊天区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeConvId ? (
          <ChatWindow
            conversationId={activeConvId}
            userId={user?.id || ''}
            onMessageSent={loadConversations}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-[#f5f5f7] dark:bg-background">
            <div className="text-center">
              <ChatBubbleLeftRightIcon className="h-16 w-16 mx-auto text-muted-foreground/20 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">选择一个会话</p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                或从通讯录中选择联系人开始聊天
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 创建群聊弹窗 */}
      {showCreateGroup && (
        <CreateGroupDialog
          onClose={() => setShowCreateGroup(false)}
          onCreated={handleGroupCreated}
          userId={user?.id || ''}
        />
      )}
    </div>
  )
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return '昨天'
  } else if (diffDays < 7) {
    return `${diffDays}天前`
  } else {
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }
}
