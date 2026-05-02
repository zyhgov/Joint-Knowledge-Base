import React, { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { aiChatService, ChatMessage } from '@/services/aiChatService'
import { aiChatDbService } from '@/services/aiChatDbService'
import { AIChatConversation } from '@/types/database'
import { useAuthStore } from '@/store/authStore'
import { PaperAirplaneIcon, StopIcon } from '@heroicons/react/24/solid'
import {
  PlusIcon, TrashIcon, ChatBubbleLeftRightIcon,
  Bars3Icon, XMarkIcon,
} from '@heroicons/react/24/outline'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import { toast } from 'react-hot-toast'

const DOUBAO_AVATAR = '/doubao/doubao_avatar.png'

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  if (isUser) {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[72%] bg-[#007aff] text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-sm">
          {message.content}
        </div>
      </div>
    )
  }
  return (
    <div className="flex mb-3">
      <img src={DOUBAO_AVATAR} alt="豆包" className="flex-shrink-0 w-8 h-8 rounded-full mr-3 mt-0.5 object-cover shadow-sm ring-2 ring-blue-100" />
      <div className="max-w-[72%] bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed prose prose-sm max-w-none prose-pre:bg-[#f6f8fa] prose-pre:border prose-pre:border-gray-200 prose-code:text-pink-600 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:rounded-xl prose-pre:p-4 shadow-sm">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const codeStr = String(children).replace(/\n$/, '')
            if (match) {
              const lang = match[1]
              const highlighted = hljs.getLanguage(lang) ? hljs.highlight(codeStr, { language: lang }).value : codeStr
              return (
                <div className="relative group">
                  <div className="flex items-center justify-between px-4 py-1.5 text-xs text-gray-500 bg-gray-100 rounded-t-xl border-b border-gray-200"><span>{lang}</span></div>
                  <pre className="!mt-0 !rounded-t-none"><code className={className} dangerouslySetInnerHTML={{ __html: highlighted }} {...(props as any)} /></pre>
                </div>
              )
            }
            return <code className={className} {...(props as any)}>{children}</code>
          },
        }}>{message.content}</ReactMarkdown>
        {message.content === '' && <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse" />}
      </div>
    </div>
  )
}

export default function AIChat() {
  const { user: currentUser } = useAuthStore()
  const [conversations, setConversations] = useState<AIChatConversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [showSidebar, setShowSidebar] = useState(true)
  const [isBanned, setIsBanned] = useState(false)
  const [banReason, setBanReason] = useState('')
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [editTitleValue, setEditTitleValue] = useState('')
  const [knowledgeBase, setKnowledgeBase] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // 加载会话列表 & 检查封禁
  useEffect(() => {
    if (!currentUser) return
    const init = async () => {
      const ban = await aiChatDbService.checkUserBan(currentUser.id)
      setIsBanned(ban.banned)
      if (ban.reason) setBanReason(ban.reason)
      const convs = await aiChatDbService.getUserConversations(currentUser.id)
      setConversations(convs)
      if (convs.length > 0) setActiveConvId(convs[0].id)
      // 加载知识预设
      const kb = await aiChatDbService.getKnowledgeBase()
      setKnowledgeBase(kb)
    }
    init()
  }, [currentUser])

  // 响应式：小屏幕默认隐藏侧边栏
  useEffect(() => {
    const checkWidth = () => {
      if (window.innerWidth < 1024) setShowSidebar(false)
    }
    checkWidth()
    window.addEventListener('resize', checkWidth)
    return () => window.removeEventListener('resize', checkWidth)
  }, [])

  // 加载当前会话消息
  useEffect(() => {
    if (!activeConvId) { setMessages([]); return }
    aiChatDbService.getMessages(activeConvId).then((msgs) =>
      setMessages(msgs.map((m) => ({ id: m.id, role: m.role as 'user' | 'assistant' | 'system', content: m.content, timestamp: new Date(m.created_at).getTime() })))
    )
  }, [activeConvId])

  const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [])
  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  // 新建会话
  const handleNewConversation = useCallback(async () => {
    if (!currentUser) return
    const conv = await aiChatDbService.createConversation(currentUser.id)
    setConversations((prev) => [conv, ...prev])
    setActiveConvId(conv.id)
    setMessages([])
  }, [currentUser])

  // 软删除：标记 is_deleted = true，从列表移除
  const handleDeleteConversation = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await aiChatDbService.deleteConversation(id)
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (activeConvId === id) { setActiveConvId(null); setMessages([]) }
  }, [activeConvId])

  // 保存编辑的标题
  const handleSaveTitle = useCallback(async (convId: string) => {
    if (!editTitleValue.trim()) { setEditingTitleId(null); return }
    await aiChatDbService.updateConversationTitle(convId, editTitleValue.trim())
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, title: editTitleValue.trim() } : c))
    setEditingTitleId(null)
  }, [editTitleValue])

  // 自动更新标题
  const updateTitleAuto = useCallback(async (convId: string, content: string) => {
    const title = content.slice(0, 30) + (content.length > 30 ? '...' : '')
    await aiChatDbService.updateConversationTitle(convId, title)
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, title } : c))
  }, [])

  // 发送消息
  const handleSend = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading || !activeConvId || !currentUser) return
    const ban = await aiChatDbService.checkUserBan(currentUser.id)
    if (ban.banned) { toast.error('您已被限制使用 AI 对话功能'); return }

    await aiChatDbService.saveMessage(activeConvId, 'user', trimmed)
    await aiChatDbService.touchConversation(activeConvId)

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: trimmed, timestamp: Date.now() }
    const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: '', timestamp: Date.now() }
    setMessages((prev) => [...prev, userMsg, aiMsg])
    setInput('')
    setLoading(true)

    const isFirstMsg = conversations.find((c) => c.id === activeConvId)?.title === '新对话'
    if (isFirstMsg) updateTitleAuto(activeConvId, trimmed)

    const controller = new AbortController()
    setAbortController(controller)
    const systemMsg = knowledgeBase ? { role: 'system' as const, content: `以下是关于本系统的知识，请参考这些内容回答用户的问题：

${knowledgeBase}` } : null
    const history = [...(systemMsg ? [systemMsg] : []), ...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))
    let fullResponse = ''

    await aiChatService.sendMessage(
      history,
      (chunk) => {
        fullResponse += chunk
        setMessages((prev) => { const c = [...prev]; const l = c[c.length - 1]; if (l.role === 'assistant') c[c.length - 1] = { ...l, content: l.content + chunk }; return c })
      },
      async () => {
        setLoading(false); setAbortController(null)
        if (fullResponse && activeConvId) { await aiChatDbService.saveMessage(activeConvId, 'assistant', fullResponse); await aiChatDbService.touchConversation(activeConvId) }
      },
      async (err) => {
        setMessages((prev) => { const c = [...prev]; const l = c[c.length - 1]; if (l.role === 'assistant') c[c.length - 1] = { ...l, content: l.content || `请求失败: ${err.message}` }; return c })
        setLoading(false); setAbortController(null)
      },
      controller.signal
    )
  }, [messages, loading, activeConvId, currentUser, conversations, updateTitleAuto, knowledgeBase])

  const handleStop = useCallback(() => { abortController?.abort(); setLoading(false); setAbortController(null) }, [abortController])
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input) } }
  const hasMessages = messages.length > 0

  const handleClickTitle = (conv: AIChatConversation) => {
    setEditingTitleId(conv.id)
    setEditTitleValue(conv.title)
    setTimeout(() => titleInputRef.current?.focus(), 50)
  }

  return (
    <div className="h-full flex bg-transparent">
      {/* ===== 历史侧边栏 ===== */}
      <div className={`flex-shrink-0 border-r border-border bg-white/40 backdrop-blur-sm transition-all duration-300 ease-in-out overflow-hidden ${showSidebar ? 'w-60' : 'w-0'}`}>
        <div className="w-60 h-full flex flex-col">
          <div className="flex items-center justify-between px-4 h-14 border-b border-border">
            <span className="text-sm font-semibold text-foreground">历史对话</span>
            <button onClick={() => setShowSidebar(false)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground"><XMarkIcon className="h-4 w-4" /></button>
          </div>
          <div className="px-3 pt-3 pb-2">
            <button onClick={handleNewConversation} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-[#007aff] hover:bg-blue-600 rounded-xl transition-colors shadow-sm">
              <PlusIcon className="h-4 w-4" />新对话
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
            {conversations.map((conv) => (
              <div key={conv.id}
                onClick={() => { if (editingTitleId !== conv.id) setActiveConvId(conv.id) }}
                className={`group w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-sm transition-all cursor-pointer ${
                  activeConvId === conv.id ? 'bg-[#007aff]/10 text-[#007aff] font-medium' : 'text-foreground/70 hover:bg-accent hover:text-foreground'
                }`}
              >
                <ChatBubbleLeftRightIcon className="h-4 w-4 flex-shrink-0" />
                {editingTitleId === conv.id ? (
                  <input ref={titleInputRef} value={editTitleValue} onChange={(e) => setEditTitleValue(e.target.value)}
                    onBlur={() => handleSaveTitle(conv.id)}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') handleSaveTitle(conv.id); if (e.key === 'Escape') setEditingTitleId(null) }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 text-sm px-1 py-0.5 border border-[#007aff] rounded bg-white focus:outline-none"
                  />
                ) : (
                  <span onClick={(e) => { e.stopPropagation(); handleClickTitle(conv) }} className="truncate flex-1 cursor-text">{conv.title}</span>
                )}
                <button onClick={(e) => handleDeleteConversation(e, conv.id)}
                  className="p-1 rounded hover:bg-red-50 hover:text-red-500 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" title="删除对话">
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {conversations.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">暂无对话记录</p>}
          </div>
        </div>
      </div>

      {/* ===== 主聊天区域 ===== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部栏 */}
        <div className="flex items-center gap-2 px-4 h-14 border-b border-border bg-white/40 backdrop-blur-sm flex-shrink-0">
          {!showSidebar && (
            <button onClick={() => setShowSidebar(true)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground"><Bars3Icon className="h-4 w-4" /></button>
          )}
          <div className="flex items-center gap-2">
            <img src={DOUBAO_AVATAR} alt="豆包" className="w-6 h-6 rounded-full object-cover" />
            <span className="text-sm font-semibold text-foreground">和豆包聊聊</span>
          </div>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto px-4 lg:px-6">
          {isBanned ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center"><XMarkIcon className="h-8 w-8 text-red-400" /></div>
                <h3 className="text-base font-semibold text-foreground mb-2">AI 功能已被限制</h3>
                <p className="text-sm text-muted-foreground">{banReason || '请联系管理员了解详情'}</p>
              </div>
            </div>
          ) : !activeConvId ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl shadow-lg shadow-blue-200 overflow-hidden"><img src={DOUBAO_AVATAR} alt="豆包" className="w-full h-full object-cover" /></div>
                <h2 className="text-lg font-semibold text-foreground mb-1">和豆包聊聊</h2>
                <p className="text-sm text-muted-foreground mb-6">点击「新对话」开始聊天</p>
                <button onClick={handleNewConversation} className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-[#007aff] hover:bg-blue-600 rounded-xl transition-colors shadow-sm"><PlusIcon className="h-4 w-4" />开始新对话</button>
              </div>
            </div>
          ) : !hasMessages ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md lg:scale-110 origin-center">
                <div className="w-24 h-24 mx-auto mb-5 rounded-full overflow-hidden"><img src={DOUBAO_AVATAR} alt="豆包" className="w-full h-full object-cover" /></div>
                <h2 className="text-xl lg:text-2xl font-semibold text-foreground mb-2">有什么想问的？</h2>
                <p className="text-sm text-muted-foreground mb-8">我会尽力帮你解答</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {['帮我写一封工作邮件', '用Python写一个快速排序', '解释什么是RESTful API', '帮我润色这段文字'].map((t) => (
                    <button key={t} onClick={() => handleSend(t)}
                      className="px-3 py-2.5 text-xs text-muted-foreground bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:text-blue-600 hover:shadow-sm transition-all text-left leading-relaxed">{t}</button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto">
              {messages.map((msg) => (<ChatBubble key={msg.id} message={msg} />))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* 输入栏 */}
        {!isBanned && activeConvId && (
          <div className="flex-shrink-0 bg-white/60 backdrop-blur-sm border-t border-border px-4 lg:px-6 py-3">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-end gap-2.5 bg-white border border-gray-200 rounded-2xl px-4 py-2.5 shadow-sm focus-within:border-blue-400 focus-within:shadow-md transition-all">
                <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder="输入消息，Enter 发送" rows={1}
                  className="flex-1 outline-none resize-none text-sm text-foreground bg-transparent placeholder:text-gray-400 max-h-28 leading-relaxed" disabled={loading}
                />
                {loading ? (
                  <button onClick={handleStop} className="flex-shrink-0 w-9 h-9 rounded-xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-sm" title="停止生成"><StopIcon className="h-4 w-4" /></button>
                ) : (
                  <button onClick={() => handleSend(input)} disabled={!input.trim()}
                    className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#007aff] hover:bg-blue-600 disabled:bg-gray-200 text-white flex items-center justify-center transition-colors disabled:cursor-not-allowed shadow-sm" title="发送"><PaperAirplaneIcon className="h-4 w-4" /></button>
                )}
              </div>
              <p className="text-[11px] text-gray-400/70 text-center mt-1.5">AI 回复仅供参考，请核实重要信息</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
