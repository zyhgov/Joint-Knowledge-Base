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

// AI 对话会话
export interface AIChatConversation {
  id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
  is_deleted?: boolean
  // 关联用户
  user?: {
    id: string
    display_name: string | null
    phone: string | null
  }
  // 最后一条消息（用于预览）
  last_message?: string
  message_count?: number
}

// AI 对话消息
export interface AIChatMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

// AI 用户封禁
export interface AIUserBan {
  id: string
  user_id: string
  banned_by: string | null
  reason: string | null
  banned_at: string
  // 关联用户
  user?: {
    id: string
    display_name: string | null
    phone: string | null
  }
  banned_by_user?: {
    id: string
    display_name: string | null
  }
}

// AI 知识预设
export interface AIKnowledgeBase {
  id: string
  content: string
  updated_at: string
  updated_by: string | null
  updated_by_user?: {
    id: string
    display_name: string | null
  }
}

// AI 预设问题
// 数据库表：ai_preset_questions
export interface AIPresetQuestion {
  id: string
  question: string
  is_hidden: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export const TRANSFER_FAN_STATUS_COLORS: Record<string, string> = {
  submitted: 'text-blue-600 bg-blue-50',
  pending: 'text-amber-600 bg-amber-50',
  processed: 'text-green-600 bg-green-50',
  cancelled: 'text-gray-500 bg-gray-50',
  rejected: 'text-red-600 bg-red-50',
}

// ====== 站内聊天系统 ======

export type ChatConversationType = 'direct' | 'group'
export type ChatMessageType = 'text' | 'system' | 'image'
export type ChatMessageStatus = 'sending' | 'sent' | 'failed' | 'read'

// 会话
export interface ChatConversation {
  id: string
  type: ChatConversationType
  name: string | null
  description: string | null
  avatar_url: string | null
  created_by: string
  disbanded_at: string | null
  created_at: string
  updated_at: string
}

// 会话参与者
export interface ChatParticipant {
  id: string
  conversation_id: string
  user_id: string
  last_read_at: string | null
  is_muted: boolean
  joined_at: string
}

// 消息
export interface ChatMessage {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  message_type: ChatMessageType
  status: ChatMessageStatus
  created_at: string
  edited_at: string | null
  is_deleted: boolean
  recalled_at: string | null
}

// 禁言
export interface ChatMute {
  id: string
  user_id: string
  conversation_id: string | null
  muted_by: string
  reason: string | null
  expires_at: string | null
  created_at: string
}

// 在线状态
export interface ChatPresence {
  user_id: string
  last_seen_at: string
  is_online: boolean
}

// 消息已读记录
export interface ChatMessageRead {
  id: string
  message_id: string
  user_id: string
  read_at: string
}

// 带关联数据的会话（前端用）
export interface ChatConversationWithDetails extends ChatConversation {
  participants: Array<{
    user: {
      id: string
      display_name: string | null
      avatar_url: string | null
      phone: string | null
    }
    last_read_at: string | null
    is_muted: boolean
  }>
  last_message: {
    content: string
    created_at: string
    sender_id: string
    message_type: ChatMessageType
  } | null
  unread_count: number
}

// 带用户信息的消息
export interface ChatMessageWithSender extends ChatMessage {
  sender: {
    id: string
    display_name: string | null
    avatar_url: string | null
  }
}

// 禁言带操作者信息
export interface ChatMuteWithDetails extends ChatMute {
  user?: {
    id: string
    display_name: string | null
    phone: string | null
  }
  muted_by_user?: {
    id: string
    display_name: string | null
  }
  conversation?: {
    id: string
    name: string | null
    type: string
  } | null
}