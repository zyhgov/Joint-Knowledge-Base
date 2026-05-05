import React, { useState, useEffect, useRef } from 'react'
import { chatService } from '@/services/chatService'
import { MagnifyingGlassIcon, XMarkIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'

interface SearchResult {
  message: {
    id: string
    conversation_id: string
    sender_id: string
    content: string
    message_type: string
    created_at: string
    recalled_at: string | null
    sender: { id: string; display_name: string | null; avatar_url: string | null }
  }
  conversation: { id: string; type: string; name: string | null }
}

interface MessageSearchDialogProps {
  userId: string
  onSelectResult: (conversationId: string, messageId: string) => void
  onClose: () => void
  getConvName: (convId: string) => string
}

export default function MessageSearchDialog({
  userId,
  onSelectResult,
  onClose,
  getConvName,
}: MessageSearchDialogProps) {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 自动聚焦
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // 防抖搜索
  useEffect(() => {
    if (!keyword.trim()) {
      setResults([])
      setSearched(false)
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      setSearched(true)
      try {
        const res = await chatService.searchMessages(userId, keyword.trim())
        setResults(res)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 400)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [keyword, userId])

  const handleSelect = (convId: string, msgId: string) => {
    onSelectResult(convId, msgId)
    onClose()
  }

  // 高亮搜索词
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text
    const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <span key={i} className="bg-yellow-200 dark:bg-yellow-600/30 text-foreground rounded">{part}</span>
        : part
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* 搜索输入 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <MagnifyingGlassIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="搜索聊天记录..."
            className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground/50"
          />
          {keyword && (
            <button
              onClick={() => setKeyword('')}
              className="p-1 rounded-lg hover:bg-accent transition-colors text-muted-foreground"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground text-xs"
          >
            取消
          </button>
        </div>

        {/* 结果列表 */}
        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="animate-spin h-5 w-5 border-b-2 border-primary rounded-full" />
            </div>
          ) : searched && results.length === 0 ? (
            <div className="text-center py-12 px-4">
              <MagnifyingGlassIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">未找到相关消息</p>
              <p className="text-xs text-muted-foreground/60 mt-1">请尝试其他搜索词</p>
            </div>
          ) : (
            results.map((r, idx) => (
              <button
                key={`${r.message.id}-${idx}`}
                onClick={() => handleSelect(r.message.conversation_id, r.message.id)}
                className="w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border/30 last:border-0"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ChatBubbleLeftRightIcon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-foreground truncate">
                        {r.message.sender?.display_name || '未知用户'}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {formatSearchTime(r.message.created_at)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground/60 truncate mt-0.5">
                      来自: {getConvName(r.message.conversation_id)}
                    </div>
                    <div className="text-sm text-foreground mt-1 line-clamp-2">
                      {r.message.message_type === 'image'
                        ? '[图片]'
                        : r.message.recalled_at
                        ? '[已撤回]'
                        : highlightText(r.message.content, keyword)}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function formatSearchTime(dateStr: string): string {
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

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
