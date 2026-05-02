import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'
import Sidebar from './Sidebar'
import UserAvatar from '@/components/common/UserAvatar'
import NotificationBell from '@/components/common/NotificationBell'
import {
  Bars3Icon,
  ArrowLeftOnRectangleIcon,
  BellIcon,
} from '@heroicons/react/24/outline'

interface MainLayoutProps {
  children: React.ReactNode
  title?: string
  actions?: React.ReactNode
  noPadding?: boolean
}

const roleLabels: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  editor: '编辑者',
  member: '成员',
  guest: '访客',
}

function getRoleLabel(role: string | undefined, roleName?: string): string {
  if (!role) return ''
  if (roleName && !['超级管理员', '管理员', '编辑者', '成员', '访客'].includes(roleName)) return roleName
  return roleLabels[role] || roleName || role
}

export default function MainLayout({
  children,
  title,
  actions,
  noPadding = false,
}: MainLayoutProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // 检测屏幕尺寸
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      if (mobile) {
        setSidebarCollapsed(true)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // 关闭移动端侧边栏（路由切换时）
  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [navigate])

  const handleLogout = async () => {
    try {
      await logout()
      toast.success('已安全退出登录')
      navigate('/login')
    } catch (error) {
      toast.error('退出失败，请重试')
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ===== 移动端遮罩 ===== */}
      {isMobile && mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* ===== 桌面端侧边栏 ===== */}
      <div className="hidden lg:block flex-shrink-0">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* ===== 移动端侧边栏（抽屉式） ===== */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 lg:hidden transition-transform duration-300 ease-in-out',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Sidebar
          collapsed={false}
          onToggleCollapse={() => setMobileSidebarOpen(false)}
        />
      </div>

      {/* ===== 主内容区 ===== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 顶部导航栏 */}
        <header className="h-16 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 lg:px-6 flex-shrink-0 sticky top-0 z-30">
          {/* 左侧 */}
          <div className="flex items-center gap-3 min-w-0">
            {/* 移动端菜单按钮 */}
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-accent rounded-lg transition-colors flex-shrink-0"
              aria-label="打开菜单"
            >
              <Bars3Icon className="h-5 w-5 text-foreground" />
            </button>

            {/* 页面标题 */}
            <h1 className="text-lg font-semibold text-foreground truncate">
              {title || import.meta.env.VITE_APP_NAME || '联合知识库'}
            </h1>
          </div>

          {/* 右侧操作区 */}
          <div className="flex items-center gap-1 lg:gap-2 flex-shrink-0">
            {/* 自定义操作按钮 */}
            {actions && (
              <div className="flex items-center gap-2 mr-2">
                {actions}
              </div>
            )}

            {/* 通知按钮 */}
            <NotificationBell />
            {/* 分隔线 */}
            <div className="hidden sm:block w-px h-6 bg-border mx-1" />

            {/* 用户信息区 */}
            <div className="flex items-center gap-2 lg:gap-3">
              {/* 用户名和角色（中等屏幕以上显示） */}
              <div className="hidden md:block text-right">
                <p className="text-sm font-medium text-foreground leading-tight truncate max-w-[140px]">
                  {user?.display_name || '用户'}
                </p>
                <p className="text-xs text-muted-foreground leading-tight">
                  {getRoleLabel(user?.role, (user as any)?.role_name)}
                </p>
              </div>

              {/* 头像（点击跳转设置） */}
              <Link
                to="/settings"
                title="个人设置"
                className="flex-shrink-0"
              >
                <UserAvatar
                  avatarUrl={user?.avatar_url}
                  displayName={user?.display_name}
                  size="sm"
                  showOnline
                  className="hover:ring-2 hover:ring-primary/50 transition-all rounded-full"
                />
              </Link>

              {/* 退出按钮 */}
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-destructive"
                title="退出登录"
              >
                <ArrowLeftOnRectangleIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        {/* 主内容滚动区 */}
        <main className="flex-1 overflow-y-auto bg-[#f5f5f7] dark:bg-background">
          <div className={noPadding ? 'h-full' : 'container max-w-7xl mx-auto p-4 lg:p-8'}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}