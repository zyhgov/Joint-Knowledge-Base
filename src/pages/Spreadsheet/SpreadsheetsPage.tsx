import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { spreadsheetService } from '@/services/spreadsheetService'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/store/authStore'
import { Spreadsheet, SpreadsheetShare } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import DepartmentTreeSelector from '@/components/common/DepartmentTreeSelector'
import { DepartmentTreeNode, JkbDepartment } from '@/types/database'
import { departmentService } from '@/services/departmentService'
import { Plus, Table2, Search, Trash2, Share2, Settings, Globe, Lock, Building2, Clock, User, Users, Copy, Check, Link, KeyRound, Upload, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { parseExcelToSnapshot } from '@/services/spreadsheetService'
import {
  canCreateSpreadsheet,
  canImportSpreadsheet,
  canDeleteSpreadsheet,
  canShareSpreadsheet,
} from '@/utils/permission'

export default function SpreadsheetsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const userPermissions = useAuthStore((s) => s.userPermissions)
  const [spreadsheets, setSpreadsheets] = useState<Spreadsheet[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [userDeptIds, setUserDeptIds] = useState<string[]>([])
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({})
  const [presenceMap, setPresenceMap] = useState<Record<string, {user_id: string; display_name: string}[]>>({})

  // 新建弹窗
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')

  // 设置弹窗
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSheet, setSettingsSheet] = useState<Spreadsheet | null>(null)
  const [settingsName, setSettingsName] = useState('')
  const [settingsIcon, setSettingsIcon] = useState('')
  const [settingsDescription, setSettingsDescription] = useState('')
  const [settingsAccess, setSettingsAccess] = useState<'public' | 'department' | 'private'>('private')
  const [settingsEditPermission, setSettingsEditPermission] = useState<'editable' | 'readonly'>('editable')
  const [settingsDeptIds, setSettingsDeptIds] = useState<string[]>([])
  const [departmentTree, setDepartmentTree] = useState<DepartmentTreeNode[]>([])
  const [saving, setSaving] = useState(false)

  // Emoji 图标列表
  const EMOJI_ICONS = ['📊', '📋', '📈', '📉', '📝', '📑', '📁', '📂', '🗂️', '📌', '📎', '🔖', '📐', '📓', '📒', '📗']

  // 删除确认
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Excel 导入
  const importFileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const handleImportExcel = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setImporting(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const { snapshot } = parseExcelToSnapshot(arrayBuffer)
      const sheet = await spreadsheetService.createSpreadsheet(
        file.name.replace(/\.[^/.]+$/, ''),
        user.id,
        snapshot
      )
      if (sheet) {
        toast.success('Excel 导入成功')
        navigate(`/spreadsheets/${sheet.id}`)
      } else {
        toast.error('导入失败：无法创建表格')
      }
    } catch (err: any) {
      toast.error('Excel 导入失败: ' + (err.message || ''))
      console.error('导入 Excel 错误:', err)
    }
    setImporting(false)
    if (importFileRef.current) importFileRef.current.value = ''
  }, [user, navigate])

  // 分享弹窗
  const [shareOpen, setShareOpen] = useState(false)
  const [shareSheet, setShareSheet] = useState<Spreadsheet | null>(null)
  const [shares, setShares] = useState<SpreadsheetShare[]>([])
  const [shareNewExpiry, setShareNewExpiry] = useState('24h')
  const [shareNewPassword, setShareNewPassword] = useState('')
  const [shareNewCanEdit, setShareNewCanEdit] = useState(false)
  const [shareCreating, setShareCreating] = useState(false)
  const [shareCopied, setShareCopied] = useState<string | null>(null)
  const [shareDeleting, setShareDeleting] = useState<string | null>(null)

  // 加载用户部门
  useEffect(() => {
    if (!user) return
    departmentService.getUserDepartments(user.id).then((depts) => {
      setUserDeptIds(depts.map((d: any) => d.department?.id).filter(Boolean))
    })
  }, [user])

  // 加载表格列表
  const loadSpreadsheets = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const data = await spreadsheetService.getSpreadsheets(user.id, userDeptIds)
    setSpreadsheets(data)
    // 收集创建者 ID 去查名字
    const creatorIds = [...new Set(data.map((s) => s.created_by).filter(Boolean))]
    if (creatorIds.length > 0) {
      const { data: users } = await supabase
        .from('jkb_users')
        .select('id, display_name')
        .in('id', creatorIds)
      if (users) {
        const map: Record<string, string> = {}
        users.forEach((u: any) => { map[u.id] = u.display_name || '已删除用户' })
        setCreatorNames(map)
      }
    }
    setLoading(false)

    // 加载在线用户数据
    const sheetIds = data.map(s => s.id)
    if (sheetIds.length > 0) {
      const { data: presenceData } = await supabase
        .from('spreadsheet_presence')
        .select('spreadsheet_id, user_id, display_name')
        .in('spreadsheet_id', sheetIds)
      if (presenceData) {
        const map: Record<string, {user_id: string; display_name: string}[]> = {}
        presenceData.forEach((p: any) => {
          if (!map[p.spreadsheet_id]) map[p.spreadsheet_id] = []
          if (!map[p.spreadsheet_id].find(u => u.user_id === p.user_id)) {
            map[p.spreadsheet_id].push({ user_id: p.user_id, display_name: p.display_name })
          }
        })
        setPresenceMap(map)
      }
    }
  }, [user, userDeptIds])

  useEffect(() => {
    if (user && userDeptIds.length > 0) {
      loadSpreadsheets()
    }
  }, [user, userDeptIds, loadSpreadsheets])

  // 实时订阅在线用户变化
  useEffect(() => {
    const channel = supabase
      .channel('spreadsheet-presence')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'spreadsheet_presence' }, (payload: any) => {
        const p = payload.new
        setPresenceMap(prev => {
          const list = [...(prev[p.spreadsheet_id] || [])]
          if (!list.find(u => u.user_id === p.user_id)) {
            list.push({ user_id: p.user_id, display_name: p.display_name })
          }
          return { ...prev, [p.spreadsheet_id]: list }
        })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'spreadsheet_presence' }, (payload: any) => {
        const p = payload.old
        setPresenceMap(prev => {
          const list = (prev[p.spreadsheet_id] || []).filter(u => u.user_id !== p.user_id)
          const next = { ...prev }
          if (list.length > 0) {
            next[p.spreadsheet_id] = list
          } else {
            delete next[p.spreadsheet_id]
          }
          return next
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // 加载部门树
  useEffect(() => {
    departmentService.getAllDepartments().then((depts: JkbDepartment[]) => {
      const tree = departmentService.buildDepartmentTree(depts)
      setDepartmentTree(tree || [])
    })
  }, [])

  // 搜索过滤
  const filtered = useMemo(() => {
    if (!search.trim()) return spreadsheets
    const q = search.trim().toLowerCase()
    return spreadsheets.filter((s) => s.name.toLowerCase().includes(q))
  }, [search, spreadsheets])

  // 新建
  const handleCreate = async () => {
    if (!newName.trim() || !user) return
    const sheet = await spreadsheetService.createSpreadsheet(newName.trim(), user.id)
    if (sheet) {
      toast.success('表格创建成功')
      setCreateOpen(false)
      setNewName('')
      navigate(`/spreadsheets/${sheet.id}`)
    } else {
      toast.error('创建失败')
    }
  }

  // 打开设置
  const openSettings = (sheet: Spreadsheet) => {
    setSettingsSheet(sheet)
    setSettingsName(sheet.name)
    setSettingsIcon(sheet.icon || '')
    setSettingsDescription(sheet.description || '')
    setSettingsAccess(sheet.access_level || 'private')
    setSettingsEditPermission(sheet.edit_permission || 'editable')
    setSettingsDeptIds(sheet.visible_department_ids || [])
    setSettingsOpen(true)
  }

  // 保存设置
  const handleSaveSettings = async () => {
    if (!settingsSheet || user?.id !== settingsSheet.created_by) return
    if (user?.id !== settingsSheet.created_by) {
      toast.error('只有表格创建者可以修改设置')
      return
    }
    setSaving(true)
    const nameOk = await spreadsheetService.updateSpreadsheet(settingsSheet.id, {
      name: settingsName,
      icon: settingsIcon,
      description: settingsDescription,
    } as any)
    const permOk = await spreadsheetService.updateSpreadsheetPermissions(
      settingsSheet.id,
      settingsAccess,
      settingsDeptIds,
      settingsEditPermission
    )
    if (nameOk && permOk) {
      toast.success('设置已保存')
      setSettingsOpen(false)
      loadSpreadsheets()
    } else {
      toast.error('保存设置失败')
    }
    setSaving(false)
  }

  // 删除
  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    const ok = await spreadsheetService.deleteSpreadsheet(deleteId)
    if (ok) {
      toast.success('表格已删除')
      setDeleteId(null)
      loadSpreadsheets()
    } else {
      toast.error('删除失败')
    }
    setDeleting(false)
  }

  // 打开分享弹窗
  const openShare = async (sheet: Spreadsheet) => {
    setShareSheet(sheet)
    setShareNewExpiry('24h')
    setShareNewPassword('')
    setShareNewCanEdit(false)
    setShareCopied(null)
    setShareOpen(true)
    const shareList = await spreadsheetService.getSharesBySpreadsheet(sheet.id)
    setShares(shareList)
  }

  // 创建分享链接
  const handleCreateShare = async () => {
    if (!shareSheet || !user) return
    setShareCreating(true)
    let expiresAt: string | undefined
    if (shareNewExpiry !== 'never') {
      const now = new Date()
      switch (shareNewExpiry) {
        case '24h': now.setHours(now.getHours() + 24); break
        case '7d': now.setDate(now.getDate() + 7); break
        case '30d': now.setDate(now.getDate() + 30); break
      }
      expiresAt = now.toISOString()
    }
    const share = await spreadsheetService.createShareLink(shareSheet.id, user.id, {
      expiresAt,
      password: shareNewPassword || undefined,
      canEdit: shareNewCanEdit,
    })
    if (share) {
      toast.success('分享链接已创建')
      const shareList = await spreadsheetService.getSharesBySpreadsheet(shareSheet.id)
      setShares(shareList)
    } else {
      toast.error('创建分享链接失败')
    }
    setShareCreating(false)
  }

  // 复制分享链接
  const handleCopyShare = (shareCode: string) => {
    const url = spreadsheetService.generateShareLink(shareCode)
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(shareCode)
      toast.success('链接已复制')
      setTimeout(() => setShareCopied(null), 2000)
    }).catch(() => toast.error('复制失败'))
  }

  // 删除分享
  const handleDeleteShare = async (shareId: string) => {
    setShareDeleting(shareId)
    const ok = await spreadsheetService.deleteShareLink(shareId)
    if (ok) {
      toast.success('分享链接已删除')
      setShares(shares.filter((s) => s.id !== shareId))
    } else {
      toast.error('删除失败')
    }
    setShareDeleting(null)
  }

  // 格式化过期时间
  const formatExpiry = (expiresAt: string | null) => {
    if (!expiresAt) return '永不过期'
    return new Date(expiresAt).toLocaleDateString()
  }

  // 权限图标
  const getAccessIcon = (level: string) => {
    switch (level) {
      case 'public': return <Globe className="h-3.5 w-3.5" />
      case 'department': return <Building2 className="h-3.5 w-3.5" />
      default: return <Lock className="h-3.5 w-3.5" />
    }
  }

  const getAccessLabel = (level: string) => {
    switch (level) {
      case 'public': return '公开'
      case 'department': return '部门'
      default: return '私密'
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">协作表格</h1>
          <p className="text-sm text-muted-foreground mt-1">创建和管理在线电子表格</p>
        </div>
        <div className="flex items-center gap-2">
        <input
          ref={importFileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleImportExcel}
        />
        {canImportSpreadsheet(user, userPermissions) && (
          <Button variant="outline" onClick={() => importFileRef.current?.click()} disabled={importing} className="gap-1.5">
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {importing ? '导入中...' : '导入 Excel'}
          </Button>
        )}
        {canCreateSpreadsheet(user, userPermissions) && (
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            新建表格
          </Button>
        )}
        </div>
      </div>

      {/* 搜索 */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索表格..."
          className="pl-9 h-9"
        />
      </div>

      {/* 表格列表 */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Table2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {search ? '未找到匹配的表格' : '还没有表格，点击上方按钮创建一个'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((sheet) => (
            <div
              key={sheet.id}
              onClick={() => navigate(`/spreadsheets/${sheet.id}`)}
              className="group rounded-xl bg-card border border-border p-4 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center flex-shrink-0 text-base">
                    {sheet.icon || <Table2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                  </div>
                  <h3 className="text-sm font-medium text-foreground truncate">{sheet.name}</h3>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}>
                  {canShareSpreadsheet(user, sheet, userPermissions) && sheet.access_level !== 'private' && (
                    <button onClick={() => openShare(sheet)}
                      className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                      title="分享">
                      <Share2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {user?.id === sheet.created_by && (
                    <button onClick={() => openSettings(sheet)}
                      className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                      title="设置">
                      <Settings className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canDeleteSpreadsheet(user, sheet, userPermissions) && (
                    <button onClick={() => setDeleteId(sheet.id)}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="删除">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  {getAccessIcon(sheet.access_level)}
                  {getAccessLabel(sheet.access_level)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(sheet.updated_at).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1 truncate">
                  <User className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{creatorNames[sheet.created_by] || '加载中...'}</span>
                </span>
              </div>
              {presenceMap[sheet.id]?.length > 0 && (() => {
                const users = presenceMap[sheet.id]
                const maxShow = 2
                const showNames = users.slice(0, maxShow).map(u => u.display_name)
                const extra = users.length - maxShow
                return (
                  <div className="mt-1.5 flex items-center gap-1 text-xs text-green-600 dark:text-green-400 overflow-hidden">
                    <Users className="h-3 w-3 flex-shrink-0" />
                    <span className="flex-shrink-0">{users.length}人在线</span>
                    <span className="truncate text-muted-foreground">
                      ({showNames.join(', ')}{extra > 0 ? ` +${extra}人` : ''})
                    </span>
                  </div>
                )
              })()}
            </div>
          ))}
        </div>
      )}

      {/* 新建弹窗 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>新建表格</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>表格名称</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="输入表格名称"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 设置弹窗 */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>表格设置</DialogTitle>
          </DialogHeader>
          {settingsSheet && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>表格图标</Label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSettingsIcon('')}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm border transition-colors ${!settingsIcon ? 'border-blue-400 bg-blue-50 dark:bg-blue-950' : 'border-border hover:border-blue-300'}`}
                    title="无图标"
                  >
                    <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  {EMOJI_ICONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => setSettingsIcon(emoji)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-base border transition-colors ${settingsIcon === emoji ? 'border-blue-400 bg-blue-50 dark:bg-blue-950' : 'border-border hover:border-blue-300'}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>表格名称</Label>
                <Input value={settingsName} onChange={(e) => setSettingsName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>简介（可选）</Label>
                <textarea
                  value={settingsDescription}
                  onChange={(e) => setSettingsDescription(e.target.value)}
                  placeholder="表格简介或说明..."
                  className="flex w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[60px] resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label>访问权限</Label>
                <Select value={settingsAccess} onValueChange={(v: any) => setSettingsAccess(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">
                      <span className="flex items-center gap-2"><Lock className="h-4 w-4" />仅自己可见</span>
                    </SelectItem>
                    <SelectItem value="public">
                      <span className="flex items-center gap-2"><Globe className="h-4 w-4" />公开</span>
                    </SelectItem>
                    <SelectItem value="department">
                      <span className="flex items-center gap-2"><Building2 className="h-4 w-4" />按部门</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {settingsAccess !== 'private' && (
                <div className="space-y-2">
                  <Label>编辑权限</Label>
                  <Select value={settingsEditPermission} onValueChange={(v: any) => setSettingsEditPermission(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editable">允许编辑</SelectItem>
                      <SelectItem value="readonly">仅查看</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {settingsAccess === 'department' && (
                <div className="space-y-2">
                  <Label>可见部门</Label>
                  <DepartmentTreeSelector
                    tree={departmentTree}
                    selectedIds={settingsDeptIds}
                    onChange={setSettingsDeptIds}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>取消</Button>
            <Button onClick={handleSaveSettings} disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>删除后可在数据库中恢复，确定要删除此表格吗？</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? '删除中...' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 分享弹窗 */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>分享表格 - {shareSheet?.name}</DialogTitle>
            <DialogDescription>创建分享链接，其他人可通过链接访问此表格</DialogDescription>
          </DialogHeader>
          {shareSheet && (
            <div className="space-y-4">
              {/* 创建新分享 */}
              <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
                <h4 className="text-sm font-medium text-foreground">创建新分享链接</h4>

                {/* 过期时间 */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">过期时间</Label>
                  <Select value={shareNewExpiry} onValueChange={setShareNewExpiry}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24h">24 小时</SelectItem>
                      <SelectItem value="7d">7 天</SelectItem>
                      <SelectItem value="30d">30 天</SelectItem>
                      <SelectItem value="never">永不过期</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 密码 */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">访问密码（可选）</Label>
                  <Input
                    value={shareNewPassword}
                    onChange={(e) => setShareNewPassword(e.target.value)}
                    placeholder="设置密码..."
                    className="h-8 text-xs"
                    type="password"
                  />
                </div>

                {/* 编辑权限 */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="canEdit"
                    checked={shareNewCanEdit}
                    onChange={(e) => setShareNewCanEdit(e.target.checked)}
                    className="rounded border-border h-4 w-4"
                  />
                  <Label htmlFor="canEdit" className="text-xs cursor-pointer">允许编辑</Label>
                </div>

                <Button onClick={handleCreateShare} disabled={shareCreating} size="sm" className="w-full">
                  {shareCreating ? '创建中...' : '生成分享链接'}
                </Button>
              </div>

              {/* 已有分享链接列表 */}
              {shares.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-foreground">已有分享链接（{shares.length}）</h4>
                  {shares.map((share) => (
                    <div key={share.id} className="flex items-center justify-between p-2.5 rounded-lg bg-card border border-border">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Link className="h-3 w-3 flex-shrink-0" />
                          <code className="text-xs truncate text-foreground">{spreadsheetService.generateShareLink(share.share_code)}</code>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>到期: {formatExpiry(share.expires_at)}</span>
                          {share.password_hash && (
                            <span className="flex items-center gap-0.5">
                              <KeyRound className="h-3 w-3" />有密码
                            </span>
                          )}
                          <span>{share.can_edit ? '可编辑' : '仅查看'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleCopyShare(share.share_code)}
                          title="复制链接"
                        >
                          {shareCopied === share.share_code ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteShare(share.id)}
                          disabled={shareDeleting === share.id}
                          title="删除"
                        >
                          {shareDeleting === share.id ? (
                            <span className="h-3.5 w-3.5">...</span>
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
