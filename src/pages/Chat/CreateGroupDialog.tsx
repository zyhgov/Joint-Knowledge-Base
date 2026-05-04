import React, { useState, useEffect } from 'react'
import { supabase } from '@/services/supabase'
import { chatService } from '@/services/chatService'
import { toast } from 'react-hot-toast'
import { MagnifyingGlassIcon, XMarkIcon, CheckIcon } from '@heroicons/react/24/outline'

interface CreateGroupDialogProps {
  onClose: () => void
  onCreated: (conversationId: string) => void
  userId: string
}

interface SelectableUser {
  id: string
  display_name: string | null
  avatar_url: string | null
  phone: string | null
  selected: boolean
}

export default function CreateGroupDialog({ onClose, onCreated, userId }: CreateGroupDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [users, setUsers] = useState<SelectableUser[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const { data } = await supabase
        .from('jkb_users')
        .select('id, display_name, avatar_url, phone')
        .eq('is_active', true)
        .neq('id', userId) // 排除自己
        .order('display_name')

      setUsers((data || []).map((u: any) => ({
        id: u.id,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        phone: u.phone,
        selected: false,
      })))
    } catch (err) {
      console.error('加载用户失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleUser = (id: string) => {
    setUsers(prev => prev.map(u =>
      u.id === id ? { ...u, selected: !u.selected } : u
    ))
  }

  const filteredUsers = searchQuery.trim()
    ? users.filter(u =>
        u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.phone?.includes(searchQuery)
      )
    : users

  const selectedCount = users.filter(u => u.selected).length

  const handleCreate = async () => {
    if (!name.trim() || selectedCount === 0) return

    setCreating(true)
    try {
      const memberIds = users.filter(u => u.selected).map(u => u.id)
      const convId = await chatService.createGroupConversation(name.trim(), userId, memberIds, description.trim() || undefined)
      toast.success('群聊创建成功')
      onCreated(convId)
    } catch (err: any) {
      console.error('创建群聊失败:', err)
      toast.error(err?.message || '创建群聊失败，请检查数据库表是否已创建')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">创建群聊</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* 群聊名称 */}
        <div className="px-5 py-3 border-b border-border/50 space-y-2">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="群聊名称"
            className="w-full h-10 px-3 rounded-lg bg-background border border-input text-sm outline-none focus:ring-2 focus:ring-ring/20"
            maxLength={50}
          />
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="群聊简介（选填）"
            className="w-full h-10 px-3 rounded-lg bg-background border border-input text-sm outline-none focus:ring-2 focus:ring-ring/20"
            maxLength={200}
          />
        </div>

        {/* 搜索成员 */}
        <div className="px-5 py-2 border-b border-border/50">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索成员..."
              className="w-full h-8 pl-8 pr-3 rounded-lg bg-background border border-input text-sm outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>
        </div>

        {/* 成员列表 */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <span className="animate-spin h-5 w-5 border-b-2 border-primary rounded-full" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              未找到用户
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredUsers.map(u => (
                <button
                  key={u.id}
                  onClick={() => toggleUser(u.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left"
                >
                  {/* 选中状态 */}
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      u.selected
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-muted-foreground/30'
                    }`}
                  >
                    {u.selected && <CheckIcon className="h-3 w-3" />}
                  </div>

                  {/* 头像 */}
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="头像" className="w-full h-full object-cover" />
                    ) : (
                      (u.display_name || u.phone || '?').charAt(0).toUpperCase()
                    )}
                  </div>

                  {/* 信息 */}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {u.display_name || u.phone}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {selectedCount > 0 ? `已选择 ${selectedCount} 人` : '选择群聊成员'}
          </span>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || selectedCount === 0 || creating}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              name.trim() && selectedCount > 0 && !creating
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
          >
            {creating ? '创建中...' : '创建群聊'}
          </button>
        </div>
      </div>
    </div>
  )
}
