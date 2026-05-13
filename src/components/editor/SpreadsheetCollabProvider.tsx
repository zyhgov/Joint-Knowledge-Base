import { useEffect, useState, useCallback, useRef } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { useAuthStore } from '@/store/authStore'

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
  avatarUrl?: string | null
  cursor?: { row: number; col: number } | null
}

interface SpreadsheetCollabProviderProps {
  spreadsheetId: string
  children: (props: {
    users: CollabUser[]
    connectionStatus: 'connecting' | 'connected' | 'disconnected'
    provider: WebsocketProvider | null
    doc: Y.Doc
    setCursor: (row: number | null, col: number | null) => void
  }) => React.ReactNode
}

export default function SpreadsheetCollabProvider({ spreadsheetId, children }: SpreadsheetCollabProviderProps) {
  const { user } = useAuthStore()
  const [doc] = useState(() => new Y.Doc())
  const providerRef = useRef<WebsocketProvider | null>(null)
  const [provider, setProvider] = useState<WebsocketProvider | null>(null)
  const [users, setUsers] = useState<CollabUser[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const cleanupRef = useRef<(() => void) | null>(null)

  // 广播光标位置
  const setCursor = useCallback((row: number | null, col: number | null) => {
    const prov = providerRef.current
    if (!prov) return
    prov.awareness.setLocalStateField('cursor', row != null && col != null ? { row, col } : null)
  }, [])

  const initProvider = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current()
    }

    const colorIndex = Math.abs(hashCode(user?.id || 'anonymous')) % CURSOR_COLORS.length
    const userColor = CURSOR_COLORS[colorIndex]

    const wsProvider = new WebsocketProvider(
      `${COLLAB_SERVER_URL}/editor`,
      `spreadsheet-${spreadsheetId}`,
      doc,
      {
        connect: true,
        params: {
          name: user?.display_name || '匿名用户',
          color: userColor,
          avatarUrl: user?.avatar_url || '',
        },
      }
    )

    // 监听连接状态
    wsProvider.on('status', ({ status }: { status: string }) => {
      const newStatus = status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting' : 'disconnected'
      setConnectionStatus(newStatus)
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
            avatarUrl: state.user?.avatarUrl || null,
            cursor: state.cursor || null,
          })
        }
      })

      collaborators.unshift({
        name: user?.display_name || '我',
        color: userColor,
        clientId: awareness.clientID,
        avatarUrl: user?.avatar_url || null,
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
      avatarUrl: user?.avatar_url || '',
    })

    providerRef.current = wsProvider
    setProvider(wsProvider)

    // 清理函数
    cleanupRef.current = () => {
      wsProvider.awareness.off('change', updateUsers)
      wsProvider.destroy()
    }
  }, [spreadsheetId, user?.id, user?.display_name, doc])

  useEffect(() => {
    initProvider()
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
    }
  }, [initProvider])

  return <>{children({ users, connectionStatus, provider, doc, setCursor })}</>
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
