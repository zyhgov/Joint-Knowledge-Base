import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/store/authStore'
import { departmentService } from '@/services/departmentService'
import CollabProvider from '@/components/editor/CollabProvider'
import TipTapEditor from '@/components/editor/TipTapEditor'
import DocumentShare from './DocumentShare'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Save, Share2, Users, Clock, KeyRound, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { isAdmin, getAllDepartmentIdsWithAncestors } from '@/utils/permission'

interface DocumentPageProps {
  docId: string
}

export default function DocumentEditor({ docId }: DocumentPageProps) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  // 权限相关
  const [accessDenied, setAccessDenied] = useState<string | null>(null)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [docPassword, setDocPassword] = useState<string | null>(null)
  const [docAccessLevel, setDocAccessLevel] = useState<string | null>(null)
  const [docCreatedBy, setDocCreatedBy] = useState<string | null>(null)
  const [visibleDeptIds, setVisibleDeptIds] = useState<string[]>([])
  const [visibleWsIds, setVisibleWsIds] = useState<string[]>([])
  const [passwordVerified, setPasswordVerified] = useState(false)

  // 检查访问权限
  const checkAccess = useCallback(async () => {
    if (!user) {
      setAccessDenied('请先登录')
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('jkb_documents')
        .select('id, title, workspace_id, created_by, updated_at, access_level, visible_department_ids, visible_workspace_ids, password')
        .eq('id', docId)
        .single()

      if (error) throw error
      if (!data) {
        setAccessDenied('文档不存在')
        setLoading(false)
        return
      }

      setTitle(data.title || '')
      if (data.updated_at) setLastSaved(new Date(data.updated_at))

      // 保存文档权限信息
      setDocPassword(data.password)
      setDocAccessLevel(data.access_level)
      setDocCreatedBy(data.created_by)
      setVisibleDeptIds(data.visible_department_ids || [])
      setVisibleWsIds(data.visible_workspace_ids || [])

      // 创建者始终可访问
      if (data.created_by === user.id) {
        // 即使有密码，创建者也不需要输入
        setLoading(false)
        return
      }

      // 管理员始终可访问
      if (isAdmin(user)) {
        setLoading(false)
        return
      }

      // 检查访问级别
      const level = data.access_level || 'public'
      if (level === 'public') {
        // 公开文档，通过
      } else if (level === 'private') {
        setAccessDenied('此文档为私密文档，仅创建者可访问')
        setLoading(false)
        return
      } else if (level === 'department') {
        const deptIds = data.visible_department_ids || []
        if (deptIds.length > 0) {
          const userDepts = await departmentService.getUserDepartments(user.id)
          const allDepts = await departmentService.getAllDepartments()
          const userAllDeptIds = getAllDepartmentIdsWithAncestors(
            userDepts.map(ud => ud.department.id),
            allDepts
          )
          if (!userAllDeptIds.some(id => deptIds.includes(id))) {
            setAccessDenied('您没有权限访问此文档')
            setLoading(false)
            return
          }
        }
      } else if (level === 'workspace') {
        const wsIds = data.visible_workspace_ids || []
        if (wsIds.length > 0) {
          const { data: wsData } = await supabase
            .from('jkb_workspaces')
            .select('id, is_public, department_ids')
            .in('id', wsIds)
          const accessible = (wsData || []).some(ws => {
            if (ws.is_public) return true
            if (ws.department_ids?.length > 0) {
              const userDepts = departmentService.getUserDepartments(user.id)
              return true // 简化判断，实际会异步获取
            }
            return false
          })
          if (!accessible) {
            // 更精确的异步判断
            const userDepts = await departmentService.getUserDepartments(user.id)
            const allDepts = await departmentService.getAllDepartments()
            const userAllDeptIds = getAllDepartmentIdsWithAncestors(
              userDepts.map(ud => ud.department.id),
              allDepts
            )
            const reallyAccessible = (wsData || []).some((ws: any) => {
              if (ws.is_public) return true
              if (ws.department_ids?.some((dId: string) => userAllDeptIds.includes(dId))) return true
              return false
            })
            if (!reallyAccessible) {
              setAccessDenied('您没有权限访问此文档')
              setLoading(false)
              return
            }
          }
        }
      }

      // 密码检查
      if (data.password) {
        setNeedsPassword(true)
        setLoading(false)
        return
      }

      setLoading(false)
    } catch (err) {
      console.error('加载文档失败:', err)
      setAccessDenied('文档不存在或无权访问')
      setLoading(false)
    }
  }, [docId, user, navigate])

  useEffect(() => {
    checkAccess()
  }, [checkAccess])

  // 密码验证
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (passwordInput === docPassword) {
      setPasswordVerified(true)
      setNeedsPassword(false)
    } else {
      toast.error('密码错误，请重试')
    }
  }

  // 保存文档（标题 + updated_at）
  const saveDocument = useCallback(async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('jkb_documents')
        .update({
          title: title.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', docId)
      if (error) throw error
      setLastSaved(new Date())
    } catch (err) {
      console.error('保存失败:', err)
      throw err
    } finally {
      setSaving(false)
    }
  }, [title, docId])

  // 自动保存（标题失焦时）
  const handleTitleBlur = useCallback(() => {
    if (title.trim()) {
      saveDocument().catch(() => {})
    }
  }, [title, saveDocument])

  // 标题变更时延迟自动保存
  const handleTitleChange = useCallback((value: string) => {
    setTitle(value)
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      if (value.trim()) {
        supabase
          .from('jkb_documents')
          .update({ title: value.trim(), updated_at: new Date().toISOString() })
          .eq('id', docId)
          .then(({ error }) => {
            if (!error) setLastSaved(new Date())
          })
      }
    }, 1500)
  }, [docId])

  // 手动保存（Ctrl+S / 点击保存按钮）
  const handleSave = useCallback(async () => {
    try {
      await saveDocument()
      toast.success('已保存')
    } catch {
      toast.error('保存失败')
    }
  }, [saveDocument])

  // 格式化时间
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  // 加载中
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="animate-spin h-6 w-6 border-b-2 border-primary rounded-full" />
      </div>
    )
  }

  // 无权限
  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <Lock className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">无法访问</h2>
        <p className="text-muted-foreground">{accessDenied}</p>
        <Button variant="outline" onClick={() => navigate('/documents')}>
          返回文档列表
        </Button>
      </div>
    )
  }

  // 密码验证页
  if (needsPassword && !passwordVerified) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <KeyRound className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">受密码保护的文档</h2>
        <p className="text-muted-foreground text-sm">请输入密码以访问此文档</p>
        <form onSubmit={handlePasswordSubmit} className="w-full max-w-sm space-y-3">
          <Input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="请输入文档密码"
            autoFocus
            autoComplete="off"
          />
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              验证密码
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/documents')}>
              返回
            </Button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部栏 - 精简 */}
      <div className="flex items-center h-12 px-4 border-b bg-background shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="mr-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate('/documents')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <Input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          onBlur={handleTitleBlur}
          className="flex-1 max-w-sm border-none shadow-none text-base font-medium focus-visible:ring-0 px-2"
          placeholder="无标题文档"
        />

        <div className="flex items-center gap-2 ml-auto">
          {lastSaved && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {saving ? '保存中...' : `${formatTime(lastSaved)} 已保存`}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="text-muted-foreground hover:text-foreground"
          >
            <Save className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="分享"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setShareOpen(true)}
          >
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 协作编辑器 */}
      <div className="flex-1 overflow-hidden">
        <CollabProvider docKey={`doc-${docId}`}>
          {({ doc, provider, users, connectionStatus }) => (
            <TipTapEditor
              doc={doc}
              provider={provider}
              users={users}
              connectionStatus={connectionStatus}
              onSave={handleSave}
              docTitle={title}
            />
          )}
        </CollabProvider>
      </div>

      {/* 分享弹窗 */}
      <DocumentShare docId={docId} open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  )
}

// 路由参数包装器
export function DocumentEditorWrapper() {
  const { docId } = useParams<{ docId: string }>()
  if (!docId) {
    return <div className="p-6 text-muted-foreground">文档ID缺失</div>
  }
  return <DocumentEditor docId={docId} />
}
