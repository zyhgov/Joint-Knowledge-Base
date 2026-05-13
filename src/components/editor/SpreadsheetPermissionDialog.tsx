import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { userService } from '@/services/userService'
import { departmentService } from '@/services/departmentService'
import { toast } from 'react-hot-toast'
import { Search, X, Shield, Users, Building2, ChevronRight, FileDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserWithDepartments, DepartmentTreeNode } from '@/types/database'

interface SpreadsheetPermissionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  univerAPI: any
}

/** 获取某个部门节点的所有后代部门 ID（包含自身） */
function getDepartmentAndDescendantIds(node: DepartmentTreeNode): string[] {
  const ids = [node.id]
  for (const child of node.children) {
    ids.push(...getDepartmentAndDescendantIds(child))
  }
  return ids
}

export default function SpreadsheetPermissionDialog({
  open,
  onOpenChange,
  univerAPI,
}: SpreadsheetPermissionDialogProps) {
  // 所有用户列表
  const [allUsers, setAllUsers] = useState<UserWithDepartments[]>([])
  // 部门树
  const [departmentTree, setDepartmentTree] = useState<DepartmentTreeNode[]>([])
  // 当前选中的部门节点 ID（null = 全部）
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)
  // 搜索关键词
  const [searchQuery, setSearchQuery] = useState('')
  // 已选择的用户 ID 列表
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  // 加载状态
  const [loading, setLoading] = useState(false)
  // 展开的部门节点 ID
  const [expandedDeptIds, setExpandedDeptIds] = useState<Set<string>>(new Set())

  /** 加载所有用户和部门 */
  useEffect(() => {
    if (!open) return
    setLoading(true)
    Promise.all([
      userService.getAllUsers(),
      departmentService.getAllDepartments(),
    ]).then(([users, depts]) => {
      setAllUsers(users.filter(u => u.is_active))
      const tree = departmentService.buildDepartmentTree(depts)
      setDepartmentTree(tree || [])
      // 默认展开第一层
      if (tree?.length) {
        setExpandedDeptIds(new Set(tree.map(n => n.id)))
      }
    }).catch(e => {
      console.error('加载用户/部门数据失败:', e)
      toast.error('加载用户数据失败')
    }).finally(() => setLoading(false))
  }, [open])

  /** 获取当前选中部门（含子部门）的所有用户 */
  const filteredUsers = useMemo(() => {
    let users = allUsers

    // 按部门过滤
    if (selectedDeptId) {
      // 获取选中部门及其所有后代的 ID
      const findNode = (nodes: DepartmentTreeNode[], targetId: string): DepartmentTreeNode | null => {
        for (const n of nodes) {
          if (n.id === targetId) return n
          const found = findNode(n.children, targetId)
          if (found) return found
        }
        return null
      }
      const node = findNode(departmentTree, selectedDeptId)
      const deptIds = node ? getDepartmentAndDescendantIds(node) : [selectedDeptId]

      users = users.filter(u => {
        const userDeptIds: string[] = []
        if (u.primary_department?.id) userDeptIds.push(u.primary_department.id)
        if (u.extra_departments?.length) userDeptIds.push(...u.extra_departments.map(d => d.id))
        return userDeptIds.some(id => deptIds.includes(id))
      })
    }

    // 按搜索过滤
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      users = users.filter(u =>
        (u.display_name?.toLowerCase().includes(q) ?? false) ||
        u.phone.includes(q)
      )
    }

    return users
  }, [allUsers, selectedDeptId, searchQuery, departmentTree])

  /** 获取用户所属部门名称（用于展示） */
  const getUserDeptName = useCallback((user: UserWithDepartments): string => {
    return user.primary_department?.name || (user.extra_departments?.[0]?.name) || ''
  }, [])

  /** 切换选中用户 */
  const toggleUser = useCallback((userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }, [])

  /** 移除已选用户 */
  const removeUser = useCallback((userId: string) => {
    setSelectedUserIds(prev => prev.filter(id => id !== userId))
  }, [])

  /** 已选用户的详细信息 */
  const selectedUsers = useMemo(() => {
    return allUsers.filter(u => selectedUserIds.includes(u.id))
  }, [allUsers, selectedUserIds])

  /** 递归渲染部门树节点 */
  const renderDeptNode = (nodes: DepartmentTreeNode[], depth: number = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedDeptIds.has(node.id)
      const isSelected = selectedDeptId === node.id
      const hasChildren = node.children.length > 0

      return (
        <div key={node.id}>
          <button
            className={cn(
              'w-full flex items-center gap-1 px-2 py-1.5 text-sm rounded-md transition-colors text-left',
              isSelected
                ? 'bg-primary/10 text-primary font-medium'
                : 'hover:bg-accent text-foreground'
            )}
            onClick={() => {
              setSelectedDeptId(isSelected ? null : node.id)
              if (hasChildren) {
                setExpandedDeptIds(prev => {
                  const next = new Set(prev)
                  if (next.has(node.id)) next.delete(node.id)
                  else next.add(node.id)
                  return next
                })
              }
            }}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
          >
            {hasChildren ? (
              <ChevronRight className={cn('h-3.5 w-3.5 flex-shrink-0 transition-transform', isExpanded && 'rotate-90')} />
            ) : (
              <span className="w-3.5 flex-shrink-0" />
            )}
            <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            <span className="truncate">{node.name}</span>
          </button>
          {hasChildren && isExpanded && renderDeptNode(node.children, depth + 1)}
        </div>
      )
    })
  }

  /** 保存权限设置 */
  const handleSave = useCallback(async () => {
    if (!univerAPI) {
      toast.error('表格编辑器未就绪')
      return
    }
    if (selectedUserIds.length === 0) {
      toast.error('请至少选择一个用户')
      return
    }

    try {
      setLoading(true)
      const fWorkbook = univerAPI.getActiveWorkbook()
      if (!fWorkbook) {
        toast.error('无法获取工作簿')
        return
      }
      const fWorksheet = fWorkbook.getActiveSheet()
      if (!fWorksheet) {
        toast.error('无法获取当前工作表')
        return
      }

      const permission = fWorksheet.getWorksheetPermission()
      if (!permission) {
        toast.error('无法获取权限接口')
        return
      }

      // 应用工作表保护，使用系统用户 ID 作为 allowedUsers
      await permission.protect({
        allowedUsers: selectedUserIds,
        name: '系统权限保护',
      })

      toast.success(`已为 ${selectedUserIds.length} 个用户设置工作表编辑权限`)
      onOpenChange(false)
    } catch (e: any) {
      console.error('设置权限失败:', e)
      toast.error('设置权限失败: ' + (e.message || ''))
    } finally {
      setLoading(false)
    }
  }, [univerAPI, selectedUserIds, onOpenChange])

  /** 打开弹窗时重置状态 */
  useEffect(() => {
    if (open) {
      setSelectedDeptId(null)
      setSearchQuery('')
      setSelectedUserIds([])
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            权限管理 - 编辑人员设置
          </DialogTitle>
          <DialogDescription>
            选择系统中的用户作为当前工作表的编辑权限人员
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
          {/* 左侧：部门树 */}
          <div className="w-56 flex-shrink-0 border-r border-border pr-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2 px-2">
              <Building2 className="h-3 w-3" />
              部门筛选
            </div>
            <ScrollArea className="h-[300px]">
              <button
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors text-left mb-0.5',
                  selectedDeptId === null
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-accent text-foreground'
                )}
                onClick={() => setSelectedDeptId(null)}
              >
                <Users className="h-3.5 w-3.5" />
                <span>全部用户</span>
              </button>
              {renderDeptNode(departmentTree)}
            </ScrollArea>
          </div>

          {/* 右侧：用户列表 */}
          <div className="flex-1 min-w-0">
            {/* 搜索框 */}
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="搜索用户姓名或手机号..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>

            {/* 用户列表 */}
            <ScrollArea className="h-[300px]">
              <div className="space-y-0.5">
                {filteredUsers.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    {loading ? '加载中...' : '没有符合条件的用户'}
                  </div>
                ) : (
                  filteredUsers.map(user => {
                    const isSelected = selectedUserIds.includes(user.id)
                    return (
                      <label
                        key={user.id}
                        className={cn(
                          'flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors',
                          isSelected ? 'bg-primary/5' : 'hover:bg-accent'
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleUser(user.id)}
                        />
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white text-[10px] font-semibold flex-shrink-0">
                          {user.display_name?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-foreground truncate">
                            {user.display_name || '未命名'}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {getUserDeptName(user) || user.phone}
                          </div>
                        </div>
                      </label>
                    )
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* 已选择人员标签 */}
        {selectedUsers.length > 0 && (
          <div className="border-t border-border pt-3">
            <div className="flex items-center gap-1.5 mb-1.5 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              已选择 {selectedUsers.length} 人
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selectedUsers.map(user => (
                <Badge key={user.id} variant="secondary" className="gap-1 px-2 py-0.5 text-xs">
                  <span className="max-w-[80px] truncate">{user.display_name || '未命名'}</span>
                  <button
                    type="button"
                    onClick={() => removeUser(user.id)}
                    className="hover:text-destructive transition-colors flex-shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={loading || selectedUserIds.length === 0}>
            {loading ? '设置中...' : '保存权限设置'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
