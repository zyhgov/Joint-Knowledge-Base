import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Share2, Copy, Lock, Clock, Eye, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

type ShareType = 'public' | 'password' | 'time_limited' | 'password_time'

interface DocShare {
  id: string
  share_code: string
  share_type: ShareType
  password: string | null
  expires_at: string | null
  max_views: number | null
  view_count: number
  allow_edit: boolean
  is_active: boolean
  created_at: string
}

interface DocumentShareProps {
  docId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function DocumentShare({ docId, open, onOpenChange }: DocumentShareProps) {
  const { user } = useAuthStore()
  const [shares, setShares] = useState<DocShare[]>([])
  const [shareType, setShareType] = useState<ShareType>('public')
  const [password, setPassword] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [maxViews, setMaxViews] = useState('')
  const [allowEdit, setAllowEdit] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const loadShares = useCallback(async () => {
    if (!docId) return
    try {
      const { data, error } = await supabase
        .from('jkb_document_shares')
        .select('*')
        .eq('document_id', docId)
        .order('created_at', { ascending: false })
      if (error) throw error
      setShares(data || [])
    } catch (err: any) {
      console.warn('加载分享列表失败:', err?.message)
    }
  }, [docId])

  useEffect(() => {
    if (open) {
      loadShares()
      setGeneratedUrl('')
      setShareType('public')
      setPassword('')
      setExpiresAt('')
      setMaxViews('')
      setAllowEdit(false)
    }
  }, [open, loadShares])

  const generateShareCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let code = ''
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  const handleCreateShare = async () => {
    if (!user) return
    if ((shareType === 'password' || shareType === 'password_time') && !password) {
      toast.error('请设置访问密码')
      return
    }

    setSaving(true)
    try {
      const shareCode = generateShareCode()
      const { error } = await supabase
        .from('jkb_document_shares')
        .insert({
          document_id: docId,
          share_code: shareCode,
          share_type: shareType,
          password: (shareType === 'password' || shareType === 'password_time') ? password : null,
          expires_at: (shareType === 'time_limited' || shareType === 'password_time') && expiresAt
            ? new Date(expiresAt).toISOString() : null,
          max_views: maxViews ? parseInt(maxViews) : null,
          allow_edit: allowEdit,
          created_by: user.id,
        })
      if (error) throw error

      const url = `${window.location.origin}/share/doc/${shareCode}`
      setGeneratedUrl(url)
      loadShares()
      toast.success('分享链接已创建')
    } catch (err: any) {
      toast.error(err.message || '创建分享失败')
    } finally {
      setSaving(false)
    }
  }

  const handleRevoke = async (shareId: string) => {
    if (!confirm('确定要撤销该分享链接吗？')) return
    try {
      const { error } = await supabase
        .from('jkb_document_shares')
        .update({ is_active: false })
        .eq('id', shareId)
      if (error) throw error
      toast.success('分享已撤销')
      loadShares()
    } catch (err: any) {
      toast.error(err.message || '撤销失败')
    }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('已复制到剪贴板')
  }

  const shareTypeLabel: Record<ShareType, string> = {
    public: '公开链接',
    password: '密码保护',
    time_limited: '限时访问',
    password_time: '密码+限时',
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>分享文档</DialogTitle>
          <DialogDescription>创建分享链接供他人访问此文档</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* 创建新分享 */}
          <div className="space-y-4 p-4 border border-border rounded-lg">
            <h4 className="font-semibold text-sm">创建新分享</h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>分享类型</Label>
                <select
                  value={shareType}
                  onChange={(e) => setShareType(e.target.value as ShareType)}
                  className="mt-2 w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
                >
                  <option value="public">公开链接</option>
                  <option value="password">密码保护</option>
                  <option value="time_limited">限时访问</option>
                  <option value="password_time">密码+限时</option>
                </select>
              </div>

              {(shareType === 'password' || shareType === 'password_time') && (
                <div>
                  <Label>访问密码</Label>
                  <Input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="设置访问密码"
                    className="mt-2"
                  />
                </div>
              )}

              {(shareType === 'time_limited' || shareType === 'password_time') && (
                <div>
                  <Label>过期时间</Label>
                  <Input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="mt-2"
                  />
                </div>
              )}

              <div>
                <Label>最大访问次数（可选）</Label>
                <Input
                  type="number"
                  value={maxViews}
                  onChange={(e) => setMaxViews(e.target.value)}
                  placeholder="不限制"
                  className="mt-2"
                  min="1"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allowEdit}
                onChange={(e) => setAllowEdit(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">允许编辑文档</span>
            </label>

            <Button onClick={handleCreateShare} disabled={saving} className="w-full">
              {saving ? '创建中...' : '创建分享链接'}
            </Button>

            {generatedUrl && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-900 dark:text-green-100">分享链接已创建</span>
                </div>
                <div className="flex gap-2">
                  <Input value={generatedUrl} readOnly className="flex-1 text-xs bg-white" />
                  <Button size="sm" variant="outline" onClick={() => handleCopy(generatedUrl)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* 已有分享列表 */}
          <div>
            <h4 className="font-semibold text-sm mb-3">已创建的分享链接</h4>
            <div className="space-y-2">
              {shares.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">暂无分享链接</p>
              ) : (
                shares.map((share) => {
                  const shareUrl = `${window.location.origin}/share/doc/${share.share_code}`
                  const isExpired = share.expires_at && new Date(share.expires_at) < new Date()
                  const isExceeded = share.max_views && share.view_count >= share.max_views

                  return (
                    <div
                      key={share.id}
                      className={cn(
                        'p-3 border border-border rounded-lg',
                        (!share.is_active || isExpired || isExceeded) && 'opacity-50'
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-xs">
                          {share.share_type === 'public' && (
                            <span className="flex items-center gap-1 text-green-600">
                              <Share2 className="h-3 w-3" /> 公开链接
                            </span>
                          )}
                          {(share.share_type === 'password' || share.share_type === 'password_time') && (
                            <span className="flex items-center gap-1 text-orange-600">
                              <Lock className="h-3 w-3" /> 密码保护
                            </span>
                          )}
                          {(share.share_type === 'time_limited' || share.share_type === 'password_time') && (
                            <span className="flex items-center gap-1 text-blue-600">
                              <Clock className="h-3 w-3" /> {isExpired ? '已过期' : '限时'}
                            </span>
                          )}
                          {share.allow_edit && (
                            <span className="text-primary">可编辑</span>
                          )}
                          <span className="text-muted-foreground">
                            浏览 {share.view_count} 次
                            {share.max_views && ` / ${share.max_views}`}
                          </span>
                        </div>
                        {share.is_active && !isExpired && !isExceeded && (
                          <button
                            onClick={() => handleRevoke(share.id)}
                            className="text-xs text-destructive hover:underline"
                          >
                            撤销
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Input value={shareUrl} readOnly className="flex-1 text-xs h-8" />
                        <Button size="sm" variant="outline" onClick={() => handleCopy(shareUrl)} className="h-8">
                          复制
                        </Button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
