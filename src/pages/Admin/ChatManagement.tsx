import React, { useState, useEffect, useCallback } from 'react'
import { chatService } from '@/services/chatService'
import { supabase } from '@/services/supabase'
import {
  ChatConversationWithDetails,
  ChatMessageWithSender,
  ChatMuteWithDetails,
  ChatMute,
} from '@/types/database'
import { useAuthStore } from '@/store/authStore'
import {
  ChatBubbleLeftRightIcon,
  NoSymbolIcon,
  TrashIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  MicrophoneIcon,
} from '@heroicons/react/24/outline'

type Tab = 'conversations' | 'messages' | 'mutes'

export default function ChatManagement() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<Tab>('conversations')
  const [conversations, setConversations] = useState<ChatConversationWithDetails[]>([])
  const [selectedConv, setSelectedConv] = useState<string | null>(null)
  const [convMessages, setConvMessages] = useState<ChatMessageWithSender[]>([])
  const [mutes, setMutes] = useState<ChatMuteWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [allUsers, setAllUsers] = useState<Array<{ id: string; display_name: string | null; avatar_url: string | null; phone: string | null }>>([])

  // 禁言弹窗
  const [showMuteDialog, setShowMuteDialog] = useState(false)
  const [muteUserId, setMuteUserId] = useState('')
  const [muteReason, setMuteReason] = useState('')
  const [muteGlobal, setMuteGlobal] = useState(true)
  const [muteDuration, setMuteDuration] = useState<'permanent' | '1h' | '6h' | '24h' | '7d'>('permanent')
  const [muteUserSearch, setMuteUserSearch] = useState('')

  // 搜索
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadAllData()
    loadUsers()
  }, [])

  const loadAllData = async () => {
    setLoading(true)
    try {
      const allConvs = await chatService.getMyConversations(user?.id || '')
      setConversations(allConvs)
      const muteList = await chatService.getMutes()
      setMutes(muteList)
    } catch (err) {
      console.error('加载聊天数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    const { data } = await supabase
      .from('jkb_users')
      .select('id, display_name, avatar_url, phone')
      .eq('is_active', true)
    setAllUsers(data || [])
  }

  const loadConvMessages = async (convId: string) => {
    try {
      const msgs = await chatService.getMessages(convId, { limit: 200 })
      setConvMessages(msgs)
      setSelectedConv(convId)
      setActiveTab('messages')
    } catch (err) {
      console.error('加载消息失败:', err)
    }
  }

  const getUserName = (userId: string) => {
    const u = allUsers.find(u => u.id === userId)
    return u?.display_name || u?.phone || userId.slice(0, 8)
  }

  const getConvName = (conv: ChatConversationWithDetails) => {
    if (conv.type === 'group') return conv.name || '群聊'
    const other = conv.participants.find(p => p.user.id !== user?.id)
    return other?.user.display_name || other?.user.phone || '私聊'
  }

  // 渲染管理后台的消息内容（支持图片、已撤回）
  const renderAdminMessageContent = (msg: ChatMessageWithSender) => {
    // 已撤回的消息在管理后台保留内容 + 标记
    const isRecalled = !!msg.recalled_at

    if (msg.message_type === 'image') {
      const imgData = chatService.parseImageContent(msg.content)
      const src = imgData?.url || msg.content
      return (
        <div className="mb-1">
          {isRecalled && (
            <span className="inline-block text-[10px] text-amber-500 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded mb-1">已撤回</span>
          )}
          <div className="max-w-[200px] rounded-lg overflow-hidden border border-border/30 cursor-pointer hover:opacity-90 transition-opacity">
            <img
              src={src}
              alt="图片消息"
              className="w-full h-auto"
              loading="lazy"
              onClick={() => window.open(src, '_blank')}
            />
          </div>
        </div>
      )
    }
    return (
      <div className="flex items-start gap-2">
        {isRecalled && (
          <span className="flex-shrink-0 text-[10px] text-amber-500 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded mt-0.5">已撤回</span>
        )}
        <p className={`leading-relaxed ${msg.is_deleted ? 'text-muted-foreground italic' : ''} ${isRecalled ? 'line-through opacity-60' : ''}`}>
          {msg.content}
        </p>
      </div>
    )
  }

  // 禁言
  const handleMute = async () => {
    if (!muteUserId || !user?.id) return
    try {
      let expiresAt: string | null = null
      if (muteDuration !== 'permanent') {
        const now = new Date()
        const hoursMap = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 }
        now.setHours(now.getHours() + hoursMap[muteDuration])
        expiresAt = now.toISOString()
      }

      await chatService.addMute({
        user_id: muteUserId,
        conversation_id: muteGlobal ? null : selectedConv,
        muted_by: user.id,
        reason: muteReason || undefined,
        expires_at: expiresAt,
      })

      setShowMuteDialog(false)
      setMuteUserId('')
      setMuteReason('')
      loadAllData()
    } catch (err) {
      console.error('禁言失败:', err)
    }
  }

  // 取消禁言
  const handleUnmute = async (muteId: string) => {
    try {
      await chatService.removeMute(muteId)
      loadAllData()
    } catch (err) {
      console.error('取消禁言失败:', err)
    }
  }

  // 计算剩余禁言时间
  const getMuteExpiryText = (mute: ChatMuteWithDetails) => {
    if (!mute.expires_at) return '永久'
    const remaining = new Date(mute.expires_at).getTime() - Date.now()
    if (remaining <= 0) return '已过期'
    const hours = Math.floor(remaining / (1000 * 60 * 60))
    if (hours < 1) return `${Math.floor(remaining / (1000 * 60))}分钟`
    if (hours < 24) return `${hours}小时`
    return `${Math.floor(hours / 24)}天`
  }

  const filteredConvs = searchQuery.trim()
    ? conversations.filter(c =>
        getConvName(c).toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations

  const filteredMessages = convMessages.filter(m => {
    if (!searchQuery.trim()) return true
    return m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.sender?.display_name || '').toLowerCase().includes(searchQuery.toLowerCase())
  })

  return (
    <div className="space-y-6">
      {/* 标签页 */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        {([
          { key: 'conversations', label: '会话列表', badge: undefined },
          { key: 'messages', label: '消息记录', badge: selectedConv ? getUserName(selectedConv) : undefined },
          { key: 'mutes', label: '禁言管理', badge: `${mutes.length}` },
        ] as Array<{ key: Tab; label: string; badge: string | undefined }>).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            {tab.badge && (
              <span className="text-[10px] bg-muted-foreground/20 text-muted-foreground px-1.5 py-0.5 rounded-full">
                {tab.badge}
              </span>
            )}
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        {/* 搜索 */}
        <div className="relative w-48">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索..."
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-background border border-input text-sm outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>
      </div>

      {/* 会话列表 */}
      {activeTab === 'conversations' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="divide-y divide-border/50 max-h-[500px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <span className="animate-spin h-5 w-5 border-b-2 border-primary rounded-full" />
              </div>
            ) : filteredConvs.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                暂无会话
              </div>
            ) : (
              filteredConvs.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => loadConvMessages(conv.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                    {getConvName(conv).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{getConvName(conv)}</span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {conv.last_message
                          ? new Date(conv.last_message.created_at).toLocaleDateString('zh-CN')
                          : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground truncate">
                        {conv.type === 'group' ? `[群聊] ` : `[私聊] `}
                        {conv.participants.length} 人
                        {conv.last_message ? ` · ${conv.last_message.content.slice(0, 30)}` : ''}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* 消息记录 */}
      {activeTab === 'messages' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {selectedConv ? (
            <>
              <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
                <span className="text-sm font-medium">
                  会话 {getUserName(selectedConv)} · {convMessages.length} 条消息
                </span>
                <button
                  onClick={() => setActiveTab('conversations')}
                  className="text-xs text-primary hover:underline"
                >
                  返回会话列表
                </button>
              </div>
              <div className="max-h-[500px] overflow-y-auto px-4 py-3 space-y-2">
                {filteredMessages.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">暂无消息</div>
                ) : (
                  filteredMessages.map(msg => (
                    <div key={msg.id} className="flex items-start gap-3 text-sm">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-[9px] font-medium flex-shrink-0 mt-0.5">
                        {(msg.sender?.display_name || msg.sender_id).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">
                            {msg.sender?.display_name || '系统'}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(msg.created_at).toLocaleString('zh-CN')}
                          </span>
                          {msg.message_type === 'system' && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded">系统</span>
                          )}
                          {msg.message_type === 'image' && (
                            <span className="text-[10px] text-primary bg-primary/5 px-1 py-0.5 rounded">图片</span>
                          )}
                        </div>
                        <div className="mt-0.5 leading-relaxed">
                          {renderAdminMessageContent(msg)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-sm text-muted-foreground">
              请选择左侧会话查看消息记录
            </div>
          )}
        </div>
      )}

      {/* 禁言管理 */}
      {activeTab === 'mutes' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => {
                setMuteUserId('')
                setMuteReason('')
                setMuteGlobal(true)
                setMuteDuration('permanent')
                setShowMuteDialog(true)
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <NoSymbolIcon className="h-4 w-4" />
              添加禁言
            </button>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="divide-y divide-border/50">
              {mutes.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  暂无禁言记录
                </div>
              ) : (
                mutes.map(mute => (
                  <div key={mute.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                      <NoSymbolIcon className="h-4 w-4 text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {mute.user?.display_name || mute.user?.phone || mute.user_id.slice(0, 8)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {mute.conversation ? `群聊: ${mute.conversation.name || '未命名'}` : '全局禁言'}
                        {mute.reason ? ` · 原因: ${mute.reason}` : ''}
                        {' · '}剩余: {getMuteExpiryText(mute)}
                        {' · '}由 {mute.muted_by_user?.display_name || '管理员'} 操作
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnmute(mute.id)}
                      className="text-xs text-primary hover:underline flex-shrink-0"
                    >
                      取消禁言
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 禁言弹窗 */}
      {showMuteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">添加禁言</h2>
              <button onClick={() => setShowMuteDialog(false)} className="p-1 rounded-lg hover:bg-accent">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* 选择用户（带搜索） */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">选择用户</label>
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={muteUserSearch}
                  onChange={e => { setMuteUserSearch(e.target.value); setMuteUserId('') }}
                  placeholder="搜索用户..."
                  className="w-full h-10 pl-9 pr-3 rounded-lg bg-background border border-input text-sm outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
              {/* 用户列表 */}
              <div className="mt-2 max-h-[200px] overflow-y-auto space-y-0.5 rounded-lg border border-input bg-background">
                {(muteUserSearch.trim()
                  ? allUsers.filter(u =>
                      (u.display_name || '').toLowerCase().includes(muteUserSearch.toLowerCase()) ||
                      (u.phone || '').includes(muteUserSearch)
                    )
                  : allUsers
                ).map(u => (
                  <button
                    key={u.id}
                    onClick={() => setMuteUserId(u.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                      muteUserId === u.id
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-[9px] font-medium flex-shrink-0">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        (u.display_name || u.phone || '?').charAt(0).toUpperCase()
                      )}
                    </div>
                    <span className="truncate">{u.display_name || u.phone}</span>
                    {muteUserId === u.id && (
                      <span className="ml-auto text-xs text-primary">✓</span>
                    )}
                  </button>
                ))}
                {(muteUserSearch.trim() ? allUsers.filter(u =>
                  (u.display_name || '').toLowerCase().includes(muteUserSearch.toLowerCase()) ||
                  (u.phone || '').includes(muteUserSearch)
                ) : allUsers).length === 0 && (
                  <div className="px-3 py-4 text-xs text-muted-foreground text-center">无匹配用户</div>
                )}
              </div>
            </div>

            {/* 禁言范围 */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">禁言范围</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setMuteGlobal(true)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                    muteGlobal ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground'
                  }`}
                >
                  全局禁言
                </button>
                <button
                  onClick={() => setMuteGlobal(false)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                    !muteGlobal ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground'
                  }`}
                >
                  仅当前会话
                </button>
              </div>
            </div>

            {/* 禁言时长 */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">禁言时长</label>
              <div className="flex flex-wrap gap-2">
                {([
                  { key: '1h', label: '1小时' },
                  { key: '6h', label: '6小时' },
                  { key: '24h', label: '24小时' },
                  { key: '7d', label: '7天' },
                  { key: 'permanent', label: '永久' },
                ] as const).map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setMuteDuration(opt.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                      muteDuration === opt.key
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-input text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 原因 */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">原因（可选）</label>
              <input
                type="text"
                value={muteReason}
                onChange={e => setMuteReason(e.target.value)}
                placeholder="输入禁言原因..."
                className="w-full h-10 px-3 rounded-lg bg-background border border-input text-sm outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>

            <button
              onClick={handleMute}
              disabled={!muteUserId}
              className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all ${
                muteUserId
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              确认禁言
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
