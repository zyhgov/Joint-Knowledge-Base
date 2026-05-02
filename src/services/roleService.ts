import { supabase } from './supabase'
import { Role, RoleWithPermissions, Permission } from '@/types/rbac'

export const roleService = {
  // 获取所有角色
  getAllRoles: async (): Promise<RoleWithPermissions[]> => {
    // 先获取角色
    const { data: roles, error: rolesError } = await supabase
      .from('jkb_roles')
      .select('*')
      .order('level', { ascending: false })

    if (rolesError) throw rolesError

    // 再获取角色权限关联
    const { data: rolePermissions, error: rpError } = await supabase
      .from('jkb_role_permissions')
      .select(`
        role_id,
        permission:jkb_permissions (*)
      `)

    if (rpError) throw rpError

    // 组合数据
    return roles.map((role: any) => ({
      ...role,
      permissions: rolePermissions
        ?.filter((rp: any) => rp.role_id === role.id)
        .map((rp: any) => rp.permission)
        .filter(Boolean) || [],
    }))
  },

  // 获取所有权限
  getAllPermissions: async (): Promise<Permission[]> => {
    const { data, error } = await supabase
      .from('jkb_permissions')
      .select('*')
      .order('resource', { ascending: true })

    if (error) throw error
    return data
  },

  // 创建角色
  createRole: async (data: {
    name: string
    code: string
    description?: string
    level: number
    permission_ids: string[]
  }): Promise<Role> => {
    const { data: newRole, error } = await supabase
      .from('jkb_roles')
      .insert({
        name: data.name,
        code: data.code,
        description: data.description,
        level: data.level,
        is_system: false,
      })
      .select()
      .single()

    if (error) throw error

    // 分配权限
    if (data.permission_ids.length > 0) {
      await roleService.assignPermissions(newRole.id, data.permission_ids)
    }

    return newRole
  },

  // 更新角色
  updateRole: async (
    roleId: string,
    data: Partial<{
      name: string
      description: string
      level: number
      permission_ids: string[]
    }>
  ): Promise<Role> => {
    const { permission_ids, ...roleData } = data

    const { data: updatedRole, error } = await supabase
      .from('jkb_roles')
      .update(roleData)
      .eq('id', roleId)
      .select()
      .single()

    if (error) throw error

    // 更新权限
    if (permission_ids !== undefined) {
      await roleService.assignPermissions(roleId, permission_ids)
    }

    return updatedRole
  },

  // 删除角色
  deleteRole: async (roleId: string): Promise<void> => {
    // 检查是否是系统角色
    const { data: role } = await supabase
      .from('jkb_roles')
      .select('is_system')
      .eq('id', roleId)
      .single()

    if (role?.is_system) {
      throw new Error('系统内置角色不可删除')
    }

    const { error } = await supabase.from('jkb_roles').delete().eq('id', roleId)

    if (error) throw error
  },

  // 分配权限
  assignPermissions: async (
    roleId: string,
    permissionIds: string[]
  ): Promise<void> => {
    // 先删除旧权限
    await supabase.from('jkb_role_permissions').delete().eq('role_id', roleId)

    // 插入新权限
    if (permissionIds.length > 0) {
      const { error } = await supabase.from('jkb_role_permissions').insert(
        permissionIds.map((permissionId) => ({
          role_id: roleId,
          permission_id: permissionId,
        }))
      )

      if (error) throw error
    }
  },

  // 创建权限
  createPermission: async (data: {
    name: string
    code: string
    description?: string
    resource: string
    action: string
  }): Promise<Permission> => {
    const { data: newPermission, error } = await supabase
      .from('jkb_permissions')
      .insert(data)
      .select()
      .single()

    if (error) throw error
    return newPermission
  },

  // 更新权限
  updatePermission: async (
    permissionId: string,
    data: Partial<{
      name: string
      description: string
    }>
  ): Promise<Permission> => {
    const { data: updatedPermission, error } = await supabase
      .from('jkb_permissions')
      .update(data)
      .eq('id', permissionId)
      .select()
      .single()

    if (error) throw error
    return updatedPermission
  },

  // 删除权限
  deletePermission: async (permissionId: string): Promise<void> => {
    const { error } = await supabase
      .from('jkb_permissions')
      .delete()
      .eq('id', permissionId)

    if (error) throw error
  },

  // 同步标准权限到数据库（幂等操作）
  syncStandardPermissions: async (): Promise<{ added: number; skipped: number }> => {
    const standardPermissions = [
      // 工作区
      { name: '查看工作区', code: 'workspace_read', resource: 'workspace', action: 'read', description: '查看工作区列表和详情' },
      { name: '创建工作区', code: 'workspace_create', resource: 'workspace', action: 'create', description: '创建新的工作区' },
      { name: '编辑工作区', code: 'workspace_edit', resource: 'workspace', action: 'update', description: '修改工作区信息' },
      { name: '删除工作区', code: 'workspace_delete', resource: 'workspace', action: 'delete', description: '删除工作区' },
      { name: '管理工作区', code: 'workspace_manage', resource: 'workspace', action: 'manage', description: '管理所有工作区设置和成员' },
      // 文档
      { name: '查看文档', code: 'document_read', resource: 'document', action: 'read', description: '查看文档内容' },
      { name: '创建文档', code: 'document_create', resource: 'document', action: 'create', description: '创建新文档' },
      { name: '编辑文档', code: 'document_edit', resource: 'document', action: 'update', description: '修改文档内容' },
      { name: '删除文档', code: 'document_delete', resource: 'document', action: 'delete', description: '删除文档' },
      { name: '分享文档', code: 'document_share', resource: 'document', action: 'share', description: '分享文档给他人' },
      // 文件
      { name: '查看文件', code: 'file_read', resource: 'file', action: 'read', description: '查看文件列表和详情' },
      { name: '上传文件', code: 'file_create', resource: 'file', action: 'create', description: '上传新文件' },
      { name: '编辑文件', code: 'file_edit', resource: 'file', action: 'update', description: '修改文件信息和权限' },
      { name: '删除文件', code: 'file_delete', resource: 'file', action: 'delete', description: '删除文件' },
      { name: '分享文件', code: 'file_share', resource: 'file', action: 'share', description: '分享文件给他人' },
      { name: '管理文件', code: 'file_manage', resource: 'file', action: 'manage', description: '管理所有文件的权限和访问' },
      // 文件夹
      { name: '创建文件夹', code: 'folder_create', resource: 'folder', action: 'create', description: '创建新文件夹' },
      { name: '查看文件夹', code: 'folder_read', resource: 'folder', action: 'read', description: '查看文件夹列表和内容' },
      { name: '编辑文件夹', code: 'folder_update', resource: 'folder', action: 'update', description: '修改文件夹信息和权限' },
      { name: '删除文件夹', code: 'folder_delete', resource: 'folder', action: 'delete', description: '删除文件夹' },
      { name: '管理文件夹', code: 'folder_manage', resource: 'folder', action: 'manage', description: '管理所有文件夹的权限和访问' },
      // 用户
      { name: '查看用户', code: 'user_read', resource: 'user', action: 'read', description: '查看用户列表' },
      { name: '创建用户', code: 'user_create', resource: 'user', action: 'create', description: '创建新用户' },
      { name: '编辑用户', code: 'user_update', resource: 'user', action: 'update', description: '修改用户信息' },
      { name: '删除用户', code: 'user_delete', resource: 'user', action: 'delete', description: '删除用户' },
      { name: '管理用户', code: 'user_manage', resource: 'user', action: 'manage', description: '管理用户角色和部门' },
      // 角色
      { name: '查看角色', code: 'role_read', resource: 'role', action: 'read', description: '查看角色列表' },
      { name: '创建角色', code: 'role_create', resource: 'role', action: 'create', description: '创建新角色' },
      { name: '编辑角色', code: 'role_update', resource: 'role', action: 'update', description: '修改角色权限' },
      { name: '删除角色', code: 'role_delete', resource: 'role', action: 'delete', description: '删除角色' },
      { name: '管理角色', code: 'role_manage', resource: 'role', action: 'manage', description: '管理角色和权限配置' },
      // 部门
      { name: '查看部门', code: 'department_read', resource: 'department', action: 'read', description: '查看组织架构' },
      { name: '创建部门', code: 'department_create', resource: 'department', action: 'create', description: '创建新部门' },
      { name: '编辑部门', code: 'department_update', resource: 'department', action: 'update', description: '修改部门信息' },
      { name: '删除部门', code: 'department_delete', resource: 'department', action: 'delete', description: '删除部门' },
      { name: '管理部门', code: 'department_manage', resource: 'department', action: 'manage', description: '管理部门成员和结构' },
      // 通知
      { name: '查看通知', code: 'notification_read', resource: 'notification', action: 'read', description: '查看通知列表' },
      { name: '创建通知', code: 'notification_create', resource: 'notification', action: 'create', description: '创建新通知' },
      { name: '编辑通知', code: 'notification_update', resource: 'notification', action: 'update', description: '修改通知内容' },
      { name: '删除通知', code: 'notification_delete', resource: 'notification', action: 'delete', description: '删除通知' },
      { name: '管理通知', code: 'notification_manage', resource: 'notification', action: 'manage', description: '管理所有通知' },
      // 统计
      { name: '查看统计', code: 'stats_read', resource: 'stats', action: 'read', description: '查看文件统计数据' },
      // 古诗
      { name: '查看古诗', code: 'poem_read', resource: 'poem', action: 'read', description: '查看古诗列表' },
      { name: '管理古诗', code: 'poem_manage', resource: 'poem', action: 'manage', description: '管理古诗内容和排序' },
      // 设置
      { name: '查看设置', code: 'settings_read', resource: 'settings', action: 'read', description: '查看系统设置' },
      { name: '修改设置', code: 'settings_update', resource: 'settings', action: 'update', description: '修改系统设置' },
      // 公告与任务
      { name: '查看公告', code: 'announcement_read', resource: 'announcement', action: 'read', description: '查看公告和任务列表' },
      { name: '创建公告', code: 'announcement_create', resource: 'announcement', action: 'create', description: '创建公告/通知/打卡/任务' },
      { name: '编辑公告', code: 'announcement_update', resource: 'announcement', action: 'update', description: '编辑公告和任务' },
      { name: '删除公告', code: 'announcement_delete', resource: 'announcement', action: 'delete', description: '删除公告和任务' },
      { name: '管理公告', code: 'announcement_manage', resource: 'announcement', action: 'manage', description: '管理所有公告和任务' },
      // 转粉工单
      { name: '查看转粉工单', code: 'transfer_fan_read', resource: 'transfer_fan', action: 'read', description: '查看转粉工单列表' },
      { name: '创建转粉工单', code: 'transfer_fan_create', resource: 'transfer_fan', action: 'create', description: '创建转粉工单' },
      { name: '管理转粉工单', code: 'transfer_fan_manage', resource: 'transfer_fan', action: 'manage', description: '处理和管理所有转粉工单' },
    ]

    // 获取已有权限（用 code 和 resource+action 两个维度过滤）
    const { data: existing } = await supabase
      .from('jkb_permissions')
      .select('code, resource, action')

    const existingCodes = new Set((existing || []).map((p: any) => p.code))
    const existingResourceActions = new Set(
      (existing || []).map((p: any) => `${p.resource}:${p.action}`)
    )

    // 过滤出新权限（code 不存在 且 resource+action 组合也不存在）
    const newPermissions = standardPermissions.filter(p =>
      !existingCodes.has(p.code) && !existingResourceActions.has(`${p.resource}:${p.action}`)
    )

    if (newPermissions.length === 0) {
      return { added: 0, skipped: standardPermissions.length }
    }

    // 插入新权限
    const { error } = await supabase
      .from('jkb_permissions')
      .insert(newPermissions)

    if (error) throw error

    return { added: newPermissions.length, skipped: standardPermissions.length - newPermissions.length }
  },
}