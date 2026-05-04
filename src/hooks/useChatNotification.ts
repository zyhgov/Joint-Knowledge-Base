import { useCallback, useRef, useEffect } from 'react'

const NOTIFICATION_SOUND = '/prompt-tone/ding.mp3'

let audioContext: AudioContext | null = null

/** 获取或创建 AudioContext（需要用户交互后才能创建） */
function getAudioContext(): AudioContext | null {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume()
    }
    return audioContext
  } catch {
    return null
  }
}

/** 播放 ding 提示音 */
function playDingSound() {
  try {
    // 方式1：直接用 Audio 播放（简单可靠）
    const audio = new Audio(NOTIFICATION_SOUND)
    audio.volume = 0.6
    audio.play().catch(() => {
      // 某些浏览器需要用户交互后才能播放，静默忽略
    })
  } catch {
    // 静默失败
  }
}

/** 请求浏览器通知权限 */
function requestNotificationPermission() {
  if (!('Notification' in window)) return
  if (Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

/** 发送浏览器通知 */
function showBrowserNotification(title: string, body: string, onClickUrl?: string) {
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  try {
    // 如果页面已获得焦点则不弹通知
    if (document.hasFocus()) return
    // 如果手机锁屏了，还是会弹出（由浏览器控制）

    const notif = new Notification(title, {
      body,
      icon: '/favicon.svg',
      tag: 'chat-message', // 相同 tag 会替换之前的通知
      silent: true, // 不播放系统通知音，我们用自己的
    })

    notif.onclick = () => {
      window.focus()
      if (onClickUrl) {
        window.location.href = onClickUrl
      }
      notif.close()
    }
  } catch {
    // 静默失败
  }
}

/**
 * useChatNotification Hook
 *
 * 在收到新聊天消息时播放提示音并弹出浏览器通知。
 * 只在以下情况触发：
 *  - 消息不是自己发的
 *  - 页面不在焦点（不弹通知，但依然播放声音）
 *  - 非当前活动会话的消息（需要传 activeConvId）
 *
 * @param userId 当前用户 ID
 * @param activeConvId 当前打开的会话 ID（设为 null 表示不在聊天窗口）
 * @param senderName 对方显示名称
 * @param previewText 消息预览文本
 */
export function useChatNotification(
  userId: string | undefined,
  activeConvId: string | null,
  senderName: string,
  previewText: string
) {
  // 请求通知权限
  useEffect(() => {
    requestNotificationPermission()
  }, [])

  const prevConvRef = useRef<string | null>(null)

  // 当有新消息到达（通过 activeConvId 变化 + senderName 变化判断）
  useEffect(() => {
    if (!userId || !senderName) return
    // 如果是自己的消息，不通知
    if (senderName === '我') return

    const isNewConversationMessage = activeConvId !== prevConvRef.current
    prevConvRef.current = activeConvId

    // 如果是刚切到当前会话，不通知（已有消息正在显示）
    if (!isNewConversationMessage && activeConvId) {
      // 在当前会话中，不弹通知但可以播放声音（用户可能在看别处）
      // 只在页面没焦点时播放声音
      if (!document.hasFocus()) {
        playDingSound()
      }
      return
    }

    // 非当前会话的消息
    playDingSound()

    // 浏览器通知
    if (activeConvId) {
      // 当前打开了某个会话，通知是关于其他会话的
      showBrowserNotification(senderName, previewText, window.location.href)
    } else {
      // 没打开任何会话
      showBrowserNotification(senderName, previewText, window.location.href)
    }
  }, [userId, activeConvId, senderName, previewText])
}

/**
 * 手动触发消息通知（供非 React 环境或外部调用）
 */
export function triggerMessageNotification(
  sender: string,
  preview: string,
  isSelf: boolean,
  isCurrentConv: boolean
) {
  if (isSelf) return

  if (!isCurrentConv) {
    playDingSound()
  } else if (!document.hasFocus()) {
    playDingSound()
  }

  showBrowserNotification(sender, preview)
}
