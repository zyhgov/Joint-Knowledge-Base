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
  const [showDeprecationNotice, setShowDeprecationNotice] = useState(true)

  // 下线倒计时：2026年6月13日 18:00:00
  const DEADLINE = useMemo(() => new Date('2026-06-13T18:00:00+08:00').getTime(), [])
  const [countdown, setCountdown] = useState('')
  const [isExpired, setIsExpired] = useState(false)

  useEffect(() => {
    const calcCountdown = () => {
      const now = Date.now()
      const diff = DEADLINE - now
      if (diff <= 0) {
        setIsExpired(true)
        setCountdown('已下线')
        return
      }
      setIsExpired(false)
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      setCountdown(`${days}天 ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`)
    }
    calcCountdown()
    const timer = setInterval(calcCountdown, 1000)
    return () => clearInterval(timer)
  }, [DEADLINE])

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
    <div className="h-full flex flex-col relative">
      {/* 功能下线黄色警示条（关闭弹窗后显示） */}
      {!showDeprecationNotice && (
        <div className={cn(
          'border-b px-6 py-3',
          isExpired
            ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800'
            : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
        )}>
          <div className={cn(
            'flex items-center justify-between gap-4 text-sm',
            isExpired ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'
          )}>
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                {isExpired ? (
                  <><strong>转粉工单功能已正式下线</strong>，不再接受新工单且不再处理。请阅读<a href="https://docs.qq.com/doc/DSkdoQktEcEFOaE1h" target="_blank" rel="noopener noreferrer" className="underline font-medium hover:opacity-80 mx-0.5">操作文档</a>开始使用若善云系统内置转粉功能。</>
                ) : (
                  <><strong>转粉工单将于 2026年6月13日18:00 下线</strong>，目前仍可正常提交，管理员会进行处理。请尽早阅读<a href="https://docs.qq.com/doc/DSkdoQktEcEFOaE1h" target="_blank" rel="noopener noreferrer" className="underline font-medium hover:opacity-80 mx-0.5">操作文档</a>并开始使用若善云系统内置转粉功能。</>
                )}
              </span>
            </div>
            <div className={cn(
              'flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold tabular-nums',
              isExpired
                ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
            )}>
              {isExpired ? '⛔ 已下线' : `⏳ ${countdown}`}
            </div>
          </div>
        </div>
      )}

      {/* 页面标题 + Tab切换 */}
      <div className="border-b border-border px-6 pt-4">
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
              <Button onClick={handleAddTransfer} className="w-full" disabled={isExpired}>
                <PlusIcon className="h-4 w-4 mr-2" />
                {isExpired ? '功能已下线，无法添加' : '添加到工单列表'}
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
                  disabled={submitting || isExpired}
                  className="w-full"
                >
                  <PaperAirplaneIcon className="h-4 w-4 mr-2" />
                  {isExpired ? '功能已下线，无法提交' : submitting ? '提交中...' : `提交全部工单 (${transferList.length})`}
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
                      className="relative rounded-lg border bg-card overflow-hidden"
                    >
                      {/* 顶部斜纹警示条 */}
                      <div className={cn(
                        'h-1.5 w-full',
                        isExpired
                          ? 'bg-gradient-to-r from-red-400 via-red-500 to-red-400'
                          : 'bg-[repeating-linear-gradient(-45deg,transparent,transparent_4px,transparent_4px,transparent_5px,transparent_5px,transparent_9px)] bg-[length:200%_100%] animate-[stripes_1s_linear_infinite]'
                      )} style={!isExpired ? {
                        background: 'repeating-linear-gradient(-45deg, #f59e0b, #f59e0b 4px, #fbbf24 4px, #fbbf24 8px)',
                        backgroundSize: '200% 100%',
                        animation: 'stripes 1s linear infinite',
                      } : undefined}
                      />
                      {/* 卡片主体 */}
                      <div className="p-4 pl-5 border-l-[3px] border-l-amber-400 dark:border-l-amber-500">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {new Date(order.created_at).toLocaleString('zh-CN')}
                              </span>
                              {/* 即将下线小标签 */}
                              <span className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded font-medium leading-none',
                                isExpired
                                  ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                              )}>
                                {isExpired ? '转粉工单已下线' : '转粉工单即将下线'}
                              </span>
                            </div>
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

      {/* 功能下线蒙版弹窗（仅覆盖内容区域） */}
      {showDeprecationNotice && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#f5f5f7]/90 dark:bg-background/90 backdrop-blur-sm">
          <div className="bg-background rounded-xl shadow-xl border border-border max-w-lg w-[92%] overflow-hidden">
            {/* 顶部警示条 */}
            <div className={cn(
              'px-5 py-3 flex items-center justify-between',
              isExpired
                ? 'bg-gradient-to-r from-red-500 to-red-600'
                : 'bg-gradient-to-r from-amber-500 to-orange-500'
            )}>
              <div className="flex items-center gap-2.5">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-base font-semibold text-white">
                  {isExpired ? '转粉工单功能已正式下线' : '转粉工单功能将在2026年6月13号18:00下线'}
                </h2>
              </div>
            </div>
            {/* 倒计时区域 */}
            <div className={cn(
              'px-5 py-3 flex items-center justify-center gap-2 border-b border-border',
              isExpired ? 'bg-red-50 dark:bg-red-950/30' : 'bg-amber-50 dark:bg-amber-950/30'
            )}>
              <svg xmlns="http://www.w3.org/2000/svg" className={cn('h-4 w-4', isExpired ? 'text-red-500' : 'text-amber-500')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className={cn('text-sm font-medium', isExpired ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')}>
                {isExpired ? '功能已于 2026年6月13日18:00 正式停用' : '距离下线还剩：'}
              </span>
              {!isExpired && (
                <span className="text-base font-bold tabular-nums text-foreground bg-background px-2.5 py-0.5 rounded-md border border-border shadow-sm">
                  {countdown}
                </span>
              )}
            </div>
            {/* 内容区 */}
            <div className="px-5 py-5 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isExpired
                  ? <>转粉工单功能已正式下线，<strong className="text-foreground">不再接受新工单且不再处理</strong>。请阅读下方操作文档，逐步开始使用若善云系统内置的原生转粉功能：</>
                  : <>在 <strong className="text-foreground">2026年6月13日18:00</strong> 之前，您仍可正常提交转粉工单，管理员会照常处理。<strong className="text-foreground">到期后将不再接受新工单且不再处理</strong>。请阅读下方操作文档，逐步开始使用若善云系统内置的原生转粉功能：</>
                }
              </p>
              <a
                href="https://docs.qq.com/doc/DSkdoQktEcEFOaE1h"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors text-sm font-medium"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                【腾讯文档】若善云系统内转粉操作步骤
              </a>
              <div className="bg-muted/50 rounded-lg px-4 py-3 space-y-2 text-sm text-muted-foreground">
                {isExpired ? (
                  <p>
                    您仍可关闭此弹窗查看此前提交的历史工单记录。
                  </p>
                ) : (
                  <p>
                    关闭此弹窗后您可继续正常使用转粉工单功能，管理员会对提交的工单进行处理。
                  </p>
                )}
                <p>
                  如有疑问，请在微信群 <strong className="text-foreground">"IFC银发 领航破局"</strong> 内联系<strong className="text-foreground">胡凌峰</strong>与<strong className="text-foreground">张永豪</strong>。
                </p>
              </div>
            </div>
            {/* 底部操作 */}
            <div className="border-t border-border px-5 py-3 flex justify-end bg-muted/30">
              <button
                onClick={() => setShowDeprecationNotice(false)}
                className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
              >
                我已知晓，关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
