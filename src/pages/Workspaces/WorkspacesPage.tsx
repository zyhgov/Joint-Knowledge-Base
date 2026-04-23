import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { workspaceService } from '@/services/workspaceService'
import { departmentService } from '@/services/departmentService'
import { userService } from '@/services/userService'
import { useAuthStore } from '@/store/authStore'
import { JkbWorkspace } from '@/types/files'
import { JkbDepartment, DepartmentTreeNode } from '@/types/database'
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
import UserAvatar from '@/components/common/UserAvatar'
import IconPicker, { renderWorkspaceIcon } from '@/components/common/IconPicker'
import DepartmentTreeSelector from '@/components/common/DepartmentTreeSelector'
import {
  PlusIcon,
  FolderIcon,
  PencilIcon,
  TrashIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  GlobeAltIcon,
  LockClosedIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { CardSkeleton } from '@/components/common/Skeleton'
import { isAdmin, canEditWorkspace, canDeleteWorkspace, canCreateWorkspace, getAllDepartmentIdsWithAncestors, filterWorkspacesByPermission } from '@/utils/permission'

export default function WorkspacesPage() {
  const { user, userPermissions } = useAuthStore()
  const [workspaces, setWorkspaces] = useState<JkbWorkspace[]>([])
  const [departments, setDepartments] = useState<JkbDepartment[]>([])
  const [loading, setLoading] = useState(true)

  // 用户权限相关
  const [userDeptIds, setUserDeptIds] = useState<string[]>([])

  // 权限过滤后的工作区
  const permittedWorkspaces = useMemo(() => {
    return filterWorkspacesByPermission(workspaces, user, userDeptIds)
  }, [workspaces, user, userDeptIds])

  // 构建部门树
  const departmentTree = useMemo(() => {
    return departmentService.buildDepartmentTree(departments)
  }, [departments])

  // 创建/编辑
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState<JkbWorkspace | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    icon: '📁',
    department_ids: [] as string[],
    is_public: false,
  })
  const [saving, setSaving] = useState(false)

  // 成员管理
  const [memberDialogOpen, setMemberDialogOpen] = useState(false)
  const [selectedWorkspace, setSelectedWorkspace] = useState<JkbWorkspace | null>(null)
  const [members, setMembers] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [workspacesData, deptsData] = await Promise.all([
        workspaceService.getAllWorkspaces(),
        departmentService.getAllDepartments(),
      ])
      setWorkspaces(workspacesData)
      setDepartments(deptsData)

      // 计算用户部门（含祖先），用于权限判断
      if (user && !isAdmin(user)) {
        try {
          const userDepts = await departmentService.getUserDepartments(user.id)
          const directDeptIds = userDepts.map((d) => d.department.id)
          const allDeptIds = getAllDepartmentIdsWithAncestors(directDeptIds, deptsData)
          setUserDeptIds(allDeptIds)
        } catch {
          setUserDeptIds([])
        }
      } else {
        setUserDeptIds([])
      }
    } catch (error: any) {
      toast.error('加载失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCreate = () => {
    setEditingWorkspace(null)
    setForm({
      name: '',
      description: '',
      icon: '📁',
      department_ids: [],
      is_public: false,
    })
    setDialogOpen(true)
  }

  const handleEdit = (workspace: JkbWorkspace) => {
    setEditingWorkspace(workspace)
    setForm({
      name: workspace.name,
      description: workspace.description || '',
      icon: workspace.icon,
      department_ids: workspace.department_ids || [],
      is_public: workspace.is_public,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!user || !form.name.trim()) {
      toast.error('请填写工作区名称')
      return
    }

    setSaving(true)
    try {
      if (editingWorkspace) {
        await workspaceService.updateWorkspace(editingWorkspace.id, form)
        toast.success('工作区已更新')
      } else {
        await workspaceService.createWorkspace({
          ...form,
          owner_id: user.id,
        })
        toast.success('工作区已创建')
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
    if (!confirm('确定要删除该工作区吗？工作区内的文件不会被删除。')) return

    try {
      await workspaceService.deleteWorkspace(id)
      toast.success('工作区已删除')
      loadData()
    } catch (error: any) {
      toast.error(error.message || '删除失败')
    }
  }

  const handleManageMembers = async (workspace: JkbWorkspace) => {
    setSelectedWorkspace(workspace)

    try {
      const [membersData, usersData] = await Promise.all([
        workspaceService.getMembers(workspace.id),
        userService.getAllUsers(),
      ])
      setMembers(membersData)
      setUsers(usersData)
      setMemberDialogOpen(true)
    } catch (error: any) {
      toast.error('加载成员失败: ' + error.message)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-9 w-28 bg-muted rounded animate-pulse" />
            <div className="h-4 w-20 bg-muted rounded animate-pulse mt-2" />
          </div>
          <div className="h-10 w-28 bg-muted rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">工作区</h1>
          <p className="text-muted-foreground mt-1">
            共 {permittedWorkspaces.length} 个工作区
          </p>
        </div>
        <Button onClick={handleCreate} className="gap-2" disabled={!canCreateWorkspace(user, userPermissions)}>
          <PlusIcon className="h-4 w-4" />
          新建工作区
        </Button>
      </div>

      {/* 工作区卡片 - 瀑布流布局 */}
      <div className="columns-1 md:columns-2 lg:columns-3 gap-5 space-y-5">
        {permittedWorkspaces.map((workspace) => (
          <div
            key={workspace.id}
            className="bg-card border border-border rounded-2xl p-5 hover:shadow-md transition-all group break-inside-avoid mb-5"
          >
            {/* 封面区 */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
                  {renderWorkspaceIcon(workspace.icon)}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-lg">
                    {workspace.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    {workspace.is_public ? (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <GlobeAltIcon className="h-3 w-3" />
                        公开
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-orange-600">
                        <LockClosedIcon className="h-3 w-3" />
                        私有
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 操作按钮（hover显示） */}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {canEditWorkspace(user, workspace, userPermissions) && (
                  <button
                    onClick={() => handleEdit(workspace)}
                    className="p-1.5 hover:bg-accent rounded-md transition-colors"
                    title="编辑"
                  >
                    <PencilIcon className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
                {canDeleteWorkspace(user, workspace, userPermissions) && (
                  <button
                    onClick={() => handleDelete(workspace.id)}
                    className="p-1.5 hover:bg-destructive/10 rounded-md transition-colors"
                    title="删除"
                  >
                    <TrashIcon className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
              </div>
            </div>

            {/* 描述 */}
            {workspace.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                {workspace.description}
              </p>
            )}

            {/* 关联部门提示 */}
            {workspace.department_ids && workspace.department_ids.length > 0 && !workspace.is_public && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 px-0.5">
                <LockClosedIcon className="h-3 w-3" />
                仅关联部门可见
              </div>
            )}

            {/* 关联部门 */}
            {workspace.department_ids && workspace.department_ids.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                  <BuildingOfficeIcon className="h-3.5 w-3.5" />
                  关联部门
                </div>
                <div className="flex flex-wrap gap-1">
                  {departments
                    .filter((d) => workspace.department_ids.includes(d.id))
                    .slice(0, 3)
                    .map((dept) => (
                      <span
                        key={dept.id}
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-muted text-muted-foreground"
                      >
                        {dept.name}
                      </span>
                    ))}
                  {workspace.department_ids.length > 3 && (
                    <span className="text-xs text-muted-foreground">
                      +{workspace.department_ids.length - 3}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* 底部信息 */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <UserAvatar
                  avatarUrl={workspace.owner?.avatar_url}
                  displayName={workspace.owner?.display_name}
                  size="xs"
                />
                <span className="text-xs text-muted-foreground">
                  {workspace.owner?.display_name || '未知'}
                </span>
              </div>
              <button
                onClick={() => handleManageMembers(workspace)}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <UserGroupIcon className="h-3.5 w-3.5" />
                成员
              </button>
            </div>
          </div>
        ))}
      </div>

      {permittedWorkspaces.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FolderIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">暂无工作区</p>
        </div>
      )}

      {/* 创建/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingWorkspace ? '编辑工作区' : '新建工作区'}</DialogTitle>
            <DialogDescription>
              {editingWorkspace ? '修改工作区信息' : '创建新的协作工作区'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 左侧：基本信息 */}
            <div className="space-y-4">
              {/* 图标选择 */}
              <div>
                <Label>工作区图标</Label>
                <div className="mt-2">
                  <IconPicker
                    value={form.icon}
                    onChange={(icon) => setForm({ ...form, icon })}
                  />
                </div>
              </div>

              <div>
                <Label>工作区名称</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如: 产品部"
                  className="mt-2"
                />
              </div>

              <div>
                <Label>描述</Label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="简要描述工作区用途..."
                  rows={3}
                  className="mt-2 w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_public}
                  onChange={(e) =>
                    setForm({ ...form, is_public: e.target.checked })
                  }
                  className="rounded"
                />
                <span className="text-sm">公开工作区（所有人可见）</span>
              </label>
            </div>

            {/* 右侧：部门关联 */}
            <div>
              <Label>关联部门</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                勾选父部门时，所有子部门默认选中，可单独取消子部门
              </p>
              <div className="max-h-64 overflow-y-auto border border-border rounded-lg p-2">
                <DepartmentTreeSelector
                  tree={departmentTree}
                  selectedIds={form.department_ids}
                  onChange={(ids) => setForm({ ...form, department_ids: ids })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : editingWorkspace ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 成员管理弹窗 */}
      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>工作区成员 - {selectedWorkspace?.name}</DialogTitle>
            <DialogDescription>
              管理工作区成员和权限
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="max-h-96 overflow-y-auto space-y-2">
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  暂无成员
                </p>
              ) : (
                members.map((member: any) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        avatarUrl={member.user?.avatar_url}
                        displayName={member.user?.display_name}
                        size="sm"
                      />
                      <div>
                        <div className="font-medium text-sm">
                          {member.user?.display_name || '未知'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {member.user?.phone}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'px-2 py-1 rounded text-xs font-medium',
                          member.role === 'owner' && 'bg-red-100 text-red-700',
                          member.role === 'editor' && 'bg-blue-100 text-blue-700',
                          member.role === 'viewer' && 'bg-gray-100 text-gray-700'
                        )}
                      >
                        {member.role === 'owner' && '所有者'}
                        {member.role === 'editor' && '编辑者'}
                        {member.role === 'viewer' && '查看者'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberDialogOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}