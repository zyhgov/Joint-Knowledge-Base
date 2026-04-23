import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { fileService } from '@/services/fileService'
import { folderService } from '@/services/folderService'
import { workspaceService } from '@/services/workspaceService'
import { departmentService } from '@/services/departmentService'
import { useAuthStore } from '@/store/authStore'
import { JkbFile, JkbFileShare, JkbFolder, FileFilter, ShareType, FileCategory } from '@/types/files'
import { JkbWorkspace } from '@/types/files'
import { JkbDepartment, DepartmentTreeNode } from '@/types/database'
import { toast } from 'react-hot-toast'
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
import BatchUploader from '@/components/files/BatchUploader'
import FilePreview from '@/components/files/FilePreview'
import { FileThumbnail, getFileIconConfig, isImageFile } from '@/components/files/FileIcon'
import { renderWorkspaceIcon } from '@/components/common/IconPicker'
import DepartmentTreeSelector from '@/components/common/DepartmentTreeSelector'
import UserAvatar from '@/components/common/UserAvatar'
import {
  CloudArrowUpIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  DocumentIcon,
  PhotoIcon,
  VideoCameraIcon,
  MusicalNoteIcon,
  PaperClipIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  ShareIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  DocumentDuplicateIcon,
  CheckIcon,
  ClockIcon,
  LockClosedIcon,
  Squares2X2Icon,
  ListBulletIcon,
  FolderIcon,
  FolderPlusIcon,
  ChevronRightIcon,
  HomeIcon,
  ArrowRightIcon,
  FolderOpenIcon,
  NoSymbolIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { FileRowSkeleton, StatCardSkeleton } from '@/components/common/Skeleton'
import { isAdmin, isSuperAdmin, canEditFile, canDeleteFile, canShareFile, canUploadFile, canAccessWorkspace, getAllDepartmentIdsWithAncestors, filterFilesByPermission, filterWorkspacesByPermission, hasPermission, canEditFolder, canDeleteFolder, canCreateFolder } from '@/utils/permission'

// 文件大小格式化
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// 文件类型图标（保留用于旧兼容）
const getCategoryIcon = (category: string) => {
  const classes = "h-5 w-5"
  switch (category) {
    case 'image': return <PhotoIcon className={cn(classes, 'text-green-500')} />
    case 'video': return <VideoCameraIcon className={cn(classes, 'text-purple-500')} />
    case 'audio': return <MusicalNoteIcon className={cn(classes, 'text-pink-500')} />
    case 'document': return <DocumentIcon className={cn(classes, 'text-blue-500')} />
    default: return <PaperClipIcon className={cn(classes, 'text-gray-500')} />
  }
}

export default function FilesPage() {
  const { user, userPermissions } = useAuthStore()
  const [files, setFiles] = useState<JkbFile[]>([])
  const [workspaces, setWorkspaces] = useState<JkbWorkspace[]>([])
  const [departments, setDepartments] = useState<JkbDepartment[]>([])
  const [loading, setLoading] = useState(true)

  // 用户权限相关
  const [userDeptIds, setUserDeptIds] = useState<string[]>([])

  // 文件夹导航
  const [folders, setFolders] = useState<JkbFolder[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState<JkbFolder[]>([])
  const [currentSubFolders, setCurrentSubFolders] = useState<JkbFolder[]>([])

  // 创建文件夹弹窗
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderColor, setNewFolderColor] = useState('#6366f1')

  // 编辑文件夹弹窗
  const [editFolderOpen, setEditFolderOpen] = useState(false)
  const [editingFolder, setEditingFolder] = useState<JkbFolder | null>(null)
  const [editFolderForm, setEditFolderForm] = useState({
    name: '',
    description: '',
    color: '#6366f1',
    access_level: 'public' as 'public' | 'workspace' | 'department' | 'private',
    visible_department_ids: [] as string[],
    visible_workspace_ids: [] as string[],
  })

  // 移动文件弹窗
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [movingFileId, setMovingFileId] = useState<string | null>(null)

  // 过滤器
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<FileCategory | ''>('')
  const [filterWorkspaceId, setFilterWorkspaceId] = useState('')
  const [sortBy, setSortBy] = useState<'created_at' | 'file_size' | 'view_count' | 'display_name'>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // 分页
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // 上传器
  const [uploaderOpen, setUploaderOpen] = useState(false)

  // 编辑文件
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingFile, setEditingFile] = useState<JkbFile | null>(null)
  const [editForm, setEditForm] = useState({
    display_name: '',
    description: '',
    tags: [] as string[],
    workspace_ids: [] as string[],
    access_level: 'public' as 'public' | 'workspace' | 'department' | 'private',
    visible_department_ids: [] as string[],
    visible_workspace_ids: [] as string[],
    expires_at: '' as string,
  })
  const [tagInput, setTagInput] = useState('')

  // 分享弹窗
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [sharingFile, setSharingFile] = useState<JkbFile | null>(null)
  const [shareForm, setShareForm] = useState({
    share_type: 'public' as ShareType,
    password: '',
    expires_at: '',
    max_views: '',
    allow_download: true,
  })
  const [fileShares, setFileShares] = useState<JkbFileShare[]>([])
  const [generatedShareUrl, setGeneratedShareUrl] = useState('')

  const [saving, setSaving] = useState(false)

  // 预览
  const [previewFile, setPreviewFile] = useState<JkbFile | null>(null)

  // 视图模式
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

  // 部门树
  const departmentTree = useMemo(() => departmentService.buildDepartmentTree(departments), [departments])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [filesData, workspacesData, deptsData, foldersData] = await Promise.all([
        fileService.getFiles(),
        workspaceService.getAllWorkspaces(),
        departmentService.getAllDepartments(),
        folderService.getAllFolders(),
      ])
      setFiles(filesData)
      setWorkspaces(workspacesData)
      setDepartments(deptsData)
      setFolders(foldersData)

      // 计算用户部门（含祖先），用于权限判断
      if (user && !isAdmin(user)) {
        try {
          const userDepts = await departmentService.getUserDepartments(user.id)
          const directDeptIds = userDepts.map((d) => d.department.id)
          const allDeptIds = getAllDepartmentIdsWithAncestors(directDeptIds, deptsData)
          setUserDeptIds(allDeptIds)
        } catch {
          setUserDeptIds([])
        }
      } else {
        setUserDeptIds([])
      }
    } catch (error: any) {
      toast.error('加载失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 权限过滤后的文件（仅非管理员用户过滤）
  const permittedFiles = useMemo(() => {
    return filterFilesByPermission(files, user, userDeptIds, workspaces)
  }, [files, user, userDeptIds, workspaces])

  // 权限过滤后的工作区
  const permittedWorkspaces = useMemo(() => {
    return filterWorkspacesByPermission(workspaces, user, userDeptIds)
  }, [workspaces, user, userDeptIds])

  // 前端模糊搜索 + 过滤 + 排序
  const filteredFiles = useMemo(() => {
    let result = [...permittedFiles]

    // 文件夹过滤：当在某个文件夹中时，只显示该文件夹的文件；在根目录时显示所有文件
    if (currentFolderId) {
      result = result.filter((f) => f.folder_id === currentFolderId)
    }
    // 在根目录时不过滤，显示所有文件（包括未分类和属于文件夹的）

    // 模糊搜索
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter((f) =>
        f.display_name.toLowerCase().includes(q) ||
        (f.description || '').toLowerCase().includes(q) ||
        f.tags.some((t) => t.toLowerCase().includes(q)) ||
        (f.uploader?.display_name || '').toLowerCase().includes(q)
      )
    }

    // 类型过滤
    if (filterCategory) {
      result = result.filter((f) => f.category === filterCategory)
    }

    // 工作区过滤
    if (filterWorkspaceId) {
      result = result.filter((f) => f.workspace_ids.includes(filterWorkspaceId))
    }

    // 排序
    result.sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case 'created_at': cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break
        case 'file_size': cmp = (a.file_size || 0) - (b.file_size || 0); break
        case 'view_count': cmp = (a.view_count || 0) - (b.view_count || 0); break
        case 'display_name': cmp = a.display_name.localeCompare(b.display_name); break
      }
      return sortOrder === 'desc' ? -cmp : cmp
    })

    return result
  }, [permittedFiles, searchQuery, filterCategory, filterWorkspaceId, sortBy, sortOrder, currentFolderId])

  // 当前文件夹的子文件夹（按权限过滤）
  const currentSubFoldersMemo = useMemo(() => {
    return folders
      .filter(f => f.parent_id === currentFolderId && !f.is_archived)
      .filter(f => {
        // 管理员和创建者始终可见
        if (isAdmin(user) || f.owner_id === user?.id) return true
        // public 所有人可见
        if (!f.access_level || f.access_level === 'public') return true
        // workspace 权限
        if (f.access_level === 'workspace') {
          if (!f.visible_workspace_ids?.length) return true
          return f.visible_workspace_ids.some(wsId => {
            const ws = workspaces.find(w => w.id === wsId)
            if (!ws) return false
            return canAccessWorkspace(user, ws, userDeptIds)
          })
        }
        // department 权限
        if (f.access_level === 'department') {
          if (!f.visible_department_ids?.length) return true
          return f.visible_department_ids.some(dId => userDeptIds.includes(dId))
        }
        // private 只有创建者可见
        if (f.access_level === 'private') return f.owner_id === user?.id
        return true
      })
  }, [folders, currentFolderId, user, userDeptIds, workspaces])

  // 导航到文件夹
  const navigateToFolder = useCallback(async (folderId: string | null) => {
    setCurrentFolderId(folderId)
    if (folderId) {
      try {
        const path = await folderService.getFolderPath(folderId)
        setFolderPath(path)
      } catch {
        setFolderPath([])
      }
    } else {
      setFolderPath([])
    }
  }, [])

  // 创建文件夹
  const handleCreateFolder = async () => {
    if (!user || !newFolderName.trim()) {
      toast.error('请输入文件夹名称')
      return
    }
    try {
      await folderService.createFolder({
        name: newFolderName.trim(),
        parent_id: currentFolderId,
        owner_id: user.id,
        color: newFolderColor,
      })
      toast.success('文件夹已创建')
      setCreateFolderOpen(false)
      setNewFolderName('')
      setNewFolderColor('#6366f1')
      loadData()
    } catch (error: any) {
      toast.error(error.message || '创建失败')
    }
  }

  // 打开编辑文件夹
  const handleOpenEditFolder = (folder: JkbFolder) => {
    setEditingFolder(folder)
    setEditFolderForm({
      name: folder.name,
      description: folder.description || '',
      color: folder.color || '#6366f1',
      access_level: folder.access_level || 'public',
      visible_department_ids: folder.visible_department_ids || [],
      visible_workspace_ids: folder.visible_workspace_ids || [],
    })
    setEditFolderOpen(true)
  }

  // 保存编辑文件夹
  const handleSaveEditFolder = async () => {
    if (!editingFolder) return
    try {
      await folderService.updateFolder(editingFolder.id, {
        name: editFolderForm.name.trim(),
        description: editFolderForm.description || null,
        color: editFolderForm.color,
        access_level: editFolderForm.access_level,
        visible_department_ids: editFolderForm.visible_department_ids,
        visible_workspace_ids: editFolderForm.visible_workspace_ids,
      })
      toast.success('文件夹已更新')
      setEditFolderOpen(false)
      loadData()
    } catch (error: any) {
      toast.error(error.message || '更新失败')
    }
  }

  // 删除文件夹
  const handleDeleteFolder = async (folder: JkbFolder) => {
    if (!confirm(`确定要删除文件夹"${folder.name}"吗？文件夹内的文件将移至根目录。`)) return
    try {
      await folderService.deleteFolder(folder.id)
      toast.success('文件夹已删除')
      if (currentFolderId === folder.id) {
        navigateToFolder(folder.parent_id)
      }
      loadData()
    } catch (error: any) {
      toast.error(error.message || '删除失败')
    }
  }

  // 移动文件
  const handleMoveFile = async (targetFolderId: string | null) => {
    if (!movingFileId) return
    try {
      await folderService.moveFileToFolder(movingFileId, targetFolderId)
      toast.success('文件已移动')
      setMoveDialogOpen(false)
      setMovingFileId(null)
      loadData()
    } catch (error: any) {
      toast.error(error.message || '移动失败')
    }
  }

  // 分页
  const totalPages = Math.ceil(filteredFiles.length / pageSize)
  const paginatedFiles = useMemo<JkbFile[]>(() => {
    const start = (currentPage - 1) * pageSize
    return filteredFiles.slice(start, start + pageSize)
  }, [filteredFiles, currentPage, pageSize])

  // 搜索变化时重置页码
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filterCategory, filterWorkspaceId])

  const handleOpenEdit = (file: JkbFile) => {
    setEditingFile(file)
    setEditForm({
      display_name: file.display_name,
      description: file.description || '',
      tags: [...file.tags],
      workspace_ids: [...file.workspace_ids],
      access_level: file.access_level || 'public',
      visible_department_ids: [...(file.visible_department_ids || [])],
      visible_workspace_ids: [...(file.visible_workspace_ids || [])],
      expires_at: file.expires_at ? new Date(file.expires_at).toISOString().slice(0, 16) : '',
    })
    setEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editingFile) return

    setSaving(true)
    try {
      await fileService.updateFile(editingFile.id, {
        display_name: editForm.display_name,
        description: editForm.description,
        tags: editForm.tags,
        workspace_ids: editForm.workspace_ids,
        access_level: editForm.access_level,
        visible_department_ids: editForm.visible_department_ids,
        visible_workspace_ids: editForm.visible_workspace_ids,
        expires_at: editForm.expires_at ? new Date(editForm.expires_at).toISOString() : null,
      })
      toast.success('文件信息已更新')
      setEditDialogOpen(false)
      loadData()
    } catch (error: any) {
      toast.error(error.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (file: JkbFile) => {
    if (!confirm(`确定要删除文件"${file.display_name}"吗？`)) return

    try {
      await fileService.deleteFile(file.id)
      toast.success('文件已删除')
      loadData()
    } catch (error: any) {
      toast.error(error.message || '删除失败')
    }
  }

  const handleOpenShare = async (file: JkbFile) => {
    setSharingFile(file)
    setShareForm({
      share_type: 'public',
      password: '',
      expires_at: '',
      max_views: '',
      allow_download: true,
    })
    setGeneratedShareUrl('')

    try {
      const shares = await fileService.getFileShares(file.id)
      setFileShares(shares)
      setShareDialogOpen(true)
    } catch (error: any) {
      toast.error('加载分享链接失败: ' + error.message)
    }
  }

  const handleCreateShare = async () => {
    if (!sharingFile || !user) return

    if (shareForm.share_type === 'password' && !shareForm.password) {
      toast.error('请设置密码')
      return
    }

    setSaving(true)
    try {
      const result = await fileService.createShare(sharingFile.id, {
        share_type: shareForm.share_type,
        password: shareForm.password || undefined,
        expires_at: shareForm.expires_at || null,
        max_views: shareForm.max_views ? parseInt(shareForm.max_views) : null,
        allow_download: shareForm.allow_download,
        created_by: user.id,
      })

      const shareUrl = `${window.location.origin}/share/${result.share_code}`
      setGeneratedShareUrl(shareUrl)

      // 刷新分享列表
      const shares = await fileService.getFileShares(sharingFile.id)
      setFileShares(shares)

      toast.success('分享链接已创建')
    } catch (error: any) {
      toast.error(error.message || '创建分享失败')
    } finally {
      setSaving(false)
    }
  }

  const handleCopyShareUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    toast.success('链接已复制到剪贴板')
  }

  const handleRevokeShare = async (shareId: string) => {
    if (!confirm('确定要撤销该分享链接吗？')) return

    try {
      await fileService.revokeShare(shareId)
      toast.success('分享已撤销')
      if (sharingFile) {
        const shares = await fileService.getFileShares(sharingFile.id)
        setFileShares(shares)
      }
    } catch (error: any) {
      toast.error(error.message || '撤销失败')
    }
  }

  const handlePreview = (file: JkbFile) => {
    // 检查文件是否过期
    if (file.expires_at && new Date(file.expires_at) < new Date()) {
      toast.error('该文件已过期，无法预览')
      return
    }
    setPreviewFile(file)
    // 增加浏览计数
    fileService.incrementViewCount(file.id).catch(() => {})
  }

  const handleDownload = async (file: JkbFile) => {
    // 检查文件是否过期
    if (file.expires_at && new Date(file.expires_at) < new Date()) {
      toast.error('该文件已过期，无法下载')
      return
    }
    try {
      await fileService.downloadFile(file)
      // 增加下载计数
      await fileService.incrementDownloadCount(file.id)
    } catch (error) {
      toast.error('下载失败')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="h-9 w-28 bg-muted rounded animate-pulse" />
            <div className="h-4 w-36 bg-muted rounded animate-pulse mt-2" />
          </div>
          <div className="h-10 w-24 bg-muted rounded-lg animate-pulse" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 flex-1 bg-muted rounded-lg animate-pulse" />
          <div className="h-10 w-24 bg-muted rounded-lg animate-pulse" />
        </div>
        <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
          <FileRowSkeleton />
          <FileRowSkeleton />
          <FileRowSkeleton />
          <FileRowSkeleton />
          <FileRowSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 标题和操作 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">文件管理</h1>
          <p className="text-muted-foreground mt-1">
            共 {filteredFiles.length} 个文件
          </p>
        </div>
        <div className="flex gap-2">
            <Button onClick={() => {
              if (!canCreateFolder(user, userPermissions)) {
                toast.error('您没有创建文件夹的权限，请联系管理员')
                return
              }
              setCreateFolderOpen(true)
            }} variant="outline" className="gap-2">
              <FolderPlusIcon className="h-4 w-4" />
              新建文件夹
            </Button>
            <Button onClick={() => {
              if (!canUploadFile(user, userPermissions)) {
                console.warn('[FilesPage] 上传权限检查失败:', { user: user?.id, role: user?.role, userPermissions })
                toast.error(`您没有上传文件的权限，请联系管理员（当前权限: ${userPermissions.length > 0 ? userPermissions.join(', ') : '无'}）`)
                return
              }
              setUploaderOpen(true)
            }} className="gap-2">
              <CloudArrowUpIcon className="h-4 w-4" />
              上传文件
            </Button>
          </div>
      </div>

      {/* 搜索和过滤 */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索文件名、描述、标签..."
            className="pl-9"
          />
        </div>

        <div className="flex gap-2 items-center">
          {/* 视图切换 */}
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'list' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              title="列表视图"
            >
              <ListBulletIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'grid' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              title="网格视图"
            >
              <Squares2X2Icon className="h-4 w-4" />
            </button>
          </div>

          <select
            value={filterWorkspaceId}
            onChange={(e) => setFilterWorkspaceId(e.target.value)}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          >
            <option value="">所有工作区</option>
            {permittedWorkspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>

          <select
            value={`${sortBy}_${sortOrder}`}
            onChange={(e) => {
              const [sort_by, sort_order] = e.target.value.split('_')
              setSortBy(sort_by as any)
              setSortOrder(sort_order as any)
            }}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          >
            <option value="created_at_desc">最新上传</option>
            <option value="created_at_asc">最早上传</option>
            <option value="file_size_desc">文件大小降序</option>
            <option value="file_size_asc">文件大小升序</option>
            <option value="view_count_desc">浏览最多</option>
          </select>
        </div>
      </div>

      {/* 分类标签页导航 */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto pb-px">
        {[
          { key: '', label: '全部', icon: PaperClipIcon, color: 'text-muted-foreground' },
          { key: 'document', label: '文档', icon: DocumentIcon, color: 'text-blue-500' },
          { key: 'image', label: '图片', icon: PhotoIcon, color: 'text-green-500' },
          { key: 'video', label: '视频', icon: VideoCameraIcon, color: 'text-purple-500' },
          { key: 'audio', label: '音频', icon: MusicalNoteIcon, color: 'text-pink-500' },
          { key: 'file', label: '其他', icon: PaperClipIcon, color: 'text-gray-500' },
        ].map((tab) => {
          const count = tab.key === ''
            ? permittedFiles.filter(f => f.folder_id === currentFolderId).length
            : permittedFiles.filter(f => f.category === tab.key && f.folder_id === currentFolderId).length
          const active = filterCategory === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => { setFilterCategory(tab.key as FileCategory | ''); setCurrentPage(1) }}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              <tab.icon className={cn('h-4 w-4', !active && tab.color)} />
              {tab.label}
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded-full',
                active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* 面包屑导航 */}
      <div className="flex items-center gap-1.5 text-sm flex-wrap">
        <button
          onClick={() => navigateToFolder(null)}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-md transition-colors',
            !currentFolderId ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
        >
          <HomeIcon className="h-3.5 w-3.5" />
          全部文件
        </button>
        {folderPath.map((f, i) => (
          <React.Fragment key={f.id}>
            <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              onClick={() => navigateToFolder(f.id)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-md transition-colors',
                i === folderPath.length - 1 ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <FolderIcon className="h-3.5 w-3.5" style={{ color: f.color || '#6366f1' }} />
              {f.name}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* 子文件夹卡片 */}
      {currentSubFoldersMemo.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {currentSubFoldersMemo.map((folder) => {
            const fileCount = permittedFiles.filter(f => f.folder_id === folder.id).length
            const subFolderCount = folders.filter(f => f.parent_id === folder.id).length
            return (
              <div
                key={folder.id}
                className="group relative bg-card border border-border rounded-xl p-4 hover:shadow-md transition-all cursor-pointer"
                onClick={() => navigateToFolder(folder.id)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: (folder.color || '#6366f1') + '15' }}
                  >
                    <FolderIcon className="h-5 w-5" style={{ color: folder.color || '#6366f1' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{folder.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fileCount} 个文件{subFolderCount > 0 ? `, ${subFolderCount} 个文件夹` : ''}
                    </p>
                  </div>
                </div>
                {folder.description && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{folder.description}</p>
                )}
                {/* 操作按钮 */}
                <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {canEditFolder(user, userPermissions) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleOpenEditFolder(folder) }}
                    className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
                    title="编辑"
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                  </button>
                  )}
                  {canDeleteFolder(user, userPermissions) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder) }}
                    className="p-1 hover:bg-destructive/10 rounded transition-colors text-muted-foreground hover:text-destructive"
                    title="删除"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 文件列表 - 列表视图 */}
      {viewMode === 'list' ? (
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
                  文件名
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase hidden md:table-cell">
                  大小
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase hidden lg:table-cell">
                  上传者
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase hidden xl:table-cell">
                  上传时间
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedFiles.map((file) => {
                const isExpired = !!(file.expires_at && new Date(file.expires_at) < new Date())
                return (
                <tr key={file.id} className={cn(
                  'hover:bg-muted/30 transition-colors group',
                  isExpired && 'bg-destructive/5'
                )}>
                  {/* 文件名 */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => handlePreview(file)}>
                      {isImageFile(file.file_ext) && !isExpired ? (
                        <FileThumbnail file={file} className="w-10 h-10 rounded-lg" />
                      ) : isImageFile(file.file_ext) && isExpired ? (
                        <div className="w-10 h-10 rounded-lg flex-shrink-0 bg-muted/50 flex items-center justify-center">
                          <PhotoIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                      ) : (
                        <div className={cn('rounded-lg flex items-center justify-center w-10 h-10 flex-shrink-0', getFileIconConfig(file.file_ext).bgColor)}>
                          {getFileIconConfig(file.file_ext).icon}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-foreground truncate max-w-xs group-hover:text-primary transition-colors">
                          {file.display_name}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {isExpired && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">
                              已过期
                            </span>
                          )}
                          <span className={cn('text-xs px-1.5 py-0.5 rounded', getFileIconConfig(file.file_ext).bgColor)}>
                            {file.file_ext?.toUpperCase() || 'FILE'}
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {file.tags.slice(0, 2).map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary"
                              >
                                {tag}
                              </span>
                            ))}
                            {file.tags.length > 2 && (
                              <span className="text-xs text-muted-foreground">
                                +{file.tags.length - 2}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* 大小 */}
                  <td className="px-4 py-3 text-sm text-foreground hidden md:table-cell">
                    {formatFileSize(file.file_size)}
                  </td>

                  {/* 上传者 */}
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        avatarUrl={file.uploader?.avatar_url}
                        displayName={file.uploader?.display_name}
                        size="xs"
                      />
                      <span className="text-sm text-foreground">
                        {file.uploader?.display_name || '未知'}
                      </span>
                    </div>
                  </td>

                  {/* 时间 */}
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden xl:table-cell">
                    {new Date(file.created_at).toLocaleDateString('zh-CN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>

                  {/* 操作 */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handlePreview(file)}
                        className="p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
                        title="预览"
                      >
                        <EyeIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDownload(file)}
                        className="p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
                        title="下载"
                      >
                        <ArrowDownTrayIcon className="h-4 w-4" />
                      </button>
                      {canEditFile(user, file, userPermissions) && (
                        <button
                          onClick={() => { setMovingFileId(file.id); setMoveDialogOpen(true) }}
                          className="p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
                          title="移动到"
                        >
                          <FolderIcon className="h-4 w-4" />
                        </button>
                      )}
                      {canShareFile(user, file, userPermissions) && (
                        <button
                          onClick={() => handleOpenShare(file)}
                          className="p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
                          title="分享"
                        >
                          <ShareIcon className="h-4 w-4" />
                        </button>
                      )}
                      {canEditFile(user, file, userPermissions) && (
                        <button
                          onClick={() => handleOpenEdit(file)}
                          className="p-1.5 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground"
                          title="编辑"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                      )}
                      {canDeleteFile(user, file, userPermissions) && (
                        <button
                          onClick={() => handleDelete(file)}
                          className="p-1.5 hover:bg-destructive/10 rounded-md transition-colors text-muted-foreground hover:text-destructive"
                          title="删除"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {filteredFiles.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <CloudArrowUpIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无文件</p>
          </div>
        )}
      </div>
      ) : (
      /* 网格视图 */
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {paginatedFiles.map((file) => {
          const isExpired = !!(file.expires_at && new Date(file.expires_at) < new Date())
          return (
          <div
            key={file.id}
            className={cn(
              'border border-border rounded-xl overflow-hidden hover:shadow-md transition-all group cursor-pointer',
              isExpired ? 'bg-destructive/5 border-destructive/20' : 'bg-card'
            )}
            onClick={() => handlePreview(file)}
          >
            {/* 缩略图区域 */}
            <div className="aspect-square flex items-center justify-center bg-muted/30 relative overflow-hidden">
              {isImageFile(file.file_ext) && !isExpired ? (
                <img
                  src={file.thumbnail_url || file.public_url}
                  alt={file.display_name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              ) : isImageFile(file.file_ext) && isExpired ? (
                <div className="w-full h-full flex items-center justify-center bg-muted/50">
                  <PhotoIcon className="h-12 w-12 text-muted-foreground" />
                </div>
              ) : (
                <div className={cn('rounded-xl flex items-center justify-center w-16 h-16', getFileIconConfig(file.file_ext).bgColor)}>
                  <div className="scale-[2.5]">{getFileIconConfig(file.file_ext).icon}</div>
                </div>
              )}
              {/* 操作悬浮 */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                <button
                  onClick={(e) => { e.stopPropagation(); handlePreview(file) }}
                  className="p-2 bg-white/90 rounded-lg text-foreground hover:bg-white transition-colors"
                  title="预览"
                >
                  <EyeIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDownload(file) }}
                  className="p-2 bg-white/90 rounded-lg text-foreground hover:bg-white transition-colors"
                  title="下载"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* 文件信息 */}
            <div className="p-3">
              <p className="text-sm font-medium text-foreground truncate">{file.display_name}</p>
              <div className="flex items-center justify-between mt-1">
                {isExpired ? (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">
                    已过期
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">{formatFileSize(file.file_size)}</span>
                )}
                <span className={cn('text-xs px-1.5 py-0.5 rounded', getFileIconConfig(file.file_ext).bgColor)}>
                  {file.file_ext?.toUpperCase() || 'FILE'}
                </span>
              </div>
            </div>
          </div>
          )
        })}
        {filteredFiles.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <CloudArrowUpIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无文件</p>
          </div>
        )}
      </div>
      )}

      {/* 分页 */}
      {filteredFiles.length > pageSize && (
        <div className="flex items-center justify-between px-1">
          <div className="text-sm text-muted-foreground">
            显示 {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredFiles.length)} 共 {filteredFiles.length} 条
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-2 py-1 text-sm rounded border border-input hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
            >
              首页
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2 py-1 text-sm rounded border border-input hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((p, i, arr) => (
                <React.Fragment key={p}>
                  {i > 0 && arr[i - 1] !== p - 1 && (
                    <span className="px-1 text-muted-foreground">...</span>
                  )}
                  <button
                    onClick={() => setCurrentPage(p)}
                    className={cn(
                      'px-2.5 py-1 text-sm rounded border transition-colors',
                      p === currentPage
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-input hover:bg-accent'
                    )}
                  >
                    {p}
                  </button>
                </React.Fragment>
              ))
            }
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-sm rounded border border-input hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
            >
              下一页
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-sm rounded border border-input hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
            >
              末页
            </button>
          </div>
        </div>
      )}

      {/* 文件预览 */}
      {previewFile && (
        <FilePreview
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={handleDownload}
          workspaces={permittedWorkspaces}
        />
      )}

      {/* 上传器弹窗 */}
      <Dialog open={uploaderOpen} onOpenChange={setUploaderOpen}>
        <DialogContent className="max-w-6xl p-0">
          <BatchUploader
            workspaces={permittedWorkspaces}
            folders={folders}
            currentFolderId={currentFolderId}
            onUploadComplete={loadData}
            onClose={() => setUploaderOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 编辑文件弹窗 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑文件信息</DialogTitle>
            <DialogDescription>修改文件名、描述、标签、权限和过期时间</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>显示名称</Label>
              <Input
                value={editForm.display_name}
                onChange={(e) =>
                  setEditForm({ ...editForm, display_name: e.target.value })
                }
                className="mt-2"
              />
            </div>

            <div>
              <Label>描述</Label>
              <textarea
                value={editForm.description}
                onChange={(e) =>
                  setEditForm({ ...editForm, description: e.target.value })
                }
                rows={3}
                className="mt-2 w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>

            <div>
              <Label>标签</Label>
              <div className="mt-2 flex flex-wrap gap-1.5 mb-2">
                {editForm.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-xs"
                  >
                    {tag}
                    <button
                      onClick={() =>
                        setEditForm({
                          ...editForm,
                          tags: editForm.tags.filter((t) => t !== tag),
                        })
                      }
                      className="hover:text-destructive"
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="输入标签后回车"
                  className="flex-1 h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && tagInput.trim()) {
                      setEditForm({
                        ...editForm,
                        tags: [...editForm.tags, tagInput.trim()],
                      })
                      setTagInput('')
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (tagInput.trim()) {
                      setEditForm({
                        ...editForm,
                        tags: [...editForm.tags, tagInput.trim()],
                      })
                      setTagInput('')
                    }
                  }}
                >
                  添加
                </Button>
              </div>
            </div>

            <div>
              <Label>可用工作区</Label>
              <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto border border-border rounded-lg p-2">
                {permittedWorkspaces.map((ws) => (
                  <label
                    key={ws.id}
                    className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={editForm.workspace_ids.includes(ws.id)}
                      onChange={(e) => {
                        const ids = e.target.checked
                          ? [...editForm.workspace_ids, ws.id]
                          : editForm.workspace_ids.filter((id) => id !== ws.id)
                        setEditForm({ ...editForm, workspace_ids: ids })
                      }}
                      className="rounded"
                    />
                    <span className="text-sm flex items-center gap-2">
                      <div className="w-5 h-5 rounded flex-shrink-0">{renderWorkspaceIcon(ws.icon)}</div>
                      {ws.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* 访问权限 */}
            <div>
              <Label>访问权限</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                设置谁可以查看此文件
              </p>
              <select
                value={editForm.access_level}
                onChange={(e) => setEditForm({ ...editForm, access_level: e.target.value as any })}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              >
                <option value="public">所有人可见</option>
                <option value="workspace">指定工作区可见</option>
                <option value="department">指定部门可见</option>
                <option value="private">仅自己可见</option>
              </select>
            </div>

            {/* 可见工作区（当 access_level 为 workspace 时） */}
            {editForm.access_level === 'workspace' && (
              <div>
                <Label>可见工作区</Label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                  选择哪些工作区的成员可以查看此文件
                </p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto border border-border rounded-lg p-2">
                  {permittedWorkspaces.map((ws) => (
                    <label
                      key={ws.id}
                      className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        checked={editForm.visible_workspace_ids.includes(ws.id)}
                        onChange={(e) => {
                          const ids = e.target.checked
                            ? [...editForm.visible_workspace_ids, ws.id]
                            : editForm.visible_workspace_ids.filter((id) => id !== ws.id)
                          setEditForm({ ...editForm, visible_workspace_ids: ids })
                        }}
                        className="rounded"
                      />
                      <span className="text-sm flex items-center gap-2">
                      <div className="w-5 h-5 rounded flex-shrink-0">{renderWorkspaceIcon(ws.icon)}</div>
                      {ws.name}
                    </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 可见部门（当 access_level 为 department 时） */}
            {editForm.access_level === 'department' && (
              <div>
                <Label>可见部门</Label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                  选择哪些部门的成员可以查看此文件
                </p>
                <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-2">
                  <DepartmentTreeSelector
                    tree={departmentTree}
                    selectedIds={editForm.visible_department_ids}
                    onChange={(ids) => setEditForm({ ...editForm, visible_department_ids: ids })}
                  />
                </div>
              </div>
            )}

            {/* 过期时间 */}
            <div>
              <Label>过期时间（可选）</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                设置文件过期时间，过期后将无法访问
              </p>
              <Input
                type="datetime-local"
                value={editForm.expires_at}
                onChange={(e) => setEditForm({ ...editForm, expires_at: e.target.value })}
                className="h-10"
                min={new Date().toISOString().slice(0, 16)}
              />
              {editForm.expires_at && (
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, expires_at: '' })}
                  className="text-xs text-muted-foreground hover:text-foreground mt-1"
                >
                  清除过期时间
                </button>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 分享弹窗 */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>分享文件 - {sharingFile?.display_name}</DialogTitle>
            <DialogDescription>创建分享链接供他人访问</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* 创建新分享 */}
            <div className="space-y-4 p-4 border border-border rounded-lg">
              <h4 className="font-semibold text-sm">创建新分享</h4>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>分享类型</Label>
                  <select
                    value={shareForm.share_type}
                    onChange={(e) =>
                      setShareForm({
                        ...shareForm,
                        share_type: e.target.value as ShareType,
                      })
                    }
                    className="mt-2 w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
                  >
                    <option value="public">公开链接</option>
                    <option value="password">密码保护</option>
                    <option value="time_limited">限时访问</option>
                    <option value="password_time">密码+限时</option>
                  </select>
                </div>

                {(shareForm.share_type === 'password' ||
                  shareForm.share_type === 'password_time') && (
                  <div>
                    <Label>访问密码</Label>
                    <Input
                      type="text"
                      value={shareForm.password}
                      onChange={(e) =>
                        setShareForm({ ...shareForm, password: e.target.value })
                      }
                      placeholder="设置访问密码"
                      className="mt-2"
                    />
                  </div>
                )}

                {(shareForm.share_type === 'time_limited' ||
                  shareForm.share_type === 'password_time') && (
                  <div>
                    <Label>过期时间</Label>
                    <Input
                      type="datetime-local"
                      value={shareForm.expires_at}
                      onChange={(e) =>
                        setShareForm({ ...shareForm, expires_at: e.target.value })
                      }
                      className="mt-2"
                    />
                  </div>
                )}

                <div>
                  <Label>最大访问次数（可选）</Label>
                  <Input
                    type="number"
                    value={shareForm.max_views}
                    onChange={(e) =>
                      setShareForm({ ...shareForm, max_views: e.target.value })
                    }
                    placeholder="不限制"
                    className="mt-2"
                    min="1"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareForm.allow_download}
                  onChange={(e) =>
                    setShareForm({ ...shareForm, allow_download: e.target.checked })
                  }
                  className="rounded"
                />
                <span className="text-sm">允许下载文件</span>
              </label>

              <Button onClick={handleCreateShare} disabled={saving} className="w-full">
                {saving ? '创建中...' : '创建分享链接'}
              </Button>

              {generatedShareUrl && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckIcon className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-900 dark:text-green-100">
                      分享链接已创建
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={generatedShareUrl}
                      readOnly
                      className="flex-1 text-xs bg-white"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyShareUrl(generatedShareUrl)}
                    >
                      <DocumentDuplicateIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* 已有分享列表 */}
            <div>
              <h4 className="font-semibold text-sm mb-3">已创建的分享链接</h4>
              <div className="space-y-2">
                {fileShares.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    暂无分享链接
                  </p>
                ) : (
                  fileShares.map((share) => {
                    const shareUrl = `${window.location.origin}/share/${share.share_code}`
                    const isExpired =
                      share.expires_at && new Date(share.expires_at) < new Date()
                    const isExceeded =
                      share.max_views && share.view_count >= share.max_views

                    return (
                      <div
                        key={share.id}
                        className={cn(
                          'p-3 border border-border rounded-lg',
                          (!share.is_active || isExpired || isExceeded) &&
                            'opacity-50'
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 text-xs">
                            {share.share_type === 'public' && (
                              <span className="flex items-center gap-1 text-green-600">
                                <ShareIcon className="h-3 w-3" />
                                公开链接
                              </span>
                            )}
                            {(share.share_type === 'password' ||
                              share.share_type === 'password_time') && (
                              <span className="flex items-center gap-1 text-orange-600">
                                <LockClosedIcon className="h-3 w-3" />
                                密码保护
                              </span>
                            )}
                            {(share.share_type === 'time_limited' ||
                              share.share_type === 'password_time') && (
                              <span className="flex items-center gap-1 text-blue-600">
                                <ClockIcon className="h-3 w-3" />
                                {isExpired ? '已过期' : '限时'}
                              </span>
                            )}
                            <span className="text-muted-foreground">
                              浏览 {share.view_count} 次
                              {share.max_views && ` / ${share.max_views}`}
                            </span>
                          </div>
                          {share.is_active && !isExpired && !isExceeded && (
                            <button
                              onClick={() => handleRevokeShare(share.id)}
                              className="text-xs text-destructive hover:underline"
                            >
                              撤销
                            </button>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Input
                            value={shareUrl}
                            readOnly
                            className="flex-1 text-xs h-8"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopyShareUrl(shareUrl)}
                            className="h-8"
                          >
                            复制
                          </Button>
                        </div>

                        {share.expires_at && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {isExpired
                              ? '已于 '
                              : '将于 '}
                            {new Date(share.expires_at).toLocaleString('zh-CN')}
                            {isExpired ? ' 过期' : ' 过期'}
                          </p>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新建文件夹弹窗 */}
      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新建文件夹</DialogTitle>
            <DialogDescription>在当前目录下创建新文件夹</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>文件夹名称</Label>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="请输入文件夹名称"
                className="mt-2"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              />
            </div>
            <div>
              <Label>颜色</Label>
              <div className="flex gap-2 mt-2">
                {['#6366f1', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899'].map(c => (
                  <button
                    key={c}
                    onClick={() => setNewFolderColor(c)}
                    className={cn(
                      'w-8 h-8 rounded-lg transition-all',
                      newFolderColor === c ? 'ring-2 ring-offset-2 ring-ring scale-110' : 'hover:scale-105'
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFolderOpen(false)}>取消</Button>
            <Button onClick={handleCreateFolder}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑文件夹弹窗 */}
      <Dialog open={editFolderOpen} onOpenChange={setEditFolderOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑文件夹</DialogTitle>
            <DialogDescription>修改文件夹名称、描述和权限</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>文件夹名称</Label>
              <Input
                value={editFolderForm.name}
                onChange={(e) => setEditFolderForm({ ...editFolderForm, name: e.target.value })}
                className="mt-2"
              />
            </div>
            <div>
              <Label>描述</Label>
              <textarea
                value={editFolderForm.description}
                onChange={(e) => setEditFolderForm({ ...editFolderForm, description: e.target.value })}
                placeholder="文件夹描述（可选）"
                rows={2}
                className="mt-2 w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <div>
              <Label>颜色</Label>
              <div className="flex gap-2 mt-2">
                {['#6366f1', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899'].map(c => (
                  <button
                    key={c}
                    onClick={() => setEditFolderForm({ ...editFolderForm, color: c })}
                    className={cn(
                      'w-8 h-8 rounded-lg transition-all',
                      editFolderForm.color === c ? 'ring-2 ring-offset-2 ring-ring scale-110' : 'hover:scale-105'
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div>
              <Label>访问权限</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">设置谁可以查看此文件夹</p>
              <select
                value={editFolderForm.access_level}
                onChange={(e) => setEditFolderForm({ ...editFolderForm, access_level: e.target.value as any })}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              >
                <option value="public">所有人可见</option>
                <option value="workspace">指定工作区可见</option>
                <option value="department">指定部门可见</option>
                <option value="private">仅自己可见</option>
              </select>
            </div>
            {editFolderForm.access_level === 'workspace' && (
              <div>
                <Label>可见工作区</Label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto border border-border rounded-lg p-2 mt-2">
                  {permittedWorkspaces.map((ws) => (
                    <label key={ws.id} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-accent">
                      <input
                        type="checkbox"
                        checked={editFolderForm.visible_workspace_ids.includes(ws.id)}
                        onChange={(e) => {
                          const ids = e.target.checked
                            ? [...editFolderForm.visible_workspace_ids, ws.id]
                            : editFolderForm.visible_workspace_ids.filter((id) => id !== ws.id)
                          setEditFolderForm({ ...editFolderForm, visible_workspace_ids: ids })
                        }}
                        className="rounded"
                      />
                      <span className="text-sm flex items-center gap-2">
                        <div className="w-5 h-5 rounded flex-shrink-0">{renderWorkspaceIcon(ws.icon)}</div>
                        {ws.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {editFolderForm.access_level === 'department' && (
              <div>
                <Label>可见部门</Label>
                <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-2 mt-2">
                  <DepartmentTreeSelector
                    tree={departmentTree}
                    selectedIds={editFolderForm.visible_department_ids}
                    onChange={(ids) => setEditFolderForm({ ...editFolderForm, visible_department_ids: ids })}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditFolderOpen(false)}>取消</Button>
            <Button onClick={handleSaveEditFolder}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 移动文件弹窗 */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>移动文件到</DialogTitle>
            <DialogDescription>选择目标文件夹</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            <button
              onClick={() => handleMoveFile(null)}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left',
                !movingFileId ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
              )}
            >
              <HomeIcon className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm">根目录</span>
            </button>
            {folders.filter(f => !f.is_archived && f.id !== movingFileId).map((folder) => (
              <button
                key={folder.id}
                onClick={() => handleMoveFile(folder.id)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors text-left"
              >
                <FolderIcon className="h-5 w-5" style={{ color: folder.color || '#6366f1' }} />
                <div>
                  <span className="text-sm">{folder.name}</span>
                  {folder.description && (
                    <p className="text-xs text-muted-foreground">{folder.description}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>取消</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}