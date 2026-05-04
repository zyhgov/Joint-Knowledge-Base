import React, { useState, useEffect } from 'react'
import { departmentService } from '@/services/departmentService'
import { supabase } from '@/services/supabase'
import { DepartmentTreeNode, JkbDepartment } from '@/types/database'
import { MagnifyingGlassIcon, ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/24/outline'

interface ContactsPanelProps {
  onStartChat: (userId: string) => void
  presenceMap: Record<string, boolean>
}

interface FlattenedUser {
  id: string
  display_name: string | null
  avatar_url: string | null
  phone: string | null
  department_name: string
}

// 用户头像组件（支持真实头像和在线状态）
function ContactAvatar({ user, online }: { user: FlattenedUser; online: boolean }) {
  const initial = (user.display_name || user.phone || '?').charAt(0).toUpperCase()
  return (
    <div className="relative flex-shrink-0">
      <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center font-semibold bg-gradient-to-br from-blue-400 to-purple-500 text-white text-[10px]">
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.display_name || '头像'}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              const parent = target.parentElement!
              parent.innerHTML = `<span class="text-[10px] font-semibold text-white">${initial}</span>`
            }}
          />
        ) : (
          <span>{initial}</span>
        )}
      </div>
      <span
        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${
          online ? 'bg-green-500' : 'bg-gray-400'
        }`}
      />
    </div>
  )
}

// 搜索列表用稍大头像
function SearchContactAvatar({ user, online }: { user: FlattenedUser; online: boolean }) {
  const initial = (user.display_name || user.phone || '?').charAt(0).toUpperCase()
  return (
    <div className="relative flex-shrink-0">
      <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center font-semibold bg-gradient-to-br from-blue-400 to-purple-500 text-white text-xs">
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.display_name || '头像'}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              const parent = target.parentElement!
              parent.innerHTML = `<span class="text-xs font-semibold text-white">${initial}</span>`
            }}
          />
        ) : (
          <span>{initial}</span>
        )}
      </div>
      <span
        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${
          online ? 'bg-green-500' : 'bg-gray-400'
        }`}
      />
    </div>
  )
}

export default function ContactsPanel({ onStartChat, presenceMap }: ContactsPanelProps) {
  const [tree, setTree] = useState<DepartmentTreeNode[]>([])
  const [allUsers, setAllUsers] = useState<FlattenedUser[]>([])
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const departments = await departmentService.getAllDepartments()
      const treeData = departmentService.buildDepartmentTree(departments)
      setTree(treeData)

      // 默认展开第一层
      const defaultExpanded = new Set<string>()
      treeData.forEach(n => defaultExpanded.add(n.id))
      setExpandedDepts(defaultExpanded)

      // 获取所有用户及其部门信息
      const { data: users } = await supabase
        .from('jkb_users')
        .select('id, display_name, avatar_url, phone')
        .eq('is_active', true)
        .order('display_name')

      // 获取用户-部门关系
      const { data: userDepts } = await supabase
        .from('jkb_user_departments')
        .select('user_id, is_primary, department:jkb_departments(id, name)')
        .eq('is_primary', true)

      // 构建用户列表
      const deptMap = new Map<string, string>()
      userDepts?.forEach((ud: any) => {
        if (ud.department) {
          deptMap.set(ud.user_id, ud.department.name || '')
        }
      })

      const flattened: FlattenedUser[] = (users || []).map((u: any) => ({
        id: u.id,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        phone: u.phone,
        department_name: deptMap.get(u.id) || '',
      }))

      // 按部门名称排序
      flattened.sort((a, b) => a.department_name.localeCompare(b.department_name))

      setAllUsers(flattened)
    } catch (err) {
      console.error('加载通讯录失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleDept = (deptId: string) => {
    const next = new Set(expandedDepts)
    if (next.has(deptId)) {
      next.delete(deptId)
    } else {
      next.add(deptId)
    }
    setExpandedDepts(next)
  }

  // 获取某部门下的所有 userId（含子部门）
  const collectDeptUserIds = (departments: DepartmentTreeNode[]): string[] => {
    // 简化处理：从 allUsers 中按部门名筛选
    return []
  }

  // 搜索过滤
  const filteredUsers = searchQuery.trim()
    ? allUsers.filter(u =>
        u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.phone?.includes(searchQuery)
      )
    : []

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="animate-spin h-5 w-5 border-b-2 border-primary rounded-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 搜索框 */}
      <div className="px-3 py-2 border-b border-border/50">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索用户..."
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-background border border-input text-sm outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {searchQuery.trim() ? (
          /* 搜索结果 */
          <div className="px-3 py-1 space-y-0.5">
            {filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                未找到用户
              </div>
            ) : (
              filteredUsers.map(u => (
                <button
                  key={u.id}
                  onClick={() => onStartChat(u.id)}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent transition-colors text-left"
                >
                  <SearchContactAvatar user={u} online={!!presenceMap[u.id]} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {u.display_name || u.phone}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {u.department_name || u.phone}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          /* 部门树 */
          tree.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground px-4">
              暂无部门数据
            </div>
          ) : (
            tree.map(node => (
              <DepartmentNode
                key={node.id}
                node={node}
                expandedDepts={expandedDepts}
                onToggle={toggleDept}
                onStartChat={onStartChat}
                presenceMap={presenceMap}
                allUsers={allUsers}
              />
            ))
          )
        )}
      </div>
    </div>
  )
}

interface DepartmentNodeProps {
  node: DepartmentTreeNode
  expandedDepts: Set<string>
  onToggle: (id: string) => void
  onStartChat: (userId: string) => void
  presenceMap: Record<string, boolean>
  allUsers: FlattenedUser[]
}

function DepartmentNode({
  node,
  expandedDepts,
  onToggle,
  onStartChat,
  presenceMap,
  allUsers,
}: DepartmentNodeProps) {
  const isExpanded = expandedDepts.has(node.id)
  const hasChildren = node.children && node.children.length > 0

  // 获取该部门下的用户
  const deptUsers = allUsers.filter(u => u.department_name === node.name)

  return (
    <div>
      <button
        onClick={() => onToggle(node.id)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent/50 transition-colors rounded-none"
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDownIcon className="h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <ChevronRightIcon className="h-3.5 w-3.5 flex-shrink-0" />
          )
        ) : (
          <div className="w-3.5 flex-shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
        <span className="ml-auto text-[10px] text-muted-foreground/60">
          {deptUsers.length}
        </span>
      </button>

      {isExpanded && (
        <div className="pb-1">
          {/* 部门用户 */}
          {deptUsers.map(u => (
            <button
              key={u.id}
              onClick={() => onStartChat(u.id)}
              className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-accent/50 transition-colors text-left"
            >
              <ContactAvatar user={u} online={!!presenceMap[u.id]} />
              <div className="text-xs font-medium truncate text-foreground/80">
                {u.display_name || u.phone}
              </div>
            </button>
          ))}

          {/* 子部门 */}
          {hasChildren && node.children.map(child => (
            <DepartmentNode
              key={child.id}
              node={child}
              expandedDepts={expandedDepts}
              onToggle={onToggle}
              onStartChat={onStartChat}
              presenceMap={presenceMap}
              allUsers={allUsers}
            />
          ))}
        </div>
      )}
    </div>
  )
}
