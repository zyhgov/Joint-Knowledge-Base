import React, { useState, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { hasAnyPermission } from '@/utils/permission'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useAuthStore } from '@/store/authStore'
import UserAvatar from '@/components/common/UserAvatar'
import { BuildingOfficeIcon } from '@heroicons/react/24/outline'
import {
  HomeIcon,
  DocumentTextIcon,
  FolderIcon,
  PaperClipIcon,
  UserGroupIcon,
  ShieldCheckIcon,
  Cog6ToothIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  BellIcon,
  ChartBarIcon,
  MegaphoneIcon,
  UserPlusIcon,
  ArrowTrendingUpIcon,
  InformationCircleIcon,
  UsersIcon,
  ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline'

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
}

const menuItems = [
  { name: '仪表板', icon: HomeIcon, path: '/dashboard', perm: null },
  { name: '协作文档', icon: DocumentTextIcon, path: '/documents', perm: ['document_read'] },
  { name: '工作区', icon: FolderIcon, path: '/workspaces', perm: ['workspace_read'] },
  { name: '文件', icon: PaperClipIcon, path: '/files', perm: ['file_read'] },
]

const adminMenuItems = [
  { name: '用户管理', icon: UserGroupIcon, path: '/admin/users', perm: ['user_read', 'user_manage'] },
  { name: '部门管理', icon: BuildingOfficeIcon, path: '/admin/departments', perm: ['department_read', 'department_manage'] },
  { name: '角色权限', icon: ShieldCheckIcon, path: '/admin/roles', perm: ['role_read', 'role_manage'] },
  { name: '通知管理', icon: BellIcon, path: '/admin/notifications', perm: ['notification_read', 'notification_manage'] },
  { name: '公告与任务', icon: MegaphoneIcon, path: '/admin/announcements', perm: ['announcement_read', 'announcement_manage'] },
  { name: '文件统计', icon: ChartBarIcon, path: '/stats', perm: ['stats_read'] },
  { name: '转粉统计', icon: ArrowTrendingUpIcon, path: '/stats/transfer-fan', perm: ['stats_read'] },
  { name: '人力资源管理', icon: UsersIcon, path: '/admin/hr', perm: null },
  { name: '审批管理', icon: ClipboardDocumentCheckIcon, path: '/admin/approval', perm: null },
]

const roleLabels: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  editor: '编辑者',
  member: '成员',
  guest: '访客',
}

function getRoleLabel(role: string | undefined, roleName?: string): string {
  if (!role) return ''
  // 优先使用 RBAC 返回的角色名称
  if (roleName && !['超级管理员', '管理员', '编辑者', '成员', '访客'].includes(roleName)) return roleName
  return roleLabels[role] || roleName || role
}

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, userPermissions } = useAuthStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [aboutOpen, setAboutOpen] = useState(false)


  // 根据权限判断是否显示管理菜单（每个菜单项独立判断）
  const visibleAdminMenuItems = useMemo(() => {
    return adminMenuItems.filter((item) => {
      if (!item.perm) return true
      return hasAnyPermission(user, userPermissions, ...item.perm)
    })
  }, [user, userPermissions])

  // 可见的普通菜单项（根据权限过滤）
  const visibleMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (!item.perm) return true
      return hasAnyPermission(user, userPermissions, ...item.perm)
    })
  }, [user, userPermissions])

  const hasAnyAdminPerm = visibleAdminMenuItems.length > 0

  // 所有菜单项（含设置）
  const allMenuItems = useMemo(() => {
    const items = [...visibleMenuItems]
    if (hasAnyAdminPerm) {
      items.push(...visibleAdminMenuItems)
    }
    items.push({ name: '设置', icon: Cog6ToothIcon, path: '/settings', perm: null })
    return items
  }, [hasAnyAdminPerm, visibleMenuItems, visibleAdminMenuItems])

  // 搜索过滤
  const filteredMenuItems = useMemo(() => {
    if (!searchQuery.trim()) return null // null means show normal layout
    const q = searchQuery.trim().toLowerCase()
    return allMenuItems.filter((item) =>
      item.name.toLowerCase().includes(q)
    )
  }, [searchQuery, allMenuItems])

  return (
    <aside
      className={cn(
        'h-screen bg-[hsl(var(--sidebar-background))] border-r border-[hsl(var(--sidebar-border))] flex flex-col transition-all duration-300 ease-in-out flex-shrink-0 overflow-hidden',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* ===== 用户信息区 ===== */}
      <div
        className={cn(
          'flex items-center border-b border-[hsl(var(--sidebar-border))] transition-all duration-300',
          collapsed ? 'p-3 justify-center' : 'p-4 gap-3'
        )}
      >
        {/* 头像 - 任何情况下都完整显示 */}
        <Link
          to="/settings"
          title={collapsed ? (user?.display_name || '设置') : undefined}
          className="flex-shrink-0"
        >
          <UserAvatar
            avatarUrl={user?.avatar_url}
            displayName={user?.display_name}
            size={collapsed ? 'sm' : 'md'}
            showOnline
          />
        </Link>

        {/* 展开时显示用户信息 */}
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {user?.display_name || '用户'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {getRoleLabel(user?.role, (user as any)?.role_name)}
            </p>
          </div>
        )}
      </div>

      {/* ===== 搜索框 ===== */}
      {!collapsed && (
        <div className="px-3 py-3 border-b border-[hsl(var(--sidebar-border))]">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索功能..."
              className="w-full h-8 pl-8 pr-3 rounded-lg bg-background border border-input text-sm outline-none focus:ring-2 focus:ring-ring/20 transition-all"
            />
          </div>
        </div>
      )}

      {/* ===== 主菜单 ===== */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 space-y-0.5">
        {filteredMenuItems ? (
          // 搜索模式：显示过滤后的菜单
          <>
            {filteredMenuItems.length > 0 ? (
              filteredMenuItems.map((item) => {
                const active = location.pathname === item.path
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSearchQuery('')}
                    className={cn(
                      'flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-foreground/70 hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    <span className="truncate">{item.name}</span>
                  </Link>
                )
              })
            ) : (
              <div className="text-center py-6 text-sm text-muted-foreground">
                未找到匹配的功能
              </div>
            )}
          </>
        ) : (
          // 正常模式
          <>
            {visibleMenuItems.map((item) => {
              const active = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={collapsed ? item.name : undefined}
                  className={cn(
                    'flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-foreground/70 hover:bg-accent hover:text-foreground',
                    collapsed && 'justify-center px-2'
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && <span className="truncate">{item.name}</span>}
                </Link>
              )
            })}

            {/* 转粉工单 */}
            <Link
              to="/transfer-fan"
              title={collapsed ? '转粉工单' : undefined}
              className={cn(
                'flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                location.pathname === '/transfer-fan'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-foreground/70 hover:bg-accent hover:text-foreground',
                collapsed && 'justify-center px-2'
              )}
            >
              <UserPlusIcon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span className="truncate">转粉工单</span>}
            </Link>

            {/* 管理员菜单 */}
            {hasAnyAdminPerm && (
              <>
                <div className={cn('py-2', collapsed && 'px-2')}>
                  {!collapsed ? (
                    <div className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      管理
                    </div>
                  ) : (
                    <div className="h-px bg-border" />
                  )}
                </div>
                {visibleAdminMenuItems.map((item) => {
                  const active = location.pathname === item.path
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      title={collapsed ? item.name : undefined}
                      className={cn(
                        'flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                        active
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-foreground/70 hover:bg-accent hover:text-foreground',
                        collapsed && 'justify-center px-2'
                      )}
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {!collapsed && <span className="truncate">{item.name}</span>}
                    </Link>
                  )
                })}
              </>
            )}
          </>
        )}
      </nav>

      {/* ===== 底部操作 ===== */}
      <div className="px-2 py-2 border-t border-[hsl(var(--sidebar-border))] space-y-0.5">
        <Link
          to="/settings"
          title={collapsed ? '设置' : undefined}
          className={cn(
            'flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
            location.pathname === '/settings'
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground/70 hover:bg-accent hover:text-foreground',
            collapsed && 'justify-center'
          )}
        >
          <Cog6ToothIcon className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>设置</span>}
        </Link>

        <button
          onClick={() => setAboutOpen(true)}
          title={collapsed ? '关于本站' : undefined}
          className={cn(
            'w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-all text-foreground/70 hover:bg-accent hover:text-foreground whitespace-nowrap',
            collapsed && 'justify-center'
          )}
        >
          <InformationCircleIcon className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>关于本站</span>}
        </button>

        <button
          onClick={onToggleCollapse}
          title={collapsed ? '展开' : '折叠'}
          className={cn(
            'w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-all text-foreground/70 hover:bg-accent hover:text-foreground whitespace-nowrap',
            collapsed && 'justify-center'
          )}
        >
          {collapsed ? (
            <ChevronRightIcon className="h-5 w-5 flex-shrink-0" />
          ) : (
            <>
              <ChevronLeftIcon className="h-5 w-5 flex-shrink-0" />
              <span>折叠侧边栏</span>
            </>
          )}
        </button>
      </div>
      {/* 关于本站 */}
      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">关于本站</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p className="text-base font-medium text-foreground">
              基于现代技术栈构建的协作平台
            </p>

            <div className="space-y-2">
              <h4 className="font-semibold text-foreground">技术栈</h4>
              <ul className="list-disc list-inside space-y-1 pl-1">
                <li><span className="text-foreground">前端框架：</span>React + TypeScript</li>
                <li><span className="text-foreground">UI 框架：</span>Radix UI + Tailwind CSS + shadcn/ui</li>
                <li><span className="text-foreground">图表库：</span>ECharts</li>
                <li><span className="text-foreground">数据库：</span>Supabase</li>
                <li><span className="text-foreground">对象存储：</span>Cloudflare R2</li>
                <li><span className="text-foreground">通知与协作：</span>Cloudflare Realtime</li>
                <li><span className="text-foreground">部署：</span>Cloudflare Pages / Workers</li>
                <li><span className="text-foreground">代码仓库：</span>GitHub</li>
              </ul>
            </div>

            <div className="pt-2 border-t border-border">
              <p className="text-foreground">
                本平台由 <strong>杖雍皓</strong> 与 <strong>联合库 unhub</strong> 协同制作，
                通过联合库 unhub 站点管理委员会审核发布。
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </aside>
  )
}