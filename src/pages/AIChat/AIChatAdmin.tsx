import React, { useState, useEffect, useCallback } from 'react'
import { aiChatDbService } from '@/services/aiChatDbService'
import { AIUserBan } from '@/types/database'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'react-hot-toast'
import {
  MagnifyingGlassIcon, XMarkIcon, ChatBubbleLeftRightIcon,
  NoSymbolIcon, CheckCircleIcon, ExclamationTriangleIcon,
  TrashIcon, BookOpenIcon,
} from '@heroicons/react/24/outline'

function fmtDate(dateStr: string) {
  const d = new Date(dateStr)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${min}`
}

function fmtFullDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type TabType = 'conversations' | 'bans' | 'knowledge'

export default function AIChatAdmin() {
  const { user: currentUser } = useAuthStore()
  const [tab, setTab] = useState<TabType>('conversations')
  const [conversations, setConversations] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(15)
  const [searchUserId, setSearchUserId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(false)

  // 封禁管理
  const [bannedUsers, setBannedUsers] = useState<AIUserBan[]>([])
  const [banUserId, setBanUserId] = useState('')
  const [banReason, setBanReason] = useState('')
  const [banDialogOpen, setBanDialogOpen] = useState(false)
  const [expandedConvId, setExpandedConvId] = useState<string | null>(null)
  const [convMessages, setConvMessages] = useState<any[]>([])
  const [deletedOnly, setDeletedOnly] = useState(false)

  // 知识预设
  const [knowledgeContent, setKnowledgeContent] = useState('')
  const [knowledgeLoading, setKnowledgeLoading] = useState(false)
  const [knowledgeSaving, setKnowledgeSaving] = useState(false)

  // 加载对话列表
  const loadConversations = useCallback(async () => {
    setLoading(true)
    try {
      const { data, total: t } = await aiChatDbService.getAllConversations({
        userId: searchUserId || undefined,
        deletedOnly,
        page,
        pageSize,
      })
      setConversations(data)
      setTotal(t)
    } catch (err: any) {
      toast.error('加载失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [searchUserId, page, pageSize, deletedOnly])

  // 加载封禁列表
  const loadBans = useCallback(async () => {
    try {
      const data = await aiChatDbService.getBannedUsers()
      setBannedUsers(data)
    } catch (err: any) {
      toast.error('加载封禁列表失败: ' + err.message)
    }
  }, [])

  useEffect(() => {
    if (tab === 'conversations') loadConversations()
    else if (tab === 'bans') loadBans()
    else if (tab === 'knowledge') loadKnowledge()
  }, [tab, loadConversations, loadBans])

  // 封禁用户
  const handleBan = async () => {
    if (!banUserId.trim() || !currentUser) return
    try {
      await aiChatDbService.banUser(banUserId.trim(), currentUser.id, banReason || undefined)
      toast.success('已封禁该用户的 AI 对话功能')
      setBanUserId('')
      setBanReason('')
      setBanDialogOpen(false)
      loadBans()
    } catch (err: any) {
      toast.error('封禁失败: ' + err.message)
    }
  }

  // 解封用户
  const handleUnban = async (userId: string) => {
    try {
      await aiChatDbService.unbanUser(userId)
      toast.success('已解封')
      loadBans()
    } catch (err: any) {
      toast.error('解封失败: ' + err.message)
    }
  }

  // 加载知识预设
  const loadKnowledge = useCallback(async () => {
    setKnowledgeLoading(true)
    try {
      const content = await aiChatDbService.getKnowledgeBase()
      setKnowledgeContent(content)
    } catch (err: any) {
      toast.error('加载知识预设失败: ' + err.message)
    } finally {
      setKnowledgeLoading(false)
    }
  }, [])

  // 保存知识预设
  const handleSaveKnowledge = async () => {
    if (!currentUser) return
    setKnowledgeSaving(true)
    try {
      await aiChatDbService.updateKnowledgeBase(knowledgeContent, currentUser.id)
      toast.success('知识预设已保存')
    } catch (err: any) {
      toast.error('保存失败: ' + err.message)
    } finally {
      setKnowledgeSaving(false)
    }
  }

  // 展开查看对话消息
  const handleExpandConv = async (convId: string) => {
    if (expandedConvId === convId) {
      setExpandedConvId(null)
      return
    }
    setExpandedConvId(convId)
    const msgs = await aiChatDbService.getMessages(convId)
    setConvMessages(msgs)
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="h-full flex flex-col p-6">
      {/* 标签页切换 */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => { setTab('conversations'); setPage(1) }}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
            tab === 'conversations' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ChatBubbleLeftRightIcon className="h-4 w-4 inline mr-1.5" />
          对话记录
        </button>
        <button
          onClick={() => setTab('bans')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
            tab === 'bans' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <NoSymbolIcon className="h-4 w-4 inline mr-1.5" />
          封禁管理
        </button>
        <button
          onClick={() => setTab('knowledge')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
            tab === 'knowledge' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <BookOpenIcon className="h-4 w-4 inline mr-1.5" />
          知识预设
        </button>
      </div>

      {tab === 'conversations' && (
        <>
          {/* 搜索 + 筛选 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button onClick={() => { setDeletedOnly(false); setPage(1) }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${!deletedOnly ? 'bg-[#007aff] text-white shadow-sm' : 'bg-gray-100 text-muted-foreground hover:text-foreground'}`}
              >全部</button>
              <button onClick={() => { setDeletedOnly(true); setPage(1) }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${deletedOnly ? 'bg-[#007aff] text-white shadow-sm' : 'bg-gray-100 text-muted-foreground hover:text-foreground'}`}
              ><TrashIcon className="h-3.5 w-3.5 inline mr-0.5" />已删除</button>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="搜索用户 ID..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#007aff]/20 focus:border-[#007aff]"
                onKeyDown={(e) => { if (e.key === 'Enter') { setSearchUserId(searchInput); setPage(1) } }}
              />
            </div>
            <button
              onClick={() => { setSearchUserId(searchInput); setPage(1) }}
              className="px-3 py-2 text-sm bg-[#007aff] text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              搜索
            </button>
            {searchUserId && (
              <button
                onClick={() => { setSearchUserId(''); setSearchInput(''); setPage(1) }}
                className="flex items-center gap-1 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <XMarkIcon className="h-4 w-4" />
                清除
              </button>
            )}
          </div>
          </div>

          {/* 对话列表 */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#007aff] mr-2" />
                加载中...
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-12">暂无对话记录</div>
            ) : (
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <div key={conv.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                    {/* 会话行 */}
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => handleExpandConv(conv.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <ChatBubbleLeftRightIcon className="h-5 w-5 text-[#007aff] flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">
                            {conv.title}
                            {conv.is_deleted && <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-red-50 text-red-500 rounded">已删除</span>}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {conv.user?.display_name || conv.user?.phone || conv.user_id}
                            </span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">
                              {fmtDate(conv.updated_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <svg className={`h-4 w-4 text-muted-foreground transition-transform ${expandedConvId === conv.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>

                    {/* 展开的消息 */}
                    {expandedConvId === conv.id && (
                      <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 max-h-64 overflow-y-auto space-y-2">
                        {convMessages.map((msg) => (
                          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] px-3 py-2 text-xs rounded-lg leading-relaxed ${
                              msg.role === 'user'
                                ? 'bg-[#007aff] text-white rounded-br-sm'
                                : 'bg-white border border-gray-200 rounded-bl-sm'
                            }`}>
                              {msg.content || '(空)'}
                            </div>
                          </div>
                        ))}
                        {convMessages.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-2">暂无消息</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
              <span className="text-xs text-muted-foreground">共 {total} 条记录</span>
              <div className="flex gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  上一页
                </button>
                <span className="px-3 py-1.5 text-xs text-muted-foreground">{page}/{totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'bans' && (
        <>
          {/* 封禁表单 */}
          <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <NoSymbolIcon className="h-4 w-4 text-red-500" />
              封禁用户 AI 功能
            </h3>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground block mb-1">用户 ID</label>
                <input
                  value={banUserId}
                  onChange={(e) => setBanUserId(e.target.value)}
                  placeholder="输入要封禁的用户 ID..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-400/20 focus:border-red-400"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground block mb-1">原因（可选）</label>
                <input
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="例如：滥用 AI 功能"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-400/20 focus:border-red-400"
                />
              </div>
              <button
                onClick={handleBan}
                disabled={!banUserId.trim()}
                className="px-4 py-2 text-sm text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                <NoSymbolIcon className="h-4 w-4" />
                封禁
              </button>
            </div>
          </div>

          {/* 已封禁列表 */}
          <div className="flex-1 overflow-y-auto">
            <h4 className="text-sm font-medium text-foreground mb-3">
              已封禁用户（{bannedUsers.length}）
            </h4>
            {bannedUsers.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-12">
                <CheckCircleIcon className="h-10 w-10 mx-auto mb-2 text-green-400" />
                暂无被封禁用户
              </div>
            ) : (
              <div className="space-y-2">
                {bannedUsers.map((ban) => (
                  <div key={ban.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center">
                        <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {ban.user?.display_name || ban.user?.phone || ban.user_id}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {ban.reason && <span className="text-xs text-red-500">原因: {ban.reason}</span>}
                          <span className="text-xs text-muted-foreground">
                            封禁于 {fmtFullDate(ban.banned_at)}
                          </span>
                          {ban.banned_by_user && (
                            <span className="text-xs text-muted-foreground">
                              操作人: {ban.banned_by_user.display_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnban(ban.user_id)}
                      className="ml-3 flex-shrink-0 px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                    >
                      解封
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'knowledge' && (
        <>
          <div className="flex-1 flex flex-col gap-4">
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                <BookOpenIcon className="h-4 w-4 text-[#007aff]" />
                知识预设
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                在这里设置 AI 对话的预设知识。例如：站点的转粉功能说明、业务规则等。
                用户在对话中问到相关问题时，AI 会参考这些内容回答。
              </p>
              {knowledgeLoading ? (
                <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#007aff] mr-2" />
                  加载中...
                </div>
              ) : (
                <>
                  <textarea
                    value={knowledgeContent}
                    onChange={(e) => setKnowledgeContent(e.target.value)}
                    placeholder="输入知识预设内容，AI 会参考这些内容回答用户的问题...&#10;&#10;例如：&#10;1. 转粉功能：用户可以将源账号的粉丝转移到目标账号，支持批量操作&#10;2. 转粉加急：提供加急处理通道，优先处理转粉请求&#10;3. 转粉统计：管理员可以查看转粉数据的统计分析&#10;..."
                    className="w-full h-64 px-4 py-3 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#007aff]/20 focus:border-[#007aff] resize-y font-mono leading-relaxed"
                  />
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-muted-foreground">
                      AI 会将此内容作为系统指令，每次对话都会参考
                    </span>
                    <button
                      onClick={handleSaveKnowledge}
                      disabled={knowledgeSaving}
                      className="px-5 py-2 text-sm font-medium text-white bg-[#007aff] hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                      {knowledgeSaving ? '保存中...' : '保存知识预设'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
