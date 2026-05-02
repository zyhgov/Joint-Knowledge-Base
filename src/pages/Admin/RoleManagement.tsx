import React, { useState, useEffect } from 'react'
import { roleService } from '@/services/roleService'
import { RoleWithPermissions, Permission } from '@/types/rbac'
import { toast } from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ShieldCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

export default function RoleManagement() {
  const [roles, setRoles] = useState<RoleWithPermissions[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)

  // 权限按资源分组
  const [groupedPermissions, setGroupedPermissions] = useState<
    Record<string, Permission[]>
  >({})

  // 创建角色弹窗
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newRole, setNewRole] = useState({
    name: '',
    code: '',
    description: '',
    level: 50,
    permission_ids: [] as string[],
  })

  // 编辑角色弹窗
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<RoleWithPermissions | null>(null)

  // 权限组展开状态
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [rolesData, permissionsData] = await Promise.all([
        roleService.getAllRoles(),
        roleService.getAllPermissions(),
      ])
      setRoles(rolesData)
      setPermissions(permissionsData)

      // 按资源分组权限
      const grouped = permissionsData.reduce((acc, perm) => {
        if (!acc[perm.resource]) {
          acc[perm.resource] = []
        }
        acc[perm.resource].push(perm)
        return acc
      }, {} as Record<string, Permission[]>)
      setGroupedPermissions(grouped)

      // 默认展开所有组
      const expanded = Object.keys(grouped).reduce((acc, key) => {
        acc[key] = true
        return acc
      }, {} as Record<string, boolean>)
      setExpandedGroups(expanded)
    } catch (error: any) {
      toast.error('加载数据失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // 创建角色
  const handleCreateRole = async () => {
    if (!newRole.name || !newRole.code) {
      toast.error('请填写角色名称和编码')
      return
    }

    try {
      await roleService.createRole(newRole)
      toast.success('角色创建成功')
      setCreateDialogOpen(false)
      setNewRole({
        name: '',
        code: '',
        description: '',
        level: 50,
        permission_ids: [],
      })
      loadData()
    } catch (error: any) {
      toast.error(error.message || '创建失败')
    }
  }

  // 更新角色
  const handleUpdateRole = async () => {
    if (!editingRole) return

    try {
      await roleService.updateRole(editingRole.id, {
        name: editingRole.name,
        description: editingRole.description || '',
        level: editingRole.level,
        permission_ids: editingRole.permissions.map((p) => p.id),
      })
      toast.success('角色已更新')
      setEditDialogOpen(false)
      setEditingRole(null)
      loadData()
    } catch (error: any) {
      toast.error(error.message || '更新失败')
    }
  }

  // 删除角色
  const handleDeleteRole = async (roleId: string) => {
    if (!confirm('确定要删除该角色吗？此操作不可恢复。')) return

    try {
      await roleService.deleteRole(roleId)
      toast.success('角色已删除')
      loadData()
    } catch (error: any) {
      toast.error(error.message || '删除失败')
    }
  }

  // 切换权限组展开状态
  const toggleGroup = (resource: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [resource]: !prev[resource],
    }))
  }

  // 切换权限选择
  const togglePermission = (
    permissionId: string,
    isEditing: boolean = false
  ) => {
    if (isEditing && editingRole) {
      const hasPermission = editingRole.permissions.some((p) => p.id === permissionId)
      if (hasPermission) {
        setEditingRole({
          ...editingRole,
          permissions: editingRole.permissions.filter((p) => p.id !== permissionId),
        })
      } else {
        const permission = permissions.find((p) => p.id === permissionId)
        if (permission) {
          setEditingRole({
            ...editingRole,
            permissions: [...editingRole.permissions, permission],
          })
        }
      }
    } else {
      if (newRole.permission_ids.includes(permissionId)) {
        setNewRole({
          ...newRole,
          permission_ids: newRole.permission_ids.filter((id) => id !== permissionId),
        })
      } else {
        setNewRole({
          ...newRole,
          permission_ids: [...newRole.permission_ids, permissionId],
        })
      }
    }
  }

  // 全选/取消全选某个资源的权限
  const toggleGroupPermissions = (resource: string, isEditing: boolean = false) => {
    const groupPerms = groupedPermissions[resource] || []
    const allSelected = groupPerms.every((perm) =>
      isEditing
        ? editingRole?.permissions.some((p) => p.id === perm.id)
        : newRole.permission_ids.includes(perm.id)
    )

    if (isEditing && editingRole) {
      if (allSelected) {
        setEditingRole({
          ...editingRole,
          permissions: editingRole.permissions.filter(
            (p) => !groupPerms.some((gp) => gp.id === p.id)
          ),
        })
      } else {
        const newPermissions = [...editingRole.permissions]
        groupPerms.forEach((perm) => {
          if (!newPermissions.some((p) => p.id === perm.id)) {
            newPermissions.push(perm)
          }
        })
        setEditingRole({
          ...editingRole,
          permissions: newPermissions,
        })
      }
    } else {
      if (allSelected) {
        setNewRole({
          ...newRole,
          permission_ids: newRole.permission_ids.filter(
            (id) => !groupPerms.some((p) => p.id === id)
          ),
        })
      } else {
        const newIds = [...newRole.permission_ids]
        groupPerms.forEach((perm) => {
          if (!newIds.includes(perm.id)) {
            newIds.push(perm.id)
          }
        })
        setNewRole({
          ...newRole,
          permission_ids: newIds,
        })
      }
    }
  }

  // 资源名称映射
  const resourceLabels: Record<string, string> = {
    workspace: '工作区',
    document: '文档',
    file: '文件',
    folder: '文件夹',
    user: '用户',
    role: '角色',
    department: '部门',
    notification: '通知',
    stats: '统计',
    poem: '古诗',
    settings: '设置',
    announcement: '公告与任务',
    transfer_fan: '转粉工单',
    ai_chat: 'AI 对话',
    hr: '人力资源',
    approval: '审批',
  }

  // 操作名称映射
  const actionLabels: Record<string, string> = {
    create: '创建',
    read: '查看',
    update: '编辑',
    delete: '删除',
    manage: '管理',
    assign: '分配',
  }

  // 同步权限
  const [syncing, setSyncing] = useState(false)
  const handleSyncPermissions = async () => {
    setSyncing(true)
    try {
      const result = await roleService.syncStandardPermissions()
      toast.success(`权限同步完成：新增 ${result.added} 项，已存在 ${result.skipped} 项`)
      loadData()
    } catch (error: any) {
      toast.error(error.message || '同步失败')
    } finally {
      setSyncing(false)
    }
  }

  // 权限选择器组件
  const PermissionSelector = ({
    selectedPermissionIds,
    isEditing = false,
  }: {
    selectedPermissionIds: string[]
    isEditing?: boolean
  }) => (
    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
      {Object.entries(groupedPermissions).map(([resource, perms]) => {
        const allSelected = perms.every((perm) =>
          selectedPermissionIds.includes(perm.id)
        )
        const someSelected = perms.some((perm) =>
          selectedPermissionIds.includes(perm.id)
        )

        return (
          <div key={resource} className="border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleGroup(resource)}
              className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                {expandedGroups[resource] ? (
                  <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium text-sm">
                  {resourceLabels[resource] || resource}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({perms.length} 项)
                </span>
              </div>
              <Checkbox
                checked={allSelected}
                className={cn(someSelected && !allSelected && 'opacity-50')}
                onCheckedChange={() => toggleGroupPermissions(resource, isEditing)}
                onClick={(e) => e.stopPropagation()}
              />
            </button>

            {expandedGroups[resource] && (
              <div className="p-3 space-y-2 bg-card">
                {perms.map((perm) => (
                  <label
                    key={perm.id}
                    className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={selectedPermissionIds.includes(perm.id)}
                      onCheckedChange={() => togglePermission(perm.id, isEditing)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-foreground">
                        {perm.name}
                      </div>
                      {perm.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {perm.description}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        <code className="bg-muted px-1.5 py-0.5 rounded">
                          {perm.code}
                        </code>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 标题和操作栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">角色权限管理</h1>
          <p className="text-muted-foreground mt-1">
            管理系统角色和权限配置
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleSyncPermissions}
            disabled={syncing}
          >
            <ArrowPathIcon className={cn('h-4 w-4', syncing && 'animate-spin')} />
            <span className="hidden sm:inline">同步权限</span>
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <PlusIcon className="h-4 w-4" />
              <span className="hidden sm:inline">新建角色</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>新建角色</DialogTitle>
              <DialogDescription>
                创建新角色并分配相应权限
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>角色名称</Label>
                  <Input
                    value={newRole.name}
                    onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                    placeholder="例如: 项目经理"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>角色编码</Label>
                  <Input
                    value={newRole.code}
                    onChange={(e) =>
                      setNewRole({ ...newRole, code: e.target.value.toLowerCase() })
                    }
                    placeholder="例如: project_manager"
                    className="mt-2"
                  />
                </div>
              </div>

              <div>
                <Label>角色描述</Label>
                <Input
                  value={newRole.description}
                  onChange={(e) =>
                    setNewRole({ ...newRole, description: e.target.value })
                  }
                  placeholder="简要描述该角色的职责"
                  className="mt-2"
                />
              </div>

              <div>
                <Label>权重级别</Label>
                <Input
                  type="number"
                  value={newRole.level}
                  onChange={(e) =>
                    setNewRole({ ...newRole, level: parseInt(e.target.value) })
                  }
                  min="1"
                  max="99"
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  数字越大权限越高（1-99，系统角色保留100）
                </p>
              </div>

              <div>
                <Label>权限配置</Label>
                <div className="mt-2">
                  <PermissionSelector
                    selectedPermissionIds={newRole.permission_ids}
                    isEditing={false}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleCreateRole}>创建</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* 角色列表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {roles.map((role) => (
          <div
            key={role.id}
            className="bg-card border border-border rounded-lg p-6 space-y-4 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon className="h-5 w-5 text-primary flex-shrink-0" />
                  <h3 className="font-semibold text-lg text-foreground truncate">
                    {role.name}
                  </h3>
                  {role.is_system && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                      系统
                    </span>
                  )}
                </div>
                {role.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {role.description}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span>编码: {role.code}</span>
                  <span>级别: {role.level}</span>
                </div>
              </div>
              {!role.is_system && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingRole(role)
                      setEditDialogOpen(true)
                    }}
                    className="p-2 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
                    title="编辑"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteRole(role.id)}
                    className="p-2 hover:bg-destructive/10 rounded-md transition-colors text-muted-foreground hover:text-destructive"
                    title="删除"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {/* 权限列表 */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                已授权限 ({role.permissions.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {role.permissions.slice(0, 6).map((perm) => (
                  <span
                    key={perm.id}
                    className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-muted text-muted-foreground"
                    title={perm.description || undefined}
                  >
                    {perm.name}
                  </span>
                ))}
                {role.permissions.length > 6 && (
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-muted text-muted-foreground">
                    +{role.permissions.length - 6} 更多
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 编辑角色弹窗 - 左基本信息 + 右树状权限 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>编辑角色</DialogTitle>
            <DialogDescription>
              修改角色信息和权限配置
            </DialogDescription>
          </DialogHeader>
          {editingRole && (
            <div className="flex-1 overflow-y-auto min-h-0 px-1">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 左侧：基本信息 */}
                <div className="space-y-4">
                  <div className="font-medium text-sm text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
                    基本信息
                  </div>
                  <div>
                    <Label>角色名称</Label>
                    <Input
                      value={editingRole.name}
                      onChange={(e) =>
                        setEditingRole({ ...editingRole, name: e.target.value })
                      }
                      className="mt-2"
                      disabled={editingRole.is_system}
                    />
                  </div>
                  <div>
                    <Label>角色编码</Label>
                    <Input
                      value={editingRole.code}
                      className="mt-2 bg-muted"
                      disabled
                    />
                  </div>

                  <div>
                    <Label>角色描述</Label>
                    <Input
                      value={editingRole.description || ''}
                      onChange={(e) =>
                        setEditingRole({ ...editingRole, description: e.target.value })
                      }
                      className="mt-2"
                      disabled={editingRole.is_system}
                    />
                  </div>

                  <div>
                    <Label>权重级别</Label>
                    <Input
                      type="number"
                      value={editingRole.level}
                      onChange={(e) =>
                        setEditingRole({
                          ...editingRole,
                          level: parseInt(e.target.value),
                        })
                      }
                      min="1"
                      max="99"
                      className="mt-2"
                      disabled={editingRole.is_system}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      数字越大权限越高（1-99，系统角色保留100）
                    </p>
                  </div>
                </div>

                {/* 右侧：权限配置 */}
                <div className="space-y-3">
                  <div className="font-medium text-sm text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
                    权限配置
                  </div>
                  <PermissionSelector
                    selectedPermissionIds={editingRole.permissions.map((p) => p.id)}
                    isEditing={true}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-shrink-0 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false)
                setEditingRole(null)
              }}
            >
              取消
            </Button>
            <Button onClick={handleUpdateRole} disabled={editingRole?.is_system}>
              {editingRole?.is_system ? '系统角色不可编辑' : '保存更改'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新建角色弹窗 - 左基本信息 + 右树状权限 */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>新建角色</DialogTitle>
            <DialogDescription>
              创建新角色并分配相应权限
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 px-1">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 左侧：基本信息 */}
              <div className="space-y-4">
                <div className="font-medium text-sm text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
                  基本信息
                </div>
                <div>
                  <Label>角色名称</Label>
                  <Input
                    value={newRole.name}
                    onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                    placeholder="例如: 项目经理"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>角色编码</Label>
                  <Input
                    value={newRole.code}
                    onChange={(e) =>
                      setNewRole({ ...newRole, code: e.target.value.toLowerCase() })
                    }
                    placeholder="例如: project_manager"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label>角色描述</Label>
                  <Input
                    value={newRole.description}
                    onChange={(e) =>
                      setNewRole({ ...newRole, description: e.target.value })
                    }
                    placeholder="简要描述该角色的职责"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label>权重级别</Label>
                  <Input
                    type="number"
                    value={newRole.level}
                    onChange={(e) =>
                      setNewRole({ ...newRole, level: parseInt(e.target.value) })
                    }
                    min="1"
                    max="99"
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    数字越大权限越高（1-99，系统角色保留100）
                  </p>
                </div>
              </div>

              {/* 右侧：权限配置 */}
              <div className="space-y-3">
                <div className="font-medium text-sm text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
                  权限配置
                </div>
                <PermissionSelector
                  selectedPermissionIds={newRole.permission_ids}
                  isEditing={false}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="flex-shrink-0 pt-4">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreateRole}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}