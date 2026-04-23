import { supabase } from './supabase'
import { cryptoService } from './crypto'
import { JkbUser } from '@/types/database'
import { UserWithDepartments } from '@/types/database'

export const userService = {
  // 获取所有用户（含部门和角色）
  getAllUsers: async (): Promise<UserWithDepartments[]> => {
    // 获取用户
    const { data: users, error: usersError } = await supabase
      .from('jkb_users')
      .select('id, phone, display_name, avatar_url, role, is_active, created_at')
      .order('created_at', { ascending: false })

    if (usersError) throw usersError

    // 获取用户角色
    const { data: userRoles, error: rolesError } = await supabase
      .from('jkb_user_roles')
      .select('user_id, role:jkb_roles(*)')

    if (rolesError) throw rolesError

    // 获取用户部门
    const { data: userDepts, error: deptsError } = await supabase
      .from('jkb_user_departments')
      .select('user_id, is_primary, department:jkb_departments(*)')

    if (deptsError) throw deptsError

    // 组合数据
    return users.map((user: any) => {
      const roles = userRoles
        ?.filter((ur: any) => ur.user_id === user.id)
        .map((ur: any) => ur.role)
        .filter(Boolean) || []

      const depts = userDepts
        ?.filter((ud: any) => ud.user_id === user.id)
        .filter((ud: any) => ud.department) || []

      const primaryDept = depts.find((d: any) => d.is_primary)?.department || null
      const extraDepts = depts
        .filter((d: any) => !d.is_primary)
        .map((d: any) => d.department)

      return {
        ...user,
        roles,
        primary_department: primaryDept,
        extra_departments: extraDepts,
      }
    })
  },

  // 创建用户
  createUser: async (data: {
    phone: string
    password: string
    display_name: string
    role_ids?: string[]
  }): Promise<JkbUser> => {
    const passwordHash = await cryptoService.hashPassword(data.password)

    const { data: newUser, error } = await supabase
      .from('jkb_users')
      .insert({
        phone: data.phone,
        password_hash: passwordHash,
        display_name: data.display_name,
        is_active: true,
      })
      .select()
      .single()

    if (error) throw error

    if (data.role_ids && data.role_ids.length > 0) {
      await userService.assignRoles(newUser.id, data.role_ids)
    }

    return newUser
  },

  // 批量导入用户
  importUsers: async (
    users: Array<{
      phone: string
      password: string
      display_name: string
      role_code?: string
    }>
  ): Promise<{ success: number; failed: number; errors: string[] }> => {
    let success = 0
    let failed = 0
    const errors: string[] = []

    for (const user of users) {
      try {
        const passwordHash = await cryptoService.hashPassword(user.password)

        const { data: newUser, error } = await supabase
          .from('jkb_users')
          .insert({
            phone: user.phone,
            password_hash: passwordHash,
            display_name: user.display_name,
            is_active: true,
          })
          .select()
          .single()

        if (error) throw error

        if (user.role_code) {
          const { data: role } = await supabase
            .from('jkb_roles')
            .select('id')
            .eq('code', user.role_code)
            .single()

          if (role) {
            await supabase.from('jkb_user_roles').insert({
              user_id: newUser.id,
              role_id: role.id,
            })
          }
        }

        success++
      } catch (error: any) {
        failed++
        errors.push(`${user.phone}: ${error.message}`)
      }
    }

    return { success, failed, errors }
  },

  // 更新用户
  updateUser: async (
    userId: string,
    data: Partial<{
      display_name: string
      avatar_url: string | null
      bio: string
      is_active: boolean
    }>
  ): Promise<JkbUser> => {
    const { data: updatedUser, error } = await supabase
      .from('jkb_users')
      .update(data)
      .eq('id', userId)
      .select()
      .single()

    if (error) throw error
    return updatedUser
  },

  // 更新密码
  updatePassword: async (userId: string, newPassword: string): Promise<void> => {
    const passwordHash = await cryptoService.hashPassword(newPassword)
    const { error } = await supabase
      .from('jkb_users')
      .update({ password_hash: passwordHash })
      .eq('id', userId)

    if (error) throw error
  },

  // 停用用户（强制下线）
  deactivateUser: async (userId: string): Promise<void> => {
    // 先清除所有会话（立即强制下线）
    await supabase.from('jkb_sessions').delete().eq('user_id', userId)
    // 再停用账户
    const { error } = await supabase
      .from('jkb_users')
      .update({ is_active: false })
      .eq('id', userId)

    if (error) throw error
  },

  // 启用用户
  activateUser: async (userId: string): Promise<void> => {
    const { error } = await supabase
      .from('jkb_users')
      .update({ is_active: true })
      .eq('id', userId)

    if (error) throw error
  },

  // 删除用户
  deleteUser: async (userId: string): Promise<void> => {
    // 先清除会话
    await supabase.from('jkb_sessions').delete().eq('user_id', userId)
    const { error } = await supabase
      .from('jkb_users')
      .delete()
      .eq('id', userId)

    if (error) throw error
  },

  // 分配角色
  assignRoles: async (userId: string, roleIds: string[]): Promise<void> => {
    await supabase.from('jkb_user_roles').delete().eq('user_id', userId)

    if (roleIds.length > 0) {
      const { error } = await supabase.from('jkb_user_roles').insert(
        roleIds.map((roleId) => ({ user_id: userId, role_id: roleId }))
      )
      if (error) throw error
    }
  },

  // 获取用户权限
  getUserPermissions: async (userId: string): Promise<string[]> => {
    const { data, error } = await supabase.rpc('get_user_permissions', {
      user_uuid: userId,
    })
    if (error) throw error
    return data?.map((item: any) => item.permission_code) || []
  },

  // 检查用户是否有某个权限
  checkPermission: async (userId: string, permissionCode: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc('user_has_permission', {
      user_uuid: userId,
      perm_code: permissionCode,
    })
    if (error) throw error
    return data || false
  },
}