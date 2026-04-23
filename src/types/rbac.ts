// 权限定义
export interface Permission {
  id: string
  name: string
  code: string
  description: string | null
  resource: string // 如: workspace, document, user
  action: string // 如: create, read, update, delete
  created_at: string
}

// 角色定义
export interface Role {
  id: string
  name: string
  code: string
  description: string | null
  level: number // 权重，数字越大权限越高
  is_system: boolean // 系统内置角色不可删除
  created_at: string
  updated_at: string
}

// 角色-权限关联
export interface RolePermission {
  role_id: string
  permission_id: string
  granted_at: string
}

// 用户-角色关联
export interface UserRole {
  user_id: string
  role_id: string
  granted_by: string | null
  granted_at: string
}

// 完整的角色信息（含权限）
export interface RoleWithPermissions extends Role {
  permissions: Permission[]
}

// 完整的用户信息（含角色）
export interface UserWithRoles {
  id: string
  phone: string
  display_name: string | null
  avatar_url: string | null
  roles: Role[]
}