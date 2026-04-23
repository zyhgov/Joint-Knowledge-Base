import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { userService } from '@/services/userService'
import { roleService } from '@/services/roleService'
import { departmentService } from '@/services/departmentService'
import { UserWithDepartments, DepartmentTreeNode } from '@/types/database'
import { JkbDepartment } from '@/types/database'
import { Role } from '@/types/rbac'
import { toast } from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import UserAvatar from '@/components/common/UserAvatar'
import DepartmentTreeSelector from '@/components/common/DepartmentTreeSelector'
import {
  UserPlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  CloudArrowUpIcon,
  NoSymbolIcon,
  CheckCircleIcon,
  BuildingOfficeIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronDoubleDownIcon,
  ChevronDoubleUpIcon,
} from '@heroicons/react/24/outline'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

export default function UserManagement() {
  const { refreshUser } = useAuthStore()
  const [users, setUsers] = useState<UserWithDepartments[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [departments, setDepartments] = useState<JkbDepartment[]>([])
  const [departmentTree, setDepartmentTree] = useState<DepartmentTreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchMode, setSearchMode] = useState<'fuzzy' | 'exact'>('fuzzy')
  const [filterDept, setFilterDept] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')

  // 分页
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // 部门树展开状态
  const [allExpanded, setAllExpanded] = useState(false)
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set())

  // 批量选择
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 批量操作弹窗
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [batchType, setBatchType] = useState<'role' | 'department'>('role')
  const [batchRoleIds, setBatchRoleIds] = useState<string[]>([])
  const [batchDeptIds, setBatchDeptIds] = useState<string[]>([])
  const [batchPrimaryDeptId, setBatchPrimaryDeptId] = useState('')

  // 创建用户
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newUser, setNewUser] = useState({
    phone: '',
    password: '',
    display_name: '',
    role_ids: [] as string[],
    department_ids: [] as string[],
    primary_department_id: '',
  })

  // 编辑用户
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserWithDepartments | null>(null)
  const [editForm, setEditForm] = useState({
    display_name: '',
    role_ids: [] as string[],
    department_ids: [] as string[],
    primary_department_id: '',
  })

  // 导入用户
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importData, setImportData] = useState('')

  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [usersData, rolesData, deptsData] = await Promise.all([
        userService.getAllUsers(),
        roleService.getAllRoles(),
        departmentService.getAllDepartments(),
      ])
      setUsers(usersData)
      setRoles(rolesData)
      setDepartments(deptsData)
      setDepartmentTree(departmentService.buildDepartmentTree(deptsData))
    } catch (error: any) {
      toast.error('加载数据失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 创建用户
  const handleCreateUser = async () => {
    if (!newUser.phone || !newUser.password || !newUser.display_name) {
      toast.error('请填写完整信息')
      return
    }

    setSaving(true)
    try {
      const result = await userService.createUser(newUser)
      toast.success('用户创建成功')
      if (newUser.department_ids.length > 0) {
        const deptPayload = newUser.department_ids.map((dId) => ({
          department_id: dId,
          is_primary: dId === newUser.primary_department_id,
        }))
        await departmentService.setUserDepartments(result.id, deptPayload)
      }

      setCreateDialogOpen(false)
      setNewUser({ phone: '', password: '', display_name: '', role_ids: [], department_ids: [], primary_department_id: '' })
      loadData()
    } catch (error: any) {
      toast.error(error.message || '创建失败')
    } finally {
      setSaving(false)
    }
  }

  // 打开编辑
  const handleOpenEdit = async (user: UserWithDepartments) => {
    setEditingUser(user)
    setEditForm({
      display_name: user.display_name || '',
      role_ids: user.roles?.map((r) => r.id) || [],
      department_ids: [
        ...(user.primary_department ? [user.primary_department.id] : []),
        ...user.extra_departments.map((d) => d.id),
      ],
      primary_department_id: user.primary_department?.id || '',
    })
    setEditDialogOpen(true)
  }

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingUser) return

    setSaving(true)
    try {
      await userService.updateUser(editingUser.id, {
        display_name: editForm.display_name,
      })

      await userService.assignRoles(editingUser.id, editForm.role_ids)

      const deptPayload = editForm.department_ids.map((dId) => ({
        department_id: dId,
        is_primary: dId === editForm.primary_department_id,
      }))
      await departmentService.setUserDepartments(editingUser.id, deptPayload)

      toast.success('用户信息已更新')
      setEditDialogOpen(false)
      setEditingUser(null)
      loadData()
      refreshUser()
    } catch (error: any) {
      toast.error(error.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 停用用户
  const handleDeactivate = async (user: UserWithDepartments) => {
    if (!confirm(`确定要停用用户"${user.display_name}"吗？该用户将立即被强制下线。`))
      return

    try {
      await userService.deactivateUser(user.id)
      toast.success(`用户 ${user.display_name} 已停用并强制下线`)
      loadData()
    } catch (error: any) {
      toast.error(error.message || '停用失败')
    }
  }

  // 启用用户
  const handleActivate = async (user: UserWithDepartments) => {
    try {
      await userService.activateUser(user.id)
      toast.success(`用户 ${user.display_name} 已启用`)
      loadData()
    } catch (error: any) {
      toast.error(error.message || '启用失败')
    }
  }

  // 删除用户
  const handleDelete = async (user: UserWithDepartments) => {
    if (!confirm(`确定要删除用户"${user.display_name}"吗？此操作不可恢复。`))
      return

    try {
      await userService.deleteUser(user.id)
      toast.success('用户已删除')
      loadData()
    } catch (error: any) {
      toast.error(error.message || '删除失败')
    }
  }

  // 批量导入
  const handleImport = async () => {
    if (!importData.trim()) {
      toast.error('请输入导入数据')
      return
    }

    setSaving(true)
    try {
      const lines = importData.trim().split('\n')
      const usersToImport = lines.slice(1).map((line) => {
        const [phone, password, display_name, role_code, department_code] = line
          .split(',')
          .map((s) => s.trim())
        return { phone, password, display_name, role_code, department_code }
      })

      const result = await userService.importUsers(usersToImport)
      toast.success(`成功导入 ${result.success} 人，失败 ${result.failed} 人`)

      if (result.errors.length > 0) {
        console.error('导入错误:', result.errors)
      }

      setImportDialogOpen(false)
      setImportData('')
      loadData()
    } catch (error: any) {
      toast.error(error.message || '导入失败')
    } finally {
      setSaving(false)
    }
  }

  // 批量操作
  const handleBatchSave = async () => {
    if (selectedIds.size === 0) return
    setSaving(true)
    try {
      const ids = Array.from(selectedIds)
      if (batchType === 'role') {
        for (const uid of ids) {
          await userService.assignRoles(uid, batchRoleIds)
        }
        toast.success(`已为 ${ids.length} 名用户设置角色`)
      } else {
        for (const uid of ids) {
          const deptPayload = batchDeptIds.map((dId) => ({
            department_id: dId,
            is_primary: dId === batchPrimaryDeptId,
          }))
          await departmentService.setUserDepartments(uid, deptPayload)
        }
        toast.success(`已为 ${ids.length} 名用户设置部门`)
      }
      setBatchDialogOpen(false)
      setSelectedIds(new Set())
      loadData()
    } catch (error: any) {
      toast.error(error.message || '批量操作失败')
    } finally {
      setSaving(false)
    }
  }

  // 切换选中
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredUsers.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredUsers.map(u => u.id)))
    }
  }

  // 过滤用户
  const filteredUsers = users.filter((user) => {
    let matchSearch = true
    if (searchTerm) {
      const term = searchMode === 'exact' ? searchTerm : searchTerm.toLowerCase()
      if (searchMode === 'exact') {
        // 精准搜索：完全匹配
        matchSearch =
          user.id === term ||
          user.display_name === term ||
          user.phone === term
      } else {
        // 模糊搜索：包含匹配（支持 ID、姓名、手机号）
        matchSearch =
          user.id.toLowerCase().includes(term) ||
          user.display_name?.toLowerCase().includes(term) ||
          user.phone.includes(term)
      }
    }

    const matchDept =
      !filterDept ||
      user.primary_department?.id === filterDept ||
      user.extra_departments.some((d) => d.id === filterDept)

    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' && user.is_active) ||
      (filterStatus === 'inactive' && !user.is_active)

    return matchSearch && matchDept && matchStatus
  })

  // 分页后的用户列表
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredUsers.slice(start, start + pageSize)
  }, [filteredUsers, currentPage, pageSize])

  const totalPages = Math.ceil(filteredUsers.length / pageSize)

  // 计算每个部门的人数
  const deptUserCounts = useMemo(() => {
    const counts = new Map<string, number>()
    users.forEach((u) => {
      if (u.primary_department?.id) {
        counts.set(u.primary_department.id, (counts.get(u.primary_department.id) || 0) + 1)
      }
      u.extra_departments.forEach((d) => {
        counts.set(d.id, (counts.get(d.id) || 0) + 1)
      })
    })
    return counts
  }, [users])

  // 递归获取所有部门 ID
  const getAllDeptIds = (nodes: DepartmentTreeNode[]): string[] => {
    const ids: string[] = []
    const walk = (node: DepartmentTreeNode) => {
      ids.push(node.id)
      node.children?.forEach(walk)
    }
    nodes.forEach(walk)
    return ids
  }

  // 展开/收缩所有部门
  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedDepts(new Set())
      setAllExpanded(false)
    } else {
      const allIds = getAllDeptIds(departmentTree)
      setExpandedDepts(new Set(allIds))
      setAllExpanded(true)
    }
  }

  // 部门树节点组件
  const DepartmentTreeNodeItem = ({ node, depth = 0 }: { node: DepartmentTreeNode; depth?: number }) => {
    const hasChildren = node.children && node.children.length > 0
    const isExpanded = expandedDepts.has(node.id)
    const isSelected = filterDept === node.id
    const userCount = deptUserCounts.get(node.id) || 0

    return (
      <div>
        <button
          onClick={() => {
            setFilterDept(isSelected ? '' : node.id)
            setCurrentPage(1)
            if (hasChildren) {
              setExpandedDepts(prev => {
                const next = new Set(prev)
                if (next.has(node.id)) next.delete(node.id)
                else next.add(node.id)
                return next
              })
            }
          }}
          className={cn(
            'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm transition-colors text-left',
            isSelected
              ? 'bg-primary/10 text-primary font-medium'
              : 'hover:bg-accent text-foreground'
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )
          ) : (
            <span className="w-3.5" />
          )}
          <BuildingOfficeIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate flex-1">{node.name}</span>
          {userCount > 0 && (
            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">{userCount}人</span>
          )}
        </button>
        {hasChildren && isExpanded && node.children.map((child) => (
          <DepartmentTreeNodeItem key={child.id} node={child} depth={depth + 1} />
        ))}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 标题和操作 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">用户管理</h1>
          <p className="text-muted-foreground mt-1">
            共 {users.length} 名用户，{users.filter((u) => u.is_active).length} 人活跃
            {selectedIds.size > 0 && (
              <span className="text-primary ml-2">已选 {selectedIds.size} 人</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setBatchType('role')
                  setBatchRoleIds([])
                  setBatchDialogOpen(true)
                }}
              >
                批量设置角色
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setBatchType('department')
                  setBatchDeptIds([])
                  setBatchPrimaryDeptId('')
                  setBatchDialogOpen(true)
                }}
              >
                批量设置部门
              </Button>
            </>
          )}
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setImportDialogOpen(true)}
          >
            <CloudArrowUpIcon className="h-4 w-4" />
            <span className="hidden sm:inline">批量导入</span>
          </Button>
          <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
            <UserPlusIcon className="h-4 w-4" />
            <span className="hidden sm:inline">新建用户</span>
          </Button>
        </div>
      </div>

      {/* 搜索和过滤 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
            placeholder="搜索ID、姓名或手机号..."
            className="pl-9"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={searchMode}
            onChange={(e) => setSearchMode(e.target.value as 'fuzzy' | 'exact')}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          >
            <option value="fuzzy">模糊搜索</option>
            <option value="exact">精准搜索</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')
            }
            className="h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          >
            <option value="all">所有状态</option>
            <option value="active">活跃</option>
            <option value="inactive">已停用</option>
          </select>
        </div>
      </div>

      {/* 主体：左侧部门树 + 右侧用户表 */}
      <div className="flex gap-6">
        {/* 左侧部门树 */}
        <div className="hidden md:block w-64 shrink-0">
          <div className="bg-card border border-border rounded-xl p-3 sticky top-6">
            <div className="flex items-center justify-between mb-2 px-2">
              <h3 className="text-sm font-semibold text-foreground">组织架构</h3>
              <button
                onClick={toggleExpandAll}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                title={allExpanded ? '收缩所有' : '展开所有'}
              >
                {allExpanded ? (
                  <>
                    <ChevronDoubleUpIcon className="h-3.5 w-3.5" />
                    收缩
                  </>
                ) : (
                  <>
                    <ChevronDoubleDownIcon className="h-3.5 w-3.5" />
                    展开
                  </>
                )}
              </button>
            </div>
            <div className="space-y-0.5 max-h-[calc(100vh-200px)] overflow-y-auto">
              <button
                onClick={() => {
                  setFilterDept('')
                  setCurrentPage(1)
                }}
                className={cn(
                  'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm transition-colors text-left',
                  !filterDept
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-accent text-foreground'
                )}
              >
                <span className="w-3.5" />
                <span className="flex-1">全部用户</span>
                <span className="text-xs text-muted-foreground">{users.length}人</span>
              </button>
              {departmentTree.map((node) => (
                <DepartmentTreeNodeItem key={node.id} node={node} />
              ))}
            </div>
          </div>
        </div>

        {/* 右侧用户表 */}
        <div className="flex-1 min-w-0">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === filteredUsers.length && filteredUsers.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      用户
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
                      手机号
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                      部门
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden xl:table-cell">
                      角色
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      状态
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedUsers.map((user) => (
                    <tr
                      key={user.id}
                      className={cn(
                        'hover:bg-muted/30 transition-colors',
                        !user.is_active && 'opacity-60',
                        selectedIds.has(user.id) && 'bg-primary/5'
                      )}
                    >
                      {/* 复选框 */}
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(user.id)}
                          onChange={() => toggleSelect(user.id)}
                          className="rounded"
                        />
                      </td>

                      {/* ID */}
                      <td className="px-4 py-3">
                        <span
                          className="text-xs text-muted-foreground font-mono cursor-pointer hover:text-primary transition-colors"
                          title={user.id}
                          onClick={() => {
                            navigator.clipboard.writeText(user.id)
                            toast.success('ID已复制')
                          }}
                        >
                          {user.id.slice(0, 8)}
                        </span>
                      </td>

                      {/* 用户信息 */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            avatarUrl={user.avatar_url}
                            displayName={user.display_name}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">
                              {user.display_name || '未命名'}
                            </div>
                            <div className="text-xs text-muted-foreground sm:hidden">
                              {user.phone}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 手机号 */}
                      <td className="px-4 py-3 text-sm text-foreground hidden sm:table-cell">
                        {user.phone}
                      </td>

                      {/* 部门 */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="space-y-1">
                          {user.primary_department && (
                            <div className="flex items-center gap-1.5">
                              <BuildingOfficeIcon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                              <span className="text-xs font-medium text-foreground truncate max-w-[120px]">
                                {user.primary_department.name}
                              </span>
                              <span className="text-xs bg-primary/10 text-primary px-1 py-0.5 rounded">
                                主
                              </span>
                            </div>
                          )}
                          {user.extra_departments.slice(0, 2).map((dept) => (
                            <div
                              key={dept.id}
                              className="flex items-center gap-1.5"
                            >
                              <BuildingOfficeIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                {dept.name}
                              </span>
                            </div>
                          ))}
                          {user.extra_departments.length > 2 && (
                            <span className="text-xs text-muted-foreground">
                              +{user.extra_departments.length - 2} 个部门
                            </span>
                          )}
                          {!user.primary_department &&
                            user.extra_departments.length === 0 && (
                              <span className="text-xs text-muted-foreground">
                                未分配部门
                              </span>
                            )}
                        </div>
                      </td>

                      {/* 角色 */}
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {user.roles?.slice(0, 2).map((role) => (
                            <span
                              key={role.id}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary"
                            >
                              {role.name}
                            </span>
                          ))}
                          {(user.roles?.length || 0) > 2 && (
                            <span className="text-xs text-muted-foreground">
                              +{(user.roles?.length || 0) - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 状态 */}
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                            user.is_active
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-destructive/10 text-destructive'
                          )}
                        >
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full',
                              user.is_active ? 'bg-green-500' : 'bg-destructive'
                            )}
                          />
                          {user.is_active ? '活跃' : '停用'}
                        </span>
                      </td>

                      {/* 操作 */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEdit(user)}
                            className="p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
                            title="编辑"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          {user.is_active ? (
                            <button
                              onClick={() => handleDeactivate(user)}
                              className="p-1.5 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-md transition-colors text-muted-foreground hover:text-orange-600"
                              title="停用"
                            >
                              <NoSymbolIcon className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleActivate(user)}
                              className="p-1.5 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-colors text-muted-foreground hover:text-green-600"
                              title="启用"
                            >
                              <CheckCircleIcon className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(user)}
                            className="p-1.5 hover:bg-destructive/10 rounded-md transition-colors text-muted-foreground hover:text-destructive"
                            title="删除"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredUsers.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <UserPlusIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {searchTerm || filterDept || filterStatus !== 'all'
                    ? '没有找到匹配的用户'
                    : '暂无用户'}
                </p>
              </div>
            )}

            {/* 分页 */}
            {filteredUsers.length > pageSize && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <div className="text-sm text-muted-foreground">
                  共 {filteredUsers.length} 条，第 {currentPage}/{totalPages} 页
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2 py-1 text-sm rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    首页
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2 py-1 text-sm rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    上一页
                  </button>
                  {/* 页码按钮 */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let page: number
                    if (totalPages <= 5) {
                      page = i + 1
                    } else if (currentPage <= 3) {
                      page = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      page = totalPages - 4 + i
                    } else {
                      page = currentPage - 2 + i
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={cn(
                          'w-8 h-8 text-sm rounded transition-colors',
                          page === currentPage
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'hover:bg-accent'
                        )}
                      >
                        {page}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 text-sm rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    下一页
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 text-sm rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    末页
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 批量操作弹窗 */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              批量设置{batchType === 'role' ? '角色' : '部门'} - {selectedIds.size} 名用户
            </DialogTitle>
            <DialogDescription>
              将覆盖所选用户现有的{batchType === 'role' ? '角色' : '部门'}设置
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {batchType === 'role' ? (
              <div>
                <Label>选择角色</Label>
                <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-2">
                  {roles.map((role) => (
                    <label
                      key={role.id}
                      className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        checked={batchRoleIds.includes(role.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setBatchRoleIds([...batchRoleIds, role.id])
                          } else {
                            setBatchRoleIds(batchRoleIds.filter((id) => id !== role.id))
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">{role.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div>
                  <Label>选择部门</Label>
                  <div className="mt-2 max-h-48 overflow-y-auto border border-border rounded-lg p-2">
                    <DepartmentTreeSelector
                      tree={departmentTree}
                      selectedIds={batchDeptIds}
                      onChange={(ids) => {
                        setBatchDeptIds(ids)
                        setBatchPrimaryDeptId(batchPrimaryDeptId || ids[0] || '')
                      }}
                    />
                  </div>
                </div>
                {batchDeptIds.length > 0 && (
                  <div>
                    <Label className="text-xs">主部门</Label>
                    <select
                      value={batchPrimaryDeptId}
                      onChange={(e) => setBatchPrimaryDeptId(e.target.value)}
                      className="w-full h-8 px-2 mt-1 rounded-md border border-input bg-background text-sm"
                    >
                      <option value="">选择主部门</option>
                      {departments
                        .filter((d) => batchDeptIds.includes(d.id))
                        .map((dept) => (
                          <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleBatchSave} disabled={saving}>
              {saving ? '保存中...' : '确认设置'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 创建用户弹窗 */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新建用户</DialogTitle>
            <DialogDescription>创建新的系统用户</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>手机号</Label>
              <Input
                value={newUser.phone}
                onChange={(e) =>
                  setNewUser({ ...newUser, phone: e.target.value })
                }
                placeholder="188..."
                className="mt-2"
              />
            </div>
            <div>
              <Label>显示名称</Label>
              <Input
                value={newUser.display_name}
                onChange={(e) =>
                  setNewUser({ ...newUser, display_name: e.target.value })
                }
                placeholder="请输入姓名"
                className="mt-2"
              />
            </div>
            <div>
              <Label>初始密码</Label>
              <Input
                type="password"
                value={newUser.password}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
                placeholder="至少 6 位"
                className="mt-2"
              />
            </div>
            <div>
              <Label>角色</Label>
              <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                {roles.map((role) => (
                  <label
                    key={role.id}
                    className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={newUser.role_ids.includes(role.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewUser({
                            ...newUser,
                            role_ids: [...newUser.role_ids, role.id],
                          })
                        } else {
                          setNewUser({
                            ...newUser,
                            role_ids: newUser.role_ids.filter(
                              (id) => id !== role.id
                            ),
                          })
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">{role.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {role.description}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* 部门选择 */}
            <div>
              <Label>部门（可多选）</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                勾选父部门时，所有子部门默认选中
              </p>
              <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-2">
                <DepartmentTreeSelector
                  tree={departmentTree}
                  selectedIds={newUser.department_ids}
                  onChange={(ids) => setNewUser({
                    ...newUser,
                    department_ids: ids,
                    primary_department_id: newUser.primary_department_id || ids[0] || '',
                  })}
                />
              </div>
              {newUser.department_ids.length > 0 && (
                <div className="mt-2 space-y-1">
                  <Label className="text-xs">主部门</Label>
                  <select
                    value={newUser.primary_department_id}
                    onChange={(e) => setNewUser({ ...newUser, primary_department_id: e.target.value })}
                    className="w-full h-8 px-2 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">选择主部门</option>
                    {departments
                      .filter((d) => newUser.department_ids.includes(d.id))
                      .map((dept) => (
                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              取消
            </Button>
            <Button onClick={handleCreateUser} disabled={saving}>
              {saving ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑用户弹窗 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑用户</DialogTitle>
            <DialogDescription>
              修改用户信息、角色和部门
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>显示名称</Label>
              <Input
                value={editForm.display_name}
                onChange={(e) =>
                  setEditForm({ ...editForm, display_name: e.target.value })
                }
                className="mt-2"
              />
            </div>

            {/* 角色选择 */}
            <div>
              <Label>角色</Label>
              <div className="mt-2 space-y-2 max-h-36 overflow-y-auto border border-border rounded-lg p-2">
                {roles.map((role) => (
                  <label
                    key={role.id}
                    className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={editForm.role_ids.includes(role.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEditForm({
                            ...editForm,
                            role_ids: [...editForm.role_ids, role.id],
                          })
                        } else {
                          setEditForm({
                            ...editForm,
                            role_ids: editForm.role_ids.filter(
                              (id) => id !== role.id
                            ),
                          })
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">{role.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 部门选择 */}
            <div>
              <Label>部门（可多选）</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                勾选父部门时，所有子部门默认选中
              </p>
              <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-2">
                <DepartmentTreeSelector
                  tree={departmentTree}
                  selectedIds={editForm.department_ids}
                  onChange={(ids) => setEditForm({
                    ...editForm,
                    department_ids: ids,
                    primary_department_id: editForm.primary_department_id || ids[0] || '',
                  })}
                />
              </div>
              {editForm.department_ids.length > 0 && (
                <div className="mt-2 space-y-1">
                  <Label className="text-xs">主部门</Label>
                  <select
                    value={editForm.primary_department_id}
                    onChange={(e) => setEditForm({ ...editForm, primary_department_id: e.target.value })}
                    className="w-full h-8 px-2 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">选择主部门</option>
                    {departments
                      .filter((d) => editForm.department_ids.includes(d.id))
                      .map((dept) => (
                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false)
                setEditingUser(null)
              }}
            >
              取消
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量导入弹窗 */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>批量导入用户</DialogTitle>
            <DialogDescription>
              CSV 格式: phone, password, display_name, role_code, department_code（第一行为表头）
            </DialogDescription>
          </DialogHeader>
          <div>
            <textarea
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              placeholder={`phone,password,display_name,role_code,department_code
18800000001,password123,张三,editor,DEV
18800000002,password456,李四,member,HR`}
              rows={8}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none font-mono focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImportDialogOpen(false)}
            >
              取消
            </Button>
            <Button onClick={handleImport} disabled={saving}>
              {saving ? '导入中...' : '开始导入'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
