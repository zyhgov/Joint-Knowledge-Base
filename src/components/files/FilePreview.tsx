import React, { useState, useEffect } from 'react'
import { JkbFile } from '@/types/files'
import { cn } from '@/lib/utils'
import { isImageFile, isPreviewableInIframe, isOfficePreviewable, getFileIconConfig } from './FileIcon'
import MediaPlayer from './MediaPlayer'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowPathIcon,
  EyeIcon,
  DocumentTextIcon,
  CalendarDaysIcon,
  UserIcon,
  TagIcon,
  FolderIcon,
  InformationCircleIcon,
  LockClosedIcon,
  GlobeAltIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import UserAvatar from '@/components/common/UserAvatar'
import { JkbWorkspace } from '@/types/files'

// 文件大小格式化
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// 文本文件编码尝试
const tryDecodeText = async (url: string): Promise<string> => {
  const encodings = ['utf-8', 'gbk', 'gb2312', 'big5', 'iso-8859-1']
  for (const encoding of encodings) {
    try {
      const response = await fetch(url)
      const buffer = await response.arrayBuffer()
      const decoder = new TextDecoder(encoding)
      const text = decoder.decode(buffer)
      // 简单检测是否包含乱码特征
      if (!text.includes('\ufffd') && text.length > 0) {
        return text
      }
    } catch {
      continue
    }
  }
  // 默认返回 utf-8
  const response = await fetch(url)
  return response.text()
}

interface FilePreviewProps {
  file: JkbFile
  onClose: () => void
  onDownload?: (file: JkbFile) => void
  workspaces?: JkbWorkspace[]
}

export default function FilePreview({ file, onClose, onDownload, workspaces = [] }: FilePreviewProps) {
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [loadingText, setLoadingText] = useState(false)
  const [mediaPlayerOpen, setMediaPlayerOpen] = useState(false)
  const isImage = isImageFile(file.file_ext)
  const isIframe = isPreviewableInIframe(file.file_ext)
  const isOffice = isOfficePreviewable(file.file_ext)
  const fileExt = (file.file_ext || '').toLowerCase().replace('.', '')
  const isTextFile = ['txt', 'log', 'csv'].includes(fileExt)
  const isMarkdownFile = ['md', 'markdown'].includes(fileExt)
  const isVideo = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogg'].includes(fileExt)
  const isAudio = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma'].includes(fileExt)

  const handleZoomIn = () => setZoom(Math.min(300, zoom + 25))
  const handleZoomOut = () => setZoom(Math.max(25, zoom - 25))
  const handleRotate = () => setRotation((rotation + 90) % 360)

  // 加载文本文件内容
  useEffect(() => {
    if ((isTextFile || isMarkdownFile) && !textContent) {
      setLoadingText(true)
      tryDecodeText(file.public_url)
        .then((text) => {
          setTextContent(text)
        })
        .catch(() => {
          setTextContent('无法加载文件内容')
        })
        .finally(() => {
          setLoadingText(false)
        })
    }
  }, [file.public_url, isTextFile, isMarkdownFile])

  return (
    <div className="fixed inset-0 z-50 flex h-screen">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* 主内容区 */}
      <div className="relative flex-1 flex flex-col min-w-0">
        {/* 顶部操作栏 */}
        <div className="flex items-center justify-between px-4 py-3 bg-card/95 backdrop-blur-sm border-b border-border z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn('rounded-lg flex items-center justify-center w-8 h-8 flex-shrink-0', getFileIconConfig(file.file_ext).bgColor)}>
              {getFileIconConfig(file.file_ext).icon}
            </div>
            <div className="min-w-0">
              <h3 className="font-medium text-sm text-foreground truncate max-w-md">
                {file.display_name}
              </h3>
              <p className="text-xs text-muted-foreground">
                {getFileIconConfig(file.file_ext).label} · {formatFileSize(file.file_size)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {/* 图片操作按钮 */}
            {isImage && (
              <>
                <button onClick={handleZoomOut} className="p-2 hover:bg-accent rounded-lg transition-colors" title="缩小">
                  <MagnifyingGlassMinusIcon className="h-4 w-4 text-foreground" />
                </button>
                <span className="text-xs text-muted-foreground min-w-[3rem] text-center">{zoom}%</span>
                <button onClick={handleZoomIn} className="p-2 hover:bg-accent rounded-lg transition-colors" title="放大">
                  <MagnifyingGlassPlusIcon className="h-4 w-4 text-foreground" />
                </button>
                <button onClick={handleRotate} className="p-2 hover:bg-accent rounded-lg transition-colors" title="旋转">
                  <ArrowPathIcon className="h-4 w-4 text-foreground" />
                </button>
                <div className="w-px h-6 bg-border mx-1" />
              </>
            )}
            {onDownload && (
              <button onClick={() => onDownload(file)} className="p-2 hover:bg-accent rounded-lg transition-colors" title="下载">
                <ArrowDownTrayIcon className="h-4 w-4 text-foreground" />
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-accent rounded-lg transition-colors" title="关闭">
              <XMarkIcon className="h-4 w-4 text-foreground" />
            </button>
          </div>
        </div>

        {/* 预览区域 */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-6">
          {isImage && (
            <img
              src={file.public_url}
              alt={file.display_name}
              className="max-w-full max-h-full object-contain transition-transform duration-200"
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
              }}
            />
          )}

          {isIframe && !isTextFile && !isMarkdownFile && (
            <iframe
              src={file.public_url}
              className="w-full h-full border-0 rounded-lg bg-white"
              title={file.display_name}
            />
          )}

          {isTextFile && !isMarkdownFile && (
            <div className="w-full h-full bg-card rounded-xl border border-border flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                <DocumentTextIcon className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium text-foreground">{file.display_name}</span>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {loadingText ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary mr-2" />
                    加载中...
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap font-mono text-sm text-foreground leading-relaxed">
                    {textContent}
                  </pre>
                )}
              </div>
            </div>
          )}

          {isMarkdownFile && (
            <div className="w-full h-full bg-card rounded-xl border border-border flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                <DocumentTextIcon className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium text-foreground">{file.display_name}</span>
              </div>
              <div className="flex-1 overflow-auto p-6">
                {loadingText ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary mr-2" />
                    加载中...
                  </div>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {textContent || ''}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          )}

          {isOffice && (
            <div className="w-full h-full bg-card rounded-xl border border-border flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                <DocumentTextIcon className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium text-foreground">{file.display_name}</span>
              </div>
              <iframe
                src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(file.public_url)}`}
                className="flex-1 w-full border-0"
                title={file.display_name}
              />
            </div>
          )}

          {/* 视频/音频播放 */}
          {(isVideo || isAudio) && (
            <div className="text-center">
              <div className={cn('rounded-2xl flex items-center justify-center w-24 h-24 mx-auto mb-4', getFileIconConfig(file.file_ext).bgColor)}>
                <div className="scale-[3]">{getFileIconConfig(file.file_ext).icon}</div>
              </div>
              <h3 className="font-medium text-foreground mb-1">{file.display_name}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {isVideo ? '视频' : '音频'}文件 · 点击下方按钮播放
              </p>
              <button
                onClick={() => setMediaPlayerOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
                播放{isVideo ? '视频' : '音频'}
              </button>
            </div>
          )}

          {/* 不支持预览（非视频/音频） */}
          {!isImage && !isIframe && !isOffice && !isVideo && !isAudio && (
            <div className="text-center">
              <div className={cn('rounded-2xl flex items-center justify-center w-24 h-24 mx-auto mb-4', getFileIconConfig(file.file_ext).bgColor)}>
                <div className="scale-[3]">{getFileIconConfig(file.file_ext).icon}</div>
              </div>
              <h3 className="font-medium text-foreground mb-1">{file.display_name}</h3>
              <p className="text-sm text-muted-foreground mb-4">此文件格式不支持在线预览</p>
              {onDownload && (
                <button
                  onClick={() => onDownload(file)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 transition-colors"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  下载文件
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 右侧文件详情面板 */}
      <div className="relative w-80 bg-card border-l border-border overflow-y-auto flex-shrink-0">
        <div className="p-5 space-y-5">
          <h4 className="font-semibold text-foreground flex items-center gap-2">
            <InformationCircleIcon className="h-5 w-5 text-primary" />
            文件详情
          </h4>

          {/* 文件图标大号 */}
          <div className="flex justify-center py-4">
            {isImage ? (
              <img
                src={file.thumbnail_url || file.public_url}
                alt={file.display_name}
                className="w-32 h-32 object-cover rounded-xl border border-border"
              />
            ) : (
              <div className={cn('rounded-xl flex items-center justify-center w-24 h-24', getFileIconConfig(file.file_ext).bgColor)}>
                <div className="scale-[3]">{getFileIconConfig(file.file_ext).icon}</div>
              </div>
            )}
          </div>

          {/* 详情列表 */}
          <div className="space-y-3">
            <DetailRow icon={<DocumentTextIcon className="h-4 w-4" />} label="文件名" value={file.display_name} />
            <DetailRow icon={<FolderIcon className="h-4 w-4" />} label="类型" value={`${getFileIconConfig(file.file_ext).label} (${file.file_ext?.toUpperCase() || '未知'})`} />
            <DetailRow icon={<InformationCircleIcon className="h-4 w-4" />} label="大小" value={formatFileSize(file.file_size)} />
            <DetailRow icon={<UserIcon className="h-4 w-4" />} label="上传者" value={file.uploader?.display_name || '未知'} />
            {file.uploader?.department_id && (
              <DetailRow icon={<FolderIcon className="h-4 w-4" />} label="所属部门" value={file.uploader_department?.name || '未设置'} />
            )}
            <DetailRow icon={<CalendarDaysIcon className="h-4 w-4" />} label="上传时间" value={new Date(file.created_at).toLocaleString('zh-CN')} />
            {file.expires_at && (
              <DetailRow 
                icon={<CalendarDaysIcon className="h-4 w-4" />} 
                label="过期时间" 
                value={new Date(file.expires_at).toLocaleString('zh-CN')}
                valueClassName={new Date(file.expires_at) < new Date() ? 'text-destructive' : 'text-warning'}
              />
            )}
            <DetailRow icon={<EyeIcon className="h-4 w-4" />} label="浏览次数" value={`${file.view_count} 次`} />
            <DetailRow icon={<ArrowDownTrayIcon className="h-4 w-4" />} label="下载次数" value={`${file.download_count} 次`} />
          </div>

          {/* 访问权限 */}
          <div className="pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <ShieldCheckIcon className="h-3.5 w-3.5" /> 访问权限
            </p>
            <div className="flex items-center gap-2">
              {file.access_level === 'public' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                  <GlobeAltIcon className="h-3 w-3" /> 所有人可见
                </span>
              )}
              {file.access_level === 'workspace' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                  <FolderIcon className="h-3 w-3" /> 指定工作区
                </span>
              )}
              {file.access_level === 'department' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400">
                  <LockClosedIcon className="h-3 w-3" /> 指定部门
                </span>
              )}
              {file.access_level === 'private' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400">
                  <LockClosedIcon className="h-3 w-3" /> 仅自己可见
                </span>
              )}
            </div>
          </div>

          {/* 关联工作区 */}
          {file.workspace_ids && file.workspace_ids.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <FolderIcon className="h-3.5 w-3.5" /> 所属工作区
              </p>
              <div className="flex flex-wrap gap-1.5">
                {file.workspace_ids.map((wsId) => {
                  const ws = workspaces.find((w) => w.id === wsId)
                  return ws ? (
                    <span key={wsId} className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-muted text-muted-foreground">
                      {ws.name}
                    </span>
                  ) : null
                })}
              </div>
            </div>
          )}

          {/* 过期时间状态 */}
          {file.expires_at && (
            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <CalendarDaysIcon className="h-3.5 w-3.5" /> 过期状态
              </p>
              {new Date(file.expires_at) < new Date() ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-destructive/10 text-destructive">
                  已过期
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
                  有效（{new Date(file.expires_at).toLocaleString('zh-CN')}）
                </span>
              )}
            </div>
          )}

          {/* 描述 */}
          {file.description && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">描述</p>
              <p className="text-sm text-foreground">{file.description}</p>
            </div>
          )}

          {/* 标签 */}
          {file.tags.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <TagIcon className="h-3.5 w-3.5" /> 标签
              </p>
              <div className="flex flex-wrap gap-1.5">
                {file.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-primary/10 text-primary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 上传者信息 */}
          {file.uploader && (
            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">上传者信息</p>
              <div className="flex items-center gap-3">
                <UserAvatar
                  avatarUrl={file.uploader.avatar_url}
                  displayName={file.uploader.display_name}
                  size="sm"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">{file.uploader.display_name}</p>
                  {file.uploader.department_id && (
                    <p className="text-xs text-muted-foreground">
                      部门：{file.uploader_department?.name || '未设置'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 媒体播放器 */}
      {mediaPlayerOpen && (isVideo || isAudio) && (
        <MediaPlayer
          src={file.public_url}
          title={file.display_name}
          type={isVideo ? 'video' : 'audio'}
          onClose={() => setMediaPlayerOpen(false)}
        />
      )}
    </div>
  )
}

function DetailRow({ icon, label, value, valueClassName }: { icon: React.ReactNode; label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-muted-foreground mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-sm break-all', valueClassName || 'text-foreground')}>{value}</p>
      </div>
    </div>
  )
}
