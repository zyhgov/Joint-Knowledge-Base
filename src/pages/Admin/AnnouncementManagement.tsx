import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { announcementService } from '@/services/announcementService'
import { departmentService } from '@/services/departmentService'
import { workspaceService } from '@/services/workspaceService'
import { useAuthStore } from '@/store/authStore'
import { JkbAnnouncement, JkbAnnouncementRead, AnnouncementType, AnnouncementTargetType } from '@/types/files'
import { JkbDepartment, DepartmentTreeNode } from '@/types/database'
import { JkbWorkspace } from '@/types/files'
import { toast } from 'react-hot-toast'
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
import DepartmentTreeSelector from '@/components/common/DepartmentTreeSelector'
import { renderWorkspaceIcon } from '@/components/common/IconPicker'
import { cn } from '@/lib/utils'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  MegaphoneIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  BellAlertIcon,
  EyeIcon,
  ClockIcon,
  UserGroupIcon,
  XMarkIcon,
  NoSymbolIcon,
} from '@heroicons/react/24/outline'

const typeOptions: { value: AnnouncementType; label: string; icon: any; desc: string }[] = [
  { value: 'announcement', label: '公告', icon: MegaphoneIcon, desc: '重要信息公布，用户需标记已读' },
  { value: 'notice', label: '通知', icon: BellAlertIcon, desc: '一般性通知提醒' },
  { value: 'checkin', label: '打卡', icon: CheckCircleIcon, desc: '每日/定期打卡任务' },
  { value: 'task', label: '任务', icon: ClipboardDocumentCheckIcon, desc: '需用户确认完成的任务' },
]

const priorityOptions = [
  { value: 1, label: '普通', color: 'text-muted-foreground' },
  { value: 2, label: '重要', color: 'text-amber-600' },
  { value: 3, label: '紧急', color: 'text-red-600' },
]

const typeConfig: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  announcement: { label: '公告', icon: MegaphoneIcon, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  notice: { label: '通知', icon: BellAlertIcon, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  checkin: { label: '打卡', icon: CheckCircleIcon, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  task: { label: '任务', icon: ClipboardDocumentCheckIcon, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-900/20' },
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: '生效中', color: 'text-emerald-700', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  expired: { label: '已过期', color: 'text-muted-foreground', bg: 'bg-muted' },
  draft: { label: '草稿', color: 'text-amber-700', bg: 'bg-amber-50 dark:bg-amber-900/20' },
}

export default function AnnouncementManagement() {
  const { user } = useAuthStore()
  const [announcements, setAnnouncements] = useState<JkbAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 创建/编辑弹窗
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    content: '',
    type: 'announcement' as AnnouncementType,
    target_type: 'all' as AnnouncementTargetType,
    target_ids: [] as string[],
    priority: 1,
    is_pinned: false,
    start_at: '',
    expires_at: '',
  })

  // 是否显示已隐藏项
  const [showHidden, setShowHidden] = useState(false)

  // 已读详情弹窗
  const [readDialogOpen, setReadDialogOpen] = useState(false)
  const [readAnnouncement, setReadAnnouncement] = useState<JkbAnnouncement | null>(null)
  const [reads, setReads] = useState<JkbAnnouncementRead[]>([])
  const [loadingReads, setLoadingReads] = useState(false)

  // 辅助数据
  const [departments, setDepartments] = useState<JkbDepartment[]>([])
  const [workspaces, setWorkspaces] = useState<JkbWorkspace[]>([])
  const departmentTree = useMemo(() => departmentService.buildDepartmentTree(departments), [departments])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [annData, deptsData, wsData] = await Promise.all([
        announcementService.getAllAnnouncements(),
        departmentService.getAllDepartments(),
        workspaceService.getAllWorkspaces(),
      ])
      setAnnouncements(annData)
      setDepartments(deptsData)
      setWorkspaces(wsData)
    } catch (error: any) {
      toast.error('加载失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const openCreateDialog = () => {
    setEditingId(null)
    setForm({
      title: '',
      content: '',
      type: 'announcement',
      target_type: 'all',
      target_ids: [],
      priority: 1,
      is_pinned: false,
      start_at: '',
      expires_at: '',
    })
    setDialogOpen(true)
  }

  const openEditDialog = (a: JkbAnnouncement) => {
    setEditingId(a.id)
    setForm({
      title: a.title,
      content: a.content || '',
      type: a.type,
      target_type: a.target_type,
      target_ids: a.target_ids || [],
      priority: a.priority,
      is_pinned: a.is_pinned,
      start_at: a.start_at ? a.start_at.slice(0, 16) : '',
      expires_at: a.expires_at ? a.expires_at.slice(0, 16) : '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error('请输入标题')
      return
    }
    if (!user) return

    setSaving(true)
    try {
      if (editingId) {
        await announcementService.updateAnnouncement(editingId, {
          title: form.title,
          content: form.content,
          type: form.type,
          target_type: form.target_type,
          target_ids: form.target_type === 'all' ? null : form.target_ids,
          priority: form.priority,
          is_pinned: form.is_pinned,
          start_at: form.start_at || null,
          expires_at: form.expires_at || null,
        })
        toast.success('公告已更新')
      } else {
        await announcementService.createAnnouncement({
          title: form.title,
          content: form.content,
          type: form.type,
          target_type: form.target_type,
          target_ids: form.target_type === 'all' ? undefined : form.target_ids,
          priority: form.priority,
          is_pinned: form.is_pinned,
          start_at: form.start_at || null,
          expires_at: form.expires_at || null,
          created_by: user.id,
        })
        toast.success('公告已创建')
      }
      setDialogOpen(false)
      loadData()
    } catch (error: any) {
      toast.error(error.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此公告吗？')) return
    try {
      await announcementService.deleteAnnouncement(id)
      toast.success('已删除')
      loadData()
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const handleViewReads = async (a: JkbAnnouncement) => {
    setReadAnnouncement(a)
    setReadDialogOpen(true)
    setLoadingReads(true)
    try {
      const data = await announcementService.getAnnouncementReads(a.id)
      setReads(data)
    } catch {
      toast.error('加载已读列表失败')
    } finally {
      setLoadingReads(false)
    }
  }

  // 过滤显示的公告
  const displayedAnnouncements = showHidden
    ? announcements
    : announcements.filter(a => !a.is_hidden)

  // 切换隐藏
  const handleToggleHidden = async (a: JkbAnnouncement) => {
    try {
      const newHidden = !a.is_hidden
      await announcementService.updateAnnouncement(a.id, {
        is_hidden: newHidden,
      })
      toast.success(newHidden ? '已隐藏' : '已显示')
      loadData()
    } catch (error: any) {
      toast.error(error.message || '操作失败')
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-28 bg-muted/50 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">公告与任务管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理仪表盘公告、打卡任务、通知等，可指定展示给特定部门或工作区
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={openCreateDialog} className="gap-2">
            <PlusIcon className="h-4 w-4" />
            创建公告/任务
          </Button>
          <Button
            variant={showHidden ? 'default' : 'outline'}
            onClick={() => setShowHidden(!showHidden)}
            className="gap-2"
          >
            {showHidden ? '隐藏已隐藏项' : '显示已隐藏'}
          </Button>
        </div>
      </div>

      {/* 列表 */}
      {announcements.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MegaphoneIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">暂无公告或任务</p>
          <p className="text-xs mt-1">点击右上角按钮创建第一条公告</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedAnnouncements.map((a) => {
            const config = typeConfig[a.type] || typeConfig.announcement
            const sConfig = statusConfig[a.status] || statusConfig.active
            const Icon = config.icon
            const pConfig = priorityOptions.find(p => p.value === a.priority) || priorityOptions[0]

            return (
              <div
                key={a.id}
                className={cn(
                  'bg-card rounded-xl border border-border p-5 hover:shadow-sm transition-all',
                  a.is_hidden && 'opacity-50'
                )}
              >
                <div className="flex items-start gap-4">
                  {/* 图标 */}
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', config.bg)}>
                    <Icon className={cn('h-5 w-5', config.color)} />
                  </div>

                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', config.bg, config.color)}>
                        {config.label}
                      </span>
                      <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', sConfig.bg, sConfig.color)}>
                        {sConfig.label}
                      </span>
                      {a.priority >= 2 && (
                        <span className={cn('text-xs font-medium', pConfig.color)}>
                          {pConfig.label}
                        </span>
                      )}
                      {a.is_hidden && (
                        <span className="text-xs text-orange-600">已隐藏</span>
                      )}
                      {a.is_pinned && (
                        <span className="text-xs text-primary">置顶</span>
                      )}
                    </div>
                    <p className="font-medium text-foreground mt-1">{a.title}</p>
                    {a.content && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.content}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <ClockIcon className="h-3 w-3" />
                        {new Date(a.created_at).toLocaleDateString('zh-CN')}
                      </span>
                      <span>创建者: {a.creator?.display_name || '未知'}</span>
                      <span className="flex items-center gap-1">
                        <EyeIcon className="h-3 w-3" />
                        {a.read_count || 0} 人已读
                      </span>
                      {a.target_type !== 'all' && (
                        <span>
                          {a.target_type === 'departments' ? '指定部门' : '指定工作区'}
                        </span>
                      )}
                      {a.expires_at && (
                        <span>截止: {new Date(a.expires_at).toLocaleDateString('zh-CN')}</span>
                      )}
                    </div>
                  </div>

                  {/* 操作 */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleToggleHidden(a)}
                      className={cn(
                        'p-1.5 rounded-md transition-colors',
                        a.is_hidden
                          ? 'hover:bg-green-50 dark:hover:bg-green-900/20 text-muted-foreground hover:text-green-600'
                          : 'hover:bg-orange-50 dark:hover:bg-orange-900/20 text-muted-foreground hover:text-orange-600'
                      )}
                      title={a.is_hidden ? '显示' : '隐藏'}
                    >
                      {a.is_hidden ? (
                        <CheckCircleIcon className="h-4 w-4" />
                      ) : (
                        <NoSymbolIcon className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleViewReads(a)}
                      className="p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
                      title="查看已读详情"
                    >
                      <UserGroupIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => openEditDialog(a)}
                      className="p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
                      title="编辑"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="p-1.5 hover:bg-destructive/10 rounded-md transition-colors text-muted-foreground hover:text-destructive"
                      title="删除"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 创建/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑公告/任务' : '创建公告/任务'}</DialogTitle>
            <DialogDescription>
              设置公告或任务内容，可指定展示给特定部门或工作区的用户
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* 类型选择 */}
            <div>
              <Label>类型</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {typeOptions.map(opt => {
                  const selected = form.type === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setForm({ ...form, type: opt.value })}
                      className={cn(
                        'flex items-center gap-2 p-3 rounded-lg border text-left transition-colors',
                        selected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-border hover:bg-accent'
                      )}
                    >
                      <opt.icon className={cn('h-5 w-5 flex-shrink-0', typeConfig[opt.value].color)} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 标题 */}
            <div>
              <Label>标题</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="请输入标题"
                className="mt-2"
              />
            </div>

            {/* 内容 */}
            <div>
              <Label>内容</Label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="请输入详细内容..."
                rows={4}
                className="mt-2 w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>

            {/* 优先级 */}
            <div>
              <Label>优先级</Label>
              <div className="flex gap-2 mt-2">
                {priorityOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm({ ...form, priority: opt.value })}
                    className={cn(
                      'px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors',
                      form.priority === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-accent',
                      opt.color
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 置顶 */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_pinned}
                onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })}
                className="rounded"
              />
              <Label className="text-sm">置顶显示</Label>
            </div>

            {/* 目标范围 */}
            <div>
              <Label>展示范围</Label>
              <div className="flex gap-2 mt-2">
                {[
                  { value: 'all', label: '所有人' },
                  { value: 'departments', label: '指定部门' },
                  { value: 'workspaces', label: '指定工作区' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm({ ...form, target_type: opt.value as AnnouncementTargetType, target_ids: [] })}
                    className={cn(
                      'px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors',
                      form.target_type === opt.value
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:bg-accent text-muted-foreground'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 指定部门 */}
            {form.target_type === 'departments' && (
              <div>
                <Label>选择部门</Label>
                <div className="mt-2 max-h-48 overflow-y-auto border border-border rounded-lg p-2">
                  <DepartmentTreeSelector
                    tree={departmentTree}
                    selectedIds={form.target_ids}
                    onChange={(ids) => setForm({ ...form, target_ids: ids })}
                  />
                </div>
              </div>
            )}

            {/* 指定工作区 */}
            {form.target_type === 'workspaces' && (
              <div>
                <Label>选择工作区</Label>
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto border border-border rounded-lg p-2">
                  {workspaces.map(ws => (
                    <label
                      key={ws.id}
                      className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        checked={form.target_ids.includes(ws.id)}
                        onChange={(e) => {
                          const ids = e.target.checked
                            ? [...form.target_ids, ws.id]
                            : form.target_ids.filter(id => id !== ws.id)
                          setForm({ ...form, target_ids: ids })
                        }}
                        className="rounded"
                      />
                      <div className="w-5 h-5 rounded flex-shrink-0">{renderWorkspaceIcon(ws.icon)}</div>
                      <span className="text-sm">{ws.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 起止时间 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>开始时间（可选）</Label>
                <Input
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(e) => setForm({ ...form, start_at: e.target.value })}
                  className="mt-2 h-9 text-sm"
                />
              </div>
              <div>
                <Label>截止时间（可选）</Label>
                <Input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                  className="mt-2 h-9 text-sm"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : editingId ? '保存修改' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 已读详情弹窗 */}
      <Dialog open={readDialogOpen} onOpenChange={setReadDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>已读/完成详情</DialogTitle>
            <DialogDescription>
              {readAnnouncement?.title}
            </DialogDescription>
          </DialogHeader>

          {loadingReads ? (
            <div className="py-8 text-center text-muted-foreground">
              <span className="animate-spin inline-block h-5 w-5 border-b-2 border-primary rounded-full" />
              <p className="text-sm mt-2">加载中...</p>
            </div>
          ) : reads.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <UserGroupIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">暂无已读记录</p>
            </div>
          ) : (
            <div className="space-y-1.5 py-2">
              {reads.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-2.5 rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                      {r.user?.display_name?.[0] || '?'}
                    </div>
                    <span className="text-sm text-foreground">{r.user?.display_name || '未知'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {r.is_completed && (
                      <span className="text-emerald-600 flex items-center gap-0.5">
                        <CheckCircleIcon className="h-3 w-3" />
                        {new Date(r.completed_at!).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    {r.is_read && (
                      <span>
                        已读 {new Date(r.read_at!).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReadDialogOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
