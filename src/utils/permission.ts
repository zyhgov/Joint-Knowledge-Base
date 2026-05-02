import { JkbUserProfile, JkbDepartment } from '@/types/database'
import { JkbFile, JkbWorkspace } from '@/types/files'

// ============================================================
// 权限码常量定义
// 与数据库 jkb_permissions 表中的 code 字段一一对应
// ============================================================
export const PERM = {
  // 文件权限 - code 必须与数据库 jkb_permissions.code 一致
  FILE_CREATE: 'file_create',
  FILE_READ: 'file_read',
  FILE_EDIT: 'file_edit',
  FILE_DELETE: 'file_delete',
  FILE_SHARE: 'file_share',
  FILE_MANAGE: 'file_manage',

  // 文件夹权限
  FOLDER_CREATE: 'folder_create',
  FOLDER_READ: 'folder_read',
  FOLDER_UPDATE: 'folder_update',
  FOLDER_DELETE: 'folder_delete',
  FOLDER_MANAGE: 'folder_manage',

  // 工作区权限
  WORKSPACE_CREATE: 'workspace_create',
  WORKSPACE_READ: 'workspace_read',
  WORKSPACE_EDIT: 'workspace_edit',
  WORKSPACE_DELETE: 'workspace_delete',
  WORKSPACE_MANAGE: 'workspace_manage',

  // 文档权限
  DOCUMENT_CREATE: 'document_create',
  DOCUMENT_READ: 'document_read',
  DOCUMENT_EDIT: 'document_edit',
  DOCUMENT_DELETE: 'document_delete',
  DOCUMENT_SHARE: 'document_share',

  // 用户/角色/部门管理
  USER_MANAGE: 'user_manage',
  ROLE_MANAGE: 'role_manage',
  DEPARTMENT_MANAGE: 'department_manage',

  // 通知/公告
  NOTIFICATION_MANAGE: 'notification_manage',
  ANNOUNCEMENT_MANAGE: 'announcement_manage',

  // 转粉工单
  TRANSFER_FAN_READ: 'transfer_fan_read',
  TRANSFER_FAN_CREATE: 'transfer_fan_create',
  TRANSFER_FAN_MANAGE: 'transfer_fan_manage',
} as const

export type PermissionCode = (typeof PERM)[keyof typeof PERM]

// ============================================================
// 基础权限判断
// ============================================================

/**
 * 判断用户是否拥有某个权限码
 * super_admin/admin 始终拥有所有权限
 * 其他用户（包括自定义角色）通过权限码列表判断
 */
export function hasPermission(
  user: JkbUserProfile | null,
  userPermissions: string[],
  permissionCode: string
): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  return userPermissions.includes(permissionCode)
}

/**
 * 判断用户是否拥有任意一个权限码
 * super_admin/admin 始终拥有所有权限
 */
export function hasAnyPermission(
  user: JkbUserProfile | null,
  userPermissions: string[],
  ...codes: string[]
): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  return codes.some(code => userPermissions.includes(code))
}

/**
 * 判断用户是否为管理员（超级管理员或管理员）
 */
export function isAdmin(user: JkbUserProfile | null): boolean {
  if (!user) return false
  const role = user.role
  if (role === 'super_admin' || role === 'admin') return true
  return false
}

/**
 * 判断用户是否为超级管理员
 */
export function isSuperAdmin(user: JkbUserProfile | null): boolean {
  return user?.role === 'super_admin'
}

// ============================================================
// 部门继承
// ============================================================

/**
 * 获取用户所有部门ID（包括祖先部门），用于权限继承
 * 例如：用户属于 "若善/银发事业部/一部"，则返回 [一部id, 银发事业部id, 若善id]
 */
export function getAllDepartmentIdsWithAncestors(
  directDeptIds: string[],
  allDepts: JkbDepartment[]
): string[] {
  const result = new Set<string>()
  const deptMap = new Map(allDepts.map(d => [d.id, d]))

  function addWithAncestors(id: string) {
    if (result.has(id)) return
    result.add(id)
    const dept = deptMap.get(id)
    if (dept?.parent_id) {
      addWithAncestors(dept.parent_id)
    }
  }

  directDeptIds.forEach(addWithAncestors)
  return [...result]
}

// ============================================================
// 访问权限（可见性控制）
// ============================================================

/**
 * 判断用户是否可以访问某个文件
 */
export function canAccessFile(
  user: JkbUserProfile | null,
  file: JkbFile,
  userDeptIds: string[],
  workspaces: JkbWorkspace[]
): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  if (file.uploaded_by === user.id) return true

  switch (file.access_level) {
    case 'public':
      return true

    case 'workspace': {
      if (!file.visible_workspace_ids?.length) return true
      return file.visible_workspace_ids.some(wsId => {
        const ws = workspaces.find(w => w.id === wsId)
        if (!ws) return false
        return canAccessWorkspace(user, ws, userDeptIds)
      })
    }

    case 'department': {
      if (!file.visible_department_ids?.length) return true
      return file.visible_department_ids.some(dId => userDeptIds.includes(dId))
    }

    case 'private':
      return file.uploaded_by === user.id

    default:
      return false
  }
}

/**
 * 判断用户是否可以访问某个工作区
 */
export function canAccessWorkspace(
  user: JkbUserProfile | null,
  workspace: JkbWorkspace,
  userDeptIds: string[]
): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  if (workspace.owner_id === user.id) return true
  if (workspace.is_public) return true
  if (workspace.department_ids?.some(dId => userDeptIds.includes(dId))) return true
  return false
}

// ============================================================
// 操作权限（基于 RBAC 权限码 + 所有者）
// 核心改动：所有 canXxx 函数新增 userPermissions 参数
// ============================================================

/**
 * 判断用户是否可以上传文件
 * 条件：管理员 / 拥有 file_create 权限码
 */
export function canUploadFile(
  user: JkbUserProfile | null,
  userPermissions: string[]
): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  return userPermissions.includes(PERM.FILE_CREATE)
}

/**
 * 判断用户是否可以编辑某个文件
 * 条件：管理员 / 拥有 file_edit 权限码 / 文件上传者
 */
export function canEditFile(
  user: JkbUserProfile | null,
  file: JkbFile,
  userPermissions: string[] = []
): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  if (file.uploaded_by === user.id) return true
  return userPermissions.includes(PERM.FILE_EDIT) || userPermissions.includes(PERM.FILE_MANAGE)
}

/**
 * 判断用户是否可以删除某个文件
 * 条件：管理员 / 拥有 file_delete 权限码 / 文件上传者
 */
export function canDeleteFile(
  user: JkbUserProfile | null,
  file: JkbFile,
  userPermissions: string[] = []
): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  if (file.uploaded_by === user.id) return true
  return userPermissions.includes(PERM.FILE_DELETE) || userPermissions.includes(PERM.FILE_MANAGE)
}

/**
 * 判断用户是否可以分享某个文件
 * 条件：管理员 / 拥有 file_share 权限码 / 文件上传者
 */
export function canShareFile(
  user: JkbUserProfile | null,
  file: JkbFile,
  userPermissions: string[] = []
): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  if (file.uploaded_by === user.id) return true
  return userPermissions.includes(PERM.FILE_SHARE) || userPermissions.includes(PERM.FILE_MANAGE)
}

/**
 * 判断用户是否可以创建工作区
 * 条件：管理员 / 拥有 workspace_create 权限码
 */
export function canCreateWorkspace(
  user: JkbUserProfile | null,
  userPermissions: string[]
): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  return userPermissions.includes(PERM.WORKSPACE_CREATE)
}

/**
 * 判断用户是否可以编辑某个工作区
 * 条件：管理员 / 拥有 workspace_edit 权限码 / 工作区所有者
 */
export function canEditWorkspace(
  user: JkbUserProfile | null,
  workspace: JkbWorkspace,
  userPermissions: string[] = []
): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  if (workspace.owner_id === user.id) return true
  return userPermissions.includes(PERM.WORKSPACE_EDIT) || userPermissions.includes(PERM.WORKSPACE_MANAGE)
}

/**
 * 判断用户是否可以删除某个工作区
 * 条件：超级管理员 / 拥有 workspace_delete 权限码 / 工作区所有者
 */
export function canDeleteWorkspace(
  user: JkbUserProfile | null,
  workspace: JkbWorkspace,
  userPermissions: string[] = []
): boolean {
  if (!user) return false
  if (isSuperAdmin(user)) return true
  if (workspace.owner_id === user.id) return true
  return userPermissions.includes(PERM.WORKSPACE_DELETE) || userPermissions.includes(PERM.WORKSPACE_MANAGE)
}

/**
 * 判断用户是否可以创建文档
 */
export function canCreateDocument(
  user: JkbUserProfile | null,
  userPermissions: string[]
): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  return userPermissions.includes(PERM.DOCUMENT_CREATE)
}

/**
 * 判断用户是否可以编辑文档
 */
export function canEditDocument(
  user: JkbUserProfile | null,
  userPermissions: string[]
): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  return userPermissions.includes(PERM.DOCUMENT_EDIT) || userPermissions.includes(PERM.DOCUMENT_SHARE)
}

/**
 * 判断用户是否可以删除文档
 */
export function canDeleteDocument(
  user: JkbUserProfile | null,
  userPermissions: string[]
): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  return userPermissions.includes(PERM.DOCUMENT_DELETE)
}

/**
 * 判断用户是否可以分享文档
 */
export function canShareDocument(
  user: JkbUserProfile | null,
  userPermissions: string[]
): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  return userPermissions.includes(PERM.DOCUMENT_SHARE)
}

/**
 * 判断用户是否可以编辑文件夹
 * 条件：管理员 / 拥有 folder_update 或 folder_manage 权限码
 */
export function canEditFolder(
  user: JkbUserProfile | null,
  userPermissions: string[]
): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  return userPermissions.includes(PERM.FOLDER_UPDATE) || userPermissions.includes(PERM.FOLDER_MANAGE)
}

/**
 * 判断用户是否可以删除文件夹
 * 条件：管理员 / 拥有 folder_delete 或 folder_manage 权限码
 */
export function canDeleteFolder(
  user: JkbUserProfile | null,
  userPermissions: string[]
): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  return userPermissions.includes(PERM.FOLDER_DELETE) || userPermissions.includes(PERM.FOLDER_MANAGE)
}

/**
 * 判断用户是否可以创建文件夹
 * 条件：管理员 / 拥有 folder_create 权限码
 */
export function canCreateFolder(
  user: JkbUserProfile | null,
  userPermissions: string[]
): boolean {
  if (!user) return false
  if (isAdmin(user)) return true
  return userPermissions.includes(PERM.FOLDER_CREATE)
}

// ============================================================
// 过滤函数
// ============================================================

/**
 * 获取用户可见的文件列表
 */
export function filterFilesByPermission(
  files: JkbFile[],
  user: JkbUserProfile | null,
  userDeptIds: string[],
  workspaces: JkbWorkspace[]
): JkbFile[] {
  if (!user) return []
  if (isAdmin(user)) return files
  return files.filter(file => canAccessFile(user, file, userDeptIds, workspaces))
}

/**
 * 获取用户可见的工作区列表
 */
export function filterWorkspacesByPermission(
  workspaces: JkbWorkspace[],
  user: JkbUserProfile | null,
  userDeptIds: string[]
): JkbWorkspace[] {
  if (!user) return []
  if (isAdmin(user)) return workspaces
  return workspaces.filter(ws => canAccessWorkspace(user, ws, userDeptIds))
}
