import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { transferFanService } from '@/services/transferFanService'
import { TransferFanOrder, TRANSFER_FAN_STATUS_LABELS, TRANSFER_FAN_STATUS_COLORS } from '@/types/database'
import { useAuthStore } from '@/store/authStore'
import { userService } from '@/services/userService'
import { departmentService } from '@/services/departmentService'
import { roleService } from '@/services/roleService'
import { UserWithDepartments, DepartmentTreeNode } from '@/types/database'
import { Role } from '@/types/rbac'
import { SearchableUserSelect, DepartmentTreeSelect } from './components/FilterComponents'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'
import {
  FunnelIcon, PaperAirplaneIcon, ClipboardDocumentListIcon,
  XMarkIcon, ChevronDownIcon, ChevronRightIcon, CheckIcon,
  TrashIcon, NoSymbolIcon, ClockIcon, PencilSquareIcon,
  ArrowPathIcon, BoltIcon,
} from '@heroicons/react/24/outline'

interface GeneratedTransfer {
  target_user_id: string
  target_user_name: string
  target_department: string
  source_user_ids: string[]
}

const PAGE_SIZE_OPTIONS = [20, 50, 100]

export default function OrderManagement() {
  const { user: currentUser } = useAuthStore()
  const isAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'admin'

  // 筛选条件
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterTargetUserId, setFilterTargetUserId] = useState('all')
  const [filterCreatedBy, setFilterCreatedBy] = useState('all')
  const [filterRole, setFilterRole] = useState('all')

  // 数据
  const [orders, setOrders] = useState<TransferFanOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [loading, setLoading] = useState(false)
  const [allUsers, setAllUsers] = useState<UserWithDepartments[]>([])
  const [roles, setRoles] = useState<Role[]>([])

  // 驳回弹窗
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  // 部门筛选
  const [departments, setDepartments] = useState<DepartmentTreeNode[]>([])
  const [filterDepartmentId, setFilterDepartmentId] = useState('all')

  // 选择
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [generatedData, setGeneratedData] = useState<GeneratedTransfer[]>([])
  const [showGeneratedDialog, setShowGeneratedDialog] = useState(false)

  // 展开的ID列表
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // 编辑工单
  const [editingOrder, setEditingOrder] = useState<TransferFanOrder | null>(null)
  const [editSourceIds, setEditSourceIds] = useState('')
  const [editTargetUserId, setEditTargetUserId] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editResubmit, setEditResubmit] = useState(false)

  // 部门树平铺
  const flatDepartments = useMemo(() => {
    const result: Array<DepartmentTreeNode & { level: number }> = []
    const flatten = (nodes: DepartmentTreeNode[], level: number) => {
      for (const node of nodes) {
        result.push({ ...node, level })
        if (node.children && node.children.length > 0) {
          flatten(node.children, level + 1)
        }
      }
    }
    flatten(departments, 0)
    return result
  }, [departments])

  // 获取部门及其所有子部门的ID列表
  const getAllSubDepartmentIds = useCallback((deptId: string): string[] => {
    const ids: string[] = []
    const findInTree = (nodes: DepartmentTreeNode[]) => {
      for (const node of nodes) {
        if (node.id === deptId) {
          const collectIds = (n: DepartmentTreeNode) => {
            ids.push(n.id)
            if (n.children && n.children.length > 0) {
              n.children.forEach(collectIds)
            }
          }
          collectIds(node)
          return true
        }
        if (node.children && node.children.length > 0) {
          if (findInTree(node.children)) return true
        }
      }
      return false
    }
    findInTree(departments)
    return ids
  }, [departments])

  // 根据选中的部门获取用户ID列表（包含子部门）
  const departmentUserIds = useMemo(() => {
    if (filterDepartmentId === 'all') return undefined
    const deptIds = getAllSubDepartmentIds(filterDepartmentId)
    return allUsers
      .filter(u => {
        const userDeptIds = [
          u.primary_department?.id,
          ...(u.extra_departments || []).map(d => d.id)
        ].filter((id): id is string => Boolean(id))
        return userDeptIds.some(id => deptIds.includes(id))
      })
      .map(u => u.id)
  }, [allUsers, filterDepartmentId, getAllSubDepartmentIds])

  // 根据选中的角色获取用户ID列表
  const roleUserIds = useMemo(() => {
    if (filterRole === 'all') return undefined
    return allUsers
      .filter(u => u.roles?.some(r => r.id === filterRole))
      .map(u => u.id)
  }, [allUsers, filterRole])

  // 根据选中部门过滤的用户列表（用于联动筛选下拉框）
  const filteredByDeptUsers = useMemo(() => {
    if (filterDepartmentId === 'all') return allUsers
    const deptIds = getAllSubDepartmentIds(filterDepartmentId)
    return allUsers.filter(u => {
      const userDeptIds = [
        u.primary_department?.id,
        ...(u.extra_departments || []).map(d => d.id)
      ].filter((id): id is string => Boolean(id))
      return userDeptIds.some(id => deptIds.includes(id))
    })
  }, [allUsers, filterDepartmentId, getAllSubDepartmentIds])

  // 根据选中部门过滤的角色列表（用于联动筛选下拉框）
  const filteredByDeptRoles = useMemo(() => {
    if (filterDepartmentId === 'all') return roles
    const roleIdsInDept = new Set(
      filteredByDeptUsers.flatMap(u => (u.roles || []).map(r => r.id))
    )
    return roles.filter(r => roleIdsInDept.has(r.id))
  }, [roles, filteredByDeptUsers, filterDepartmentId])

  // 合并部门和角色筛选（取交集）
  const filterUserIds = useMemo(() => {
    const sets: (string[] | undefined)[] = []
    if (departmentUserIds) sets.push(departmentUserIds)
    if (roleUserIds) sets.push(roleUserIds)
    if (sets.length === 0) return undefined
    // 取交集
    const combined = sets.reduce((acc, curr) =>
      acc!.filter(id => curr!.includes(id))
    )!
    return combined.length > 0 ? combined : ['__none__']
  }, [departmentUserIds, roleUserIds])

  // 加载用户列表和角色列表
  useEffect(() => {
    loadUsers()
    loadDepartments()
    loadRoles()
  }, [])

  const loadUsers = async () => {
    try {
      const users = await userService.getAllUsers()
      setAllUsers(users)
    } catch { }
  }

  const loadRoles = async () => {
    try {
      const rolesData = await roleService.getAllRoles()
      setRoles(rolesData)
    } catch { }
  }

  const loadDepartments = async () => {
    try {
      const depts = await departmentService.getAllDepartments()
      const tree = departmentService.buildDepartmentTree(depts)
      setDepartments(tree)
    } catch { }
  }

  // 加载工单列表
  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const result = await transferFanService.list({
        status: filterStatus,
        target_user_id: filterTargetUserId,
        created_by: filterCreatedBy,
        created_by_ids: filterUserIds,
        page,
        page_size: pageSize,
        current_user_id: currentUser?.id,
        is_admin: isAdmin,
      })
      setOrders(result.data as TransferFanOrder[])
      setTotal(result.total)
    } catch (error: any) {
      toast.error('加载工单失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }, [filterStatus, filterTargetUserId, filterCreatedBy, filterRole, filterDepartmentId, filterUserIds, page, pageSize, currentUser?.id, isAdmin])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const totalPages = Math.ceil(total / pageSize)

  // 重置到第一页
  const handleFilterChange = (setter: any, value: any) => {
    setter(value)
    setPage(1)
    setSelectedIds(new Set())
  }

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedIds.size === orders.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(orders.map(o => o.id)))
    }
  }

  // 切换选择
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 批量更新状态
  const handleBatchUpdate = async (status: string, reject_reason?: string) => {
    if (selectedIds.size === 0) {
      toast.error('请先选择工单')
      return
    }

    try {
      await transferFanService.updateStatus(
        Array.from(selectedIds),
        status,
        currentUser?.id,
        reject_reason
      )
      toast.success(`已${TRANSFER_FAN_STATUS_LABELS[status]} ${selectedIds.size} 条工单`)
      setSelectedIds(new Set())
      loadOrders()
    } catch (error: any) {
      toast.error('操作失败: ' + error.message)
    }
  }

  // 复制到剪贴板（带 fallback）
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('已复制到剪贴板')
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      textarea.style.pointerEvents = 'none'
      document.body.appendChild(textarea)
      try {
        textarea.select()
        document.execCommand('copy')
        toast.success('已复制到剪贴板')
      } catch {
        toast.error('复制失败，请手动复制')
      }
      document.body.removeChild(textarea)
    }
  }

  // 生成转粉数据（按目标用户分组）
  const handleGenerateTransferData = () => {
    if (selectedIds.size === 0) {
      toast.error('请先选择工单')
      return
    }

    const selectedOrders = orders.filter(o => selectedIds.has(o.id))
    const groupMap = new Map<string, GeneratedTransfer>()

    for (const order of selectedOrders) {
      const targetId = order.target_user_id
      const targetName = order.target_user?.display_name || order.target_user?.phone || targetId
      const targetUserInfo = allUsers.find(u => u.id === targetId)
      const targetDeptName = targetUserInfo?.primary_department?.name || ''

      if (!groupMap.has(targetId)) {
        groupMap.set(targetId, {
          target_user_id: targetId,
          target_user_name: targetName,
          target_department: targetDeptName,
          source_user_ids: [],
        })
      }
      groupMap.get(targetId)!.source_user_ids.push(...order.source_user_ids)
    }

    for (const [, value] of groupMap) {
      value.source_user_ids = [...new Set(value.source_user_ids)]
    }

    setGeneratedData(Array.from(groupMap.values()))
    setShowGeneratedDialog(true)
  }

  // 复制全部转粉数据
  const copyTransferData = () => {
    if (generatedData.length === 0) return

    const text = generatedData.map(item => {
      const ids = item.source_user_ids.join('\n')
      const lines = [ids]
      lines.push(`目标用户: ${item.target_user_name}`)
      if (item.target_department) {
        lines.push(`目标部门: ${item.target_department}`)
      }
      return lines.join('\n')
    }).join('\n\n')

    copyToClipboard(text)
  }

  // 复制单个目标用户及其源用户ID
  const copySingleEntry = (item: GeneratedTransfer) => {
    const ids = item.source_user_ids.join('\n')
    const lines = [ids]
    lines.push(`目标用户: ${item.target_user_name}`)
    if (item.target_department) {
      lines.push(`目标部门: ${item.target_department}`)
    }
    copyToClipboard(lines.join('\n'))
  }

  // 取消单条工单（普通用户）
  const handleCancelSingle = async (order: TransferFanOrder) => {
    if (!confirm('确定取消此工单？')) return
    try {
      await transferFanService.cancel([order.id], currentUser?.id || '')
      toast.success('工单已取消')
      loadOrders()
    } catch (error: any) {
      toast.error('取消失败: ' + error.message)
    }
  }

  // 重新提交已取消的工单
  const handleResubmitSingle = async (order: TransferFanOrder) => {
    if (!confirm('确定重新提交此工单？')) return
    try {
      await transferFanService.resubmit([order.id])
      toast.success('工单已重新提交')
      loadOrders()
    } catch (error: any) {
      toast.error('重新提交失败: ' + error.message)
    }
  }

  // 打开编辑弹窗
  const handleOpenEdit = (order: TransferFanOrder) => {
    setEditingOrder(order)
    setEditSourceIds(order.source_user_ids.join('\n'))
    setEditTargetUserId(order.target_user_id)
    setEditResubmit(false)
  }

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingOrder) return

    const newSourceIds = editSourceIds
      .split('\n')
      .map(id => id.trim())
      .filter(id => id.length > 0 && /^\d+$/.test(id))

    if (newSourceIds.length === 0) {
      toast.error('至少需要一个有效源用户ID')
      return
    }

    if (!editTargetUserId) {
      toast.error('请选择目标用户')
      return
    }

    setSavingEdit(true)
    try {
      await transferFanService.update(editingOrder.id, {
        source_user_ids: newSourceIds,
        target_user_id: editTargetUserId,
      })

      // 如果勾选了重新提交，变更状态为已提交
      if (editResubmit) {
        await transferFanService.resubmit([editingOrder.id])
      }

      toast.success('工单已更新')
      setEditingOrder(null)
      loadOrders()
    } catch (error: any) {
      toast.error('更新失败: ' + error.message)
    } finally {
      setSavingEdit(false)
    }
  }

  // 页面大小变更
  const handlePageSizeChange = (newSize: string) => {
    setPageSize(Number(newSize))
    setPage(1)
    setSelectedIds(new Set())
  }

  // 获取用户名称
  const getUserName = (userId: string) => {
    const user = allUsers.find(u => u.id === userId)
    return user?.display_name || user?.phone || userId
  }

  // 获取创建人角色名称
  const getCreatorRole = (userId: string) => {
    const user = allUsers.find(u => u.id === userId)
    if (!user || !user.roles || user.roles.length === 0) return '—'
    return user.roles.map(r => r.name).join(', ')
  }

  // 获取用户列表（用于编辑）
  const getEditTargetUsers = () => {
    if (!editingOrder) return []
    // 找这个工单的创建人的部门，过滤同部门用户
    const creatorUser = allUsers.find(u => u.id === editingOrder.created_by)
    if (!creatorUser) return allUsers
    const userDeptIds = [
      creatorUser.primary_department?.id,
      ...creatorUser.extra_departments.map(d => d.id)
    ].filter((id): id is string => Boolean(id))
    if (userDeptIds.length === 0) return allUsers
    return allUsers.filter(u => {
      const deptIds = [u.primary_department?.id, ...u.extra_departments.map(d => d.id)].filter((id): id is string => Boolean(id))
      return deptIds.some(d => userDeptIds.includes(d))
    })
  }

  // 源用户显示组件
  function SourceIdsDisplay({ ids }: { ids: string[] }) {
    const uniqueKey = ids.join(',')
    const isExpanded = expandedIds.has(uniqueKey)
    const displayIds = isExpanded ? ids : ids.slice(0, 3)

    return (
      <div>
        <span className="font-medium">{ids.length} 个</span>
        <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
          {displayIds.map((id, idx) => (
            <div key={idx} className="truncate max-w-[200px] lg:max-w-none">{getUserName(id)}</div>
          ))}
          {ids.length > 3 && (
            <button
              onClick={() => {
                const key = ids.join(',')
                setExpandedIds(prev => {
                  const next = new Set(prev)
                  if (next.has(key)) next.delete(key)
                  else next.add(key)
                  return next
                })
              }}
              className="text-primary hover:underline inline-flex items-center gap-0.5 mt-0.5"
            >
              {isExpanded ? (
                <><ChevronDownIcon className="h-3 w-3" />收起</>
              ) : (
                <><ChevronRightIcon className="h-3 w-3" />展开全部 {ids.length} 个</>
              )}
            </button>
          )}
        </div>
      </div>
    )
  }

  // 状态标签
  function StatusBadge({ status }: { status: string }) {
    const color = TRANSFER_FAN_STATUS_COLORS[status] || 'text-gray-600 bg-gray-50'
    return (
      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', color)}>
        {TRANSFER_FAN_STATUS_LABELS[status] || status}
      </span>
    )
  }

  // 判断是否可以修改（非管理员+属主+未处理/已取消）
  const canModifyOrder = (order: TransferFanOrder) => {
    return !isAdmin && order.created_by === currentUser?.id && (order.status === 'submitted' || order.status === 'cancelled')
  }

  return (
    <div className="space-y-6">
      {/* 筛选区域 */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <FunnelIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">筛选条件</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <Label className="text-xs">工单状态</Label>
            <Select
              value={filterStatus}
              onValueChange={(v) => handleFilterChange(setFilterStatus, v)}
            >
              <SelectTrigger className="mt-1 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {Object.entries(TRANSFER_FAN_STATUS_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        
          <div>
            <DepartmentTreeSelect
              value={filterDepartmentId}
              onValueChange={(v) => handleFilterChange(setFilterDepartmentId, v)}
              departments={departments}
              flatDepartments={flatDepartments}
              label="部门"
            />
          </div>

          <div>
            <Label className="text-xs">创建人角色</Label>
            <Select
              value={filterRole}
              onValueChange={(v) => handleFilterChange(setFilterRole, v)}
            >
              <SelectTrigger className="mt-1 h-9">
                <SelectValue placeholder="全部角色" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部角色</SelectItem>
                {filteredByDeptRoles.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        
          <div>
            <SearchableUserSelect
              value={filterTargetUserId}
              onValueChange={(v) => handleFilterChange(setFilterTargetUserId, v)}
              users={filteredByDeptUsers}
              placeholder="全部目标"
              label="目标用户"
            />
          </div>
        
          <div>
            <SearchableUserSelect
              value={filterCreatedBy}
              onValueChange={(v) => handleFilterChange(setFilterCreatedBy, v)}
              users={filteredByDeptUsers}
              placeholder="全部创建人"
              label="创建人"
            />
          </div>
        
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-full"
              onClick={() => {
                setFilterStatus('all')
                setFilterTargetUserId('all')
                setFilterCreatedBy('all')
                setFilterDepartmentId('all')
                setFilterRole('all')
                setPage(1)
                setSelectedIds(new Set())
              }}
            >
              重置
            </Button>
          </div>
        </div>
      </div>

      {/* 操作栏 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {/* 刷新按钮 */}
          <Button size="sm" variant="outline" onClick={loadOrders} title="刷新工单列表">
            <ArrowPathIcon className="h-3.5 w-3.5 mr-1" />刷新
          </Button>

          {/* 加急按钮 */}
          <Button
            size="sm"
            className="bg-orange-600 hover:bg-orange-700 text-white border-0"
            onClick={() => {
              toast.success(
                '🚀 已提交紧急转粉申请！\n\n管理员已收到您的加急请求，\n将优先处理您的转粉工单，\n请耐心等待处理结果。',
                { duration: 5000 }
              )
            }}
          >
            <BoltIcon className="h-3.5 w-3.5 mr-1" />转粉加急
          </Button>

          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground self-center">
                已选 {selectedIds.size} 条
              </span>
              {isAdmin && (
                <>
                  <Button size="sm" variant="outline" onClick={() => handleBatchUpdate('pending')}>
                    <ClockIcon className="h-3.5 w-3.5 mr-1" />标记待处理
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleBatchUpdate('processed')}>
                    <CheckIcon className="h-3.5 w-3.5 mr-1" />标记已处理
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowRejectDialog(true)}>
                    <NoSymbolIcon className="h-3.5 w-3.5 mr-1" />驳回
                  </Button>
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => {
                    if (confirm('确认删除选中的工单？')) {
                      transferFanService.delete(Array.from(selectedIds)).then(() => {
                        toast.success('已删除')
                        setSelectedIds(new Set())
                        loadOrders()
                      }).catch(e => toast.error('删除失败: ' + e.message))
                    }
                  }}>
                    <TrashIcon className="h-3.5 w-3.5 mr-1" />删除
                  </Button>
                </>
              )}
              <Button size="sm" variant="default" onClick={handleGenerateTransferData}>
                <ClipboardDocumentListIcon className="h-3.5 w-3.5 mr-1" />生成转粉数据
              </Button>
            </>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          共 {total} 条
        </div>
      </div>

      {/* 工单列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <PaperAirplaneIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">暂无工单</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 表头 */}
          <div className="hidden lg:flex items-center gap-3 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/50 rounded-lg">
            <div className="w-8 flex-shrink-0">
              <input
                type="checkbox"
                checked={orders.length > 0 && selectedIds.size === orders.length}
                onChange={handleSelectAll}
                className="rounded"
              />
            </div>
            <div className="w-[160px] flex-shrink-0">目标用户</div>
            <div className="w-[120px] flex-shrink-0">创建人</div>
            <div className="w-[80px] flex-shrink-0">角色</div>
            <div className="w-[90px] flex-shrink-0">状态</div>
            <div className="w-[160px] flex-shrink-0">创建时间</div>
            <div className="flex-1 min-w-0">源用户</div>
            <div className="w-[130px] flex-shrink-0">操作</div>
          </div>

          {/* 数据行 */}
          {orders.map(order => (
            <div key={order.id} className="px-4 py-3 rounded-lg border bg-card hover:shadow-sm transition-shadow">
              {/* Desktop: 横向表格布局 */}
              <div className="hidden lg:flex items-start gap-3">
                <div className="w-8 pt-1 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(order.id)}
                    onChange={() => toggleSelect(order.id)}
                    className="rounded"
                  />
                </div>
                <div className="w-[160px] flex-shrink-0 pt-1">
                  <span className="text-sm font-medium">
                    {order.target_user?.display_name || order.target_user?.phone || '未知'}
                  </span>
                </div>
                <div className="w-[120px] flex-shrink-0 pt-1">
                  <span className="text-sm text-muted-foreground">
                    {order.creator?.display_name || order.creator?.phone || '未知'}
                  </span>
                </div>
                <div className="w-[80px] flex-shrink-0 pt-1">
                  <span className="text-xs text-muted-foreground">
                    {getCreatorRole(order.created_by)}
                  </span>
                </div>
                <div className="w-[90px] flex-shrink-0 pt-1">
                  <StatusBadge status={order.status} />
                  {order.status === 'rejected' && order.reject_reason && (
                    <div className="mt-1 group relative">
                      <span className="text-xs text-red-500 cursor-help underline decoration-dotted">
                        查看原因
                      </span>
                      <div className="absolute left-0 top-full mt-1 z-50 w-56 p-2 rounded-lg bg-popover border border-border shadow-lg text-xs text-foreground hidden group-hover:block whitespace-pre-wrap">
                        <span className="font-medium text-red-500">驳回理由：</span>
                        {order.reject_reason}
                      </div>
                    </div>
                  )}
                </div>
                <div className="w-[160px] flex-shrink-0 pt-1">
                  <span className="text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleString('zh-CN')}
                  </span>
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <SourceIdsDisplay ids={order.source_user_ids} />
                </div>
                <div className="w-[150px] flex-shrink-0 pt-1 flex gap-1 flex-wrap">
                  {canModifyOrder(order) && (
                    <>
                      <button
                        onClick={() => handleOpenEdit(order)}
                        className="text-primary hover:text-primary/80 text-xs flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-primary/5"
                        title="修改工单"
                      >
                        <PencilSquareIcon className="h-3.5 w-3.5" />
                        修改
                      </button>
                      {order.status === 'cancelled' ? (
                        <button
                          onClick={() => handleResubmitSingle(order)}
                          className="text-emerald-600 hover:text-emerald-700 text-xs flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-emerald-50"
                          title="重新提交工单"
                        >
                          <PaperAirplaneIcon className="h-3.5 w-3.5" />
                          重新提交
                        </button>
                      ) : (
                        <button
                          onClick={() => handleCancelSingle(order)}
                          className="text-amber-600 hover:text-amber-700 text-xs flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-amber-50"
                          title="取消工单"
                        >
                          <XMarkIcon className="h-3.5 w-3.5" />
                          取消
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 移动端/平板：卡片布局 */}
              <div className="lg:hidden">
                <div className="flex items-start gap-2">
                  <div className="pt-0.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(order.id)}
                      onChange={() => toggleSelect(order.id)}
                      className="rounded"
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">
                        {order.target_user?.display_name || order.target_user?.phone || '未知'}
                      </span>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>创建人: {order.creator?.display_name || order.creator?.phone || '未知'}</span>
                      {getCreatorRole(order.created_by) !== '—' && (
                        <><span>·</span><span>{getCreatorRole(order.created_by)}</span></>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleString('zh-CN')}
                    </div>
                    <div className="text-xs">
                      <SourceIdsDisplay ids={order.source_user_ids} />
                    </div>
                    {order.status === 'rejected' && order.reject_reason && (
                      <div className="group relative">
                        <span className="text-xs text-red-500 cursor-help underline decoration-dotted">查看原因</span>
                        <div className="absolute left-0 top-full mt-1 z-50 w-56 p-2 rounded-lg bg-popover border border-border shadow-lg text-xs text-foreground hidden group-hover:block whitespace-pre-wrap">
                          <span className="font-medium text-red-500">驳回理由：</span>
                          {order.reject_reason}
                        </div>
                      </div>
                    )}
                    {canModifyOrder(order) && (
                      <div className="flex gap-2 pt-0.5">
                        <button
                          onClick={() => handleOpenEdit(order)}
                          className="text-primary hover:text-primary/80 text-xs flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-primary/5"
                        >
                          <PencilSquareIcon className="h-3.5 w-3.5" />
                          修改
                        </button>
                        {order.status === 'cancelled' ? (
                          <button
                            onClick={() => handleResubmitSingle(order)}
                            className="text-emerald-600 hover:text-emerald-700 text-xs flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-emerald-50"
                          >
                            <PaperAirplaneIcon className="h-3.5 w-3.5" />
                            重新提交
                          </button>
                        ) : (
                          <button
                            onClick={() => handleCancelSingle(order)}
                            className="text-amber-600 hover:text-amber-700 text-xs flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-amber-50"
                          >
                            <XMarkIcon className="h-3.5 w-3.5" />
                            取消
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分页 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">每页</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="h-8 w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map(size => (
                  <SelectItem key={size} value={String(size)}>{size}条</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-sm text-muted-foreground">
            共 {total} 条，第 {page}/{totalPages || 1} 页
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            上一页
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            下一页
          </Button>
        </div>
      </div>

      {/* 转粉数据弹窗 */}
      {showGeneratedDialog && generatedData.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowGeneratedDialog(false)}>
          <div
            className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <ClipboardDocumentListIcon className="h-6 w-6 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold">转粉数据汇总</h3>
                  <p className="text-sm text-muted-foreground">
                    {generatedData.length} 个目标用户 · 点击卡片即可复制
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowGeneratedDialog(false)}
                className="p-1.5 hover:bg-accent rounded-lg transition-colors"
              >
                <XMarkIcon className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {/* 弹窗内容 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {generatedData.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => copySingleEntry(item)}
                  className="p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group"
                >
                  {/* 上部：源用户ID，每行一个 */}
                  <div className="mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">源用户 ID</span>
                    <div className="mt-2 bg-muted/50 rounded-lg p-3 space-y-1 max-h-[200px] overflow-y-auto">
                      {item.source_user_ids.map((id) => (
                        <div key={id} className="text-sm font-mono text-foreground hover:text-primary transition-colors">
                          {getUserName(id)}
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1.5 text-right">
                      共 {item.source_user_ids.length} 个
                    </div>
                  </div>

                  {/* 下部：目标用户信息 */}
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">目标用户：</span>
                      <span className="text-sm font-semibold text-foreground">{item.target_user_name}</span>
                    </div>
                    {item.target_department && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {item.target_department}
                      </span>
                    )}
                  </div>

                  {/* 复制提示 */}
                  <div className="flex justify-end mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs text-primary flex items-center gap-1">
                      <ClipboardDocumentListIcon className="h-3 w-3" />
                      点击复制
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* 弹窗底部 */}
            <div className="flex items-center justify-between p-6 border-t border-border">
              <span className="text-sm text-muted-foreground">
                点击任意卡片即可复制对应数据
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowGeneratedDialog(false)}>
                  关闭
                </Button>
                <Button size="sm" onClick={copyTransferData}>
                  <ClipboardDocumentListIcon className="h-4 w-4 mr-1.5" />
                  复制全部
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 驳回弹窗 */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <NoSymbolIcon className="h-5 w-5 text-destructive" />
              驳回工单
            </DialogTitle>
            <DialogDescription>
              请输入驳回理由，创建人将会看到此理由。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="rejectReason">驳回理由</Label>
            <Textarea
              id="rejectReason"
              value={rejectReason}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRejectReason(e.target.value)}
              placeholder="请输入驳回理由..."
              className="mt-2 min-h-[120px]"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false)
                setRejectReason('')
              }}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!rejectReason.trim()) {
                  toast.error('请输入驳回理由')
                  return
                }
                handleBatchUpdate('rejected', rejectReason.trim())
                setShowRejectDialog(false)
                setRejectReason('')
              }}
            >
              确认驳回 ({selectedIds.size} 条)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑工单弹窗 */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingOrder(null)}>
          <div
            className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-lg m-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <PencilSquareIcon className="h-6 w-6 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold">修改工单</h3>
                  <p className="text-sm text-muted-foreground">
                    修改源用户ID和目标用户信息
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingOrder(null)}
                className="p-1.5 hover:bg-accent rounded-lg transition-colors"
              >
                <XMarkIcon className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {/* 内容 */}
            <div className="p-6 space-y-4">
              <div>
                <Label>源用户ID（每行一个）</Label>
                <Textarea
                  value={editSourceIds}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                    const cleaned = e.target.value.replace(/[^\d\n]/g, '')
                    setEditSourceIds(cleaned)
                  }}
                  placeholder="每行一个用户ID（纯数字）"
                  className="mt-2 min-h-[150px]"
                />
              </div>
              <div>
                <Label>目标用户</Label>
                <Select value={editTargetUserId} onValueChange={setEditTargetUserId}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="选择目标用户" />
                  </SelectTrigger>
                  <SelectContent>
                    {getEditTargetUsers().map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.display_name || u.phone || u.id}
                        {u.primary_department && (
                          <span className="text-xs text-muted-foreground ml-2">
                            ({u.primary_department.name})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {editingOrder?.status === 'cancelled' && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <input
                    type="checkbox"
                    id="editResubmit"
                    checked={editResubmit}
                    onChange={(e) => setEditResubmit(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="editResubmit" className="text-sm text-amber-800 dark:text-amber-200 cursor-pointer">
                    修改后重新提交（状态变更为已提交）
                  </label>
                </div>
              )}
            </div>

            {/* 底部 */}
            <div className="flex items-center justify-end gap-2 p-6 border-t border-border">
              <Button variant="outline" onClick={() => setEditingOrder(null)}>
                取消
              </Button>
              <Button onClick={handleSaveEdit} disabled={savingEdit}>
                {savingEdit ? '保存中...' : '保存修改'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
