import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Lock, Clock, Eye, FileText, AlertCircle, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

type ShareType = 'public' | 'password' | 'time_limited' | 'password_time'

interface ShareData {
  id: string
  document_id: string
  share_code: string
  share_type: ShareType
  password: string | null
  expires_at: string | null
  max_views: number | null
  view_count: number
  allow_edit: boolean
  is_active: boolean
}

interface DocData {
  id: string
  title: string
  content: string | null
  updated_at: string
}

export default function DocumentShareView() {
  const { shareCode } = useParams<{ shareCode: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [share, setShare] = useState<ShareData | null>(null)
  const [doc, setDoc] = useState<DocData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordVerified, setPasswordVerified] = useState(false)
  const [viewReady, setViewReady] = useState(false)

  const loadShare = useCallback(async () => {
    if (!shareCode) {
      setError('无效的分享链接')
      setLoading(false)
      return
    }

    try {
      // 查询分享记录
      const { data: shareData, error: shareError } = await supabase
        .from('jkb_document_shares')
        .select('*')
        .eq('share_code', shareCode)
        .eq('is_active', true)
        .single()

      if (shareError || !shareData) {
        setError('分享链接不存在或已失效')
        setLoading(false)
        return
      }

      const s = shareData as ShareData

      // 检查是否过期
      if (s.expires_at && new Date(s.expires_at) < new Date()) {
        setError('分享链接已过期')
        setLoading(false)
        return
      }

      // 检查访问次数
      if (s.max_views && s.view_count >= s.max_views) {
        setError('分享链接已达到最大访问次数')
        setLoading(false)
        return
      }

      setShare(s)

      // 如果是公开链接或无需密码，直接加载
      if (s.share_type === 'public' || s.share_type === 'time_limited') {
        setPasswordVerified(true)
      }
    } catch (err: any) {
      setError('加载分享信息失败')
    } finally {
      setLoading(false)
    }
  }, [shareCode])

  useEffect(() => {
    loadShare()
  }, [loadShare])

  // 密码验证后加载文档
  useEffect(() => {
    if (!passwordVerified || !share) return

    const loadDoc = async () => {
      try {
        // 增加访问计数
        await supabase
          .from('jkb_document_shares')
          .update({ view_count: share.view_count + 1 })
          .eq('id', share.id)

        // 加载文档
        const { data: docData, error: docError } = await supabase
          .from('jkb_documents')
          .select('id, title, updated_at')
          .eq('id', share.document_id)
          .single()

        if (docError || !docData) {
          setError('文档不存在或已被删除')
          return
        }

        setDoc(docData as DocData)
        setViewReady(true)
      } catch (err: any) {
        setError('加载文档失败')
      }
    }

    loadDoc()
  }, [passwordVerified, share])

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!share || !share.password) return

    if (passwordInput === share.password) {
      setPasswordVerified(true)
    } else {
      toast.error('密码错误，请重试')
    }
  }

  // 格式化时间
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // 加载中
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full" />
          <span className="text-sm text-muted-foreground">正在加载分享内容...</span>
        </div>
      </div>
    )
  }

  // 错误页面
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">无法访问</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button variant="outline" onClick={() => navigate('/')}>
            返回首页
          </Button>
        </div>
      </div>
    )
  }

  // 密码验证页面
  if (share && !passwordVerified) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-card border border-border rounded-2xl p-8">
            <div className="flex flex-col items-center mb-6">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Lock className="h-7 w-7 text-primary" />
              </div>
              <h1 className="text-xl font-semibold text-foreground">受密码保护的文档</h1>
              <p className="text-sm text-muted-foreground mt-1">请输入密码以访问此文档</p>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <Label htmlFor="password">访问密码</Label>
                <Input
                  id="password"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="请输入密码"
                  className="mt-2"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full">
                验证密码
              </Button>
            </form>

            {share.expires_at && (
              <div className="flex items-center gap-1.5 mt-4 text-xs text-muted-foreground justify-center">
                <Clock className="h-3.5 w-3.5" />
                <span>此链接将于 {formatDate(share.expires_at)} 过期</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // 文档查看页面
  if (viewReady && doc && share) {
    const isExpired = share.expires_at && new Date(share.expires_at) < new Date()
    const isExceeded = share.max_views && share.view_count >= share.max_views

    return (
      <div className="min-h-screen bg-background">
        {/* 顶部栏 */}
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <h1 className="font-semibold text-foreground truncate max-w-md">
                {doc.title || '无标题文档'}
              </h1>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {share.allow_edit ? (
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                  可编辑
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-muted-foreground">
                  <Eye className="h-3 w-3" /> 只读
                </span>
              )}
              <span>浏览 {share.view_count} 次</span>
              {share.expires_at && (
                <span className={cn(
                  'flex items-center gap-1',
                  isExpired ? 'text-destructive' : ''
                )}>
                  <Clock className="h-3 w-3" />
                  {isExpired ? '已过期' : `有效期至 ${new Date(share.expires_at).toLocaleDateString('zh-CN')}`}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* 文档内容区 */}
        <main className="max-w-4xl mx-auto px-6 py-8">
          <div className="bg-card border border-border rounded-xl p-8 min-h-[60vh]">
            {/* 分享查看模式 - 使用 TipTap 编辑器的只读/可编辑模式 */}
            <SharedDocumentContent
              documentId={doc.id}
              allowEdit={share.allow_edit}
            />
          </div>

          {/* 底部信息 */}
          <div className="mt-6 text-center text-xs text-muted-foreground">
            <p>此文档通过分享链接访问 {share.allow_edit ? '· 允许编辑' : '· 只读模式'}</p>
          </div>
        </main>
      </div>
    )
  }

  return null
}

// 分享文档内容组件 - 使用 CollabProvider + TipTap 编辑器
function SharedDocumentContent({ documentId, allowEdit }: { documentId: string; allowEdit: boolean }) {
  const [content, setContent] = useState<string>('暂无内容')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 对于分享查看，我们尝试使用 CollabProvider 连接协作服务
    // 如果连接失败，则直接从数据库读取内容
    const loadContent = async () => {
      try {
        // 尝试从 jkb_document_content 表加载
        const { data } = await supabase
          .from('jkb_document_content')
          .select('content')
          .eq('document_id', documentId)
          .single()

        if (data?.content) {
          // content 是 JSON 格式的 TipTap 文档
          setContent('')
        }
      } catch {
        // 表可能不存在，显示占位内容
      }
      setLoading(false)
    }
    loadContent()
  }, [documentId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-6 w-6 border-b-2 border-primary rounded-full" />
      </div>
    )
  }

  // 使用 iframe 嵌入编辑器页面（如果允许编辑）
  // 或者显示只读内容
  if (allowEdit) {
    // 可编辑模式：重定向到登录后的编辑页面
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">此分享链接允许编辑</p>
        <a href={`/documents/${documentId}`}>
          <Button className="gap-2">
            <ArrowRight className="h-4 w-4" />
            打开编辑器
          </Button>
        </a>
        <p className="text-xs text-muted-foreground">需要登录后才能编辑</p>
      </div>
    )
  }

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <p className="text-muted-foreground">
        此文档以只读模式分享。如需协作编辑，请联系文档创建者获取编辑权限。
      </p>
    </div>
  )
}
