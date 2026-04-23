import React, { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { announcementService } from '@/services/announcementService'
import { departmentService } from '@/services/departmentService'
import { JkbAnnouncement } from '@/types/files'
import { getAllDepartmentIdsWithAncestors, isAdmin } from '@/utils/permission'
import { cn } from '@/lib/utils'
import {
  MegaphoneIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  BellAlertIcon,
  ChevronRightIcon,
  ClockIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'

const typeConfig: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  announcement: { label: '公告', icon: MegaphoneIcon, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  notice: { label: '通知', icon: BellAlertIcon, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  checkin: { label: '打卡', icon: CheckCircleIcon, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  task: { label: '任务', icon: ClipboardDocumentCheckIcon, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-900/20' },
}

const priorityConfig: Record<number, { label: string; color: string }> = {
  1: { label: '普通', color: 'text-muted-foreground' },
  2: { label: '重要', color: 'text-amber-600' },
  3: { label: '紧急', color: 'text-red-600' },
}

export default function DashboardAnnouncements() {
  const { user } = useAuthStore()
  const [announcements, setAnnouncements] = useState<JkbAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadData = async () => {
    if (!user) return
    try {
      let userDeptIds: string[] = []
      if (!isAdmin(user)) {
        const userDepts = await departmentService.getUserDepartments(user.id)
        const directDeptIds = userDepts.map(d => d.department.id)
        const allDepts = await departmentService.getAllDepartments()
        userDeptIds = getAllDepartmentIdsWithAncestors(directDeptIds, allDepts)
      }
      const data = await announcementService.getMyAnnouncements(user.id, userDeptIds)
      // 过滤掉已隐藏的公告
      setAnnouncements(data.filter(a => !a.is_hidden))
    } catch (e) {
      console.error('加载公告失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user?.id])

  const handleMarkRead = async (id: string) => {
    if (!user) return
    try {
      await announcementService.markAsRead(id, user.id)
      setAnnouncements(prev => prev.map(a =>
        a.id === id ? { ...a, is_read: true, read_at: new Date().toISOString() } : a
      ))
    } catch {
      toast.error('操作失败')
    }
  }

  const handleComplete = async (id: string) => {
    if (!user) return
    try {
      await announcementService.completeTask(id, user.id)
      setAnnouncements(prev => prev.map(a =>
        a.id === id ? { ...a, is_completed: true, is_read: true, completed_at: new Date().toISOString() } : a
      ))
      toast.success('已完成！')
    } catch {
      toast.error('操作失败')
    }
  }

  const unreadCount = announcements.filter(a => !a.is_read).length

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => (
          <div key={i} className="h-24 bg-muted/50 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (announcements.length === 0) {
    return null
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">公告与任务</h2>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full">
              {unreadCount} 条未读
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={async () => {
              if (!user) return
              for (const a of announcements.filter(a => !a.is_read)) {
                await announcementService.markAsRead(a.id, user.id)
              }
              setAnnouncements(prev => prev.map(a => ({ ...a, is_read: true })))
              toast.success('全部已读')
            }}
            className="text-xs text-primary hover:underline"
          >
            全部已读
          </button>
        )}
      </div>

      <div className="space-y-3">
        {announcements.map((a) => {
          const config = typeConfig[a.type] || typeConfig.announcement
          const Icon = config.icon
          const isExpanded = expandedId === a.id
          const priorityInfo = priorityConfig[a.priority] || priorityConfig[1]

          return (
            <div
              key={a.id}
              className={cn(
                'bg-card rounded-xl border transition-all',
                !a.is_read ? 'border-primary/30 shadow-sm' : 'border-border',
                a.is_pinned && 'ring-1 ring-primary/20',
                a.is_completed && 'opacity-60'
              )}
            >
              <div
                className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : a.id)}
              >
                {/* 类型图标 */}
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', config.bg)}>
                  <Icon className={cn('h-4.5 w-4.5', config.color)} />
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', config.bg, config.color)}>
                      {config.label}
                    </span>
                    {a.priority >= 2 && (
                      <span className={cn('text-xs font-medium', priorityInfo.color)}>
                        {priorityInfo.label}
                      </span>
                    )}
                    {a.is_pinned && (
                      <span className="text-xs text-primary">置顶</span>
                    )}
                    {!a.is_read && (
                      <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                    )}
                    {a.is_completed && (
                      <span className="text-xs text-emerald-600 flex items-center gap-0.5">
                        <CheckCircleIcon className="h-3 w-3" /> 已完成
                      </span>
                    )}
                  </div>
                  <p className={cn(
                    'text-sm mt-1 truncate',
                    !a.is_read ? 'font-medium text-foreground' : 'text-foreground/80'
                  )}>
                    {a.title}
                  </p>
                  {isExpanded && a.content && (
                    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                      {a.content}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ClockIcon className="h-3 w-3" />
                      {new Date(a.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                    </span>
                    {a.creator && (
                      <span>{a.creator.display_name}</span>
                    )}
                    {a.expires_at && (
                      <span>截止: {new Date(a.expires_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}</span>
                    )}
                  </div>
                </div>

                {/* 操作 */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {(a.type === 'checkin' || a.type === 'task') && !a.is_completed && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleComplete(a.id) }}
                      className={cn(
                        'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                        a.type === 'checkin'
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400'
                          : 'bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-900/20 dark:text-violet-400'
                      )}
                    >
                      {a.type === 'checkin' ? '打卡' : '完成'}
                    </button>
                  )}
                  {!a.is_read && (a.type === 'announcement' || a.type === 'notice') && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleMarkRead(a.id) }}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      已读
                    </button>
                  )}
                  <ChevronRightIcon className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    isExpanded && 'rotate-90'
                  )} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
