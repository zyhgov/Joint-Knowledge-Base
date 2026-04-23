export type FileCategory = 'document' | 'image' | 'video' | 'audio' | 'file'
export type ShareType = 'public' | 'password' | 'time_limited' | 'password_time'
export type NotificationType = 'info' | 'warning' | 'success' | 'error'
export type NotificationTargetType = 'all' | 'users' | 'departments' | 'roles'

// 仪表盘公告/任务类型
export type AnnouncementType = 'announcement' | 'checkin' | 'notice' | 'task'
export type AnnouncementTargetType = 'all' | 'departments' | 'workspaces'
export type AnnouncementStatus = 'active' | 'expired' | 'draft'

// 文件夹接口
export interface JkbFolder {
  id: string
  name: string
  parent_id: string | null
  owner_id: string
  workspace_ids: string[]
  access_level: 'public' | 'workspace' | 'department' | 'private'
  visible_department_ids: string[]
  visible_workspace_ids: string[]
  color: string
  icon: string
  description: string | null
  sort_order: number
  is_archived: boolean
  created_at: string
  updated_at: string
  // 关联数据
  owner?: {
    id: string
    display_name: string | null
    avatar_url: string | null
  }
  // 计算字段
  file_count?: number
  subfolder_count?: number
  children?: JkbFolder[]
}

export interface JkbAnnouncement {
  id: string
  title: string
  content: string
  type: AnnouncementType
  status: AnnouncementStatus
  target_type: AnnouncementTargetType
  target_ids: string[] | null  // 部门ID或工作区ID列表
  priority: number  // 1-普通 2-重要 3-紧急
  is_pinned: boolean
  is_hidden: boolean
  start_at: string | null
  expires_at: string | null
  created_by: string
  created_at: string
  updated_at: string
  // 关联数据
  creator?: {
    id: string
    display_name: string | null
    avatar_url: string | null
  }
  // 已读/完成状态（前端计算）
  is_read?: boolean
  is_completed?: boolean
  read_at?: string | null
  completed_at?: string | null
  // 统计
  read_count?: number
  total_target_count?: number
}

export interface JkbAnnouncementRead {
  id: string
  announcement_id: string
  user_id: string
  is_read: boolean
  read_at: string | null
  is_completed: boolean  // 打卡/任务完成标记
  completed_at: string | null
  user?: {
    id: string
    display_name: string | null
    avatar_url: string | null
  }
}

export interface JkbFile {
  id: string
  original_name: string
  display_name: string
  description: string | null
  r2_key: string
  public_url: string
  thumbnail_url: string | null
  file_size: number
  file_type: string | null
  file_ext: string | null
  category: FileCategory
  tags: string[]
  workspace_ids: string[]
  uploaded_by: string
  folder_id: string | null
  // 权限控制
  visible_department_ids: string[]  // 可见部门（空数组表示全部可见）
  visible_workspace_ids: string[]   // 可见工作区（空数组表示全部可见）
  access_level: 'public' | 'workspace' | 'department' | 'private'  // 访问级别
  expires_at: string | null  // 过期时间（null 表示永不过期）
  is_deleted: boolean
  deleted_at: string | null
  view_count: number
  download_count: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  // 关联数据
  uploader?: {
    id: string
    display_name: string | null
    avatar_url: string | null
    department_id?: string | null
  }
  uploader_department?: {
    id: string
    name: string
  } | null
}

export interface JkbFileShare {
  id: string
  file_id: string
  share_code: string
  share_type: ShareType
  password: string | null
  expires_at: string | null
  max_views: number | null
  view_count: number
  allow_download: boolean
  is_active: boolean
  created_by: string
  created_at: string
}

export interface JkbWorkspace {
  id: string
  name: string
  description: string | null
  icon: string
  cover_url: string | null
  owner_id: string
  department_ids: string[]
  is_public: boolean
  is_archived: boolean
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
  // 关联数据
  owner?: {
    id: string
    display_name: string | null
    avatar_url: string | null
  }
  member_count?: number
}

export interface JkbNotification {
  id: string
  title: string
  content: string
  type: NotificationType
  sender_id: string | null
  target_type: NotificationTargetType
  target_ids: string[] | null
  is_pinned: boolean
  is_hidden: boolean
  expires_at: string | null
  created_at: string
  updated_at: string
  // 关联数据
  sender?: {
    id: string
    display_name: string | null
    avatar_url: string | null
  }
  is_read?: boolean
}

// 上传任务状态
export interface UploadTask {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  error?: string
  result?: JkbFile
  // 上传配置
  display_name: string
  description: string
  tags: string[]
  workspace_ids: string[]
}

// 文件过滤参数
export interface FileFilter {
  search?: string
  category?: FileCategory | ''
  tags?: string[]
  workspace_id?: string
  date_from?: string
  date_to?: string
  sort_by?: 'created_at' | 'file_size' | 'view_count' | 'display_name'
  sort_order?: 'asc' | 'desc'
}