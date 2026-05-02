import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { hasAnyPermission } from '@/utils/permission'
import { Button } from '@/components/ui/button'

interface ProtectedRouteProps {
  children: React.ReactNode
  /** 所需的权限码列表，满足任意一个即可访问，不传则不限制 */
  requiredPerms?: string[]
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredPerms }) => {
  const { isAuthenticated, isLoading, user, userPermissions } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login', { replace: true })
    }
  }, [isAuthenticated, isLoading, navigate])

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#f5f5f7]">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-white rounded-full animate-spin mb-4">
            <div className="w-10 h-10 border-2 border-[#d2d2d7] border-t-blue-600 rounded-full"></div>
          </div>
          <p className="text-[#86868b] text-sm">正在加载...</p>
        </div>
      </div>
    )
  }

  // 未登录
  if (!isAuthenticated || !user) {
    return null
  }

  // 权限检查
  if (requiredPerms && requiredPerms.length > 0) {
    const hasPerm = hasAnyPermission(user, userPermissions, ...requiredPerms)
    if (!hasPerm) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
              <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">无权限访问</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
              您没有权限访问此页面，请联系管理员获取相应权限。
            </p>
            <Button size="sm" onClick={() => navigate('/dashboard', { replace: true })}>
              返回首页
            </Button>
          </div>
        </div>
      )
    }
  }

  return <>{children}</>
}