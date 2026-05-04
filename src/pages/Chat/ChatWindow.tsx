import React, { useState, useEffect, useRef, useCallback } from 'react'
import { chatService } from '@/services/chatService'
import { supabase } from '@/services/supabase'
import { r2Service } from '@/services/r2Service'
import { compressToFile } from '@/utils/imageCompress'
import {
  ChatConversationWithDetails,
  ChatMessageWithSender,
} from '@/types/database'
import {
  PaperAirplaneIcon,
  UsersIcon,
  PhotoIcon,
  XMarkIcon,
  ArrowUturnLeftIcon,
} from '@heroicons/react/24/outline'
import GroupInfoDialog from './GroupInfoDialog'

interface ChatWindowProps {
  conversationId: string
  userId: string
  onMessageSent: () => void
}

export default function ChatWindow({ conversationId, userId, onMessageSent }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessageWithSender[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [convDetails, setConvDetails] = useState<ChatConversationWithDetails | null>(null)
  const [showGroupInfo, setShowGroupInfo] = useState(false)
  const [expandedImage, setExpandedImage] = useState<string | null>(null)
  const [pendingImages, setPendingImages] = useState<Array<{ file: File; previewUrl: string }>>([])
  const [isDragging, setIsDragging] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 加载消息和会话详情
  const loadMessages = useCallback(async () => {
    try {
      const msgs = await chatService.getMessages(conversationId)
      setMessages(msgs)
    } catch (err) {
      console.error('加载消息失败:', err)
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  const loadConvDetails = useCallback(async () => {
    if (!userId) return
    try {
      const convs = await chatService.getMyConversations(userId)
      const conv = convs.find(c => c.id === conversationId)
      if (conv) setConvDetails(conv)
    } catch {
      // 忽略
    }
  }, [conversationId, userId])

  useEffect(() => {
    setLoading(true)
    setMessages([])
    loadMessages()
    loadConvDetails()
  }, [conversationId, loadMessages, loadConvDetails])

  // 订阅实时新消息
  useEffect(() => {
    const channel = supabase
      .channel(`chat-messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: any) => {
          const newMsg = payload.new as any
          // 获取发送者信息
          supabase
            .from('jkb_users')
            .select('id, display_name, avatar_url')
            .eq('id', newMsg.sender_id)
            .single()
            .then(({ data: sender }) => {
              setMessages(prev => [
                ...prev,
                {
                  ...newMsg,
                  sender: sender || { id: newMsg.sender_id, display_name: null, avatar_url: null },
                } as ChatMessageWithSender,
              ])
            })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId])

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 发送消息（文字 + 图片一起发）
  const handleSend = async () => {
    const content = input.trim()
    if ((!content && pendingImages.length === 0) || sending) return

    setSending(true)
    try {
      // 1. 先上传所有待发图片
      for (const img of pendingImages) {
        const compressed = await compressToFile(img.file)
        const result = await r2Service.uploadFile(compressed, 'images')
        await chatService.sendImageMessage(
          conversationId, userId, result.url, result.key, 0, 0
        )
      }

      // 2. 再发送文本
      if (content) {
        await chatService.sendMessage(conversationId, userId, content)
      }

      // 3. 清理
      setInput('')
      pendingImages.forEach(img => URL.revokeObjectURL(img.previewUrl))
      setPendingImages([])
      onMessageSent()
      inputRef.current?.focus()
    } catch (err: any) {
      if (err.message?.includes('禁言')) {
        alert(err.message)
      } else {
        console.error('发送失败:', err)
        alert('发送失败: ' + (err.message || err))
      }
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ====== 图片选择、拖拽、粘贴 ======

  const addImageFiles = (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return
    if (imageFiles.length !== files.length) {
      alert('仅支持图片文件，已自动跳过非图片')
    }
    const newImages = imageFiles.map(file => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    setPendingImages(prev => [...prev, ...newImages])
  }

  // 点击按钮选择图片（支持多选）
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    addImageFiles(files)
  }

  // 拖拽图片
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) addImageFiles(files)
  }

  // 粘贴图片
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    const imageFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault() // 阻止粘贴原始图片数据到文本
      addImageFiles(imageFiles)
    }
  }

  // 移除待发图片
  const removePendingImage = (index: number) => {
    setPendingImages(prev => {
      URL.revokeObjectURL(prev[index].previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  // 撤回消息
  const handleRecall = async (messageId: string) => {
    if (!window.confirm('确定撤回该消息？')) return
    try {
      await chatService.recallMessage(messageId, userId)
      await loadMessages()
      onMessageSent()
    } catch (err: any) {
      alert('撤回失败: ' + (err.message || err))
    }
  }

  // 判断消息是否可撤回（自己的消息 + 2分钟内 + 非系统/已撤回）
  const canRecall = (msg: ChatMessageWithSender) => {
    if (msg.message_type === 'system') return false
    if (msg.recalled_at) return false
    if (msg.sender_id !== userId) return false
    const elapsed = Date.now() - new Date(msg.created_at).getTime()
    return elapsed <= 60 * 1000
  }

  // 获取会话头像
  const getConvAvatar = () => {
    if (!convDetails) {
      return <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-medium">?</div>
    }
    if (convDetails.type === 'group') {
      if (convDetails.avatar_url) {
        return (
          <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
            <img
              src={convDetails.avatar_url}
              alt={convDetails.name || '群头像'}
              className="w-full h-full object-cover"
            />
          </div>
        )
      }
      return (
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <UsersIcon className="h-4 w-4 text-primary" />
        </div>
      )
    }
    const other = convDetails.participants.find(p => p.user.id !== userId)
    const initial = (other?.user.display_name || other?.user.phone || '?').charAt(0).toUpperCase()
    return (
      <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center font-semibold bg-gradient-to-br from-blue-400 to-purple-500 text-white text-xs flex-shrink-0">
        {other?.user.avatar_url ? (
          <img
            src={other.user.avatar_url}
            alt={other.user.display_name || '头像'}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              const parent = target.parentElement!
              parent.innerHTML = `<span class="text-xs font-semibold text-white">${initial}</span>`
            }}
          />
        ) : (
          <span>{initial}</span>
        )}
      </div>
    )
  }

  // 获取会话标题
  const getTitle = () => {
    if (!convDetails) return '加载中...'
    if (convDetails.type === 'group') {
      if (convDetails.disbanded_at) return convDetails.name + ' (已解散)'
      return convDetails.name || '群聊'
    }
    const other = convDetails.participants.find(p => p.user.id !== userId)
    return other?.user.display_name || other?.user.phone || '未知用户'
  }

  // 获取群头像 URL
  const getGroupAvatarUrl = () => {
    if (convDetails?.type === 'group' && convDetails.avatar_url) {
      return convDetails.avatar_url
    }
    return null
  }

  // 渲染消息内容（支持文本和图片）
  const renderMessageContent = (msg: ChatMessageWithSender) => {
    // 已撤回的消息
    if (msg.recalled_at) {
      return (
        <span className="italic text-amber-500/70 text-xs">
          {msg.sender_id === userId ? '你' : (msg.sender?.display_name || '对方')} 已撤回了一条消息
        </span>
      )
    }
    if (msg.message_type === 'image') {
      const imgData = chatService.parseImageContent(msg.content)
      const src = imgData?.url || msg.content
      return (
        <div
          className="relative group cursor-pointer max-w-[240px] rounded-lg overflow-hidden"
          onClick={() => setExpandedImage(expandedImage === src ? null : src)}
        >
          <img
            src={src}
            alt="图片"
            className="w-full h-auto rounded-lg border border-border/30 hover:opacity-90 transition-opacity"
            loading="lazy"
          />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10">
            <svg className="w-8 h-8 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
            </svg>
          </div>
        </div>
      )
    }
    // 兼容旧格式的图片链接
    if (msg.content.startsWith('http') && (msg.content.includes('.jpg') || msg.content.includes('.png') || msg.content.includes('.webp') || msg.content.includes('.avif'))) {
      return (
        <div
          className="relative group cursor-pointer max-w-[240px] rounded-lg overflow-hidden"
          onClick={() => setExpandedImage(expandedImage === msg.content ? null : msg.content)}
        >
          <img
            src={msg.content}
            alt="图片"
            className="w-full h-auto rounded-lg border border-border/30 hover:opacity-90 transition-opacity"
            loading="lazy"
          />
        </div>
      )
    }
    return <span>{msg.content}</span>
  }

  // 消息发送者头像
  const getSenderAvatar = (msg: ChatMessageWithSender) => {
    const initial = (msg.sender?.display_name || msg.sender_id).charAt(0).toUpperCase()
    return (
      <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center font-semibold bg-gradient-to-br from-blue-400 to-purple-500 text-white text-[10px] flex-shrink-0 mt-1">
        {msg.sender?.avatar_url ? (
          <img
            src={msg.sender.avatar_url}
            alt={msg.sender.display_name || '头像'}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              const parent = target.parentElement!
              parent.innerHTML = `<span class="text-[10px] font-semibold text-white">${initial}</span>`
            }}
          />
        ) : (
          <span>{initial}</span>
        )}
      </div>
    )
  }

  // 格式化消息时间
  const formatMsgTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  // 格式化日期分隔
  const shouldShowDateSeparator = (index: number): string | null => {
    if (index === 0) {
      const d = new Date(messages[0].created_at)
      return formatDateLabel(d)
    }
    const prev = new Date(messages[index - 1].created_at)
    const curr = new Date(messages[index].created_at)
    if (prev.toDateString() !== curr.toDateString()) {
      return formatDateLabel(curr)
    }
    return null
  }

  const getSenderName = (msg: ChatMessageWithSender) => {
    if (msg.message_type === 'system') return null
    const isMe = msg.sender_id === userId
    return isMe ? '我' : (msg.sender?.display_name || '未知')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#f5f5f7] dark:bg-background">
        <span className="animate-spin h-5 w-5 border-b-2 border-primary rounded-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#f5f5f7] dark:bg-background">
      {/* 聊天头部 */}
      <div className="h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          {getConvAvatar()}
          <div>
            <div className="text-sm font-medium truncate max-w-[300px]">
              {getTitle()}
            </div>
            {convDetails?.type === 'group' && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {convDetails.participants.length} 位成员
                </span>
                <button
                  onClick={() => setShowGroupInfo(true)}
                  className="text-[10px] text-primary hover:underline"
                >
                  详情
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">暂无消息，发送第一条消息吧</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const dateSep = shouldShowDateSeparator(index)
            const isSystem = msg.message_type === 'system'
            const isMe = msg.sender_id === userId

            return (
              <React.Fragment key={msg.id}>
                {/* 日期分隔 */}
                {dateSep && (
                  <div className="flex items-center gap-2 py-2">
                    <div className="flex-1 h-px bg-border/50" />
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{dateSep}</span>
                    <div className="flex-1 h-px bg-border/50" />
                  </div>
                )}

                {isSystem ? (
                  /* 系统消息 */
                  <div className="text-center py-1">
                    <span className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                      {msg.content}
                    </span>
                  </div>
                ) : (
                  /* 普通消息 */
                  <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} gap-2 group`}>
                    {/* 对方头像 */}
                    {!isMe && getSenderAvatar(msg)}

                    <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                      {/* 发送者名称（非自己时显示） */}
                      {!isMe && (
                        <span className="text-[10px] text-muted-foreground mb-0.5 ml-1">
                          {getSenderName(msg)}
                        </span>
                      )}
                      {/* 撤回按钮（自己的消息 + 可撤回） */}
                      {isMe && canRecall(msg) && (
                        <button
                          onClick={() => handleRecall(msg.id)}
                          className="text-[9px] text-destructive/60 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all mb-0.5 self-end mr-1"
                        >
                          撤回
                        </button>
                      )}
                      {/* 消息气泡 */}
                      <div
                        className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                          isMe
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-card text-foreground shadow-sm rounded-bl-md'
                        }`}
                      >
                        {renderMessageContent(msg)}
                      </div>
                      {/* 时间 + 状态 */}
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-muted-foreground/60 mt-0.5 px-1">
                          {formatMsgTime(msg.created_at)}
                        </span>
                        {msg.message_type !== 'system' && (
                          <span className="text-[9px] mt-0.5">
                            {msg.status === 'sending' && <span className="text-muted-foreground/40">发送中...</span>}
                            {msg.status === 'failed' && <span className="text-destructive">未发送</span>}
                            {msg.status === 'sent' && <span className="text-muted-foreground/30">已发送</span>}
                            {msg.status === 'read' && <span className="text-primary">已读</span>}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </React.Fragment>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <div
        className={`px-4 py-3 border-t border-border bg-card/80 backdrop-blur-sm flex-shrink-0 relative ${isDragging ? 'opacity-90' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* 拖拽高亮遮罩 */}
        {isDragging && (
          <div className="absolute inset-0 z-10 bg-primary/5 border-2 border-dashed border-primary rounded-xl mx-2 my-2 flex items-center justify-center">
            <span className="text-sm text-primary font-medium">拖放图片即可添加</span>
          </div>
        )}

        {/* 待发图片预览 */}
        {pendingImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 px-1">
            {pendingImages.map((img, idx) => (
              <div key={idx} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-border/50">
                <img
                  src={img.previewUrl}
                  alt={`待发图片${idx + 1}`}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => removePendingImage(idx)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <XMarkIcon className="h-3 w-3 text-white" />
                </button>
                {idx === 0 && pendingImages.length > 1 && (
                  <span className="absolute bottom-0.5 right-0.5 text-[9px] bg-black/50 text-white px-1 rounded">
                    +{pendingImages.length - 1}
                  </span>
                )}
              </div>
            ))}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center hover:border-primary/50 transition-colors text-muted-foreground hover:text-primary"
            >
              <PhotoIcon className="h-5 w-5" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 bg-background rounded-xl border border-input p-2 focus-within:ring-2 focus-within:ring-ring/20 focus-within:border-primary transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={pendingImages.length > 0 ? '添加文字说明...' : '输入消息... (Enter 发送, Shift+Enter 换行, 支持拖入/粘贴图片)'}
            rows={1}
            className="flex-1 resize-none bg-transparent outline-none text-sm px-1 py-1 max-h-24 scrollbar-thin"
            disabled={sending}
          />
          {/* 图片上传按钮 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
            title="选择图片"
          >
            <PhotoIcon className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageSelect}
          />
          <button
            onClick={handleSend}
            disabled={(!input.trim() && pendingImages.length === 0) || sending}
            className={`p-2 rounded-lg transition-all flex-shrink-0 ${
              (input.trim() || pendingImages.length > 0) && !sending
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
          >
            {sending ? (
              <span className="animate-spin h-4 w-4 border-b-2 border-current rounded-full block" />
            ) : (
              <PaperAirplaneIcon className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* 群信息弹窗 */}
      {showGroupInfo && (
        <GroupInfoDialog
          conversationId={conversationId}
          userId={userId}
          isOwner={convDetails?.created_by === userId}
          onClose={() => setShowGroupInfo(false)}
          onUpdate={() => { loadMessages(); loadConvDetails() }}
        />
      )}

      {/* 图片放大查看 */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setExpandedImage(null)}
        >
          <img
            src={expandedImage}
            alt="查看图片"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  )
}

function formatDateLabel(date: Date): string {
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) {
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
    return weekdays[date.getDay()]
  }
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', year: 'numeric' })
}
