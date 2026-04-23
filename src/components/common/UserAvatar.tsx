import React from 'react'
import { cn } from '@/lib/utils'

interface UserAvatarProps {
  avatarUrl?: string | null
  displayName?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  // 是否显示在线状态
  showOnline?: boolean
}

const sizeConfig = {
  xs: {
    container: 'w-6 h-6',
    text: 'text-[10px]',
    online: 'w-1.5 h-1.5 -bottom-0 -right-0',
  },
  sm: {
    container: 'w-8 h-8',
    text: 'text-xs',
    online: 'w-2 h-2 -bottom-0 -right-0',
  },
  md: {
    container: 'w-10 h-10',
    text: 'text-sm',
    online: 'w-2.5 h-2.5 bottom-0 right-0',
  },
  lg: {
    container: 'w-12 h-12',
    text: 'text-base',
    online: 'w-3 h-3 bottom-0 right-0',
  },
  xl: {
    container: 'w-24 h-24',
    text: 'text-2xl',
    online: 'w-4 h-4 bottom-1 right-1',
  },
}

export default function UserAvatar({
  avatarUrl,
  displayName,
  size = 'md',
  className,
  showOnline = false,
}: UserAvatarProps) {
  const config = sizeConfig[size]
  const initial = displayName?.charAt(0)?.toUpperCase() || 'U'

  return (
    <div className={cn('relative flex-shrink-0', className)}>
      <div
        className={cn(
          'rounded-full overflow-hidden flex items-center justify-center font-semibold',
          config.container,
          !avatarUrl && 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
        )}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName || '用户头像'}
            className="w-full h-full object-cover"
            onError={(e) => {
              // 图片加载失败时显示文字头像
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              target.parentElement!.innerHTML = `<span class="${config.text} font-semibold text-white">${initial}</span>`
              target.parentElement!.classList.add(
                'bg-gradient-to-br',
                'from-blue-500',
                'to-blue-600'
              )
            }}
          />
        ) : (
          <span className={cn(config.text, 'font-semibold')}>{initial}</span>
        )}
      </div>

      {/* 在线状态点 */}
      {showOnline && (
        <div
          className={cn(
            'absolute rounded-full bg-green-500 border-2 border-background',
            config.online
          )}
        />
      )}
    </div>
  )
}