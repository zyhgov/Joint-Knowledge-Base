import React, { useEffect, useState, useCallback } from 'react'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * PWA 安装提示组件
 * - 监听 beforeinstallprompt 事件，捕获安装弹窗
 * - 提供手动触发安装的按钮
 * - 支持已安装态隐藏
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // 检测是否已安装（standalone 模式）
  useEffect(() => {
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    ) {
      setIsInstalled(true)
    }
  }, [])

  // 监听 beforeinstallprompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // 监听应用已安装
  useEffect(() => {
    const handler = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('appinstalled', handler)
    return () => window.removeEventListener('appinstalled', handler)
  }, [])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setIsInstalled(true)
    }
    setDeferredPrompt(null)
  }, [deferredPrompt])

  // 已安装 / 不支持 / 已关闭 -> 不显示
  if (isInstalled || !deferredPrompt || dismissed) return null

  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-xs cursor-pointer',
        'bg-primary/10 text-primary hover:bg-primary/15 border border-primary/20',
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium">安装应用</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          安装到桌面，体验更流畅
        </p>
      </div>

      <button
        onClick={handleInstall}
        className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
      >
        <ArrowDownTrayIcon className="h-3.5 w-3.5" />
        安装
      </button>

      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        aria-label="关闭"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  )
}
