import React, { useState, useEffect, useCallback } from 'react'
import { notificationService } from '@/services/notificationService'
import { userService } from '@/services/userService'
import { departmentService } from '@/services/departmentService'
import { roleService } from '@/services/roleService'
import { useAuthStore } from '@/store/authStore'
import { JkbNotification, NotificationType, NotificationTargetType } from '@/types/files'
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
import {
  PlusIcon,
  BellIcon,
  TrashIcon,
  PencilIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  ShieldCheckIcon,
  GlobeAltIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  XCircleIcon,
  StarIcon,
  NoSymbolIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

const typeConfig = {
  info: {
    icon: InformationCircleIcon,
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    label: '通知',
  },
  warning: {
    icon: ExclamationTriangleIcon,
    color: 'text-orange-500',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    label: '警告',
  },
  success: {
    icon: CheckCircleIcon,
    color: 'text-green-500',
    bg: 'bg-green-50 dark:bg-green-900/20',
    label: '成功',
  },
  error: {
    icon: XCircleIcon,
    color: 'text-red-500',
    bg: 'bg-red-50 dark:bg-red-900/20',
    label: '错误',
  },
}

export default function NotificationManagement() {
  const { user } = useAuthStore()
  const [notifications, setNotifications] = useState<JkbNotification[]>([])
  const [loading, setLoading] = useState(true)

  // 创建/编辑弹窗
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingNotif, setEditingNotif] = useState<JkbNotification | null>(null)
  const [form, setForm] = useState({
    title: '',
    content: '',
    type: 'info' as NotificationType,
    target_type: 'all' as NotificationTargetType,
    target_ids: [] as string[],
    is_pinned: false,
    is_hidden: false,
    expires_at: '',
  })

  // 是否显示已隐藏项
  const [showHidden, setShowHidden] = useState(false)

  // 数据源
  const [users, setUsers] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [notifsData, usersData, deptsData, rolesData] = await Promise.all([
        notificationService.getAllNotifications(),
        userService.getAllUsers(),
        departmentService.getAllDepartments(),
        roleService.getAllRoles(),
      ])
      setNotifications(notifsData)
      setUsers(usersData)
      setDepartments(deptsData)
      setRoles(rolesData)
    } catch (error: any) {
      toast.error('加载失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCreate = () => {
    setEditingNotif(null)
    setForm({
      title: '',
      content: '',
      type: 'info',
      target_type: 'all',
      target_ids: [],
      is_pinned: false,
      is_hidden: false,
      expires_at: '',
    })
    setDialogOpen(true)
  }

  const handleEdit = (notif: JkbNotification) => {
    setEditingNotif(notif)
    setForm({
      title: notif.title,
      content: notif.content,
      type: notif.type,
      target_type: notif.target_type,
      target_ids: notif.target_ids || [],
      is_pinned: notif.is_pinned,
      is_hidden: notif.is_hidden || false,
      expires_at: notif.expires_at
        ? new Date(notif.expires_at).toISOString().slice(0, 16)
        : '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!user || !form.title.trim() || !form.content.trim()) {
      toast.error('请填写标题和内容')
      return
    }

    setSaving(true)
    try {
      if (editingNotif) {
        await notificationService.updateNotification(editingNotif.id, {
          title: form.title,
          content: form.content,
          type: form.type,
          is_pinned: form.is_pinned,
          is_hidden: form.is_hidden,
          expires_at: form.expires_at || null,
        })
        toast.success('通知已更新')
      } else {
        await notificationService.sendNotification({
          title: form.title,
          content: form.content,
          type: form.type,
          target_type: form.target_type,
          target_ids: form.target_ids.length > 0 ? form.target_ids : undefined,
          is_pinned: form.is_pinned,
          expires_at: form.expires_at || null,
          sender_id: user.id,
        })
        toast.success('通知已发送')
      }
      setDialogOpen(false)
      loadData()
    } catch (error: any) {
      toast.error(error.message || '操作失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该通知吗？')) return

    try {
      await notificationService.deleteNotification(id)
      toast.success('通知已删除')
      loadData()
    } catch (error: any) {
      toast.error(error.message || '删除失败')
    }
  }

  // 切换隐藏
  const handleToggleHidden = async (notif: JkbNotification) => {
    try {
      const newHidden = !notif.is_hidden
      await notificationService.updateNotification(notif.id, {
        is_hidden: newHidden,
      })
      toast.success(newHidden ? '已隐藏' : '已显示')
      loadData()
    } catch (error: any) {
      toast.error(error.message || '操作失败')
    }
  }

  // 过滤显示的通矧
  const displayedNotifications = showHidden
    ? notifications
    : notifications.filter(n => !n.is_hidden)

  const getTargetLabel = (notif: JkbNotification): string => {
    if (notif.target_type === 'all') return '全员'
    if (notif.target_type === 'users')
      return `指定用户 (${notif.target_ids?.length || 0})`
    if (notif.target_type === 'departments')
      return `指定部门 (${notif.target_ids?.length || 0})`
    if (notif.target_type === 'roles')
      return `指定角色 (${notif.target_ids?.length || 0})`
    return ''
  }

  const targetOptions = users
    .filter((u) => form.target_ids.includes(u.id))
    .map((u) => u.display_name || u.phone)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">通知管理</h1>
          <p className="text-muted-foreground mt-1">
            向用户发送站内通知，共 {notifications.length} 条
          </p>
        </div>
        <Button onClick={handleCreate} className="gap-2">
          <PlusIcon className="h-4 w-4" />
          发送通知
        </Button>
        <Button
          variant={showHidden ? 'default' : 'outline'}
          onClick={() => setShowHidden(!showHidden)}
          className="gap-2"
        >
          {showHidden ? '隐藏已隐藏项' : '显示已隐藏'}
        </Button>
      </div>

      {/* 通知列表 */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
                  类型
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
                  标题
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase hidden md:table-cell">
                  内容
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase hidden lg:table-cell">
                  接收对象
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase hidden xl:table-cell">
                  发送时间
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayedNotifications.map((notif) => {
                const config = typeConfig[notif.type]
                const TypeIcon = config.icon
                const isExpired =
                  notif.expires_at && new Date(notif.expires_at) < new Date()
                const isHidden = notif.is_hidden

                return (
                  <tr
                    key={notif.id}
                    className={cn(
                      'hover:bg-muted/30 transition-colors',
                      (isExpired || isHidden) && 'opacity-50'
                    )}
                  >
                    {/* 类型 */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <TypeIcon className={cn('h-5 w-5', config.color)} />
                        {notif.is_pinned && (
                          <StarIcon className="h-3.5 w-3.5 text-primary" />
                        )}
                      </div>
                    </td>

                    {/* 标题 */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm text-foreground max-w-xs truncate">
                        {notif.title}
                      </div>
                    </td>

                    {/* 内容 */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-xs text-muted-foreground line-clamp-2 max-w-md">
                        {notif.content}
                      </p>
                    </td>

                    {/* 接收对象 */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5 text-xs">
                        {notif.target_type === 'all' && (
                          <>
                            <GlobeAltIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">全员</span>
                          </>
                        )}
                        {notif.target_type === 'users' && (
                          <>
                            <UserGroupIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              {notif.target_ids?.length || 0} 位用户
                            </span>
                          </>
                        )}
                        {notif.target_type === 'departments' && (
                          <>
                            <BuildingOfficeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              {notif.target_ids?.length || 0} 个部门
                            </span>
                          </>
                        )}
                        {notif.target_type === 'roles' && (
                          <>
                            <ShieldCheckIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              {notif.target_ids?.length || 0} 个角色
                            </span>
                          </>
                        )}
                      </div>
                    </td>

                    {/* 时间 */}
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden xl:table-cell">
                      <div>
                        {new Date(notif.created_at).toLocaleDateString('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      {notif.expires_at && (
                        <div className="text-xs mt-0.5">
                          {isExpired ? '已过期' : `至 ${new Date(notif.expires_at).toLocaleDateString('zh-CN')}`}
                        </div>
                      )}
                    </td>

                    {/* 操作 */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleToggleHidden(notif)}
                          className={cn(
                            'p-1.5 rounded-md transition-colors',
                            isHidden
                              ? 'hover:bg-green-50 dark:hover:bg-green-900/20 text-muted-foreground hover:text-green-600'
                              : 'hover:bg-orange-50 dark:hover:bg-orange-900/20 text-muted-foreground hover:text-orange-600'
                          )}
                          title={isHidden ? '显示' : '隐藏'}
                        >
                          {isHidden ? (
                            <CheckCircleIcon className="h-4 w-4" />
                          ) : (
                            <NoSymbolIcon className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleEdit(notif)}
                          className="p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
                          title="编辑"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(notif.id)}
                          className="p-1.5 hover:bg-destructive/10 rounded-md transition-colors text-muted-foreground hover:text-destructive"
                          title="删除"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {displayedNotifications.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <BellIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无通知</p>
          </div>
        )}
      </div>

      {/* 创建/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingNotif ? '编辑通知' : '发送通知'}</DialogTitle>
            <DialogDescription>
              {editingNotif ? '修改通知信息' : '向用户发送站内通知'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 标题 */}
            <div>
              <Label>通知标题</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="请输入通知标题"
                className="mt-2"
                maxLength={200}
              />
            </div>

            {/* 内容 */}
            <div>
              <Label>通知内容</Label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="请输入通知内容..."
                rows={4}
                className="mt-2 w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>

            {/* 类型和置顶 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>通知类型</Label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as NotificationType })
                  }
                  className="mt-2 w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
                >
                  {Object.entries(typeConfig).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer h-10">
                  <input
                    type="checkbox"
                    checked={form.is_pinned}
                    onChange={(e) =>
                      setForm({ ...form, is_pinned: e.target.checked })
                    }
                    className="rounded"
                  />
                  <span className="text-sm">置顶显示</span>
                </label>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer h-10">
                  <input
                    type="checkbox"
                    checked={form.is_hidden}
                    onChange={(e) =>
                      setForm({ ...form, is_hidden: e.target.checked })
                    }
                    className="rounded"
                  />
                  <span className="text-sm">隐藏此通知</span>
                </label>
              </div>
            </div>

            {/* 接收对象 */}
            {!editingNotif && (
              <div>
                <Label>接收对象</Label>
                <select
                  value={form.target_type}
                  onChange={(e) => {
                    setForm({
                      ...form,
                      target_type: e.target.value as NotificationTargetType,
                      target_ids: [],
                    })
                  }}
                  className="mt-2 w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
                >
                  <option value="all">全员通知</option>
                  <option value="users">指定用户</option>
                  <option value="departments">指定部门</option>
                  <option value="roles">指定角色</option>
                </select>

                {/* 用户选择 */}
                {form.target_type === 'users' && (
                  <div className="mt-2 max-h-40 overflow-y-auto border border-border rounded-lg p-2 space-y-1">
                    {users.map((u) => (
                      <label
                        key={u.id}
                        className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={form.target_ids.includes(u.id)}
                          onChange={(e) => {
                            const ids = e.target.checked
                              ? [...form.target_ids, u.id]
                              : form.target_ids.filter((id) => id !== u.id)
                            setForm({ ...form, target_ids: ids })
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">
                          {u.display_name || u.phone}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {/* 部门选择 */}
                {form.target_type === 'departments' && (
                  <div className="mt-2 max-h-40 overflow-y-auto border border-border rounded-lg p-2 space-y-1">
                    {departments.map((d) => (
                      <label
                        key={d.id}
                        className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={form.target_ids.includes(d.id)}
                          onChange={(e) => {
                            const ids = e.target.checked
                              ? [...form.target_ids, d.id]
                              : form.target_ids.filter((id) => id !== d.id)
                            setForm({ ...form, target_ids: ids })
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">
                          {'　'.repeat(d.level)}{d.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {/* 角色选择 */}
                {form.target_type === 'roles' && (
                  <div className="mt-2 max-h-40 overflow-y-auto border border-border rounded-lg p-2 space-y-1">
                    {roles.map((r) => (
                      <label
                        key={r.id}
                        className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={form.target_ids.includes(r.id)}
                          onChange={(e) => {
                            const ids = e.target.checked
                              ? [...form.target_ids, r.id]
                              : form.target_ids.filter((id) => id !== r.id)
                            setForm({ ...form, target_ids: ids })
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{r.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 过期时间 */}
            <div>
              <Label>过期时间（可选）</Label>
              <Input
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                不设置则永久有效
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : editingNotif ? '保存' : '发送'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}