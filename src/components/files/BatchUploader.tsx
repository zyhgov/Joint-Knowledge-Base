import React, { useState, useRef, useCallback } from 'react'
import { fileService } from '@/services/fileService'
import { useAuthStore } from '@/store/authStore'
import { UploadTask, JkbFolder } from '@/types/files'
import { JkbWorkspace } from '@/types/files'
import { toast } from 'react-hot-toast'
import {
  CloudArrowUpIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  DocumentIcon,
  PhotoIcon,
  VideoCameraIcon,
  MusicalNoteIcon,
  PaperClipIcon,
  FolderIcon,
  LinkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { renderWorkspaceIcon } from '@/components/common/IconPicker'

// 文件大小格式化
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// 文件类型图标
const FileTypeIcon = ({ category }: { category: string }) => {
  const classes = "h-8 w-8"
  switch (category) {
    case 'image': return <PhotoIcon className={cn(classes, 'text-green-500')} />
    case 'video': return <VideoCameraIcon className={cn(classes, 'text-purple-500')} />
    case 'audio': return <MusicalNoteIcon className={cn(classes, 'text-pink-500')} />
    case 'document': return <DocumentIcon className={cn(classes, 'text-blue-500')} />
    default: return <PaperClipIcon className={cn(classes, 'text-gray-500')} />
  }
}

// 压缩策略类型
type CompressMode = 'lossy' | 'lossless' | 'original'

interface BatchUploaderProps {
  workspaces: JkbWorkspace[]
  folders: JkbFolder[]
  currentFolderId: string | null
  onUploadComplete: () => void
  onClose: () => void
}

// 图片压缩并转换为 AVIF
async function compressAndConvertToAvif(file: File, quality: number = 0.8): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('无法创建 Canvas')); return }
      ctx.drawImage(img, 0, 0)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            canvas.toBlob(
              (webpBlob) => {
                if (!webpBlob) { reject(new Error('图片压缩失败')); return }
                resolve(new File([webpBlob], file.name.replace(/\.[^/.]+$/, '.webp'), { type: 'image/webp', lastModified: Date.now() }))
              },
              'image/webp', quality
            )
            return
          }
          resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '.avif'), { type: 'image/avif', lastModified: Date.now() }))
        },
        'image/avif', quality
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')) }
    img.src = url
  })
}

// 无损转换为 WebP
async function losslessConvertToWebp(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('无法创建 Canvas')); return }
      ctx.drawImage(img, 0, 0)
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('无损转换失败')); return }
          resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '.webp'), { type: 'image/webp', lastModified: Date.now() }))
        },
        'image/webp', 1.0
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')) }
    img.src = url
  })
}

export default function BatchUploader({
  workspaces,
  folders,
  currentFolderId,
  onUploadComplete,
  onClose,
}: BatchUploaderProps) {
  const { user } = useAuthStore()
  const [tasks, setTasks] = useState<UploadTask[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  // 压缩策略
  const [compressMode, setCompressMode] = useState<CompressMode>('lossy')

  // 上传位置
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(currentFolderId)
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  // 全局标签和工作区
  const [globalTags, setGlobalTags] = useState<string[]>([])
  const [globalWorkspaceIds, setGlobalWorkspaceIds] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [globalAccessLevel, setGlobalAccessLevel] = useState<'public' | 'workspace' | 'department' | 'private'>('public')
  const [globalVisibleDepartmentIds, setGlobalVisibleDepartmentIds] = useState<string[]>([])
  const [globalVisibleWorkspaceIds, setGlobalVisibleWorkspaceIds] = useState<string[]>([])
  const [globalExpiresAt, setGlobalExpiresAt] = useState<string>('')

  // 添加文件
  const addFiles = useCallback((files: File[]) => {
    const newTasks: UploadTask[] = files.map((file) => ({
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      file,
      status: 'pending' as const,
      progress: 0,
      display_name: file.name.replace(/\.[^/.]+$/, ''),
      description: '',
      tags: [...globalTags],
      workspace_ids: [...globalWorkspaceIds],
    }))
    setTasks((prev) => [...prev, ...newTasks])
  }, [globalTags, globalWorkspaceIds])

  // 拖拽处理
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  // 粘贴处理
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile()
        if (file) files.push(file)
      }
    }
    if (files.length > 0) addFiles(files)
  }, [addFiles])

  // 更新/移除任务
  const updateTask = (id: string, updates: Partial<UploadTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)))
  }
  const removeTask = (id: string) => setTasks((prev) => prev.filter((t) => t.id !== id))

  // 保存链接资源
  const handleSaveLink = async () => {
    if (!linkUrl.trim() || !user) return
    try {
      const url = linkUrl.trim()
      // 解析链接获取文件类型
      const urlPath = new URL(url).pathname
      const ext = urlPath.split('.').pop()?.toLowerCase() || ''
      let category = 'file'
      let mimeType = 'application/octet-stream'
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp'].includes(ext)) {
        category = 'image'; mimeType = `image/${ext === 'svg' ? 'svg+xml' : ext}`
      } else if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
        category = 'video'; mimeType = `video/${ext}`
      } else if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) {
        category = 'audio'; mimeType = `audio/${ext}`
      } else if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'].includes(ext)) {
        category = 'document'; mimeType = 'application/octet-stream'
      }

      const fileName = urlPath.split('/').pop() || `link-resource-${Date.now()}.${ext || 'bin'}`
      await fileService.uploadLinkResource({
        url,
        display_name: fileName.replace(/\.[^/.]+$/, ''),
        category,
        mime_type: mimeType,
        file_ext: `.${ext}`,
        tags: globalTags,
        workspace_ids: globalWorkspaceIds,
        userId: user.id,
        folder_id: selectedFolderId,
        access_level: globalAccessLevel,
        visible_department_ids: globalVisibleDepartmentIds,
        visible_workspace_ids: globalVisibleWorkspaceIds,
        expires_at: globalExpiresAt ? new Date(globalExpiresAt).toISOString() : null,
      })
      toast.success('链接资源已保存')
      setLinkUrl('')
      setShowLinkInput(false)
      onUploadComplete()
    } catch (err: any) {
      toast.error(err.message || '保存链接失败')
    }
  }

  // 开始上传
  const handleUpload = async () => {
    if (!user || tasks.length === 0) return
    const pendingTasks = tasks.filter((t) => t.status === 'pending')
    if (pendingTasks.length === 0) { toast.error('没有待上传的文件'); return }
    setUploading(true)

    for (const task of pendingTasks) {
      updateTask(task.id, { status: 'uploading', progress: 0 })
      try {
        let uploadFile = task.file
        // 图片处理策略
        if (task.file.type.startsWith('image/')) {
          if (compressMode === 'lossy') {
            try {
              updateTask(task.id, { progress: 10 })
              const compressed = await compressAndConvertToAvif(task.file, 0.8)
              uploadFile = compressed
            } catch (e) {
              console.warn('有损压缩失败，使用原文件:', e)
            }
          } else if (compressMode === 'lossless') {
            try {
              updateTask(task.id, { progress: 10 })
              const converted = await losslessConvertToWebp(task.file)
              uploadFile = converted
            } catch (e) {
              console.warn('无损转换失败，使用原文件:', e)
            }
          }
          // original 不做任何处理
        }

        const result = await fileService.uploadFile(uploadFile, {
          display_name: task.display_name,
          description: task.description,
          tags: task.tags,
          workspace_ids: task.workspace_ids,
          userId: user.id,
          folder_id: selectedFolderId,
          access_level: globalAccessLevel,
          visible_department_ids: globalVisibleDepartmentIds,
          visible_workspace_ids: globalVisibleWorkspaceIds,
          expires_at: globalExpiresAt ? new Date(globalExpiresAt).toISOString() : null,
          onProgress: (progress) => updateTask(task.id, { progress }),
        })
        updateTask(task.id, { status: 'success', progress: 100, result })
      } catch (error: any) {
        updateTask(task.id, { status: 'error', error: error.message })
      }
    }

    setUploading(false)
    const successCount = tasks.filter((t) => t.status === 'success').length
    const errorCount = tasks.filter((t) => t.status === 'error').length
    if (successCount > 0) { toast.success(`${successCount} 个文件上传成功`); onUploadComplete() }
    if (errorCount > 0) toast.error(`${errorCount} 个文件上传失败`)
  }

  const pendingCount = tasks.filter((t) => t.status === 'pending').length
  const successCount = tasks.filter((t) => t.status === 'success').length
  const errorCount = tasks.filter((t) => t.status === 'error').length
  const hasImages = tasks.some((t) => t.file.type.startsWith('image/'))

  // 压缩策略配置
  const compressTabs: { key: CompressMode; label: string; desc: string }[] = [
    { key: 'lossy', label: '有损优化', desc: '压缩为 AVIF 格式，节省占用' },
    { key: 'lossless', label: '无损转换', desc: '无损转换为 WebP' },
    { key: 'original', label: '保留原片', desc: '以原始格式上传，不做处理' },
  ]

  return (
    <div className="flex flex-col h-full max-h-[85vh]" onPaste={handlePaste}>
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <h2 className="text-lg font-semibold text-foreground">上传文件</h2>
        <button onClick={onClose} className="p-2 hover:bg-accent rounded-lg transition-colors">
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* 压缩策略选项卡 */}
        {hasImages && (
          <div>
            <Label className="mb-2">图片压缩策略</Label>
            <div className="flex gap-1 p-1 bg-muted rounded-xl">
              {compressTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setCompressMode(tab.key)}
                  className={cn(
                    'flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all',
                    compressMode === tab.key
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  <div>{tab.label}</div>
                  <div className={cn(
                    'text-xs mt-0.5',
                    compressMode === tab.key ? 'text-primary-foreground/70' : 'text-muted-foreground/60'
                  )}>
                    {tab.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 上传位置设置 */}
        <div className="space-y-3">
          <Label>上传位置</Label>

          {/* 外部链接 */}
          <div className="border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => setShowLinkInput(!showLinkInput)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <LinkIcon className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">外部链接</span>
              </div>
              {showLinkInput ? <ChevronUpIcon className="h-4 w-4 text-muted-foreground" /> : <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showLinkInput && (
              <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  支持 PNG、JPG、MP3、MP4、WebM 等直链资源
                </p>
                <div className="flex gap-2">
                  <Input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="输入资源链接，如 https://example.com/video.mp4"
                    className="flex-1 h-9 text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveLink()}
                  />
                  <Button size="sm" onClick={handleSaveLink} disabled={!linkUrl.trim()}>
                    保存
                  </Button>
                </div>
                {/* 链接格式提示 */}
                <div className="flex flex-wrap gap-1.5">
                  {['PNG', 'JPG', 'GIF', 'MP3', 'WAV', 'MP4', 'WebM', 'PDF'].map((fmt) => (
                    <span key={fmt} className="px-1.5 py-0.5 bg-muted rounded text-xs text-muted-foreground">
                      {fmt}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 目标文件夹 */}
          <div className="border border-border rounded-xl px-4 py-3">
            <div className="flex items-center gap-2.5">
              <FolderIcon className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">目标文件夹</span>
            </div>
            <div className="mt-2">
              <select
                value={selectedFolderId || ''}
                onChange={(e) => setSelectedFolderId(e.target.value || null)}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              >
                <option value="">根目录（未分类）</option>
                {folders.filter(f => !f.is_archived).map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.parent_id ? '  └ ' : ''}{folder.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 拖拽上传区 */}
        <div
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-accent/30'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <ArrowUpTrayIcon className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-foreground font-medium">
            拖拽、粘贴文件到此处，或点击选择
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            支持 JPG、PNG、GIF、WebP、AVIF、MP4、MP3、PDF 等格式
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}>
              选择文件
            </Button>
            <Button variant="outline" size="sm" onClick={(e) => {
              e.stopPropagation()
              if (folderInputRef.current) {
                folderInputRef.current.setAttribute('webkitdirectory', '')
                folderInputRef.current.setAttribute('directory', '')
                folderInputRef.current.click()
              }
            }}>
              <FolderIcon className="h-4 w-4 mr-1.5" />
              选择文件夹
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = '' }}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = '' }}
          />
        </div>

        {/* 文件列表 */}
        {tasks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>待上传文件（{tasks.length}）</Label>
              {tasks.length > 0 && (
                <button
                  onClick={() => setTasks([])}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  清空
                </button>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1.5 border border-border rounded-xl p-2">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent/50 transition-colors">
                  <FileTypeIcon category={fileService.getCategory(task.file)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{task.display_name || task.file.name}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">{formatFileSize(task.file.size)}</p>
                      {task.status === 'uploading' && (
                        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${task.progress}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {task.status === 'success' && <CheckCircleIcon className="h-4 w-4 text-green-500" />}
                    {task.status === 'error' && <ExclamationCircleIcon className="h-4 w-4 text-destructive" />}
                    {task.status === 'pending' && (
                      <button onClick={() => removeTask(task.id)} className="p-0.5 hover:text-destructive transition-colors">
                        <XMarkIcon className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 标签和工作区快捷设置 */}
        {tasks.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            {/* 工作区 */}
            <div>
              <Label className="text-xs">可用工作区</Label>
              <div className="mt-1.5 space-y-1 max-h-32 overflow-y-auto border border-border rounded-lg p-2">
                {workspaces.map((ws) => (
                  <label key={ws.id} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-accent text-xs">
                    <input
                      type="checkbox"
                      checked={globalWorkspaceIds.includes(ws.id)}
                      onChange={(e) => setGlobalWorkspaceIds(e.target.checked ? [...globalWorkspaceIds, ws.id] : globalWorkspaceIds.filter(id => id !== ws.id))}
                      className="rounded"
                    />
                    <div className="w-4 h-4 rounded flex-shrink-0">{renderWorkspaceIcon(ws.icon)}</div>
                    {ws.name}
                  </label>
                ))}
              </div>
            </div>
            {/* 标签 */}
            <div>
              <Label className="text-xs">标签</Label>
              <div className="mt-1.5 flex flex-wrap gap-1 mb-1.5">
                {globalTags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">
                    {tag}
                    <button onClick={() => setGlobalTags(globalTags.filter(t => t !== tag))} className="hover:text-destructive">&times;</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="输入标签回车"
                  className="flex-1 h-7 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && tagInput.trim()) {
                      if (!globalTags.includes(tagInput.trim())) setGlobalTags([...globalTags, tagInput.trim()])
                      setTagInput('')
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="flex-shrink-0 px-6 py-4 border-t border-border flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {pendingCount > 0 && <span>{pendingCount} 个文件待上传</span>}
          {successCount > 0 && <span className="text-green-500 ml-2">{successCount} 成功</span>}
          {errorCount > 0 && <span className="text-destructive ml-2">{errorCount} 失败</span>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { onClose(); if (successCount > 0) onUploadComplete() }} disabled={uploading}>
            {successCount === tasks.length && tasks.length > 0 ? '完成' : '取消'}
          </Button>
          <Button onClick={handleUpload} disabled={uploading || pendingCount === 0}>
            {uploading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                上传中...
              </span>
            ) : (
              `开始上传${pendingCount > 0 ? ` (${pendingCount})` : ''}`
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
