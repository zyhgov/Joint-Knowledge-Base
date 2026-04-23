import React, { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '@/store/authStore'
import { fileService } from '@/services/fileService'
import { workspaceService } from '@/services/workspaceService'
import { departmentService } from '@/services/departmentService'
import { userService } from '@/services/userService'
import { JkbFile, JkbWorkspace } from '@/types/files'
import {
  DocumentTextIcon,
  FolderIcon,
  UserGroupIcon,
  ArrowRightIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  CloudArrowUpIcon,
  EyeIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { getFileIconConfig, isImageFile } from '@/components/files/FileIcon'
import { WelcomeSkeleton, StatCardSkeleton, ListSkeleton, CardSkeleton } from '@/components/common/Skeleton'
import { renderWorkspaceIcon } from '@/components/common/IconPicker'
import DashboardAnnouncements from '@/components/common/DashboardAnnouncements'
import { isAdmin, getAllDepartmentIdsWithAncestors, filterFilesByPermission, filterWorkspacesByPermission } from '@/utils/permission'

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const [files, setFiles] = useState<JkbFile[]>([])
  const [workspaces, setWorkspaces] = useState<JkbWorkspace[]>([])
  const [userCount, setUserCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [userDeptIds, setUserDeptIds] = useState<string[]>([])

  useEffect(() => {
    const loadData = async () => {
      try {
        const [filesData, wsData, deptsData] = await Promise.all([
          fileService.getFiles({ sort_by: 'created_at', sort_order: 'desc' }),
          workspaceService.getAllWorkspaces(),
          departmentService.getAllDepartments(),
        ])
        setFiles(filesData)
        setWorkspaces(wsData)

        // 计算用户部门（含祖先），用于权限判断
        if (user && !isAdmin(user)) {
          try {
            const userDepts = await departmentService.getUserDepartments(user.id)
            const directDeptIds = userDepts.map((d) => d.department.id)
            const allDeptIds = getAllDepartmentIdsWithAncestors(directDeptIds, deptsData)
            setUserDeptIds(allDeptIds)
          } catch {
            setUserDeptIds([])
          }
        } else {
          setUserDeptIds([])
        }

        try {
          const users = await userService.getAllUsers()
          setUserCount(users.length)
        } catch {}
      } catch (error) {
        console.error('Failed to load dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [user?.id])

  // 权限过滤
  const permittedFiles = useMemo(() => {
    return filterFilesByPermission(files, user, userDeptIds, workspaces)
  }, [files, user, userDeptIds, workspaces])

  const permittedWorkspaces = useMemo(() => {
    return filterWorkspacesByPermission(workspaces, user, userDeptIds)
  }, [workspaces, user, userDeptIds])

  const stats = [
    {
      label: '文件总数',
      value: permittedFiles.length,
      icon: DocumentTextIcon,
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: '工作区',
      value: permittedWorkspaces.length,
      icon: FolderIcon,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      label: '团队成员',
      value: userCount,
      icon: UserGroupIcon,
      color: 'text-violet-600',
      bg: 'bg-violet-50 dark:bg-violet-900/20',
    },
    {
      label: '总浏览量',
      value: permittedFiles.reduce((sum, f) => sum + (f.view_count || 0), 0),
      icon: EyeIcon,
      color: 'text-amber-600',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
    },
  ]

  const recentFiles = permittedFiles.slice(0, 5)

  // 时段问候语
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 8) return '早上好'
    if (hour >= 8 && hour < 11) return '上午好'
    if (hour >= 11 && hour < 13) return '中午好'
    if (hour >= 13 && hour < 18) return '下午好'
    return '晚上好'
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <WelcomeSkeleton />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <div>
          <div className="h-6 w-32 bg-muted rounded animate-pulse mb-4" />
          <ListSkeleton rows={5} />
        </div>
        <div>
          <div className="h-6 w-28 bg-muted rounded animate-pulse mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* 欢迎区 */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 border border-primary/10 p-8">
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-foreground">
            {getGreeting()}，{user?.display_name || '用户'}
          </h1>
          <p className="text-muted-foreground mt-1">
            今天也是高效工作的一天。让我们一起看看最新的动态。
          </p>
        </div>
        <div className="absolute right-8 top-1/2 -translate-y-1/2 text-8xl opacity-10">
          📋
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-card rounded-xl p-5 border border-border hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">{stat.label}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{stat.value.toLocaleString()}</p>
              </div>
              <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', stat.bg)}>
                <stat.icon className={cn('h-5 w-5', stat.color)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 公告与任务 */}
      <DashboardAnnouncements />

      {/* 最近文件 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">最近上传的文件</h2>
          <a href="/files" className="text-sm text-primary hover:underline flex items-center gap-1">
            查看全部
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {recentFiles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CloudArrowUpIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">暂无文件</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors cursor-pointer group"
                  onClick={() => window.location.href = '/files'}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isImageFile(file.file_ext) ? (
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        <img
                          src={file.thumbnail_url || file.public_url}
                          alt={file.display_name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', getFileIconConfig(file.file_ext).bgColor)}>
                        {getFileIconConfig(file.file_ext).icon}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">
                        {file.display_name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(file.file_size)}
                        </span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">
                          {file.uploader?.display_name || '未知'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ClockIcon className="h-3.5 w-3.5" />
                      {new Date(file.created_at).toLocaleDateString('zh-CN', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <ArrowRightIcon className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 工作区概览 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">工作区概览</h2>
          <a href="/workspaces" className="text-sm text-primary hover:underline flex items-center gap-1">
            管理工作区
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {permittedWorkspaces.slice(0, 3).map((ws) => (
            <div
              key={ws.id}
              className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-all cursor-pointer group"
              onClick={() => window.location.href = '/workspaces'}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
                  {renderWorkspaceIcon(ws.icon)}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">
                    {ws.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                    {ws.description || '暂无描述'}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {permittedWorkspaces.length === 0 && (
            <div className="col-span-full text-center py-8 text-muted-foreground">
              <FolderIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">暂无工作区</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}