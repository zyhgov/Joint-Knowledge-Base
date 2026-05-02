import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { transferFanService } from '@/services/transferFanService'
import { TransferFanOrder, TRANSFER_FAN_STATUS_LABELS, TRANSFER_FAN_STATUS_COLORS, DepartmentTreeNode } from '@/types/database'
import { useAuthStore } from '@/store/authStore'
import { userService } from '@/services/userService'
import { departmentService } from '@/services/departmentService'
import { UserWithDepartments } from '@/types/database'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'
import {
  PaperAirplaneIcon, ChevronDownIcon, ChevronRightIcon,
  MagnifyingGlassIcon, ArrowPathIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import { SearchableUserSelect, DepartmentTreeSelect } from './components/FilterComponents'

const PAGE_SIZE_OPTIONS = [20, 50, 100]

// ─── 主组件 ──────────────────────────────────────────
export default function AuditManagement() {
  const { user: currentUser } = useAuthStore()
  const isAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'admin'

  // 筛选条件
  const [filterSourceUserId, setFilterSourceUserId] = useState('')
  const [filterCreatedFrom, setFilterCreatedFrom] = useState('')
  const [filterCreatedTo, setFilterCreatedTo] = useState('')
  const [filterUpdatedFrom, setFilterUpdatedFrom] = useState('')
  const [filterUpdatedTo, setFilterUpdatedTo] = useState('')
  const [filterTargetUserId, setFilterTargetUserId] = useState('all')
  const [filterCreatedBy, setFilterCreatedBy] = useState('all')
  const [filterDepartmentId, setFilterDepartmentId] = useState('all')

  // 数据
  const [orders, setOrders] = useState<TransferFanOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [loading, setLoading] = useState(false)
  const [allUsers, setAllUsers] = useState<UserWithDepartments[]>([])
  const [departments, setDepartments] = useState<DepartmentTreeNode[]>([])

  // 展开的源用户ID列表
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

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

  // 加载数据
  useEffect(() => {
    Promise.all([
      loadUsers(),
      loadDepartments(),
    ])
  }, [])

  const loadUsers = async () => {
    try {
      const users = await userService.getAllUsers()
      setAllUsers(users)
    } catch { }
  }

  const loadDepartments = async () => {
    try {
      const depts = await departmentService.getAllDepartments()
      const tree = departmentService.buildDepartmentTree(depts)
      setDepartments(tree)
    } catch { }
  }

  // 根据选中的部门获取用户ID列表
  const departmentUserIds = useMemo(() => {
    if (filterDepartmentId === 'all') return undefined
    return allUsers
      .filter(u =>
        u.primary_department?.id === filterDepartmentId ||
        u.extra_departments?.some(d => d.id === filterDepartmentId)
      )
      .map(u => u.id)
  }, [allUsers, filterDepartmentId])

  // 加载工单列表
  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const result = await transferFanService.list({
        source_user_id: filterSourceUserId || undefined,
        created_from: filterCreatedFrom || undefined,
        created_to: filterCreatedTo || undefined,
        updated_from: filterUpdatedFrom || undefined,
        updated_to: filterUpdatedTo || undefined,
        target_user_id: filterTargetUserId,
        created_by: filterCreatedBy,
        created_by_ids: departmentUserIds,
        page,
        page_size: pageSize,
        current_user_id: currentUser?.id,
        is_admin: true,
      })
      setOrders(result.data as TransferFanOrder[])
      setTotal(result.total)
    } catch (error: any) {
      toast.error('加载审计数据失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }, [filterSourceUserId, filterCreatedFrom, filterCreatedTo, filterUpdatedFrom, filterUpdatedTo, filterTargetUserId, filterCreatedBy, filterDepartmentId, departmentUserIds, page, pageSize, currentUser?.id])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const totalPages = Math.ceil(total / pageSize)

  // 重置筛选
  const handleReset = () => {
    setFilterSourceUserId('')
    setFilterCreatedFrom('')
    setFilterCreatedTo('')
    setFilterUpdatedFrom('')
    setFilterUpdatedTo('')
    setFilterTargetUserId('all')
    setFilterCreatedBy('all')
    setFilterDepartmentId('all')
    setPage(1)
  }

  // 获取用户名称
  const getUserName = (userId: string) => {
    const user = allUsers.find(u => u.id === userId)
    return user?.display_name || user?.phone || userId
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
            <div key={idx} className="truncate max-w-[160px]">{getUserName(id)}</div>
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

  // 权限检查
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
            <PaperAirplaneIcon className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">无权限访问</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            您没有权限查看审计内容，请联系管理员获取相应权限。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 筛选区域 */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <MagnifyingGlassIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">审计搜索</span>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {/* Row 1: 主要筛选条件 */}
          <div>
            <Label className="text-xs">源用户ID</Label>
            <Input
              value={filterSourceUserId}
              onChange={(e) => setFilterSourceUserId(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="输入源用户ID搜索"
              className="mt-1 h-9"
            />
          </div>
          <div>
            <DepartmentTreeSelect
              value={filterDepartmentId}
              onValueChange={(v) => { setFilterDepartmentId(v); setPage(1) }}
              departments={departments}
              flatDepartments={flatDepartments}
              label="部门"
            />
          </div>
          <div>
            <SearchableUserSelect
              value={filterTargetUserId}
              onValueChange={(v) => { setFilterTargetUserId(v); setPage(1) }}
              users={allUsers}
              placeholder="全部目标"
              label="目标用户"
            />
          </div>
          <div>
            <SearchableUserSelect
              value={filterCreatedBy}
              onValueChange={(v) => { setFilterCreatedBy(v); setPage(1) }}
              users={allUsers}
              placeholder="全部创建人"
              label="创建人"
            />
          </div>

          {/* Row 2: 时间范围 + 按钮 */}
          <div>
            <Label className="text-xs">创建时间（起）</Label>
            <Input
              type="date"
              value={filterCreatedFrom}
              onChange={(e) => setFilterCreatedFrom(e.target.value)}
              className="mt-1 h-9"
            />
          </div>
          <div>
            <Label className="text-xs">创建时间（止）</Label>
            <Input
              type="date"
              value={filterCreatedTo}
              onChange={(e) => setFilterCreatedTo(e.target.value)}
              className="mt-1 h-9"
            />
          </div>
          <div>
            <Label className="text-xs">更新时间（起）</Label>
            <Input
              type="date"
              value={filterUpdatedFrom}
              onChange={(e) => setFilterUpdatedFrom(e.target.value)}
              className="mt-1 h-9"
            />
          </div>
          <div>
            <Label className="text-xs">更新时间（止）</Label>
            <Input
              type="date"
              value={filterUpdatedTo}
              onChange={(e) => setFilterUpdatedTo(e.target.value)}
              className="mt-1 h-9"
            />
          </div>

          {/* Row 3: 操作按钮 */}
          <div className="col-span-4 flex items-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="h-9"
            >
              <XMarkIcon className="h-3.5 w-3.5 mr-1" />
              重置
            </Button>
            <Button
              size="sm"
              onClick={() => { setPage(1); loadOrders() }}
              className="h-9"
            >
              <MagnifyingGlassIcon className="h-3.5 w-3.5 mr-1" />
              搜索
            </Button>
            <div className="flex-1" />
            <div className="text-sm text-muted-foreground">
              共 {total} 条记录
            </div>
          </div>
        </div>
      </div>

      {/* 数据表格 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <PaperAirplaneIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">未找到匹配的审计记录</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 表头 */}
          <div className="flex items-center gap-3 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/50 rounded-lg">
            <div className="w-[140px] flex-shrink-0">源用户</div>
            <div className="w-[120px] flex-shrink-0">目标用户</div>
            <div className="w-[100px] flex-shrink-0">创建人</div>
            <div className="w-[100px] flex-shrink-0">处理人</div>
            <div className="w-[70px] flex-shrink-0">状态</div>
            <div className="w-[150px] flex-shrink-0">创建时间</div>
            <div className="w-[150px] flex-shrink-0">更新时间</div>
          </div>

          {/* 数据行 */}
          {orders.map(order => (
            <div key={order.id} className="flex items-start gap-3 px-4 py-3 rounded-lg border bg-card hover:shadow-sm transition-shadow">
              <div className="w-[140px] flex-shrink-0 pt-1">
                <SourceIdsDisplay ids={order.source_user_ids} />
              </div>
              <div className="w-[120px] flex-shrink-0 pt-1">
                <span className="text-sm font-medium">
                  {order.target_user?.display_name || order.target_user?.phone || '未知'}
                </span>
              </div>
              <div className="w-[100px] flex-shrink-0 pt-1">
                <span className="text-sm text-muted-foreground">
                  {order.creator?.display_name || order.creator?.phone || '未知'}
                </span>
              </div>
              <div className="w-[100px] flex-shrink-0 pt-1">
                <span className="text-sm text-muted-foreground">
                  {order.processor?.display_name || order.processor?.phone || (
                    <span className="text-xs text-muted-foreground/50">—</span>
                  )}
                </span>
              </div>
              <div className="w-[70px] flex-shrink-0 pt-1">
                <StatusBadge status={order.status} />
              </div>
              <div className="w-[150px] flex-shrink-0 pt-1">
                <span className="text-xs text-muted-foreground">
                  {new Date(order.created_at).toLocaleString('zh-CN')}
                </span>
              </div>
              <div className="w-[150px] flex-shrink-0 pt-1">
                <span className="text-xs text-muted-foreground">
                  {new Date(order.updated_at).toLocaleString('zh-CN')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分页 */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">每页</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
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
    </div>
  )
}
