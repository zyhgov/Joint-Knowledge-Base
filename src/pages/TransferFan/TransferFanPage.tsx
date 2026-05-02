import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { departmentService } from '@/services/departmentService'
import { userService } from '@/services/userService'
import { transferFanService } from '@/services/transferFanService'
import { DepartmentTreeNode, UserWithDepartments, TransferFanOrder, TRANSFER_FAN_STATUS_LABELS, TRANSFER_FAN_STATUS_COLORS } from '@/types/database'
import { PlusIcon, XMarkIcon, PaperAirplaneIcon, ChevronDownIcon, ChevronRightIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import OrderManagement from './OrderManagement.tsx'
import AuditManagement from './AuditManagement.tsx'
import { SearchableUserSelect, DepartmentTreeSelect } from './components/FilterComponents'

interface TransferTarget {
  userId: string
  userName: string
  departmentName: string
}

interface TransferEntry {
  id: string
  sourceIds: string[]
  target: TransferTarget
  createdAt: Date
}

export default function TransferFanPage() {
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const [sourceInput, setSourceInput] = useState('')
  const [selectedDeptId, setSelectedDeptId] = useState<string | undefined>(undefined)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [departments, setDepartments] = useState<DepartmentTreeNode[]>([])
  const [users, setUsers] = useState<UserWithDepartments[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [transferList, setTransferList] = useState<TransferEntry[]>([])
  const [submittedOrders, setSubmittedOrders] = useState<TransferFanOrder[]>([])
  const [submittedTotal, setSubmittedTotal] = useState(0)
  const [submittedPage, setSubmittedPage] = useState(1)
  const submittedPageSize = 10
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())
  const { user: currentUser } = useAuthStore()
  const isSuperAdmin = currentUser?.role === 'super_admin'
  const isAdmin = isSuperAdmin || currentUser?.role === 'admin'
  const [currentUserDeptIds, setCurrentUserDeptIds] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState('create')

  // 将部门树平铺为扁平列表，用于Select选项显示
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

  // 过滤部门树：只保留当前用户实际配置的部门（去掉祖先层级）
  const filterDeptTreeByUser = useCallback((tree: DepartmentTreeNode[], userDeptIds: string[]): DepartmentTreeNode[] => {
    return tree.reduce((result, node) => {
      const nodeIsUserDept = userDeptIds.includes(node.id)
      const filteredChildren = node.children ? filterDeptTreeByUser(node.children, userDeptIds) : []
      if (nodeIsUserDept) {
        // 用户所属的部门，保留它及其子部门树
        result.push({ ...node, children: filteredChildren })
      } else if (filteredChildren.length > 0) {
        // 该节点不是用户所属部门，但其子部门中有匹配的 — 将子部门提升到当前层级
        result.push(...filteredChildren)
      }
      return result
    }, [] as DepartmentTreeNode[])
  }, [])

  // 只显示当前用户所属的部门树
  const userDepartmentTree = useMemo(() => {
    return filterDeptTreeByUser(departments, currentUserDeptIds)
  }, [departments, currentUserDeptIds, filterDeptTreeByUser])

  // 用户部门树的扁平列表
  const userFlatDepartments = useMemo(() => {
    const result: Array<DepartmentTreeNode & { level: number }> = []
    const flatten = (nodes: DepartmentTreeNode[], level: number) => {
      for (const node of nodes) {
        result.push({ ...node, level })
        if (node.children && node.children.length > 0) {
          flatten(node.children, level + 1)
        }
      }
    }
    flatten(userDepartmentTree, 0)
    return result
  }, [userDepartmentTree])

  // 加载部门和用户数据
  useEffect(() => {
    loadData()
    loadSubmittedOrders()
  }, [])

  // 切换tab时刷新已提交列表
  const [prevTab, setPrevTab] = useState(activeTab)
  useEffect(() => {
    if (activeTab === 'create' && prevTab === 'management') {
      loadSubmittedOrders()
    }
    setPrevTab(activeTab)
  }, [activeTab])

  const loadData = async () => {
    setLoading(true)
    try {
      const [deptsData, usersData] = await Promise.all([
        departmentService.getAllDepartments(),
        userService.getAllUsers(),
      ])
      const deptTree = departmentService.buildDepartmentTree(deptsData)
      setDepartments(deptTree)
      setUsers(usersData)

      if (currentUser) {
        const currentUserInfo = usersData.find((u: UserWithDepartments) => u.id === currentUser.id)
        if (currentUserInfo) {
          const deptIds = [
            currentUserInfo.primary_department?.id,
            ...(currentUserInfo.extra_departments || []).map(d => d.id)
          ].filter((id): id is string => Boolean(id))
          setCurrentUserDeptIds(deptIds)
          if (currentUserInfo.primary_department) {
            setSelectedDeptId(currentUserInfo.primary_department.id)
          }
        }
      }
    } catch (error: any) {
      console.error('加载数据失败:', error)
      toast.error('加载数据失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // 加载已提交工单（从数据库）
  const loadSubmittedOrders = async (page = 1) => {
    try {
      const result = await transferFanService.list({
        page,
        page_size: submittedPageSize,
        current_user_id: currentUser?.id,
        is_admin: isSuperAdmin || currentUser?.role === 'admin',
      })
      setSubmittedOrders(result.data)
      setSubmittedTotal(result.total)
      setSubmittedPage(page)
    } catch {
      // 静默处理
    }
  }

  // 根据选择的部门过滤用户（包含子部门）
  const filteredUsers = useMemo(() => {
    // 全部/未选择 → 只显示当前用户所属部门的用户
    if (!selectedDeptId || selectedDeptId === 'all') {
      return users.filter(u => {
        const userDeptIds = [
          u.primary_department?.id,
          ...u.extra_departments.map(d => d.id)
        ].filter((id): id is string => Boolean(id))
        return userDeptIds.some(id => currentUserDeptIds.includes(id))
      })
    }
    
    const getAllSubDepartmentIds = (tree: DepartmentTreeNode[], deptId: string): string[] => {
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
      findInTree(tree)
      return ids
    }
    
    const deptIds = getAllSubDepartmentIds(departments, selectedDeptId)
    
    return users.filter(u => {
      const userDeptIds = [
        u.primary_department?.id,
        ...u.extra_departments.map(d => d.id)
      ].filter((id): id is string => Boolean(id))
      return userDeptIds.some(id => deptIds.includes(id))
    })
  }, [users, selectedDeptId, departments, currentUserDeptIds])

  // 解析输入的源用户ID（只保留数字）
  const parseSourceIds = (): string[] => {
    const cleaned = sourceInput.replace(/[^\d\n,，]/g, '')
    const ids = cleaned
      .split(/[\n,，]/)
      .map(id => id.trim())
      .filter(id => id.length > 0 && /^\d+$/.test(id))
    return ids
  }

  // 处理输入，只允许数字、换行、逗号
  const handleSourceInputChange = (value: string) => {
    const cleaned = value.replace(/[^\d\n,，]/g, '')
    setSourceInput(cleaned)
  }

  // 添加转粉条目
  const handleAddTransfer = () => {
    const sourceIds = parseSourceIds()
    
    if (sourceIds.length === 0) {
      toast.error('请输入源用户ID')
      return
    }

    if (!selectedUserId) {
      toast.error('请选择目标用户')
      return
    }

    const targetUser = users.find(u => u.id === selectedUserId)
    if (!targetUser) {
      toast.error('目标用户不存在')
      return
    }

    const newEntry: TransferEntry = {
      id: Date.now().toString(),
      sourceIds,
      target: {
        userId: targetUser.id,
        userName: targetUser.display_name || targetUser.phone || '未命名用户',
        departmentName: targetUser.primary_department?.name || '无部门'
      },
      createdAt: new Date()
    }

    setTransferList([...transferList, newEntry])
    setSourceInput('')
    setSelectedUserId('')
    toast.success('已添加到工单列表')
  }

  // 删除转粉条目
  const handleRemoveTransfer = (id: string) => {
    setTransferList(transferList.filter(entry => entry.id !== id))
  }

  // 提交所有工单
  const handleSubmit = async () => {
    if (transferList.length === 0) {
      toast.error('请至少添加一条转粉工单')
      return
    }

    setSubmitting(true)
    try {
      const orders = transferList.map(entry => ({
        source_user_ids: entry.sourceIds,
        target_user_id: entry.target.userId,
        remark: `转粉工单：${entry.sourceIds.length} 个源用户转移给 ${entry.target.userName}`,
        created_by: currentUser?.id || '',
      }))
      
      await transferFanService.create(orders)

      toast.success(`成功提交 ${transferList.length} 条转粉工单`)
      setTransferList([])
      loadSubmittedOrders()
    } catch (error: any) {
      toast.error('提交失败: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  // 获取用户名称（安全处理空值）
  const getUserName = (userId: string): string => {
    const user = users.find(u => u.id === userId)
    return user?.display_name || user?.phone || userId
  }

  // 切换源用户ID展开/收起
  const toggleExpandEntry = (entryId: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev)
      if (next.has(entryId)) {
        next.delete(entryId)
      } else {
        next.add(entryId)
      }
      return next
    })
  }

  // 源用户ID显示组件（支持展开/收起）
  function SourceIdsDisplay({ entry }: { entry: TransferEntry }) {
    const isExpanded = expandedEntries.has(entry.id)
    const ids = entry.sourceIds

    if (ids.length === 1) {
      return <span className="font-medium">{getUserName(ids[0])}</span>
    }

    const displayIds = isExpanded ? ids : ids.slice(0, 3)

    return (
      <div>
        <span className="font-medium">{ids.length} 个用户</span>
        <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
          {displayIds.map((id, idx) => (
            <div key={idx}>{getUserName(id)}</div>
          ))}
          {!isExpanded && ids.length > 3 && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpandEntry(entry.id) }}
              className="text-primary hover:underline inline-flex items-center gap-0.5 mt-1"
            >
              <ChevronRightIcon className="h-3 w-3" />
              展开全部 {ids.length} 个
            </button>
          )}
          {isExpanded && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpandEntry(entry.id) }}
              className="text-primary hover:underline inline-flex items-center gap-0.5 mt-1"
            >
              <ChevronDownIcon className="h-3 w-3" />
              收起
            </button>
          )}
        </div>
      </div>
    )
  }

  // 已提交工单的源用户ID显示
  function SubmittedSourceDisplay({ order }: { order: TransferFanOrder }) {
    const idsKey = order.id
    const isExpanded = expandedEntries.has(idsKey)
    const ids = order.source_user_ids

    if (ids.length === 1) {
      return <span className="font-medium">{getUserName(ids[0])}</span>
    }

    const displayIds = isExpanded ? ids : ids.slice(0, 3)

    return (
      <div>
        <span className="font-medium">{ids.length} 个用户</span>
        <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
          {displayIds.map((id, idx) => (
            <div key={idx}>{getUserName(id)}</div>
          ))}
          {!isExpanded && ids.length > 3 && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpandEntry(idsKey) }}
              className="text-primary hover:underline inline-flex items-center gap-0.5 mt-1"
            >
              <ChevronRightIcon className="h-3 w-3" />
              展开全部 {ids.length} 个
            </button>
          )}
          {isExpanded && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpandEntry(idsKey) }}
              className="text-primary hover:underline inline-flex items-center gap-0.5 mt-1"
            >
              <ChevronDownIcon className="h-3 w-3" />
              收起
            </button>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* 页面标题 + Tab切换 */}
      <div className="border-b border-border bg-card px-6 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">转粉工单管理</h1>
            <p className="text-sm text-muted-foreground mt-1">
              将源用户转移给目标用户管理，支持批量操作
            </p>
          </div>
        </div>
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('create')}
            className={cn(
              'pb-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'create'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <PlusIcon className="h-4 w-4 inline mr-1.5" />
            新建工单
          </button>
          <button
            onClick={() => setActiveTab('management')}
            className={cn(
              'pb-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'management'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <PaperAirplaneIcon className="h-4 w-4 inline mr-1.5" />
            工单管理
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('audit')}
              className={cn(
                'pb-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'audit'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <MagnifyingGlassIcon className="h-4 w-4 inline mr-1.5" />
              转粉工单审计
            </button>
          )}
        </div>
      </div>

      {activeTab === 'create' ? (
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* 左侧：提交工单区域 */}
          <div className="w-full lg:w-1/2 border-r lg:border-r border-b lg:border-b-0 border-border overflow-y-auto p-6 min-h-[550px]">
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <PlusIcon className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">新建工单</h2>
            </div>

            {/* 输入模式切换 */}
            <div className="space-y-4">
              <div>
                <Label>输入模式</Label>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant={mode === 'single' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setMode('single')}
                  >
                    单个输入
                  </Button>
                  <Button
                    variant={mode === 'batch' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setMode('batch')}
                  >
                    批量输入
                  </Button>
                </div>
              </div>

              {/* 源用户ID输入 */}
              <div>
                <Label>
                  源用户ID
                  {mode === 'batch' && (
                    <span className="text-xs text-muted-foreground ml-2">
                      每行一个ID，或使用逗号分隔
                    </span>
                  )}
                </Label>
                {mode === 'single' ? (
                  <Input
                    value={sourceInput}
                    onChange={(e) => handleSourceInputChange(e.target.value)}
                    placeholder="请输入用户ID（纯数字），例如：456789"
                    className="mt-2"
                  />
                ) : (
                  <Textarea
                    value={sourceInput}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleSourceInputChange(e.target.value)}
                    placeholder={"每行一个用户ID（纯数字），例如：\n456789\n456790\n456791"}
                    className="mt-2 min-h-[120px]"
                  />
                )}
              </div>

              {/* 目标用户选择 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <DepartmentTreeSelect
                    value={selectedDeptId || 'all'}
                    onValueChange={(v) => setSelectedDeptId(v === 'all' ? undefined : v)}
                    departments={userDepartmentTree}
                    flatDepartments={userFlatDepartments}
                    label="目标部门"
                  />
                </div>

                <div>
                  <SearchableUserSelect
                    value={selectedUserId}
                    onValueChange={setSelectedUserId}
                    users={filteredUsers}
                    placeholder="选择目标用户"
                    label="目标用户"
                  />
                </div>
              </div>

              {/* 添加按钮 */}
              <Button onClick={handleAddTransfer} className="w-full">
                <PlusIcon className="h-4 w-4 mr-2" />
                添加到工单列表
              </Button>
            </div>

            {/* 待提交工单列表 */}
            {transferList.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">
                    待提交 ({transferList.length})
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTransferList([])}
                  >
                    清空全部
                  </Button>
                </div>

                <div className="space-y-2">
                  {transferList.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">源用户：</span>
                          <SourceIdsDisplay entry={entry} />
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">目标用户：</span>
                          <span className="font-medium text-primary">
                            {entry.target.userName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({entry.target.departmentName})
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveTransfer(entry.id)}
                        className="p-1 hover:bg-accent rounded transition-colors"
                      >
                        <XMarkIcon className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full"
                >
                  <PaperAirplaneIcon className="h-4 w-4 mr-2" />
                  {submitting ? '提交中...' : `提交全部工单 (${transferList.length})`}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：已提交工单列表（从数据库加载） */}
        <div className="w-full lg:w-1/2 overflow-y-auto p-6 bg-muted/30">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <PaperAirplaneIcon className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">已提交工单</h2>
              <span className="text-sm text-muted-foreground">
                ({submittedTotal})
              </span>
            </div>

            {submittedOrders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <PaperAirplaneIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">暂无已提交的工单</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-3">
                  {submittedOrders.map((order) => (
                    <div
                      key={order.id}
                      className="p-4 rounded-lg border bg-card"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {new Date(order.created_at).toLocaleString('zh-CN')}
                          </span>
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full',
                            TRANSFER_FAN_STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-700'
                          )}>
                            {TRANSFER_FAN_STATUS_LABELS[order.status] || order.status}
                          </span>
                        </div>
                        <div className="flex items-start gap-2 text-sm">
                          <span className="text-muted-foreground flex-shrink-0">源用户：</span>
                          <SubmittedSourceDisplay order={order} />
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">目标用户：</span>
                          <span className="font-medium text-primary">
                            {order.target_user?.display_name || order.target_user?.phone || '未知'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 分页控件 */}
                {submittedTotal > submittedPageSize && (
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="text-sm text-muted-foreground">
                      第 {submittedPage} 页，共 {Math.ceil(submittedTotal / submittedPageSize)} 页
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadSubmittedOrders(submittedPage - 1)}
                        disabled={submittedPage === 1}
                      >
                        上一页
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadSubmittedOrders(submittedPage + 1)}
                        disabled={submittedPage >= Math.ceil(submittedTotal / submittedPageSize)}
                      >
                        下一页
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      ) : activeTab === 'audit' ? (
        <div className="flex-1 overflow-y-auto p-6">
          <AuditManagement />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          <OrderManagement />
        </div>
      )}
    </div>
  )
}
