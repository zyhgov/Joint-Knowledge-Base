import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { DepartmentTreeNode, UserWithDepartments } from '@/types/database'
import {
  ChevronDownIcon, ChevronRightIcon, BuildingOfficeIcon, CheckIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'

// ─── 可搜索用户下拉组件 ──────────────────────────────
export function SearchableUserSelect({
  value,
  onValueChange,
  users,
  placeholder,
  label,
}: {
  value: string
  onValueChange: (v: string) => void
  users: UserWithDepartments[]
  placeholder: string
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)

  // 选中用户名称
  const selectedName = value === 'all'
    ? placeholder
    : users.find(u => u.id === value)?.display_name
      || users.find(u => u.id === value)?.phone
      || '未知'

  // 根据搜索词过滤
  const filtered = useMemo(() => {
    if (!search.trim()) return users
    const q = search.toLowerCase()
    return users.filter(u =>
      (u.display_name && u.display_name.toLowerCase().includes(q)) ||
      (u.phone && u.phone.includes(q)) ||
      u.id.toLowerCase().includes(q)
    )
  }, [users, search])

  // 点击外部关闭
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={wrapperRef} className="relative">
      <Label className="text-xs">{label}</Label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'mt-1 h-9 w-full flex items-center justify-between px-3 rounded-md border text-sm',
          'bg-background hover:bg-accent transition-colors',
          value === 'all' ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        <span className="truncate">{selectedName}</span>
        <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 ml-1" />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`搜索${label}...`}
                className="w-full h-8 pl-8 pr-3 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onValueChange('all'); setOpen(false); setSearch('') }}
              className={cn(
                'w-full px-3 py-2 text-sm text-left hover:bg-accent flex items-center gap-2',
                value === 'all' && 'bg-accent/50 text-primary font-medium'
              )}
            >
              <span>全部{label}</span>
              {value === 'all' && <CheckIcon className="h-3.5 w-3.5 ml-auto text-primary" />}
            </button>
            {filtered.map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => { onValueChange(u.id); setOpen(false); setSearch('') }}
                className={cn(
                  'w-full px-3 py-2 text-sm text-left hover:bg-accent flex items-center gap-2',
                  value === u.id && 'bg-accent/50 text-primary font-medium'
                )}
              >
                <div className="flex-1 min-w-0">
                  <span className="truncate block">{u.display_name || u.phone || '未知'}</span>
                  {u.primary_department && (
                    <span className="text-xs text-muted-foreground truncate block">
                      {u.primary_department.name}
                    </span>
                  )}
                </div>
                {value === u.id && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0 text-primary" />}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                未找到匹配用户
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 部门树选择组件 ──────────────────────────────────
export function DepartmentTreeSelect({
  value,
  onValueChange,
  departments,
  flatDepartments,
  label,
}: {
  value: string
  onValueChange: (v: string) => void
  departments: DepartmentTreeNode[]
  flatDepartments: Array<DepartmentTreeNode & { level: number }>
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set())
  const wrapperRef = useRef<HTMLDivElement>(null)

  // 选中部门名称
  const selectedName = value === 'all'
    ? `全部${label}`
    : flatDepartments.find(d => d.id === value)?.name || '未知'

  // 点击外部关闭
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // 展开/折叠
  const toggleExpand = (deptId: string) => {
    setExpandedDepts(prev => {
      const next = new Set(prev)
      if (next.has(deptId)) next.delete(deptId)
      else next.add(deptId)
      return next
    })
  }

  // 渲染部门树节点
  function renderTree(nodes: DepartmentTreeNode[], depth: number = 0) {
    return nodes.map(node => {
      const hasChildren = node.children && node.children.length > 0
      const isExpanded = expandedDepts.has(node.id)

      return (
        <div key={node.id}>
          <button
            type="button"
            className={cn(
              'w-full flex items-center gap-1 px-3 py-2 text-sm text-left hover:bg-accent transition-colors',
              value === node.id && 'bg-accent/50 text-primary font-medium'
            )}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() => {
              onValueChange(node.id)
              setOpen(false)
            }}
          >
            {hasChildren ? (
              <span
                onClick={(e) => { e.stopPropagation(); toggleExpand(node.id) }}
                className="flex-shrink-0 cursor-pointer p-0.5 hover:bg-muted rounded"
              >
                {isExpanded
                  ? <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  : <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
                }
              </span>
            ) : (
              <span className="w-4 flex-shrink-0" />
            )}
            <BuildingOfficeIcon className={cn(
              'h-3.5 w-3.5 flex-shrink-0',
              value === node.id ? 'text-primary' : 'text-muted-foreground'
            )} />
            <span className="truncate">{node.name}</span>
            {value === node.id && <CheckIcon className="h-3.5 w-3.5 ml-auto text-primary flex-shrink-0" />}
          </button>
          {hasChildren && isExpanded && renderTree(node.children, depth + 1)}
        </div>
      )
    })
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Label className="text-xs">{label}</Label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'mt-1 h-9 w-full flex items-center justify-between px-3 rounded-md border text-sm',
          'bg-background hover:bg-accent transition-colors',
          value === 'all' ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        <span className="truncate">{selectedName}</span>
        <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 ml-1" />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
          <button
            type="button"
            onClick={() => { onValueChange('all'); setOpen(false) }}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors',
              value === 'all' && 'bg-accent/50 text-primary font-medium'
            )}
          >
            <span className="w-4 flex-shrink-0" />
            <BuildingOfficeIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span>全部{label}</span>
            {value === 'all' && <CheckIcon className="h-3.5 w-3.5 ml-auto text-primary flex-shrink-0" />}
          </button>
          {renderTree(departments)}
        </div>
      )}
    </div>
  )
}
