import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { departmentService } from '@/services/departmentService'
import { userService } from '@/services/userService'
import { DepartmentTreeNode, JkbDepartment } from '@/types/database'
import { UserWithDepartments } from '@/types/database'
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
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  UserPlusIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

// 部门树节点组件
function DepartmentNode({
  node,
  depth,
  onEdit,
  onDelete,
  onManageMembers,
  memberCounts,
}: {
  node: DepartmentTreeNode
  depth: number
  onEdit: (dept: JkbDepartment) => void
  onDelete: (dept: JkbDepartment) => void
  onManageMembers: (dept: JkbDepartment) => void
  memberCounts: Record<string, number>
}) {
  const [expanded, setExpanded] = useState(depth === 0)
  const hasChildren = node.children.length > 0
  const memberCount = memberCounts[node.id] || 0

  return (
    <div className="select-none">
      <div
        className={cn(
          'group flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors',
          depth > 0 && 'ml-6'
        )}
      >
        {/* 展开/折叠按钮 */}
        <button
          onClick={() => hasChildren && setExpanded(!expanded)}
          className={cn(
            'w-5 h-5 flex items-center justify-center rounded transition-colors flex-shrink-0',
            hasChildren
              ? 'hover:bg-accent text-muted-foreground'
              : 'text-transparent cursor-default'
          )}
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDownIcon className="h-3.5 w-3.5" />
            ) : (
              <ChevronRightIcon className="h-3.5 w-3.5" />
            )
          ) : null}
        </button>

        {/* 图标 */}
        <BuildingOfficeIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />

        {/* 名称和路径 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {node.name}
            </span>
            {node.code && (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {node.code}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {node.path}
          </div>
        </div>

        {/* 成员数量 */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <UserGroupIcon className="h-3.5 w-3.5" />
          <span>{memberCount} 人</span>
        </div>

        {/* 操作按钮（hover 显示） */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onManageMembers(node)}
            className="p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
            title="管理成员"
          >
            <UserPlusIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onEdit(node)}
            className="p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
            title="编辑"
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(node)}
            className="p-1.5 hover:bg-destructive/10 rounded-md transition-colors text-muted-foreground hover:text-destructive"
            title="删除"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 子节点 */}
      {expanded && hasChildren && (
        <div className="border-l border-border ml-8 pl-0">
          {node.children.map((child) => (
            <DepartmentNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onManageMembers={onManageMembers}
              memberCounts={memberCounts}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function DepartmentManagement() {
  const { refreshUser } = useAuthStore()
  const [departments, setDepartments] = useState<JkbDepartment[]>([])
  const [departmentTree, setDepartmentTree] = useState<DepartmentTreeNode[]>([])
  const [users, setUsers] = useState<UserWithDepartments[]>([])
  const [loading, setLoading] = useState(true)

  // 从 users + departmentTree 派生出各部门递归人数
  const memberCounts = useMemo(() => {
    const directCounts: Record<string, number> = {}
    users.forEach(u => {
      const deptIds = [
        u.primary_department?.id,
        ...(u.extra_departments || []).map(d => d.id)
      ].filter((id): id is string => Boolean(id))
      deptIds.forEach(deptId => {
        directCounts[deptId] = (directCounts[deptId] || 0) + 1
      })
    })

    // 递归累加子部门人数
    const accumulate = (nodes: DepartmentTreeNode[]): void => {
      for (const node of nodes) {
        let total = directCounts[node.id] || 0
        if (node.children && node.children.length > 0) {
          accumulate(node.children)
          for (const child of node.children) {
            total += result[child.id] || 0
          }
        }
        result[node.id] = total
      }
    }

    const result: Record<string, number> = {}
    accumulate(departmentTree)
    return result
  }, [users, departmentTree])

  // 创建/编辑部门
  const [deptDialogOpen, setDeptDialogOpen] = useState(false)
  const [editingDept, setEditingDept] = useState<JkbDepartment | null>(null)
  const [deptForm, setDeptForm] = useState({
    name: '',
    code: '',
    description: '',
    parent_id: '',
    manager_id: '',
    sort_order: 0,
  })

  // 管理成员弹窗
  const [memberDialogOpen, setMemberDialogOpen] = useState(false)
  const [selectedDept, setSelectedDept] = useState<JkbDepartment | null>(null)
  const [deptMembers, setDeptMembers] = useState<any[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [memberSearchTerm, setMemberSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [deptsData, usersData] = await Promise.all([
        departmentService.getAllDepartments(),
        userService.getAllUsers(),
      ])
      const tree = departmentService.buildDepartmentTree(deptsData)
      setDepartments(deptsData)
      setDepartmentTree(tree)
      setUsers(usersData)
    } catch (error: any) {
      toast.error('加载失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 打开创建对话框
  const handleCreate = () => {
    setEditingDept(null)
    setDeptForm({
      name: '',
      code: '',
      description: '',
      parent_id: '',
      manager_id: '',
      sort_order: 0,
    })
    setDeptDialogOpen(true)
  }

  // 打开编辑对话框
  const handleEdit = (dept: JkbDepartment) => {
    setEditingDept(dept)
    setDeptForm({
      name: dept.name,
      code: dept.code || '',
      description: dept.description || '',
      parent_id: dept.parent_id || '',
      manager_id: dept.manager_id || '',
      sort_order: dept.sort_order,
    })
    setDeptDialogOpen(true)
  }

  // 保存部门
  const handleSaveDept = async () => {
    if (!deptForm.name.trim()) {
      toast.error('请输入部门名称')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: deptForm.name.trim(),
        code: deptForm.code.trim() || undefined,
        description: deptForm.description.trim() || undefined,
        parent_id: deptForm.parent_id || null,
        manager_id: deptForm.manager_id || null,
        sort_order: deptForm.sort_order,
      }

      if (editingDept) {
        await departmentService.updateDepartment(editingDept.id, payload)
        toast.success('部门已更新')
      } else {
        await departmentService.createDepartment(payload)
        toast.success('部门已创建')
      }

      setDeptDialogOpen(false)
      loadData()
    } catch (error: any) {
      toast.error(error.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 删除部门
  const handleDelete = async (dept: JkbDepartment) => {
    if (!confirm(`确定要删除部门"${dept.name}"吗？`)) return

    try {
      await departmentService.deleteDepartment(dept.id)
      toast.success('部门已删除')
      loadData()
    } catch (error: any) {
      toast.error(error.message || '删除失败')
    }
  }

  // 打开成员管理
  const handleManageMembers = async (dept: JkbDepartment) => {
    setSelectedDept(dept)
    setMemberSearchTerm('')

    try {
      const members = await departmentService.getDepartmentMembers(dept.id)
      setDeptMembers(members)
      setSelectedUserIds(members.map((m: any) => m.user?.id).filter(Boolean))
      setMemberDialogOpen(true)
    } catch (error: any) {
      toast.error('加载成员失败: ' + error.message)
    }
  }

  // 保存成员
  const handleSaveMembers = async () => {
    if (!selectedDept) return

    setSaving(true)
    try {
      await departmentService.setDepartmentMembers(
        selectedDept.id,
        selectedUserIds
      )
      toast.success('成员已更新')
      setMemberDialogOpen(false)
      loadData()
      // 刷新当前用户权限（防止修改了自己所在部门后权限不更新）
      refreshUser()
    } catch (error: any) {
      toast.error(error.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const filteredUsers = users.filter(
    (u) =>
      u.display_name?.toLowerCase().includes(memberSearchTerm.toLowerCase()) ||
      u.phone.includes(memberSearchTerm)
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
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">部门管理</h1>
          <p className="text-muted-foreground mt-1">
            管理组织架构和部门成员
          </p>
        </div>
        <Button onClick={handleCreate} className="gap-2">
          <PlusIcon className="h-4 w-4" />
          新建部门
        </Button>
      </div>

      {/* 部门树 */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BuildingOfficeIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">组织架构</span>
            <span className="text-xs text-muted-foreground">
              ({departments.length} 个部门)
            </span>
          </div>
        </div>

        <div className="p-3 space-y-0.5">
          {departmentTree.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BuildingOfficeIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">暂无部门，点击右上角新建部门</p>
            </div>
          ) : (
            departmentTree.map((node) => (
              <DepartmentNode
                key={node.id}
                node={node}
                depth={0}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onManageMembers={handleManageMembers}
                memberCounts={memberCounts}
              />
            ))
          )}
        </div>
      </div>

      {/* 创建/编辑部门弹窗 */}
      <Dialog open={deptDialogOpen} onOpenChange={setDeptDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingDept ? '编辑部门' : '新建部门'}
            </DialogTitle>
            <DialogDescription>
              {editingDept ? '修改部门信息' : '创建新的组织部门'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>部门名称</Label>
                <Input
                  value={deptForm.name}
                  onChange={(e) =>
                    setDeptForm({ ...deptForm, name: e.target.value })
                  }
                  placeholder="例如: 研发部"
                  className="mt-2"
                />
              </div>
              <div>
                <Label>部门编码</Label>
                <Input
                  value={deptForm.code}
                  onChange={(e) =>
                    setDeptForm({ ...deptForm, code: e.target.value })
                  }
                  placeholder="例如: RD"
                  className="mt-2"
                />
              </div>
            </div>

            <div>
              <Label>上级部门</Label>
              <select
                value={deptForm.parent_id}
                onChange={(e) =>
                  setDeptForm({ ...deptForm, parent_id: e.target.value })
                }
                className="mt-2 w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              >
                <option value="">无（顶级部门）</option>
                {departments
                  .filter((d) => d.id !== editingDept?.id)
                  .map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {'　'.repeat(dept.level)}{dept.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <Label>部门负责人</Label>
              <select
                value={deptForm.manager_id}
                onChange={(e) =>
                  setDeptForm({ ...deptForm, manager_id: e.target.value })
                }
                className="mt-2 w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              >
                <option value="">未设置</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.display_name || user.phone}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>部门描述</Label>
              <textarea
                value={deptForm.description}
                onChange={(e) =>
                  setDeptForm({ ...deptForm, description: e.target.value })
                }
                placeholder="简要描述部门职能..."
                rows={2}
                className="mt-2 w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>

            <div>
              <Label>排序</Label>
              <Input
                type="number"
                value={deptForm.sort_order}
                onChange={(e) =>
                  setDeptForm({
                    ...deptForm,
                    sort_order: parseInt(e.target.value) || 0,
                  })
                }
                className="mt-2"
                min={0}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeptDialogOpen(false)}
            >
              取消
            </Button>
            <Button onClick={handleSaveDept} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 管理成员弹窗 */}
      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              管理成员 - {selectedDept?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedDept?.path}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-shrink-0">
            <Input
              placeholder="搜索用户..."
              value={memberSearchTerm}
              onChange={(e) => setMemberSearchTerm(e.target.value)}
              className="mb-3"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>已选择 {selectedUserIds.length} 人</span>
              <button
                onClick={() => {
                  if (selectedUserIds.length === filteredUsers.length) {
                    setSelectedUserIds([])
                  } else {
                    setSelectedUserIds(filteredUsers.map((u) => u.id))
                  }
                }}
                className="text-primary hover:underline"
              >
                {selectedUserIds.length === filteredUsers.length
                  ? '取消全选'
                  : '全选'}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-1">
            {filteredUsers.map((user) => {
              const isSelected = selectedUserIds.includes(user.id)
              return (
                <div
                  key={user.id}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedUserIds(
                        selectedUserIds.filter((id) => id !== user.id)
                      )
                    } else {
                      setSelectedUserIds([...selectedUserIds, user.id])
                    }
                  }}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors',
                    isSelected
                      ? 'bg-primary/10 border border-primary/30'
                      : 'hover:bg-accent border border-transparent'
                  )}
                >
                  <div
                    className={cn(
                      'w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors',
                      isSelected
                        ? 'bg-primary border-primary'
                        : 'border-muted-foreground/30'
                    )}
                  >
                    {isSelected && (
                      <CheckIcon className="h-3 w-3 text-white" />
                    )}
                  </div>

                  <UserAvatar
                    avatarUrl={user.avatar_url}
                    displayName={user.display_name}
                    size="sm"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {user.display_name || '未命名'}
                      </span>
                      {!user.is_active && (
                        <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">
                          已停用
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {user.phone}
                      {user.primary_department && (
                        <span className="ml-2 text-primary">
                          {user.primary_department.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <DialogFooter className="flex-shrink-0 border-t border-border pt-4 mt-2">
            <Button
              variant="outline"
              onClick={() => setMemberDialogOpen(false)}
            >
              取消
            </Button>
            <Button onClick={handleSaveMembers} disabled={saving}>
              {saving ? '保存中...' : `确认 (${selectedUserIds.length} 人)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}