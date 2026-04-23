import React, { useEffect, useRef } from 'react'
import { useNotificationStore } from '@/store/notificationStore'
import { useAuthStore } from '@/store/authStore'
import { BellIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { BellAlertIcon } from '@heroicons/react/24/solid'
import { cn } from '@/lib/utils'
import { JkbNotification } from '@/types/files'
import UserAvatar from './UserAvatar'

const typeConfig = {
  info: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    dot: 'bg-blue-500',
    label: '通知',
  },
  warning: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-200 dark:border-orange-800',
    dot: 'bg-orange-500',
    label: '警告',
  },
  success: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
    dot: 'bg-green-500',
    label: '成功',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    dot: 'bg-red-500',
    label: '错误',
  },
}

function NotificationItem({
  notification,
  onRead,
}: {
  notification: JkbNotification
  onRead: (id: string) => void
}) {
  const config = typeConfig[notification.type]
  const isExpired =
    notification.expires_at && new Date(notification.expires_at) < new Date()

  return (
    <div
      className={cn(
        'p-4 rounded-lg border transition-all cursor-pointer',
        config.bg,
        config.border,
        !notification.is_read && 'shadow-sm',
        isExpired && 'opacity-50'
      )}
      onClick={() => !notification.is_read && onRead(notification.id)}
    >
      <div className="flex items-start gap-3">
        {/* 发送者头像 */}
        {notification.sender ? (
          <UserAvatar
            avatarUrl={notification.sender.avatar_url}
            displayName={notification.sender.display_name}
            size="xs"
            className="mt-0.5 flex-shrink-0"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <BellIcon className="h-3 w-3 text-primary" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {/* 未读红点 */}
            {!notification.is_read && (
              <span className={cn('w-2 h-2 rounded-full flex-shrink-0', config.dot)} />
            )}
            {/* 置顶标记 */}
            {notification.is_pinned && (
              <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                置顶
              </span>
            )}
            <h4 className="text-sm font-semibold text-foreground truncate">
              {notification.title}
            </h4>
          </div>

          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
            {notification.content}
          </p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {notification.sender?.display_name && (
                <span>{notification.sender.display_name}</span>
              )}
              <span>·</span>
              <span>
                {new Date(notification.created_at).toLocaleDateString('zh-CN', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            {notification.expires_at && (
              <span className="text-xs text-muted-foreground">
                {isExpired
                  ? '已过期'
                  : `${new Date(notification.expires_at).toLocaleDateString('zh-CN')} 到期`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function NotificationBell() {
  const { user } = useAuthStore()
  const {
    notifications,
    unreadCount,
    isOpen,
    isLoading,
    setOpen,
    loadNotifications,
    markAsRead,
    markAllAsRead,
    subscribeRealtime,
  } = useNotificationStore()

  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // 加载通知 + 实时订阅
  useEffect(() => {
    if (user?.id) {
      loadNotifications(user.id)
      // 订阅 Realtime
      const unsubscribe = subscribeRealtime(user.id)
      return () => {
        unsubscribe()
      }
    }
  }, [user?.id])

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMarkAsRead = async (id: string) => {
    if (!user?.id) return
    await markAsRead(id, user.id)
  }

  const handleMarkAllAsRead = async () => {
    if (!user?.id) return
    await markAllAsRead(user.id)
  }

  return (
    <div className="relative">
      {/* 铃铛按钮 */}
      <button
        ref={buttonRef}
        onClick={() => setOpen(!isOpen)}
        className={cn(
          'relative p-2 rounded-lg transition-colors',
          isOpen
            ? 'bg-accent text-foreground'
            : 'hover:bg-accent text-muted-foreground hover:text-foreground'
        )}
        title="通知"
      >
        {unreadCount > 0 ? (
          <BellAlertIcon className="h-5 w-5 text-primary" />
        ) : (
          <BellIcon className="h-5 w-5" />
        )}

        {/* 未读数量角标 */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 通知面板 */}
      {isOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-96 max-h-[600px] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {/* 面板头部 */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <BellIcon className="h-5 w-5 text-foreground" />
              <h3 className="font-semibold text-foreground">通知</h3>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="flex items-center gap-1 text-xs text-primary hover:underline px-2 py-1 rounded hover:bg-accent transition-colors"
                  title="全部标为已读"
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                  全部已读
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 通知列表 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-12">
                <BellIcon className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">暂无通知</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRead={handleMarkAsRead}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}