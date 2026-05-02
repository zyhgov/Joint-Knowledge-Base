import React, { useState } from 'react'
import { ClockIcon, StarIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'

interface PreviewPlaceholderProps {
  title: string
  description?: string
}

export default function PreviewPlaceholder({ title, description }: PreviewPlaceholderProps) {
  const [joined, setJoined] = useState(false)

  const handleJoinPreview = () => {
    setJoined(true)
    toast.success(
      '已加入预览计划，将在功能预上线前发布给您进行灰度测试',
      { duration: 4000 }
    )
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-6 max-w-md">
        {/* 图标 */}
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-muted">
            <ClockIcon className="h-12 w-12 text-muted-foreground" />
          </div>
        </div>

        {/* 标题 */}
        <h2 className="text-2xl font-bold text-foreground">{title}</h2>

        {/* 描述 */}
        <p className="text-muted-foreground">
          {description || `${title}功能正在开发中，敬请期待...`}
        </p>

        {/* 装饰进度条 */}
        <div className="w-full bg-muted rounded-full h-2.5">
          <div className="bg-primary h-2.5 rounded-full w-1/3 animate-pulse" />
        </div>
        <p className="text-xs text-muted-foreground">开发进度：即将开放</p>

        {/* 加入预览计划 */}
        <div className={cn(
          'pt-4 border-t border-border space-y-3',
          joined && 'opacity-50 pointer-events-none'
        )}>
          <p className="text-sm font-medium text-foreground">
            想要提前体验？
          </p>
          <Button
            onClick={handleJoinPreview}
            disabled={joined}
            className="gap-2"
          >
            <StarIcon className="h-4 w-4" />
            {joined ? '已加入预览计划' : '加入预览计划'}
          </Button>
          {!joined && (
            <p className="text-xs text-muted-foreground">
              加入后将在功能预上线前通知您进行灰度测试
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
