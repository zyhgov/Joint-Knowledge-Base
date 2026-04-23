import React, { useEffect, useState, useCallback, useRef } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/services/supabase'

const COLLAB_SERVER_URL = import.meta.env.VITE_COLLAB_SERVER_URL || 'ws://localhost:8787'

// 用户颜色列表（协作光标）
const CURSOR_COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635',
  '#34d399', '#22d3ee', '#60a5fa', '#a78bfa',
  '#f472b6', '#e879f9', '#818cf8', '#38bdf8',
]

export interface CollabUser {
  name: string
  color: string
  clientId: number
}

interface CollabProviderProps {
  docKey: string
  children: (props: {
    doc: Y.Doc
    provider: WebsocketProvider
    users: CollabUser[]
    connectionStatus: 'connecting' | 'connected' | 'disconnected'
  }) => React.ReactNode
}

export default function CollabProvider({ docKey, children }: CollabProviderProps) {
  const { user } = useAuthStore()
  const [doc] = useState(() => new Y.Doc())
  const [provider, setProvider] = useState<WebsocketProvider | null>(null)
  const [users, setUsers] = useState<CollabUser[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const cleanupRef = useRef<(() => void) | null>(null)
  const presenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 从 docKey 中提取 documentId（格式为 "doc-{uuid}"）
  const documentId = docKey.replace('doc-', '')

  // 更新在线状态到数据库
  const updatePresence = useCallback(async () => {
    if (!user?.id) return
    try {
      await supabase
        .from('jkb_document_presence')
        .upsert({
          document_id: documentId,
          user_id: user.id,
          user_name: user.display_name || '匿名用户',
          last_active_at: new Date().toISOString(),
        }, { onConflict: 'document_id,user_id' })
    } catch {
      // 表可能不存在，忽略
    }
  }, [documentId, user?.id, user?.display_name])

  // 离开文档时移除在线状态
  const removePresence = useCallback(async () => {
    if (!user?.id) return
    try {
      await supabase
        .from('jkb_document_presence')
        .delete()
        .eq('document_id', documentId)
        .eq('user_id', user.id)
    } catch {
      // 忽略
    }
  }, [documentId, user?.id])

  const initProvider = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current()
    }

    const colorIndex = Math.abs(hashCode(user?.id || 'anonymous')) % CURSOR_COLORS.length
    const userColor = CURSOR_COLORS[colorIndex]

    const wsProvider = new WebsocketProvider(
      `${COLLAB_SERVER_URL}/editor`,
      docKey,
      doc,
      {
        connect: true,
        params: {
          name: user?.display_name || '匿名用户',
          color: userColor,
        },
      }
    )

    // 监听连接状态
    wsProvider.on('status', ({ status }: { status: string }) => {
      const newStatus = status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting' : 'disconnected'
      setConnectionStatus(newStatus)
      // 连接成功时立即更新在线状态
      if (newStatus === 'connected') {
        updatePresence()
      }
    })

    // 监听协作用户变化
    const updateUsers = () => {
      const awareness = wsProvider.awareness
      const collaborators: CollabUser[] = []

      awareness.getStates().forEach((state: any, clientId: number) => {
        if (clientId !== awareness.clientID) {
          collaborators.push({
            name: state.user?.name || '匿名用户',
            color: state.user?.color || '#888',
            clientId,
          })
        }
      })

      collaborators.unshift({
        name: user?.display_name || '我',
        color: userColor,
        clientId: awareness.clientID,
      })

      setUsers(collaborators)
    }

    wsProvider.awareness.on('change', updateUsers)
    wsProvider.on('sync', (isSynced: boolean) => {
      if (isSynced) updateUsers()
    })

    // 设置 awareness 本地用户信息
    wsProvider.awareness.setLocalStateField('user', {
      name: user?.display_name || '匿名用户',
      color: userColor,
    })

    setProvider(wsProvider)

    // 定期更新在线状态（每30秒）
    presenceTimerRef.current = setInterval(updatePresence, 30000)

    // 清理函数
    cleanupRef.current = () => {
      if (presenceTimerRef.current) {
        clearInterval(presenceTimerRef.current)
        presenceTimerRef.current = null
      }
      wsProvider.awareness.off('change', updateUsers)
      wsProvider.destroy()
      // 离开时移除在线状态
      removePresence()
    }
  }, [docKey, user?.id, user?.display_name, doc, updatePresence, removePresence])

  useEffect(() => {
    initProvider()
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
    }
  }, [initProvider])

  // 页面关闭时也要清理
  useEffect(() => {
    const handleBeforeUnload = () => {
      removePresence()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [removePresence])

  if (!provider) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="animate-spin h-5 w-5 border-b-2 border-primary rounded-full" />
        <span className="ml-2 text-sm text-muted-foreground">正在连接协作服务...</span>
      </div>
    )
  }

  return (
    <>
      {children({ doc, provider, users, connectionStatus })}
    </>
  )
}

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash
}
