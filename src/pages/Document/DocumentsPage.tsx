import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/store/authStore'
import { departmentService } from '@/services/departmentService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import DepartmentTreeSelector from '@/components/common/DepartmentTreeSelector'
import UserAvatar from '@/components/common/UserAvatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, FileText, Search, Clock, Users, Circle, Settings, Trash2, Share2, Tag, Briefcase, Lock, Globe, KeyRound } from 'lucide-react'
import { BuildingOfficeIcon, GlobeAltIcon as GlobeIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { canCreateDocument, canEditDocument, canDeleteDocument, canShareDocument, isAdmin, getAllDepartmentIdsWithAncestors } from '@/utils/permission'
import { DepartmentTreeNode, JkbDepartment } from '@/types/database'
import { cn } from '@/lib/utils'

interface DocRow {
  id: string
  title: string
  workspace_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  tags?: string[] | null
  access_level?: string | null
  visible_department_ids?: string[] | null
  visible_workspace_ids?: string[] | null
  password?: string | null
  // 降级查询补充
  creator_name?: string
  creator_avatar?: string | null
}

export default function DocumentsPage() {
  const navigate = useNavigate()
  const { user, userPermissions } = useAuthStore()
  const [documents, setDocuments] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [workspaceFilter, setWorkspaceFilter] = useState<string>('all')
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string; is_public?: boolean; department_ids?: string[]; owner_id?: string }[]>([])
  const [departments, setDepartments] = useState<JkbDepartment[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newWorkspace, setNewWorkspace] = useState<string>('')
  const [onlineCounts, setOnlineCounts] = useState<Record<string, number>>({})
  const [onlineNames, setOnlineNames] = useState<Record<string, string[]>>({})

  // 设置弹窗
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsDoc, setSettingsDoc] = useState<DocRow | null>(null)
  const [settingsForm, setSettingsForm] = useState({
    title: '',
    tags: [] as string[],
    tagInput: '',
    access_level: 'public' as string,
    visible_department_ids: [] as string[],
    visible_workspace_ids: [] as string[],
    workspace_id: '' as string,
    password: '' as string,
    hasPassword: false,
    removePassword: false,
  })
  const [departmentTree, setDepartmentTree] = useState<DepartmentTreeNode[]>([])
  const [saving, setSaving] = useState(false)
  const [userDeptIds, setUserDeptIds] = useState<string[]>([])

  // 强制刷新计数器
  const refreshRef = useRef(0)

  // 加载工作区列表
  useEffect(() => {
    async function loadWorkspaces() {
      const { data } = await supabase
        .from('jkb_workspaces')
        .select('id, name, is_public, department_ids, owner_id')
        .order('name')
      if (data) setWorkspaces(data)
    }
    loadWorkspaces()
  }, [])

  // 加载用户部门ID
  useEffect(() => {
    async function loadUserDepts() {
      if (!user) return
      try {
        const userDepts = await departmentService.getUserDepartments(user.id)
        const directIds = userDepts.map(ud => ud.department.id)
        const allDepts = await departmentService.getAllDepartments()
        setDepartments(allDepts)
        setDepartmentTree(departmentService.buildDepartmentTree(allDepts))
        const allIds = getAllDepartmentIdsWithAncestors(directIds, allDepts)
        setUserDeptIds(allIds)
      } catch {
        setUserDeptIds([])
      }
    }
    loadUserDepts()
  }, [user?.id])

  // 从数据库加载所有文档原始数据
  const loadDocuments = useCallback(async () => {
    setLoading(true)
    try {
      // 先查文档列表
      let data: DocRow[] | null = null
      let error: any = null

      const res1 = await supabase
        .from('jkb_documents')
        .select('id, title, workspace_id, created_by, created_at, updated_at, tags, access_level, visible_department_ids, visible_workspace_ids, password')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })

      if (res1.error) {
        console.warn('带 deleted_at 查询失败，尝试降级查询:', res1.error.message)
        const res2 = await supabase
          .from('jkb_documents')
          .select('id, title, workspace_id, created_by, created_at, updated_at, tags, access_level, visible_department_ids, visible_workspace_ids, password')
          .order('updated_at', { ascending: false })
        data = res2.data
        error = res2.error
      } else {
        data = res1.data
      }

      if (error) throw error
      let filtered = data || []

      // 单独查询创建者信息
      if (filtered.length > 0) {
        const creatorIds = [...new Set(filtered.map(d => d.created_by).filter(Boolean))]
        const creatorMap = new Map<string, { display_name: string | null; avatar_url: string | null }>()
        // 兜底：当前用户
        if (user) creatorMap.set(user.id, { display_name: user.display_name, avatar_url: user.avatar_url })

        try {
          const { data: usersData } = await supabase
            .from('jkb_users')
            .select('id, display_name, avatar_url')
            .in('id', creatorIds)
          if (usersData) {
            usersData.forEach(u => creatorMap.set(u.id, { display_name: u.display_name, avatar_url: u.avatar_url }))
          }
        } catch (e) {
          console.warn('[DocList] 查询创建者失败，使用当前用户信息兜底:', e)
        }

        filtered = filtered.map(d => {
          const u = creatorMap.get(d.created_by)
          return { ...d, creator_name: u?.display_name || undefined, creator_avatar: u?.avatar_url || null }
        })
      }

      // 按访问权限过滤文档
      if (user) {
        filtered = filtered.filter(d => {
          if (d.created_by === user.id) return true
          if (isAdmin(user)) return true
          if (!d.access_level || d.access_level === 'public') return true
          if (d.access_level === 'workspace') {
            if (!d.visible_workspace_ids || d.visible_workspace_ids.length === 0) return true
            return d.visible_workspace_ids.some(wsId => {
              const ws = workspaces.find(w => w.id === wsId)
              if (!ws) return false
              if (ws.is_public) return true
              if (ws.department_ids?.some(dId => userDeptIds.includes(dId))) return true
              return false
            })
          }
          if (d.access_level === 'department') {
            if (!d.visible_department_ids || d.visible_department_ids.length === 0) return true
            return d.visible_department_ids.some(dId => userDeptIds.includes(dId))
          }
          if (d.access_level === 'private') return false
          return true
        })
      }

      setDocuments(filtered)
    } catch (err) {
      console.error('加载文档失败:', err)
      try {
        const res = await supabase
          .from('jkb_documents')
          .select('id, title, workspace_id, created_by, created_at, updated_at, tags, access_level, visible_department_ids, visible_workspace_ids, password')
          .order('updated_at', { ascending: false })
        setDocuments(res.data || [])
      } catch {
        setDocuments([])
      }
    } finally {
      setLoading(false)
    }
  }, [user, userDeptIds, workspaces])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments, refreshRef.current])

  // 前端搜索 + 工作区筛选（从已加载文档中过滤）
  const filteredDocuments = useMemo(() => {
    let result = documents
    if (workspaceFilter !== 'all') {
      result = result.filter(d => d.workspace_id === workspaceFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(d => d.title.toLowerCase().includes(q))
    }
    return result
  }, [documents, search, workspaceFilter])

  // 定期从数据库查询在线编辑人数
  useEffect(() => {
    const fetchOnlineCounts = async () => {
      if (documents.length === 0) return
      try {
        await supabase
          .from('jkb_document_presence')
          .delete()
          .lt('last_active_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())

        const docIds = documents.map(d => d.id)
        const { data } = await supabase
          .from('jkb_document_presence')
          .select('document_id, user_name')
          .in('document_id', docIds)

        if (data) {
          const counts: Record<string, number> = {}
          const names: Record<string, string[]> = {}
          data.forEach(row => {
            counts[row.document_id] = (counts[row.document_id] || 0) + 1
            if (!names[row.document_id]) names[row.document_id] = []
            names[row.document_id].push(row.user_name || '匿名')
          })
          setOnlineCounts(counts)
          setOnlineNames(names)
        }
      } catch {
        // 表可能不存在，忽略
      }
    }

    fetchOnlineCounts()
    const timer = setInterval(fetchOnlineCounts, 8000)
    return () => clearInterval(timer)
  }, [documents])

  // 创建新文档
  const handleCreate = async () => {
    if (!newTitle.trim()) {
      toast.error('请输入文档标题')
      return
    }
    try {
      const { data, error } = await supabase
        .from('jkb_documents')
        .insert({
          title: newTitle.trim(),
          workspace_id: newWorkspace || null,
          created_by: user?.id,
        })
        .select('id')
        .single()

      if (error) throw error
      if (data) {
        toast.success('文档创建成功')
        setCreateOpen(false)
        setNewTitle('')
        setNewWorkspace('')
        navigate(`/documents/${data.id}`)
      }
    } catch (err) {
      console.error('创建文档失败:', err)
      toast.error('创建失败')
    }
  }

  // 删除文档
  const handleDelete = async (doc: DocRow) => {
    if (!confirm(`确定要删除文档"${doc.title}"吗？`)) return
    try {
      // 先从本地状态移除，立即更新 UI
      setDocuments(prev => prev.filter(d => d.id !== doc.id))

      // 直接硬删除（最可靠）
      const { error } = await supabase
        .from('jkb_documents')
        .delete()
        .eq('id', doc.id)

      if (error) {
        console.error('[DocDelete] 硬删除失败:', error.message)
        // 硬删除失败，恢复本地状态
        setDocuments(prev => [doc, ...prev])
        throw error
      }

      toast.success('文档已删除')
    } catch (err: any) {
      toast.error(err.message || '删除失败')
    }
  }

  // 打开设置
  const handleOpenSettings = (doc: DocRow) => {
    setSettingsDoc(doc)
    setSettingsForm({
      title: doc.title || '',
      tags: doc.tags || [],
      tagInput: '',
      access_level: doc.access_level || 'public',
      visible_department_ids: doc.visible_department_ids || [],
      visible_workspace_ids: doc.visible_workspace_ids || [],
      workspace_id: doc.workspace_id || '',
      password: '',
      hasPassword: !!doc.password,
      removePassword: false,
    })
    setSettingsOpen(true)
  }

  // 保存设置
  const handleSaveSettings = async () => {
    if (!settingsDoc) return
    setSaving(true)
    try {
      const updateData: any = {
        title: settingsForm.title.trim(),
        tags: settingsForm.tags,
        access_level: settingsForm.access_level,
        visible_department_ids: settingsForm.visible_department_ids,
        visible_workspace_ids: settingsForm.visible_workspace_ids,
        workspace_id: settingsForm.workspace_id || null,
        updated_at: new Date().toISOString(),
      }
      // 密码处理
      if (settingsForm.removePassword) {
        updateData.password = null
      } else if (settingsForm.password.trim()) {
        updateData.password = settingsForm.password.trim()
      }
      const { error } = await supabase
        .from('jkb_documents')
        .update(updateData)
        .eq('id', settingsDoc.id)
      if (error) throw error
      toast.success('文档设置已保存')
      setSettingsOpen(false)
      refreshRef.current += 1
      await loadDocuments()
    } catch (err: any) {
      toast.error(err.message || '保存设置失败')
    } finally {
      setSaving(false)
    }
  }

  // 进入文档前的权限检查
  const handleOpenDoc = async (doc: DocRow) => {
    // 检查是否有密码保护
    if (doc.password) {
      const pwd = prompt('此文档已设置密码保护，请输入密码：')
      if (pwd === null) return // 取消
      if (pwd !== doc.password) {
        toast.error('密码错误，无法访问')
        return
      }
    }
    navigate(`/documents/${doc.id}`)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`
    return date.toLocaleDateString()
  }

  const canEdit = canEditDocument(user, userPermissions)
  const canDelete = canDeleteDocument(user, userPermissions)
  const canShare = canShareDocument(user, userPermissions)
  const canCreate = canCreateDocument(user, userPermissions)

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">协作文档</h1>
          <p className="text-muted-foreground mt-1">
            共 {filteredDocuments.length} 个文档
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button disabled={!canCreate}>
              <Plus className="h-4 w-4 mr-2" />
              新建文档
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建文档</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">文档标题</label>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="输入文档标题..."
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">所属工作区</label>
                <Select value={newWorkspace} onValueChange={setNewWorkspace}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择工作区（可选）" />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map((ws) => (
                      <SelectItem key={ws.id} value={ws.id}>
                        {ws.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} className="w-full">
                创建文档
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 搜索和过滤 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索文档..."
            className="pl-9"
          />
        </div>
        <Select value={workspaceFilter} onValueChange={setWorkspaceFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="全部工作区" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部工作区</SelectItem>
            {workspaces.map((ws) => (
              <SelectItem key={ws.id} value={ws.id}>
                {ws.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 文档列表 - 瀑布流布局 */}
      {loading ? (
        <div className="columns-1 md:columns-2 lg:columns-3 gap-5 space-y-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-5 animate-pulse break-inside-avoid mb-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-muted" />
                <div className="flex-1">
                  <div className="h-5 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-4 bg-muted rounded w-1/3" />
                </div>
              </div>
              <div className="h-3 bg-muted rounded w-1/2 mb-2" />
              <div className="h-3 bg-muted rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">暂无文档</p>
        </div>
      ) : (
        <div className="columns-1 md:columns-2 lg:columns-3 gap-5 space-y-5">
          {filteredDocuments.map((doc) => {
            const online = onlineCounts[doc.id] || 0
            const isCreator = doc.created_by === user?.id
            const canEditThis = canEdit || isCreator
            const canDeleteThis = canDelete || isCreator
            const accessLevel = doc.access_level || 'public'
            const accessLabel = { public: '公开', workspace: '指定工作区', department: '指定部门', private: '仅自己' }[accessLevel] || '公开'
            const visibleWorkspaces = doc.visible_workspace_ids && doc.visible_workspace_ids.length > 0
              ? workspaces.filter(ws => doc.visible_workspace_ids!.includes(ws.id))
              : []
            const visibleDepartments = doc.visible_department_ids && doc.visible_department_ids.length > 0
              ? departments.filter(d => doc.visible_department_ids!.includes(d.id))
              : []
            // 创建者名称：从单独查询结果获取
            const creatorName = doc.creator_name || '未知'
            const creatorAvatar = doc.creator_avatar ?? null
            return (
              <div
                key={doc.id}
                className="bg-card border border-border rounded-2xl p-5 hover:shadow-md transition-all group break-inside-avoid mb-5 cursor-pointer"
                onClick={() => handleOpenDoc(doc)}
              >
                {/* 头部：图标 + 标题 + 操作按钮 */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="relative w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-primary" />
                      {online > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {doc.title || '无标题文档'}
                      </h3>
                      {/* 访问权限标签 + 密码标识 */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={cn(
                          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
                          accessLevel === 'public' && 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
                          accessLevel === 'workspace' && 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
                          accessLevel === 'department' && 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
                          accessLevel === 'private' && 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
                        )}>
                          {accessLevel === 'public' && <GlobeIcon className="h-3 w-3" />}
                          {accessLevel === 'workspace' && <Briefcase className="h-3 w-3" />}
                          {accessLevel === 'department' && <BuildingOfficeIcon className="h-3 w-3" />}
                          {accessLevel === 'private' && <Lock className="h-3 w-3" />}
                          {accessLabel}
                        </span>
                        {doc.password && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                            <KeyRound className="h-3 w-3" />
                            加密
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* 操作按钮（hover显示） */}
                  {(canEditThis || canDeleteThis) && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {canEditThis && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenSettings(doc) }}
                          className="p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
                          title="设置"
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canDeleteThis && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(doc) }}
                          className="p-1.5 hover:bg-destructive/10 rounded-md transition-colors text-muted-foreground hover:text-destructive"
                          title="删除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* 所属工作区 */}
                {(() => {
                  const wsName = workspaces.find(w => w.id === doc.workspace_id)?.name
                  return wsName ? (
                    <div className="mb-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                        <Briefcase className="h-3.5 w-3.5" />
                        所属工作区
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-muted text-muted-foreground">
                        <Briefcase className="h-2.5 w-2.5" />
                        {wsName}
                      </span>
                    </div>
                  ) : null
                })()}

                {/* 可见工作区（access_level=workspace 时显示） */}
                {accessLevel === 'workspace' && visibleWorkspaces.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                      <Briefcase className="h-3.5 w-3.5" />
                      可见工作区
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {visibleWorkspaces.slice(0, 3).map(ws => (
                        <span key={ws.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                          {ws.name}
                        </span>
                      ))}
                      {visibleWorkspaces.length > 3 && (
                        <span className="text-xs text-muted-foreground">+{visibleWorkspaces.length - 3}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* 可见部门（access_level=department 时显示） */}
                {accessLevel === 'department' && visibleDepartments.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                      <BuildingOfficeIcon className="h-3.5 w-3.5" />
                      可见部门
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {visibleDepartments.slice(0, 3).map(dept => (
                        <span key={dept.id} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                          {dept.name}
                        </span>
                      ))}
                      {visibleDepartments.length > 3 && (
                        <span className="text-xs text-muted-foreground">+{visibleDepartments.length - 3}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* 标签 */}
                {doc.tags && doc.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {doc.tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary">
                        <Tag className="h-2.5 w-2.5" />
                        {tag}
                      </span>
                    ))}
                    {doc.tags.length > 4 && (
                      <span className="text-xs text-muted-foreground">+{doc.tags.length - 4}</span>
                    )}
                  </div>
                )}

                {/* 在线编辑人数 */}
                {online > 0 && (
                  <div className="flex items-center gap-1 mb-3">
                    <Circle className="h-2.5 w-2.5 fill-green-500 text-green-500" />
                    <span className="text-xs text-green-600 font-medium">
                      {online}人正在编辑
                    </span>
                    {onlineNames[doc.id] && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({onlineNames[doc.id].slice(0, 3).join('\u3001')}{online > 3 ? '\u7B49' : ''})
                      </span>
                    )}
                  </div>
                )}

                {/* 底部信息 */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex items-center gap-2">
                    <UserAvatar
                      avatarUrl={creatorAvatar}
                      displayName={creatorName}
                      size="xs"
                    />
                    <span className="text-xs text-muted-foreground">
                      {creatorName}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDate(doc.updated_at)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 文档设置弹窗 */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>文档设置</DialogTitle>
            <DialogDescription>修改文档属性、标签、可见范围和权限</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* 标题 */}
            <div>
              <Label>文档标题</Label>
              <Input
                value={settingsForm.title}
                onChange={(e) => setSettingsForm({ ...settingsForm, title: e.target.value })}
                className="mt-2"
              />
            </div>

            {/* 所属工作区 */}
            <div>
              <Label>所属工作区</Label>
              <Select
                value={settingsForm.workspace_id || '_none'}
                onValueChange={(v) => setSettingsForm({ ...settingsForm, workspace_id: v === '_none' ? '' : v })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="选择工作区" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">无工作区</SelectItem>
                  {workspaces.map((ws) => (
                    <SelectItem key={ws.id} value={ws.id}>
                      {ws.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 标签 */}
            <div>
              <Label>标签</Label>
              <div className="mt-2 flex flex-wrap gap-1.5 mb-2">
                {settingsForm.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-xs"
                  >
                    {tag}
                    <button
                      onClick={() => setSettingsForm({ ...settingsForm, tags: settingsForm.tags.filter(t => t !== tag) })}
                      className="hover:text-destructive"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={settingsForm.tagInput}
                  onChange={(e) => setSettingsForm({ ...settingsForm, tagInput: e.target.value })}
                  placeholder="输入标签后回车"
                  className="flex-1 h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && settingsForm.tagInput.trim()) {
                      e.preventDefault()
                      if (!settingsForm.tags.includes(settingsForm.tagInput.trim())) {
                        setSettingsForm({ ...settingsForm, tags: [...settingsForm.tags, settingsForm.tagInput.trim()], tagInput: '' })
                      }
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (settingsForm.tagInput.trim() && !settingsForm.tags.includes(settingsForm.tagInput.trim())) {
                      setSettingsForm({ ...settingsForm, tags: [...settingsForm.tags, settingsForm.tagInput.trim()], tagInput: '' })
                    }
                  }}
                >
                  添加
                </Button>
              </div>
            </div>

            {/* 访问权限 */}
            <div>
              <Label>访问权限</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">设置谁可以查看此文档</p>
              <select
                value={settingsForm.access_level}
                onChange={(e) => setSettingsForm({ ...settingsForm, access_level: e.target.value })}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              >
                <option value="public">所有人可见</option>
                <option value="workspace">指定工作区可见</option>
                <option value="department">指定部门可见</option>
                <option value="private">仅创建者可见</option>
              </select>
            </div>

            {/* 可见工作区 */}
            {settingsForm.access_level === 'workspace' && (
              <div>
                <Label>可见工作区</Label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-2">选择哪些工作区的成员可以查看此文档</p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto border border-border rounded-lg p-2">
                  {workspaces.map((ws) => (
                    <label
                      key={ws.id}
                      className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        checked={settingsForm.visible_workspace_ids.includes(ws.id)}
                        onChange={(e) => {
                          const ids = e.target.checked
                            ? [...settingsForm.visible_workspace_ids, ws.id]
                            : settingsForm.visible_workspace_ids.filter(id => id !== ws.id)
                          setSettingsForm({ ...settingsForm, visible_workspace_ids: ids })
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">{ws.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 可见部门 */}
            {settingsForm.access_level === 'department' && (
              <div>
                <Label>可见部门</Label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-2">选择哪些部门的成员可以查看此文档</p>
                <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-2">
                  <DepartmentTreeSelector
                    tree={departmentTree}
                    selectedIds={settingsForm.visible_department_ids}
                    onChange={(ids) => setSettingsForm({ ...settingsForm, visible_department_ids: ids })}
                  />
                </div>
              </div>
            )}

            {/* 文档密码 */}
            <div>
              <Label className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                文档密码保护
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                设置后，用户打开文档前需输入密码才能查看
              </p>
              {settingsForm.hasPassword && !settingsForm.removePassword ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm">
                    <KeyRound className="h-4 w-4" />
                    已设置密码保护
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={settingsForm.removePassword}
                      onChange={(e) => setSettingsForm({ ...settingsForm, removePassword: e.target.checked })}
                      className="rounded"
                    />
                    移除密码保护
                  </label>
                </div>
              ) : (
                <Input
                  type="password"
                  value={settingsForm.password}
                  onChange={(e) => setSettingsForm({ ...settingsForm, password: e.target.value })}
                  placeholder="输入密码（留空则不设密码）"
                  className="mt-2"
                  autoComplete="new-password"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>取消</Button>
            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
