import React, { useState, useMemo, useEffect } from 'react'
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
import { useNotificationStore } from '@/store/notificationStore'
import UserAvatar from '@/components/common/UserAvatar'
import InstallPrompt from '@/components/common/InstallPrompt'
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
  ChatBubbleLeftRightIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { ChevronDown, ChevronUp, GitCommit } from "lucide-react";
interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
}

const DOUBAO_AVATAR = '/doubao/doubao_avatar.png'
const RUOSHAN_LOGO = '/ruoshan/ruoshan.png'

// 豆包图片图标
function DoubaoIcon({ className }: { className?: string }) {
  return <img src={DOUBAO_AVATAR} alt="豆包" className={`${className} rounded-full object-cover`} />
}

// 若善云系统图标
function RuoshanIcon({ className }: { className?: string }) {
  return <img src={RUOSHAN_LOGO} alt="若善云" className={`${className} object-cover`} />
}

const menuItems = [
  { name: '仪表板', icon: HomeIcon, path: '/dashboard', perm: null },
  { name: '协作文档', icon: DocumentTextIcon, path: '/documents', perm: ['document_read'] },
  { name: '工作区', icon: FolderIcon, path: '/workspaces', perm: ['workspace_read'] },
  { name: '文件', icon: PaperClipIcon, path: '/files', perm: ['file_read'] },
  { name: '和豆包聊聊', icon: DoubaoIcon, path: '/ai-chat', perm: ['ai_chat_read'] },
  { name: '若善云系统', icon: RuoshanIcon, path: '/ruoshan', perm: null },
  { name: '即时通讯', icon: ChatBubbleLeftRightIcon, path: '/chat', perm: null },
]

const adminMenuItems = [
  { name: '用户管理', icon: UserGroupIcon, path: '/admin/users', perm: ['user_read', 'user_manage'] },
  { name: '部门管理', icon: BuildingOfficeIcon, path: '/admin/departments', perm: ['department_read', 'department_manage'] },
  { name: '角色权限', icon: ShieldCheckIcon, path: '/admin/roles', perm: ['role_read', 'role_manage'] },
  { name: '通知管理', icon: BellIcon, path: '/admin/notifications', perm: ['notification_read', 'notification_manage'] },
  { name: '公告与任务', icon: MegaphoneIcon, path: '/admin/announcements', perm: ['announcement_read', 'announcement_manage'] },
  { name: '文件统计', icon: ChartBarIcon, path: '/stats', perm: ['stats_read'] },
  { name: '转粉统计', icon: ArrowTrendingUpIcon, path: '/stats/transfer-fan', perm: ['stats_read'] },
  { name: '人力资源管理', icon: UsersIcon, path: '/admin/hr', perm: ['hr_read', 'hr_manage'] },
  { name: '审批管理', icon: ClipboardDocumentCheckIcon, path: '/admin/approval', perm: ['approval_read', 'approval_manage'] },
  { name: 'AI 对话管理', icon: ChatBubbleLeftRightIcon, path: '/admin/ai-chat', perm: ['ai_chat_manage'] },
  { name: '聊天记录管理', icon: ChatBubbleLeftRightIcon, path: '/admin/chat', perm: ['chat_manage'] },
]

const roleLabels: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  editor: '编辑者',
  member: '成员',
  guest: '访客',
}

const changelogData = [
  {
    version: "v1.2.0",
    date: "2026-05-03",
    changes: [
      "✨ 新增工单管理系统，支持快速创建和紧急转粉",
      "✨ 接入火山引擎的豆包大模型用作 AI 聊天与站点功能对话说明",
      "🎨 优化 UI 设计，采用 shadcn/ui 组件库提升用户体验",
      "🚀 集成 Cloudflare Realtime 实现实时协作功能",
      "🐛 修复已知问题，提升系统稳定性"
    ]
  },
  {
    version: "v1.1.2",
    date: "2026-04-20",
    changes: [
      "🔐 新增数据可视化图表功能，支持折线图、柱状图等多种图表类型",
      "📊 优化数据库查询性能，响应速度提升 80%",
      "🐛 修复已知问题，提升系统稳定性"
    ]
  },
  {
    version: "v1.1.0",
    date: "2026-04-10",
    changes: [
      "🔐 接入 Supabase 认证系统，增强账户安全性",
      "📊 优化数据库查询性能，响应速度提升 40%",
      "🌐 支持多样式界面切换"
    ]
  },
  {
    version: "v1.0.0",
    date: "2026-04-01",
    changes: [
      "项目正式立项并提交联合库 UNHub 站点管理委员会审核",
      "🔧 完成基础架构搭建"
    ]
  }
];


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
  const [showChangelog, setShowChangelog] = useState(false)


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

  const { chatUnreadCount, subscribeChatRealtime } = useNotificationStore()

  // 全局订阅聊天消息（用于侧边栏未读徽标）
  useEffect(() => {
    if (!user?.id) return
    const unsub = subscribeChatRealtime(user.id)
    return unsub
  }, [user?.id, subscribeChatRealtime])

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
                        ? 'bg-[#dddde0] dark:bg-[#2a2a2e] text-foreground shadow-sm'
                        : 'text-foreground/70 hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0 text-[#007aff]" />
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
                      ? 'bg-[#dddde0] dark:bg-[#2a2a2e] text-foreground shadow-sm'
                      : 'text-foreground/70 hover:bg-accent hover:text-foreground',
                    collapsed && 'justify-center px-2 relative'
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0 text-[#007aff]" />
                  {!collapsed && <span className="truncate">{item.name}</span>}
                  {/* 即时通讯未读徽标 */}
                  {item.path === '/chat' && chatUnreadCount > 0 && (
                    <span className={cn(
                      'bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0',
                      collapsed ? 'absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1' : 'ml-auto min-w-[18px] h-[18px] px-1'
                    )}>
                      {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                    </span>
                  )}
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
                  ? 'bg-[#dddde0] dark:bg-[#2a2a2e] text-foreground shadow-sm'
                  : 'text-foreground/70 hover:bg-accent hover:text-foreground',
                collapsed && 'justify-center px-2'
              )}
            >
              <UserPlusIcon className="h-5 w-5 flex-shrink-0 text-[#007aff]" />
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
                          ? 'bg-[#dddde0] dark:bg-[#2a2a2e] text-foreground shadow-sm'
                          : 'text-foreground/70 hover:bg-accent hover:text-foreground',
                        collapsed && 'justify-center px-2'
                      )}
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0 text-[#007aff]" />
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
              ? 'bg-[#dddde0] dark:bg-[#2a2a2e] text-foreground'
              : 'text-foreground/70 hover:bg-accent hover:text-foreground',
            collapsed && 'justify-center'
          )}
        >
          <Cog6ToothIcon className="h-5 w-5 flex-shrink-0 text-[#007aff]" />
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
          <InformationCircleIcon className="h-5 w-5 flex-shrink-0 text-[#007aff]" />
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
            <ChevronRightIcon className="h-5 w-5 flex-shrink-0 text-[#007aff]" />
          ) : (
            <>
              <ChevronLeftIcon className="h-5 w-5 flex-shrink-0 text-[#007aff]" />
              <span>折叠侧边栏</span>
            </>
          )}
        </button>

        {!collapsed && <InstallPrompt />}
      </div>

{/* 关于本站 */}
<Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
  <DialogContent className="max-w-md rounded-2xl max-h-[80vh] overflow-y-auto">
    <DialogHeader>
      <div className="flex items-center justify-between">
        <DialogTitle className="text-xl font-semibold">关于联合知识库JKB</DialogTitle>
        <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
          当前版本 v1.2.0
        </span>
      </div>
    </DialogHeader>
    
    <div className="space-y-5 text-sm text-muted-foreground">
      {/* 平台简介 */}
      <div className="space-y-1.5">
        <p className="text-base font-medium text-foreground leading-relaxed">
          <strong>联合知识库JKB</strong> 是一款专注于高效协作与数据可视化的现代 Web 应用，采用云原生架构设计，致力于为用户提供稳定、安全、流畅的协同体验。
        </p>
      </div>

      {/* 技术架构 */}
      <div className="space-y-2">
        <h4 className="font-semibold text-foreground">技术架构</h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <span className="text-muted-foreground">前端框架</span>
          <span className="text-foreground font-medium">React 18 + TypeScript</span>
          
          <span className="text-muted-foreground">UI 设计系统</span>
          <span className="text-foreground font-medium">Radix UI + Tailwind CSS + shadcn/ui</span>
          
          <span className="text-muted-foreground">数据可视化</span>
          <span className="text-foreground font-medium">Apache ECharts</span>
          
          <span className="text-muted-foreground">数据库与认证</span>
          <span className="text-foreground font-medium">Supabase</span>
          
          <span className="text-muted-foreground">对象存储</span>
          <span className="text-foreground font-medium">Cloudflare R2</span>
          
          <span className="text-muted-foreground">实时通信</span>
          <span className="text-foreground font-medium">Cloudflare Realtime</span>
          
          <span className="text-muted-foreground">部署与工程化</span>
          <span className="text-foreground font-medium">Cloudflare Pages / Workers</span>
          
          <span className="text-muted-foreground">代码管理</span>
          <span className="text-foreground font-medium">GitHub</span>

          <span className="text-muted-foreground">配色参考</span>
          <span className="text-foreground font-medium">Apple</span>

          <span className="text-muted-foreground">字体设计</span>
          <span className="text-foreground font-medium">OpenAI font</span>

          <span className="text-muted-foreground">位置数据</span>
          <span className="text-foreground font-medium">ipinfo.io</span>

          <span className="text-muted-foreground">天气数据</span>
          <span className="text-foreground font-medium">高德地图</span>

          <span className="text-muted-foreground">AI 支持</span>
          <span className="text-foreground font-medium">Claude Opus 4.5、ChatGPT、Gemini、Qwen、DeepSeek、GLM-5.1等</span>
        </div>
      </div>

      {/* 更新日志折叠面板 */}
      <div className="space-y-2">
        <button
          onClick={() => setShowChangelog(!showChangelog)}
          className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-accent/50 transition-colors group"
        >
          <div className="flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            <span className="font-semibold text-foreground">版本更新日志</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {changelogData.length} 个版本
            </span>
            {showChangelog ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {/* 折叠内容 */}
        {showChangelog && (
          <div className="space-y-3 pl-2 border-l-2 border-border animate-in slide-in-from-top-2 duration-200">
            {changelogData.map((release, index) => (
              <div key={release.version} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-primary">
                    {release.version}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {release.date}
                  </span>
                  {index === 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                      最新
                    </span>
                  )}
                </div>
                <ul className="space-y-1 pl-1">
                  {release.changes.map((change, i) => (
                    <li key={i} className="text-xs text-muted-foreground leading-relaxed pl-1.5">
                      {change}
                    </li>
                  ))}
                </ul>
                {index < changelogData.length - 1 && (
                  <div className="pt-2 border-b border-border/50" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 出品与合规 */}
      <div className="pt-3 border-t border-border space-y-1.5">
        <p className="leading-relaxed">
          本平台由 <strong className="text-foreground">杖雍皓</strong> 主导开发，与 <strong className="text-foreground">联合库 UNHub</strong> 联合出品。
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          项目源码与发布版本均已通过 <strong className="text-foreground">联合库 UNHub 站点管理委员会</strong> 严格审核，确保服务合规、数据透明与持续迭代。
        </p>
      </div>
    </div>
  </DialogContent>
</Dialog>

    </aside>
  )
}