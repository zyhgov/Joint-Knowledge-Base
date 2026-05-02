import React, { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
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
import { departmentService } from '@/services/departmentService'
import { userService } from '@/services/userService'
import { DepartmentTreeNode, UserWithDepartments } from '@/types/database'
import { BuildingOfficeIcon, UserIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'

interface TransferFanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface TransferTarget {
  userId: string
  userName: string
  departmentName: string
}

interface TransferEntry {
  sourceIds: string[]
  target: TransferTarget
}

export default function TransferFanDialog({ open, onOpenChange }: TransferFanDialogProps) {
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const [sourceInput, setSourceInput] = useState('')
  const [selectedDeptId, setSelectedDeptId] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [departments, setDepartments] = useState<DepartmentTreeNode[]>([])
  const [users, setUsers] = useState<UserWithDepartments[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [transferList, setTransferList] = useState<TransferEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  // 加载部门和用户数据
  useEffect(() => {
    if (open) {
      loadData()
    }
  }, [open])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [deptsData, usersData] = await Promise.all([
        departmentService.getAllDepartments(),
        userService.getAllUsers(),
      ])
      // 将平铺的部门列表转换为树形结构
      const deptTree = departmentService.buildDepartmentTree(deptsData)
      setDepartments(deptTree)
      setUsers(usersData)
    } catch (error: any) {
      console.error('加载数据失败:', error)
      setError(error.message || '加载数据失败')
      toast.error('加载数据失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // 根据选择的部门过滤用户
  const filteredUsers = useMemo(() => {
    if (!selectedDeptId) return users
    return users.filter(u => {
      const deptIds = [
        u.primary_department?.id,
        ...u.extra_departments.map(d => d.id)
      ].filter(Boolean)
      return deptIds.includes(selectedDeptId)
    })
  }, [users, selectedDeptId])

  // 解析输入的源用户ID
  const parseSourceIds = (): string[] => {
    const ids = sourceInput
      .split(/[\n,，]/)
      .map(id => id.trim())
      .filter(id => id.length > 0)
    return ids
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
      sourceIds,
      target: {
        userId: targetUser.id,
        userName: targetUser.display_name || targetUser.phone || '未命名用户',
        departmentName: targetUser.primary_department?.name || '无部门'
      }
    }

    setTransferList([...transferList, newEntry])
    setSourceInput('')
    setSelectedUserId('')
    toast.success('已添加转粉工单')
  }

  // 删除转粉条目
  const handleRemoveTransfer = (index: number) => {
    setTransferList(transferList.filter((_, i) => i !== index))
  }

  // 提交所有工单
  const handleSubmit = async () => {
    if (transferList.length === 0) {
      toast.error('请至少添加一条转粉工单')
      return
    }

    setSubmitting(true)
    try {
      // TODO: 实现实际的提交逻辑
      // 这里应该调用后端 API 提交工单
      console.log('提交转粉工单:', transferList)
      
      toast.success(`成功提交 ${transferList.length} 条转粉工单`)
      setTransferList([])
      setSourceInput('')
      setSelectedUserId('')
      setSelectedDeptId('')
      onOpenChange(false)
    } catch (error: any) {
      toast.error('提交失败: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  // 获取用户名称
  const getUserName = (userId: string): string => {
    const user = users.find(u => u.id === userId)
    return user?.display_name || user?.phone || userId
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>提交转粉工单</DialogTitle>
          <DialogDescription>
            将源用户转移给目标用户管理，支持批量操作
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
              <p className="text-sm text-muted-foreground">加载中...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-sm text-red-500 mb-3">{error}</p>
              <Button onClick={loadData} size="sm">重试</Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-6 py-4">
            {/* 输入区域 */}
            <div className="space-y-4">
            {/* 输入模式切换 */}
            <div className="flex gap-2">
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
                  onChange={(e) => setSourceInput(e.target.value)}
                  placeholder="请输入用户ID，例如：456789"
                  className="mt-2"
                />
              ) : (
                <Textarea
                  value={sourceInput}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSourceInput(e.target.value)}
                  placeholder={"每行一个用户ID，例如：\n456789\n456790\n456791"}
                  className="mt-2 min-h-[120px]"
                />
              )}
            </div>

            {/* 目标用户选择 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>目标用户部门</Label>
                <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="选择部门（可选）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">全部部门</SelectItem>
                    {departments.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>
                        <div className="flex items-center gap-2">
                          <BuildingOfficeIcon className="h-4 w-4" />
                          <span>{'　'.repeat(dept.level)}{dept.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>目标用户</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="选择目标用户" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredUsers.map(user => (
                      <SelectItem key={user.id} value={user.id}>
                        <div className="flex items-center gap-2">
                          <UserIcon className="h-4 w-4" />
                          <span>{user.display_name || user.phone || '未命名用户'}</span>
                          {user.primary_department && (
                            <span className="text-xs text-muted-foreground">
                              ({user.primary_department.name})
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 添加按钮 */}
            <Button onClick={handleAddTransfer} className="w-full">
              <PlusIcon className="h-4 w-4 mr-2" />
              添加到工单列表
            </Button>
          </div>

            {/* 工单列表 */}
            {transferList.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">
                    工单列表 ({transferList.length})
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTransferList([])}
                  >
                    清空全部
                  </Button>
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {transferList.map((entry, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">源用户：</span>
                          <span className="font-medium">
                            {entry.sourceIds.length === 1
                              ? getUserName(entry.sourceIds[0])
                              : `${entry.sourceIds.length} 个用户`}
                          </span>
                        </div>
                        {entry.sourceIds.length > 1 && (
                          <div className="text-xs text-muted-foreground pl-2">
                            {entry.sourceIds.slice(0, 3).map(id => getUserName(id)).join('、')}
                            {entry.sourceIds.length > 3 && '...'}
                          </div>
                        )}
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
                        onClick={() => handleRemoveTransfer(index)}
                        className="p-1 hover:bg-accent rounded transition-colors"
                      >
                        <XMarkIcon className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 底部操作按钮 */}
        <div className="flex gap-2 pt-4 border-t flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || transferList.length === 0}
            className="flex-1"
          >
            {submitting ? '提交中...' : `提交工单 (${transferList.length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
