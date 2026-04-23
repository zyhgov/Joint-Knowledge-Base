import React, { useState } from 'react'
import { DepartmentTreeNode } from '@/types/database'
import { ChevronRightIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

/**
 * 部门树级联选择器组件
 * - 勾选父部门自动选中所有子部门
 * - 取消父部门自动取消所有子部门
 * - 支持半选状态（indeterminate）
 */
export default function DepartmentTreeSelector({
  tree,
  selectedIds,
  onChange,
  depth = 0,
}: {
  tree: DepartmentTreeNode[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  depth?: number
}) {
  // 获取某个节点及其所有子孙的 id
  const getAllDescendantIds = (node: DepartmentTreeNode): string[] => {
    const ids = [node.id]
    node.children.forEach((child) => {
      ids.push(...getAllDescendantIds(child))
    })
    return ids
  }

  const handleToggle = (node: DepartmentTreeNode, checked: boolean) => {
    const descendantIds = getAllDescendantIds(node)
    if (checked) {
      const newIds = [...new Set([...selectedIds, ...descendantIds])]
      onChange(newIds)
    } else {
      const newIds = selectedIds.filter((id) => !descendantIds.includes(id))
      onChange(newIds)
    }
  }

  // 判断节点状态: 'all' = 全选, 'partial' = 部分选中, 'none' = 未选
  const getNodeState = (node: DepartmentTreeNode): 'all' | 'partial' | 'none' => {
    const descendantIds = getAllDescendantIds(node)
    const selectedCount = descendantIds.filter((id) => selectedIds.includes(id)).length
    if (selectedCount === 0) return 'none'
    if (selectedCount === descendantIds.length) return 'all'
    return 'partial'
  }

  return (
    <div>
      {tree.map((node) => {
        const state = getNodeState(node)
        const hasChildren = node.children.length > 0
        const [expanded, setExpanded] = useState(depth < 1 || state !== 'none')

        return (
          <div key={node.id}>
            <div
              className={cn(
                'flex items-center gap-1.5 cursor-pointer p-1.5 rounded-md hover:bg-accent transition-colors',
                depth > 0 && 'ml-4'
              )}
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="p-0.5 hover:bg-accent rounded transition-colors"
                >
                  <ChevronRightIcon className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
                </button>
              ) : (
                <span className="w-5" />
              )}
              <input
                type="checkbox"
                checked={state === 'all'}
                ref={(el) => {
                  if (el) el.indeterminate = state === 'partial'
                }}
                onChange={(e) => handleToggle(node, e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">{node.name}</span>
            </div>
            {hasChildren && expanded && (
              <DepartmentTreeSelector
                tree={node.children}
                selectedIds={selectedIds}
                onChange={onChange}
                depth={depth + 1}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
