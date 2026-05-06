import React, { useState, useEffect, useRef, useCallback } from 'react'
import { chatService } from '@/services/chatService'
import { supabase } from '@/services/supabase'
import { r2Service } from '@/services/r2Service'
import { compressToFile } from '@/utils/imageCompress'
import { fetchLinkPreview, extractAllUrls, LinkPreviewData } from '@/services/linkPreviewService'
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
  FaceSmileIcon,
  ArrowDownTrayIcon,
  DocumentIcon,
  PaperClipIcon,
} from '@heroicons/react/24/outline'
import GroupInfoDialog from './GroupInfoDialog'

interface ChatWindowProps {
  conversationId: string
  userId: string
  onMessageSent: () => void
  onBack?: () => void
  scrollToMessageId?: string | null
  onScrollHandled?: () => void
}

// 链接预览卡片组件（模块级别，稳定身份避免重渲染导致的图片闪烁）
function LinkPreviewCard({ data }: { data: LinkPreviewData }) {
  const [imgError, setImgError] = useState(false)
  const [faviconError, setFaviconError] = useState(false)

  const showImage = data.image && !imgError
  const showFavicon = data.favicon && !faviconError

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-[260px] rounded-lg border border-border/30 overflow-hidden bg-card"
      onClick={(e) => e.stopPropagation()}
    >
      {showImage && (
        <div className="h-32 overflow-hidden">
          <img
            src={data.image!}
            alt={data.title || '链接预览'}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        </div>
      )}
      <div className="p-2.5 space-y-1">
        {data.title && (
          <div className="text-xs font-medium text-foreground">{data.title}</div>
        )}
        {data.description && (
          <div className="text-[10px] text-muted-foreground">{data.description}</div>
        )}
        <div className="flex items-center gap-1 pt-0.5">
          {showFavicon && (
            <img src={data.favicon!} alt="" className="w-3 h-3 rounded" onError={() => setFaviconError(true)} />
          )}
          <span className="text-[9px] text-muted-foreground/60">
            {data.siteName || (() => { try { return new URL(data.url).hostname } catch { return data.url } })()}
          </span>
        </div>
      </div>
    </a>
  )
}

export default function ChatWindow({ conversationId, userId, onMessageSent, onBack, scrollToMessageId, onScrollHandled }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessageWithSender[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [convDetails, setConvDetails] = useState<ChatConversationWithDetails | null>(null)
  const [showGroupInfo, setShowGroupInfo] = useState(false)
  const [expandedImage, setExpandedImage] = useState<string | null>(null)
  const [pendingImages, setPendingImages] = useState<Array<{ file: File; previewUrl: string }>>([])
  const [isDragging, setIsDragging] = useState(false)
  const [replyingTo, setReplyingTo] = useState<ChatMessageWithSender | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [imageGallery, setImageGallery] = useState<{ images: ChatMessageWithSender[]; currentIndex: number } | null>(null)
  const [readPopup, setReadPopup] = useState<{ messageId: string; users: Array<{ user_id: string; display_name: string | null; read_at: string }> } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileDocInputRef = useRef<HTMLInputElement>(null)
  const [pendingFiles, setPendingFiles] = useState<Array<{ file: File }>>([])
  const [linkPreviewCache, setLinkPreviewCache] = useState<Record<string, LinkPreviewData>>({})
  const fetchedUrlsRef = useRef<Set<string>>(new Set())
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null)
  const skipAutoScrollRef = useRef(false)

  // 禁言/封禁状态
  const [myBanInfo, setMyBanInfo] = useState<{
    banned: boolean
    reason: string | null
    expires_at: string | null
  } | null>(null)
  const [otherBanInfo, setOtherBanInfo] = useState<{
    banned: boolean
    reason: string | null
    expires_at: string | null
  } | null>(null)

  // 全局批量抓取链接预览（避免内嵌组件反复挂载导致的图片闪烁）
  useEffect(() => {
    messages.forEach(msg => {
      if (msg.message_type !== 'text' || msg.recalled_at) return
      const urls = extractAllUrls(msg.content)
      urls.forEach(url => {
        if (fetchedUrlsRef.current.has(url) || linkPreviewCache[url]) return
        fetchedUrlsRef.current.add(url)
        fetchLinkPreview(url).then(result => {
          if (result) {
            setLinkPreviewCache(prev => ({ ...prev, [url]: result }))
          }
        })
      })
    })
  }, [messages])

  // 加载消息和会话详情
  const loadMessages = useCallback(async () => {
    try {
      const msgs = await chatService.getMessages(conversationId)
      setMessages(msgs)
      // 自动标记他人消息为已读
      if (userId) {
        chatService.markConversationMessagesAsRead(conversationId, userId).catch(() => {})
        // 加载已读人数
        const myMsgIds = msgs.filter(m => m.sender_id === userId && m.status !== 'read').map(m => m.id)
        if (myMsgIds.length > 0) {
          chatService.getMessagesReadCounts(myMsgIds).then(counts => {
            setMessages(prev => prev.map(m => ({
              ...m,
              read_count: counts[m.id] || 0,
            })))
          }).catch(() => {})
        }
      }
    } catch (err) {
      console.error('加载消息失败:', err)
    } finally {
      setLoading(false)
    }
  }, [conversationId, userId])

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

  // 检查当前用户和对方的禁言状态
  useEffect(() => {
    if (!userId || !convDetails) return

    // 检查当前用户是否被全局禁言
    chatService.getUserBanDetail(userId).then(info => {
      setMyBanInfo(info)
    }).catch(() => {})

    // 如果是私聊，检查对方是否被全局禁言
    if (convDetails.type === 'direct') {
      const otherParticipant = convDetails.participants.find(p => p.user.id !== userId)
      if (otherParticipant) {
        chatService.getUserBanDetail(otherParticipant.user.id).then(info => {
          setOtherBanInfo(info)
        }).catch(() => {})
      }
    }
  }, [userId, convDetails])

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
          // 标记新消息为已读（如果不是自己发的）
          if (userId && newMsg.sender_id !== userId && newMsg.message_type !== 'system') {
            chatService.markConversationMessagesAsRead(conversationId, userId).catch(() => {})
          }
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

  // 自动滚动到底部（搜索定位期间跳过）
  useEffect(() => {
    if (skipAutoScrollRef.current) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 定位到指定消息并高亮
  useEffect(() => {
    if (!scrollToMessageId || messages.length === 0) return
    // 标记跳过自动滚到底部
    skipAutoScrollRef.current = true
    // 稍微延迟确保 DOM 已渲染
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-message-id="${scrollToMessageId}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightedMsgId(scrollToMessageId)
        // 2 秒后取消高亮，并通知父组件清除 scrollToMessageId
        setTimeout(() => {
          setHighlightedMsgId(null)
          skipAutoScrollRef.current = false
          onScrollHandled?.()
        }, 2000)
      } else {
        // 找不到就恢复自动滚动
        skipAutoScrollRef.current = false
        onScrollHandled?.()
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [messages, scrollToMessageId])

  // 发送消息（文字 + 图片 + 文件一起发）
  const handleSend = async () => {
    const content = input.trim()
    if ((!content && pendingImages.length === 0 && pendingFiles.length === 0) || sending) return

    // 检查封禁状态
    if (myBanInfo?.banned) {
      alert('你已被封禁，无法发送消息')
      return
    }
    if (otherBanInfo?.banned) {
      alert('对方已被封禁，无法发送消息')
      return
    }

    setSending(true)
    try {
      // 1. 先上传所有待发图片
      for (const img of pendingImages) {
        const compressed = await compressToFile(img.file, undefined, 1 * 1024 * 1024)
        const result = await r2Service.uploadFile(compressed, 'images')
        await chatService.sendImageMessage(
          conversationId, userId, result.url, result.key, 0, 0
        )
      }

      // 2. 上传所有待发文件（存到 chat-files 目录便于生命周期管理）
      for (const f of pendingFiles) {
        const result = await r2Service.uploadFile(f.file, 'chat-files')
        await chatService.sendFileMessage(conversationId, userId, {
          fileName: result.fileName,
          fileSize: result.fileSize,
          fileType: result.fileType,
          fileExt: result.fileExt,
          url: result.url,
          key: result.key,
          category: result.category,
        })
      }

      // 3. 再发送文本
      if (content) {
        await chatService.sendMessage(conversationId, userId, content, 'text', replyingTo?.id)
      }

      // 4. 清理
      setInput('')
      setReplyingTo(null)
      pendingImages.forEach(img => URL.revokeObjectURL(img.previewUrl))
      setPendingImages([])
      setPendingFiles([])
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

  // ====== 图片/文件选择、拖拽、粘贴 ======

  const CHAT_FILE_SIZE_LIMIT = 50 * 1024 * 1024 // 50MB

  const addPendingFiles = (files: File[]) => {
    const images: File[] = []
    const docs: File[] = []

    for (const f of files) {
      if (f.type.startsWith('image/')) {
        // 图片大小限制 10MB
        if (f.size > 10 * 1024 * 1024) {
          alert(`图片 ${f.name} 超过 10MB 限制`)
          continue
        }
        images.push(f)
      } else {
        // 文件大小限制 50MB
        if (f.size > CHAT_FILE_SIZE_LIMIT) {
          alert(`文件 ${f.name} 超过 50MB 限制`)
          continue
        }
        docs.push(f)
      }
    }

    if (images.length > 0) {
      const newImages = images.map(file => ({
        file,
        previewUrl: URL.createObjectURL(file),
      }))
      setPendingImages(prev => [...prev, ...newImages])
    }

    if (docs.length > 0) {
      setPendingFiles(prev => [...prev, ...docs.map(file => ({ file }))])
    }
  }

  // 点击按钮选择图片（支持多选）
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    addPendingFiles(files)
  }

  // 点击按钮选择文件
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    addPendingFiles(files)
  }

  // 拖拽
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
    if (files.length > 0) addPendingFiles(files)
  }

  // 粘贴
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    const pastedFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) pastedFiles.push(file)
      }
    }

    if (pastedFiles.length > 0) {
      e.preventDefault()
      addPendingFiles(pastedFiles)
    }
  }

  // 移除待发图片
  const removePendingImage = (index: number) => {
    setPendingImages(prev => {
      URL.revokeObjectURL(prev[index].previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  // 移除待发文件
  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index))
  }

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
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

  // 引用回复
  const handleQuoteReply = (msg: ChatMessageWithSender) => {
    setReplyingTo(replyingTo?.id === msg.id ? null : msg)
    inputRef.current?.focus()
  }

  // 取消引用
  const cancelReply = () => setReplyingTo(null)

  // 打开图片画廊
  const openImageGallery = (msgId: string) => {
    const msg = messages.find(m => m.id === msgId)
    if (!msg) return
    if (msg.message_type === 'image') {
      const d = chatService.parseImageContent(msg.content)
      setExpandedImage(d?.url || msg.content)
    } else if (msg.content.startsWith('http')) {
      setExpandedImage(msg.content)
    }
  }

  // 插入 emoji
  const insertEmoji = (emoji: string) => {
    const ref = inputRef.current
    if (!ref) {
      setInput(prev => prev + emoji)
      return
    }
    const start = ref.selectionStart ?? input.length
    const end = ref.selectionEnd ?? input.length
    const newVal = input.slice(0, start) + emoji + input.slice(end)
    setInput(newVal)
    // 恢复光标位置
    requestAnimationFrame(() => {
      ref.focus()
      ref.setSelectionRange(start + emoji.length, start + emoji.length)
    })
    setShowEmojiPicker(false)
  }

  // 常用 emoji 列表
  const commonEmojis = [
    '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','😜','🤗','🤩','🤔','🙄','😏','😒','😞','😔','😪','😫','😤','😡','😠','🤬','😈','💀','☠️','💩','🤡','👹','👺','👻','💀',
    '👍','👎','👊','✊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✌️','🤟','🤘','👌','💪','🖕','✍️','🙅','🙆','💁','🙋','🤦','🤷',
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💕','💞','💗','💖','💘','💝','💟','❣️','💔',
    '🎉','🎊','🎈','🎁','🏆','🏅','🥇','🥈','🥉','⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🎮',
    '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐸','🐒','🐔','🐧','🐦','🐤','🦆','🦅','🦉',
    '🍕','🍔','🍟','🌭','🍿','🥞','🧇','🥓','🥩','🍗','🍖','🌮','🌯','🥗','🥘','🍝','🍜','🍣','🍱','🍛','🍙','🍚','🍘','🥟',
    '☀️','🌤','⛅','🌥','🌦','🌈','☁️','🌧','⛈','🌩','🌨','❄️','☃️','🌪','🌫','🌊','💧','🔥',
  ]
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
          onClick={(e) => { e.stopPropagation(); openImageGallery(msg.id) }}
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
    // 文件消息
    if (msg.message_type === 'file') {
      const fileData = chatService.parseFileContent(msg.content)
      if (!fileData) return <span>[文件]</span>
      const fileIcon = () => {
        const ext = fileData.fileExt.toLowerCase()
        if (['pdf'].includes(ext)) return '📄'
        if (['doc','docx'].includes(ext)) return '📝'
        if (['xls','xlsx','csv'].includes(ext)) return '📊'
        if (['ppt','pptx'].includes(ext)) return '📽️'
        if (['zip','rar','7z','tar','gz'].includes(ext)) return '🗜️'
        if (['mp4','mov','avi','mkv'].includes(ext)) return '🎬'
        if (['mp3','wav','flac','aac'].includes(ext)) return '🎵'
        return '📎'
      }
      return (
        <div className="flex items-center gap-2 bg-muted/40 rounded-lg p-2 border border-border/30 max-w-[280px]">
          <span className="text-xl flex-shrink-0">{fileIcon()}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{fileData.fileName}</div>
            <div className="text-[10px] text-muted-foreground">{formatFileSize(fileData.fileSize)}</div>
          </div>
          <a
            href={fileData.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-primary flex-shrink-0"
            title="下载文件"
            onClick={(e) => e.stopPropagation()}
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
          </a>
        </div>
      )
    }
    const isOwnMessage = msg.sender_id === userId
    // 文本消息 - 提取所有链接并显示预览卡片
    // 将文本按 URL 分割，URL 渲染为可点击链接，其余渲染为普通文本
    const urls = extractAllUrls(msg.content)
    const urlRegexGlobal = /(https?:\/\/[^\s]+)/g
    const parts = msg.content.split(urlRegexGlobal)
    const renderedText = parts.map((part, i) => {
      if (/^https?:\/\/[^\s]+$/i.test(part)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={`${isOwnMessage ? 'text-blue-100' : 'text-primary'} underline underline-offset-2 break-all`}
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        )
      }
      return <span key={i}>{part}</span>
    })
    // 只在有已缓存的卡片数据时才渲染容器（避免空容器导致的布局抖动）
    const hasPreviewCards = urls.length > 0 && urls.some(url => linkPreviewCache[url])
    return (
      <div className="space-y-2">
        <div className="text-sm break-words">{renderedText}</div>
        {hasPreviewCards && (
          <div className="flex flex-wrap gap-2">
            {urls.map((url, idx) => {
              const cached = linkPreviewCache[url]
              if (!cached) return null
              return <LinkPreviewCard key={idx} data={cached} />
            })}
          </div>
        )}
      </div>
    )
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
        {/* 移动端返回按钮 */}
        {onBack && (
          <button
            onClick={onBack}
            className="lg:hidden p-1.5 mr-2 -ml-1 rounded-lg hover:bg-accent transition-colors text-muted-foreground"
            title="返回会话列表"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}
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

      {/* 消息+输入区容器（用于封禁遮罩定位） */}
      <div className="relative flex-1 flex flex-col min-h-0">

      {/* 封禁遮罩 */}
      {(myBanInfo?.banned || otherBanInfo?.banned) && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-11/12 text-center space-y-3">
            {myBanInfo?.banned ? (
              <>
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
                  <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-foreground">你已被封禁</h3>
                {myBanInfo.reason && (
                  <p className="text-sm text-muted-foreground">原因：{myBanInfo.reason}</p>
                )}
                {myBanInfo.expires_at && (
                  <BanCountdown expiresAt={myBanInfo.expires_at} />
                )}
                {!myBanInfo.expires_at && (
                  <p className="text-xs text-muted-foreground/60">永久封禁</p>
                )}
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
                  <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-foreground">对方已被封禁</h3>
                {otherBanInfo!.reason && (
                  <p className="text-sm text-muted-foreground">原因：{otherBanInfo!.reason}</p>
                )}
                {otherBanInfo!.expires_at && (
                  <BanCountdown expiresAt={otherBanInfo!.expires_at} />
                )}
                {!otherBanInfo!.expires_at && (
                  <p className="text-xs text-muted-foreground/60">永久封禁</p>
                )}
                <p className="text-xs text-muted-foreground/60">无法发送消息</p>
              </>
            )}
          </div>
        </div>
      )}

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
                  <div
                    data-message-id={msg.id}
                    className={`flex ${isMe ? 'justify-end' : 'justify-start'} gap-2 group ${highlightedMsgId === msg.id ? 'animate-search-highlight' : ''}`}
                  >
                    {/* 对方头像 */}
                    {!isMe && getSenderAvatar(msg)}

                    <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                      {/* 发送者名称（非自己时显示） */}
                      {!isMe && (
                        <span className="text-[10px] text-muted-foreground mb-0.5 ml-1">
                          {getSenderName(msg)}
                        </span>
                      )}
                      {/* 消息气泡 */}
                      <div
                        className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                          isMe
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-card text-foreground shadow-sm rounded-bl-md'
                        }`}
                      >
                        {/* 引用消息预览 */}
                        {msg.quoted_message && (
                          <div
                            className={`text-xs mb-1.5 p-1.5 rounded-lg border-l-2 ${
                              isMe
                                ? 'bg-primary-foreground/10 border-primary-foreground/30'
                                : 'bg-muted/50 border-muted-foreground/30'
                            }`}
                          >
                            <div className="font-medium truncate max-w-[200px]">
                              {msg.quoted_message.sender_name || '未知用户'}
                            </div>
                            <div className="truncate max-w-[200px] opacity-70">
                              {msg.quoted_message.message_type === 'image'
                                ? '[图片]'
                                : msg.quoted_message.message_type === 'file'
                                  ? '[文件]'
                                  : msg.quoted_message.content}
                            </div>
                          </div>
                        )}
                        {renderMessageContent(msg)}
                      </div>
                      {/* 时间 + 状态 + 操作按钮 */}
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9px] text-muted-foreground/60 px-1">
                          {formatMsgTime(msg.created_at)}
                        </span>
                        {msg.message_type !== 'system' && (
                          <span className="text-[9px]">
                            {msg.status === 'sending' && <span className="text-muted-foreground/40">发送中...</span>}
                            {msg.status === 'failed' && <span className="text-destructive">未发送</span>}
                            {msg.status === 'sent' && (
                              <span className="text-muted-foreground/30">
                                已发送{msg.sender_id === userId && msg.read_count && msg.read_count > 0 ? ` ${msg.read_count}` : ''}
                              </span>
                            )}
                            {msg.status === 'read' && (
                              <button
                                onClick={() => {
                                  chatService.getMessageReadUsersWithName(msg.id).then(users => {
                                    setReadPopup(readPopup?.messageId === msg.id ? null : { messageId: msg.id, users })
                                  }).catch(() => {})
                                }}
                                className="text-primary hover:underline cursor-pointer"
                              >
                                已读{msg.read_count && msg.read_count > 1 ? ` ${msg.read_count}` : ''}
                              </button>
                            )}
                          </span>
                        )}
                        {/* 撤回按钮 */}
                        {isMe && canRecall(msg) && (
                          <button
                            onClick={() => handleRecall(msg.id)}
                            className="text-[9px] text-destructive/60 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                          >
                            撤回
                          </button>
                        )}
                        {/* 回复按钮 */}
                        {!isSystem && (
                          <button
                            onClick={() => handleQuoteReply(msg)}
                            className="text-[9px] text-primary/60 hover:text-primary opacity-0 group-hover:opacity-100 transition-all"
                          >
                            回复
                          </button>
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
            <span className="text-sm text-primary font-medium">拖放文件即可添加</span>
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

        {/* 待发文件预览 */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 px-1">
            {pendingFiles.map((f, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-muted/50 rounded-lg pl-2 pr-1 py-1.5 border border-border/50 max-w-[220px]">
                <DocumentIcon className="h-4 w-4 text-primary/60 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs truncate">{f.file.name}</div>
                  <div className="text-[9px] text-muted-foreground">{formatFileSize(f.file.size)}</div>
                </div>
                <button
                  onClick={() => removePendingFile(idx)}
                  className="p-0.5 rounded hover:bg-accent transition-colors text-muted-foreground flex-shrink-0"
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 引用回复栏 */}
        {replyingTo && (
          <div className="flex items-center gap-2 mb-2 px-1 py-1.5 bg-muted/50 rounded-lg border border-border/50">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-primary font-medium">
                回复 {replyingTo.sender?.display_name || '未知用户'}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {replyingTo.message_type === 'image' ? '[图片]' : replyingTo.message_type === 'file' ? '[文件]' : replyingTo.content}
              </div>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="p-1 rounded-lg hover:bg-accent transition-colors text-muted-foreground flex-shrink-0"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-1 bg-background rounded-xl border border-input p-2 focus-within:ring-2 focus-within:ring-ring/20 focus-within:border-primary transition-all">
          {/* Emoji 按钮 */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              disabled={sending}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              title="选择表情"
            >
              <FaceSmileIcon className="h-5 w-5" />
            </button>
            {showEmojiPicker && (
              <>
                <div className="absolute bottom-full left-0 mb-1 bg-card border border-border rounded-xl shadow-xl p-2 z-50 w-[320px] max-h-[200px] overflow-y-auto grid grid-cols-8 gap-0.5">
                  {commonEmojis.map((emoji, i) => (
                    <button
                      key={i}
                      onClick={() => insertEmoji(emoji)}
                      className="w-8 h-8 flex items-center justify-center text-lg hover:bg-accent rounded-lg transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowEmojiPicker(false)}
                />
              </>
            )}
          </div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={pendingImages.length > 0 ? '添加文字说明...' : '输入消息... (Enter 发送, Shift+Enter 换行, 支持拖入/粘贴图片/文件)'}
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
          {/* 文件上传按钮 */}
          <button
            onClick={() => fileDocInputRef.current?.click()}
            disabled={sending}
            className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
            title="选择文件"
          >
            <PaperClipIcon className="h-4 w-4" />
          </button>
          <input
            ref={fileDocInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={handleSend}
            disabled={(!input.trim() && pendingImages.length === 0 && pendingFiles.length === 0) || sending}
            className={`p-2 rounded-lg transition-all flex-shrink-0 ${
              (input.trim() || pendingImages.length > 0 || pendingFiles.length > 0) && !sending
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

      </div>
      {/* 消息+输入区容器结束 */}

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

      {/* 图片放大查看 - 画廊模式 */}
      {expandedImage && (() => {
        const imageMsgs = messages.filter(m => m.message_type === 'image' && !m.recalled_at)
        const currentIdx = imageMsgs.findIndex(m => {
          const d = chatService.parseImageContent(m.content)
          return d?.url === expandedImage || m.content === expandedImage
        })
        const total = imageMsgs.length

        const goPrev = () => {
          const prevIdx = currentIdx > 0 ? currentIdx - 1 : total - 1
          const prev = imageMsgs[prevIdx]
          const d = chatService.parseImageContent(prev.content)
          setExpandedImage(d?.url || prev.content)
        }

        const goNext = () => {
          const nextIdx = currentIdx < total - 1 ? currentIdx + 1 : 0
          const next = imageMsgs[nextIdx]
          const d = chatService.parseImageContent(next.content)
          setExpandedImage(d?.url || next.content)
        }

        return (
          <div
            className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center"
            onClick={() => setExpandedImage(null)}
          >
            {/* 左右切换按钮 */}
            {total > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); goPrev() }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 hover:bg-white/25 transition-colors text-white"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); goNext() }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 hover:bg-white/25 transition-colors text-white"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
                {/* 计数指示器 */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-white/15 text-white/80 text-xs">
                  {currentIdx + 1} / {total}
                </div>
              </>
            )}
            <img
              src={expandedImage}
              alt="查看图片"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg select-none"
              onClick={(e) => e.stopPropagation()}
            />
            {/* 关闭按钮 */}
            <button
              onClick={() => setExpandedImage(null)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/25 transition-colors text-white"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        )
      })()}

      {/* 已读状态详情弹窗 */}
      {readPopup && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setReadPopup(null)} />
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-xl shadow-xl p-3 min-w-[180px] max-w-[260px]">
            <div className="text-xs font-medium text-foreground mb-2">已读 ({readPopup.users.length})</div>
            {readPopup.users.length === 0 ? (
              <div className="text-xs text-muted-foreground">暂无已读</div>
            ) : (
              <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                {readPopup.users.map(u => (
                  <div key={u.user_id} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{u.display_name || '用户'}</span>
                    <span className="text-muted-foreground ml-2">
                      {new Date(u.read_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Gallery 键盘导航 */}
      {expandedImage && (
        <div
          tabIndex={0}
          className="sr-only"
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault()
              const imageMsgs = messages.filter(m => m.message_type === 'image' && !m.recalled_at)
              const currentIdx = imageMsgs.findIndex(m => {
                const d = chatService.parseImageContent(m.content)
                return d?.url === expandedImage || m.content === expandedImage
              })
              if (currentIdx > 0) {
                const prev = imageMsgs[currentIdx - 1]
                const d = chatService.parseImageContent(prev.content)
                setExpandedImage(d?.url || prev.content)
              }
            } else if (e.key === 'ArrowRight') {
              e.preventDefault()
              const imageMsgs = messages.filter(m => m.message_type === 'image' && !m.recalled_at)
              const currentIdx = imageMsgs.findIndex(m => {
                const d = chatService.parseImageContent(m.content)
                return d?.url === expandedImage || m.content === expandedImage
              })
              if (currentIdx < imageMsgs.length - 1) {
                const next = imageMsgs[currentIdx + 1]
                const d = chatService.parseImageContent(next.content)
                setExpandedImage(d?.url || next.content)
              }
            } else if (e.key === 'Escape') {
              setExpandedImage(null)
            }
          }}
        />
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

// 封禁倒计时组件
function BanCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(() => {
    const calc = () => {
      const now = Date.now()
      const end = new Date(expiresAt).getTime()
      const diff = end - now
      if (diff <= 0) {
        setRemaining('即将解封')
        return
      }
      const days = Math.floor(diff / 86400000)
      const hours = Math.floor((diff % 86400000) / 3600000)
      const minutes = Math.floor((diff % 3600000) / 60000)
      if (days > 0) {
        setRemaining(`${days}天${hours}小时${minutes}分钟`)
      } else if (hours > 0) {
        setRemaining(`${hours}小时${minutes}分钟`)
      } else {
        setRemaining(`${minutes}分钟`)
      }
    }
    calc()
    timerRef.current = setInterval(calc, 60000)
    return () => clearInterval(timerRef.current)
  }, [expiresAt])

  return (
    <p className="text-sm text-orange-500 font-medium">
      剩余 {remaining}
    </p>
  )
}
