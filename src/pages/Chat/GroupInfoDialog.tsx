import React, { useState, useEffect, useMemo } from 'react'
import { chatService } from '@/services/chatService'
import { supabase } from '@/services/supabase'
import { r2Service } from '@/services/r2Service'
import { compressToFile } from '@/utils/imageCompress'
import { toast } from 'react-hot-toast'
import {
  XMarkIcon,
  CameraIcon,
  TrashIcon,
  PlusIcon,
  MinusCircleIcon,
  MagnifyingGlassIcon,
  CheckIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'

interface GroupMember {
  user: {
    id: string
    display_name: string | null
    avatar_url: string | null
    phone: string | null
  }
  is_muted: boolean
  joined_at: string
}

interface GroupInfoDialogProps {
  conversationId: string
  userId: string
  isOwner: boolean
  onClose: () => void
  onUpdate: () => void
}

interface SelectableUser {
  id: string
  display_name: string | null
  avatar_url: string | null
  phone: string | null
  department_name: string | null
  selected: boolean
}

export default function GroupInfoDialog({
  conversationId,
  userId,
  isOwner,
  onClose,
  onUpdate,
}: GroupInfoDialogProps) {
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  // 群信息编辑
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [saving, setSaving] = useState(false)

  // 成员搜索
  const [memberSearch, setMemberSearch] = useState('')

  // 多选
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set())

  // 邀请弹窗
  const [showInvite, setShowInvite] = useState(false)
  const [inviteUsers, setInviteUsers] = useState<SelectableUser[]>([])
  const [inviteSearch, setInviteSearch] = useState('')
  const [inviting, setInviting] = useState(false)

  // 转让
  const [selectedNewOwner, setSelectedNewOwner] = useState('')

  // 加载时获取的群信息（当前name/description用于编辑回显）
  const [convName, setConvName] = useState('')
  const [convDesc, setConvDesc] = useState('')
  const [convAvatar, setConvAvatar] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [mems, convData] = await Promise.all([
        chatService.getGroupMembers(conversationId),
        supabase.from('chat_conversations').select('name, description, avatar_url').eq('id', conversationId).single(),
      ])
      setMembers(mems)
      if (convData.data) {
        setConvName(convData.data.name || '')
        setConvDesc(convData.data.description || '')
        setConvAvatar(convData.data.avatar_url || '')
      }
    } catch (err) {
      console.error('加载群信息失败:', err)
    } finally {
      setLoading(false)
    }
  }

  // 进入编辑模式
  const handleStartEdit = () => {
    setEditName(convName)
    setEditDesc(convDesc)
    setEditing(true)
  }

  // 保存群信息
  const handleSaveInfo = async () => {
    if (!editName.trim()) {
      toast.error('群聊名称不能为空')
      return
    }
    setSaving(true)
    try {
      await chatService.updateGroupInfo(conversationId, {
        name: editName.trim(),
        description: editDesc.trim() || null,
      })
      setConvName(editName.trim())
      setConvDesc(editDesc.trim())
      toast.success('群信息已更新')
      setEditing(false)
      onUpdate()
    } catch (err: any) {
      toast.error('更新失败: ' + (err.message || err))
    } finally {
      setSaving(false)
    }
  }

  // 上传群头像
  const handleUploadAvatar = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      setUploading(true)
      try {
        const compressed = await compressToFile(file)
        const result = await r2Service.uploadFile(compressed, 'avatars')
        await chatService.updateGroupAvatar(conversationId, result.url)
        toast.success('群头像已更新')
        onUpdate()
      } catch (err: any) {
        toast.error('头像更新失败: ' + (err.message || err))
      } finally {
        setUploading(false)
      }
    }
    input.click()
  }

  // 转让群主
  const handleTransferOwner = async () => {
    if (!selectedNewOwner) return
    try {
      await chatService.transferOwnership(conversationId, selectedNewOwner)
      toast.success('群主已转让')
      onUpdate()
      onClose()
    } catch (err: any) {
      toast.error('转让失败: ' + (err.message || err))
    }
  }

  // 解散群聊
  const handleDisband = async () => {
    if (!window.confirm('确定解散该群聊？此操作不可撤销。')) return
    try {
      await chatService.disbandGroup(conversationId)
      toast.success('群聊已解散')
      onUpdate()
      onClose()
    } catch (err: any) {
      toast.error('解散失败: ' + (err.message || err))
    }
  }

  // 踢出成员（单个）
  const handleKick = async (targetUserId: string, displayName: string) => {
    if (!window.confirm(`确定将 ${displayName} 移出群聊？`)) return
    try {
      await chatService.removeParticipant(conversationId, targetUserId)
      toast.success(`已将 ${displayName} 移出群聊`)
      setSelectedMemberIds(prev => { const n = new Set(prev); n.delete(targetUserId); return n })
      loadData()
    } catch (err: any) {
      toast.error('移出失败: ' + (err.message || err))
    }
  }

  // 批量踢出
  const handleBatchKick = async () => {
    if (selectedMemberIds.size === 0) return
    const names = members
      .filter(m => selectedMemberIds.has(m.user.id))
      .map(m => m.user.display_name || m.user.phone || '')
    if (!window.confirm(`确定将 ${names.join('、')} 移出群聊？`)) return
    try {
      await Promise.all(
        Array.from(selectedMemberIds).map(uid =>
          chatService.removeParticipant(conversationId, uid)
        )
      )
      toast.success(`已移出 ${selectedMemberIds.size} 位成员`)
      setSelectedMemberIds(new Set())
      loadData()
    } catch (err: any) {
      toast.error('批量移出失败: ' + (err.message || err))
    }
  }

  // 打开邀请弹窗
  const handleOpenInvite = async () => {
    setShowInvite(true)
    setInviteSearch('')
    setInviting(false)

    try {
      // 获取所有活跃用户
      const { data: users } = await supabase
        .from('jkb_users')
        .select('id, display_name, avatar_url, phone')
        .eq('is_active', true)
        .order('display_name')

      const allUsers = (users || []) as Array<{ id: string; display_name: string | null; avatar_url: string | null; phone: string | null }>

      // 获取用户的主部门（批量）
      const memberIds = members.map(m => m.user.id)
      const notInGroup = allUsers.filter(u => !memberIds.includes(u.id))
      const notInGroupIds = notInGroup.map(u => u.id)

      let deptMap: Record<string, string> = {}
      if (notInGroupIds.length > 0) {
        const { data: depts } = await supabase
          .from('jkb_user_departments')
          .select(`
            user_id,
            department:jkb_departments(name)
          `)
          .in('user_id', notInGroupIds)
          .eq('is_primary', true)

        if (depts) {
          (depts as any[]).forEach((item: any) => {
            deptMap[item.user_id] = item.department?.name || ''
          })
        }
      }

      setInviteUsers(
        notInGroup.map(u => ({
          ...u,
          department_name: deptMap[u.id] || null,
          selected: false,
        }))
      )
    } catch (err) {
      console.error('加载用户列表失败:', err)
    }
  }

  // 邀请（批量）
  const handleInvite = async () => {
    const selected = inviteUsers.filter(u => u.selected)
    if (selected.length === 0) {
      toast.error('请选择要邀请的成员')
      return
    }
    setInviting(true)
    try {
      await chatService.addParticipants(
        conversationId,
        selected.map(u => u.id)
      )
      toast.success(`已邀请 ${selected.length} 位成员`)
      setShowInvite(false)
      loadData()
    } catch (err: any) {
      toast.error('邀请失败: ' + (err.message || err))
    } finally {
      setInviting(false)
    }
  }

  // 成员搜索过滤
  const filteredMembers = useMemo(
    () => {
      if (!memberSearch.trim()) return members
      const q = memberSearch.toLowerCase()
      return members.filter(m =>
        (m.user.display_name || '').toLowerCase().includes(q) ||
        (m.user.phone || '').includes(q)
      )
    },
    [members, memberSearch]
  )

  // 邀请搜索过滤
  const filteredInviteUsers = useMemo(
    () => {
      if (!inviteSearch.trim()) return inviteUsers
      const q = inviteSearch.toLowerCase()
      return inviteUsers.filter(u =>
        (u.display_name || '').toLowerCase().includes(q) ||
        (u.phone || '').includes(q) ||
        (u.department_name || '').toLowerCase().includes(q)
      )
    },
    [inviteUsers, inviteSearch]
  )

  // 切换成员选中
  const toggleMemberSelect = (id: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 切换邀请选中
  const toggleInviteSelect = (id: string) => {
    setInviteUsers(prev =>
      prev.map(u => u.id === id ? { ...u, selected: !u.selected } : u)
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">群聊设置</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* 群信息卡片 */}
          <div className="px-5 py-4 border-b border-border/50">
            <div className="flex items-center gap-4">
              {/* 头像 */}
              <div className="relative group cursor-pointer flex-shrink-0" onClick={isOwner ? handleUploadAvatar : undefined}>
                <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-lg font-medium flex-shrink-0">
                  {convAvatar ? (
                    <img src={convAvatar} alt="群头像" className="w-full h-full object-cover" />
                  ) : (
                    <span className="opacity-80">{(convName || '群').charAt(0).toUpperCase()}</span>
                  )}
                </div>
                {isOwner && (
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <CameraIcon className="h-5 w-5 text-white" />
                  </div>
                )}
              </div>

              {/* 名称 + 简介 */}
              <div className="flex-1 min-w-0">
                {editing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-background border border-input text-sm outline-none focus:ring-2 focus:ring-ring/20"
                      maxLength={50}
                    />
                    <textarea
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      placeholder="群聊简介"
                      rows={2}
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-input text-xs outline-none focus:ring-2 focus:ring-ring/20 resize-none"
                      maxLength={200}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveInfo}
                        disabled={saving}
                        className="text-xs px-3 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        {saving ? '保存中...' : '保存'}
                      </button>
                      <button
                        onClick={() => setEditing(false)}
                        className="text-xs px-3 py-1 rounded-lg border border-border text-muted-foreground hover:bg-accent"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold truncate">{convName || '群聊'}</span>
                      {isOwner && (
                        <button onClick={handleStartEdit} className="text-muted-foreground hover:text-foreground transition-colors">
                          <PencilIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {convDesc && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{convDesc}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 成员列表 */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3 px-2">
              <span className="text-xs font-semibold text-muted-foreground">
                群成员 ({members.length})
              </span>
              <div className="flex items-center gap-2">
                {isOwner && (
                  <button
                    onClick={handleOpenInvite}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <PlusIcon className="h-3 w-3" />
                    邀请
                  </button>
                )}
              </div>
            </div>

            {/* 搜索成员 */}
            <div className="relative mb-2">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="搜索群成员..."
                className="w-full h-8 pl-8 pr-3 rounded-lg bg-background border border-input text-xs outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>

            {/* 批量操作栏 */}
            {selectedMemberIds.size > 0 && isOwner && (
              <div className="flex items-center justify-between px-3 py-2 mb-2 bg-destructive/5 rounded-lg border border-destructive/20">
                <span className="text-xs text-destructive font-medium">
                  已选择 {selectedMemberIds.size} 人
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handleBatchKick}
                    className="text-xs px-3 py-1 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    移出选中
                  </button>
                  <button
                    onClick={() => setSelectedMemberIds(new Set())}
                    className="text-xs px-3 py-1 rounded-lg border border-border text-muted-foreground hover:bg-accent"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-8">
                <span className="animate-spin h-5 w-5 border-b-2 border-primary rounded-full" />
              </div>
            ) : (
              <div className="max-h-[240px] overflow-y-auto space-y-0.5 pr-1">
                {filteredMembers.length === 0 ? (
                  <div className="py-6 text-xs text-muted-foreground text-center">
                    {memberSearch.trim() ? '无匹配成员' : '暂无成员'}
                  </div>
                ) : (
                  filteredMembers.map((m) => (
                    <div
                      key={m.user.id}
                      className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent/50 transition-colors group"
                    >
                      {/* 多选复选框 */}
                      {isOwner && m.user.id !== userId && (
                        <div
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors ${
                            selectedMemberIds.has(m.user.id)
                              ? 'bg-destructive border-destructive text-destructive-foreground'
                              : 'border-muted-foreground/30 group-hover:border-muted-foreground/60'
                          }`}
                          onClick={() => toggleMemberSelect(m.user.id)}
                        >
                          {selectedMemberIds.has(m.user.id) && <CheckIcon className="h-2.5 w-2.5" />}
                        </div>
                      )}

                      {/* 头像 */}
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                        {m.user.avatar_url ? (
                          <img src={m.user.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (m.user.display_name || m.user.phone || '?').charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {m.user.display_name || m.user.phone}
                          </span>
                          {m.user.id === userId && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">我</span>
                          )}
                        </div>
                      </div>
                      {/* 移出按钮 */}
                      {isOwner && m.user.id !== userId && (
                        <button
                          onClick={() => handleKick(m.user.id, m.user.display_name || m.user.phone || '该成员')}
                          className="text-[11px] text-destructive/60 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all flex items-center gap-0.5 flex-shrink-0"
                        >
                          <MinusCircleIcon className="h-3.5 w-3.5" />
                          移出
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* 底部操作 */}
        <div className="px-5 py-3 border-t border-border space-y-2">
          {isOwner && (
            <>
              {/* 转让确认 */}
              {selectedNewOwner && (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                  <span className="text-xs text-muted-foreground flex-1">
                    确认转让给 {members.find(m => m.user.id === selectedNewOwner)?.user.display_name || '该用户'}?
                  </span>
                  <button
                    onClick={handleTransferOwner}
                    className="text-xs px-3 py-1 bg-primary text-primary-foreground rounded-lg"
                  >
                    确认转让
                  </button>
                  <button
                    onClick={() => setSelectedNewOwner('')}
                    className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground"
                  >
                    取消
                  </button>
                </div>
              )}

              {/* 设为群主（在所有非自己的成员下方显示） */}
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
                  转让群主
                </summary>
                <div className="mt-2 space-y-0.5 max-h-28 overflow-y-auto pl-1">
                  {members.filter(m => m.user.id !== userId).map(m => (
                    <button
                      key={m.user.id}
                      onClick={() => setSelectedNewOwner(m.user.id)}
                      className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-accent transition-colors ${
                        selectedNewOwner === m.user.id ? 'bg-accent' : ''
                      }`}
                    >
                      <div className="w-5 h-5 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-[8px] font-medium flex-shrink-0">
                        {m.user.avatar_url ? (
                          <img src={m.user.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (m.user.display_name || '?').charAt(0)
                        )}
                      </div>
                      <span className="truncate">{m.user.display_name || m.user.phone}</span>
                    </button>
                  ))}
                </div>
              </details>

              {/* 解散 */}
              <button
                onClick={handleDisband}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-destructive/30 text-destructive text-sm hover:bg-destructive/5 transition-colors"
              >
                <TrashIcon className="h-4 w-4" />
                解散群聊
              </button>
            </>
          )}
        </div>
      </div>

      {/* 邀请弹窗 */}
      {showInvite && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowInvite(false)}>
          <div
            className="bg-card rounded-2xl shadow-xl w-full max-w-md max-h-[75vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-base font-semibold">邀请成员</h3>
              <button onClick={() => { setShowInvite(false); setInviteSearch('') }} className="p-1 rounded-lg hover:bg-accent text-muted-foreground">
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="px-4 py-3">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={inviteSearch}
                  onChange={e => setInviteSearch(e.target.value)}
                  placeholder="搜索用户或部门..."
                  className="w-full h-10 pl-9 pr-3 rounded-lg bg-background border border-input text-sm outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
            </div>

            {/* 已选计数 */}
            {inviteUsers.some(u => u.selected) && (
              <div className="px-4 py-1.5 bg-primary/5 mx-4 rounded-lg mb-2 flex items-center justify-between">
                <span className="text-xs text-primary font-medium">
                  已选择 {inviteUsers.filter(u => u.selected).length} 人
                </span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-0.5">
              {filteredInviteUsers.length === 0 ? (
                <div className="py-8 text-xs text-muted-foreground text-center">
                  {inviteSearch.trim() ? '无匹配用户' : '没有可邀请的用户'}
                </div>
              ) : (
                filteredInviteUsers.map(u => (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => toggleInviteSelect(u.id)}
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
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-medium flex-shrink-0">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        (u.display_name || u.phone || '?').charAt(0).toUpperCase()
                      )}
                    </div>

                    {/* 信息 */}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {u.display_name || u.phone}
                      </div>
                      {u.department_name && (
                        <div className="text-[10px] text-muted-foreground truncate">
                          {u.department_name}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 底部 */}
            <div className="px-5 py-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {inviteUsers.filter(u => u.selected).length > 0
                  ? `已选择 ${inviteUsers.filter(u => u.selected).length} 人`
                  : '选择要邀请的成员'}
              </span>
              <button
                onClick={handleInvite}
                disabled={inviteUsers.filter(u => u.selected).length === 0 || inviting}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  inviteUsers.some(u => u.selected) && !inviting
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                }`}
              >
                {inviting ? '邀请中...' : '邀请加入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
