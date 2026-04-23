import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fileService } from '@/services/fileService'
import { JkbFile } from '@/types/files'
import { isImageFile, getFileIconConfig } from '@/components/files/FileIcon'
import { ArrowDownTrayIcon, LockClosedIcon, EyeIcon, ClockIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

export default function FileShareView() {
  const { shareCode } = useParams<{ shareCode: string }>()
  const navigate = useNavigate()
  const [file, setFile] = useState<JkbFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [needPassword, setNeedPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    if (!shareCode) {
      setError('无效的分享链接')
      setLoading(false)
      return
    }
    // 先尝试无密码访问
    verifyAndLoad()
  }, [shareCode])

  const verifyAndLoad = async (pwd?: string) => {
    if (!shareCode) return
    setVerifying(true)
    try {
      const result = await fileService.verifyShare(shareCode, pwd)
      if (result.valid && result.file) {
        setFile(result.file)
        setError('')
        setNeedPassword(false)
      } else {
        if (result.error === '密码错误') {
          setNeedPassword(true)
          if (pwd) setError('密码错误，请重试')
        } else {
          setError(result.error || '分享链接无效')
        }
      }
    } catch {
      setError('加载失败，请稍后重试')
    } finally {
      setLoading(false)
      setVerifying(false)
    }
  }

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return
    verifyAndLoad(password.trim())
  }

  const handleDownload = () => {
    if (!file) return
    const a = document.createElement('a')
    a.href = file.public_url
    a.download = file.display_name || file.original_name
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const fileExt = (file?.file_ext || '').toLowerCase().replace('.', '')
  const isImage = file ? isImageFile(file.file_ext) : false
  const isVideo = ['mp4', 'webm', 'mov', 'ogg'].includes(fileExt)
  const isAudio = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma'].includes(fileExt)

  // 加载中
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  // 密码输入
  if (needPassword && !file) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center shadow-lg">
          <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
            <LockClosedIcon className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">需要访问密码</h2>
          <p className="text-sm text-muted-foreground mb-6">此分享链接设置了密码保护</p>
          {error && <p className="text-sm text-destructive mb-4">{error}</p>}
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入访问密码"
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              autoFocus
            />
            <button
              type="submit"
              disabled={verifying || !password.trim()}
              className="w-full h-10 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {verifying ? '验证中...' : '确认访问'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // 错误状态
  if (error && !file) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center shadow-lg">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <EyeIcon className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">无法访问</h2>
          <p className="text-sm text-muted-foreground mb-6">{error}</p>
          <button
            onClick={() => window.location.href = '/login'}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
          >
            返回首页
          </button>
        </div>
      </div>
    )
  }

  // 错误页面
  if (!file) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center shadow-lg">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <EyeIcon className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">分享链接无效</h2>
          <p className="text-sm text-muted-foreground mb-6">{error || '该分享链接不存在或已失效'}</p>
          <button
            onClick={() => window.location.href = '/login'}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
          >
            返回首页
          </button>
        </div>
      </div>
    )
  }

  // 文件预览页面
  return (
    <div className="min-h-screen bg-background">
      {/* 顶部栏 */}
      <div className="bg-card border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', getFileIconConfig(file.file_ext).bgColor)}>
            <div className="scale-150">{getFileIconConfig(file.file_ext).icon}</div>
          </div>
          <div>
            <h1 className="font-semibold text-foreground text-sm">{file.display_name || file.original_name}</h1>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(file.file_size)} · {file.file_ext?.toUpperCase()} · {formatDate(file.created_at)}
            </p>
          </div>
        </div>
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          下载文件
        </button>
      </div>

      {/* 预览区域 */}
      <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)' }}>
        {isImage && (
          <div className="p-8 max-w-full max-h-full flex items-center justify-center">
            <img
              src={file.public_url}
              alt={file.display_name}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-lg"
            />
          </div>
        )}

        {isVideo && (
          <div className="p-8 w-full max-w-4xl mx-auto">
            <video
              src={file.public_url}
              controls
              className="w-full rounded-lg shadow-lg"
              style={{ maxHeight: '80vh' }}
            >
              您的浏览器不支持视频播放
            </video>
          </div>
        )}

        {isAudio && (
          <div className="p-8 w-full max-w-lg mx-auto text-center">
            <div className={cn('rounded-2xl flex items-center justify-center w-24 h-24 mx-auto mb-6', getFileIconConfig(file.file_ext).bgColor)}>
              <div className="scale-[3]">{getFileIconConfig(file.file_ext).icon}</div>
            </div>
            <h3 className="font-medium text-foreground mb-4">{file.display_name}</h3>
            <audio
              src={file.public_url}
              controls
              className="w-full"
            >
              您的浏览器不支持音频播放
            </audio>
          </div>
        )}

        {fileExt === 'pdf' && (
          <iframe
            src={file.public_url}
            className="w-full h-full border-0"
            style={{ minHeight: 'calc(100vh - 64px)' }}
            title={file.display_name}
          />
        )}

        {!isImage && !isVideo && !isAudio && fileExt !== 'pdf' && (
          <div className="p-8 text-center">
            <div className={cn('rounded-2xl flex items-center justify-center w-24 h-24 mx-auto mb-4', getFileIconConfig(file.file_ext).bgColor)}>
              <div className="scale-[3]">{getFileIconConfig(file.file_ext).icon}</div>
            </div>
            <h3 className="font-medium text-foreground mb-2">{file.display_name}</h3>
            <p className="text-sm text-muted-foreground mb-6">此文件格式不支持在线预览</p>
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              下载文件
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
