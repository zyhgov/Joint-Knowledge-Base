export type UserRole = 'super_admin' | 'admin' | 'member' | 'guest' | string
// 注意：UserRole 现在支持自定义角色 code（如 'operator'、'agent' 等）
export type WorkspaceMemberRole = 'owner' | 'editor' | 'viewer'
export type DocumentType = 'document' | 'folder' | 'template'
export type DocumentStatus = 'draft' | 'published' | 'archived'
export type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'file'
export type DocumentPermission = 'view' | 'comment' | 'edit' | 'manage'

// 自定义用户表
export interface JkbUser {
  id: string
  phone: string
  password_hash: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  role: UserRole
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

// 用户扩展信息
export interface JkbProfile {
  id: string
  display_name: string | null
  phone: string | null
  avatar_url: string | null
  bio: string | null
  role: UserRole
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

// 合并的用户信息
export interface JkbUserProfile extends JkbUser {
  profile?: JkbProfile | null
  role_name?: string  // RBAC 角色显示名称（如"运营人员"），由 auth 服务填充
}

export interface JkbSession {
  id: string
  user_id: string
  token: string
  expires_at: string
  created_at: string
}

export interface JkbWorkspace {
  id: string
  name: string
  description: string | null
  icon: string
  cover_url: string | null
  owner_id: string
  is_public: boolean
  is_archived: boolean
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface JkbWorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  role: WorkspaceMemberRole
  invited_by: string | null
  joined_at: string
}

export interface JkbDocument {
  id: string
  workspace_id: string
  parent_id: string | null
  title: string
  content: Record<string, unknown>
  content_text: string | null
  icon: string
  cover_url: string | null
  type: DocumentType
  status: DocumentStatus
  is_pinned: boolean
  is_deleted: boolean
  deleted_at: string | null
  created_by: string
  updated_by: string | null
  published_at: string | null
  sort_order: number
  word_count: number
  created_at: string
  updated_at: string
}

export interface JkbFile {
  id: string
  workspace_id: string
  document_id: string | null
  file_name: string
  file_type: string | null
  file_size: number | null
  file_ext: string | null
  category: FileCategory
  r2_key: string
  public_url: string
  thumbnail_url: string | null
  uploaded_by: string
  is_deleted: boolean
  metadata: Record<string, unknown>
  created_at: string
}

export interface JkbComment {
  id: string
  document_id: string
  parent_id: string | null
  content: string
  created_by: string
  is_deleted: boolean
  created_at: string
  updated_at: string
}

export interface JkbActivityLog {
  id: string
  workspace_id: string | null
  document_id: string | null
  user_id: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  detail: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

export interface JkbTag {
  id: string
  workspace_id: string
  name: string
  color: string
  created_by: string
  created_at: string
}



// 追加到 src/types/database.ts 末尾

export interface JkbDepartment {
  id: string
  name: string
  code: string | null
  description: string | null
  parent_id: string | null
  path: string
  level: number
  sort_order: number
  manager_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface JkbUserDepartment {
  id: string
  user_id: string
  department_id: string
  is_primary: boolean
  position: string | null
  joined_at: string
}

// 带子部门的部门树节点
export interface DepartmentTreeNode extends JkbDepartment {
  children: DepartmentTreeNode[]
  member_count?: number
  manager?: JkbUser | null
}

// 用户的部门信息
export interface UserDepartmentInfo {
  department: JkbDepartment
  is_primary: boolean
  position: string | null
}

// 带部门信息的用户
export interface UserWithDepartments {
  id: string
  phone: string
  display_name: string | null
  avatar_url: string | null
  role: string
  is_active: boolean
  created_at: string
  primary_department: JkbDepartment | null
  extra_departments: JkbDepartment[]
  roles: import('./rbac').Role[]
}

// 转粉工单
export interface TransferFanOrder {
  id: string
  source_user_ids: string[]
  target_user_id: string
  status: 'submitted' | 'pending' | 'processed' | 'cancelled' | 'rejected'
  reject_reason: string | null
  remark: string | null
  created_by: string
  processed_by: string | null
  processed_at: string | null
  created_at: string
  updated_at: string
  // 关联数据（通过SQL join获取）
  target_user?: {
    id: string
    display_name: string | null
    phone: string | null
    avatar_url: string | null
  }
  creator?: {
    id: string
    display_name: string | null
    phone: string | null
    avatar_url: string | null
  }
  processor?: {
    id: string
    display_name: string | null
    phone: string | null
    avatar_url: string | null
  }
}

// 转粉工单状态枚举
export const TRANSFER_FAN_STATUS_LABELS: Record<string, string> = {
  submitted: '已提交',
  pending: '待处理',
  processed: '已处理',
  cancelled: '已取消',
  rejected: '驳回',
}

// 加急按钮点击日志
export interface UrgentLog {
  id: string
  user_id: string
  created_at: string
  // 关联用户信息
  user?: {
    id: string
    display_name: string | null
    phone: string | null
    avatar_url: string | null
  }
}

export const TRANSFER_FAN_STATUS_COLORS: Record<string, string> = {
  submitted: 'text-blue-600 bg-blue-50',
  pending: 'text-amber-600 bg-amber-50',
  processed: 'text-green-600 bg-green-50',
  cancelled: 'text-gray-500 bg-gray-50',
  rejected: 'text-red-600 bg-red-50',
}