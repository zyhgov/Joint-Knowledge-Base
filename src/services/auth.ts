import { supabase } from './supabase'
import { cryptoService } from './crypto'
import { JkbUserProfile } from '@/types/database'

// 从 RBAC 角色推导出 user.role 和 user.role_name
// 规则：
// 1. 系统内置角色（super_admin/admin/member/guest）直接用 code
// 2. 自定义角色保留原始 code（如 yy、zx 等），不再强制映射
// 3. 无角色时默认 member
function deriveRoleFromRbac(rbacRoles: any[]): { code: string; name: string } {
  if (!rbacRoles || rbacRoles.length === 0) return { code: 'member', name: '成员' }
  // 按角色 level 降序排列，取最高权限的角色
  const sorted = [...rbacRoles].sort((a, b) => (b.level || 0) - (a.level || 0))
  const topRole = sorted[0]
  // 直接使用角色的 code 和 name
  return {
    code: topRole.code || 'member',
    name: topRole.name || topRole.code || '成员',
  }
}

// 获取用户 RBAC 权限码列表
async function getUserPermissionCodes(userId: string): Promise<string[]> {
  // 方式1：尝试 RPC 函数（最可靠，使用 SECURITY DEFINER）
  try {
    const { data, error } = await supabase.rpc('get_user_permissions', {
      user_uuid: userId,
    })
    if (!error && data && data.length > 0) {
      const codes = data.map((item: any) => item.permission_code || item.code || '')
        .filter(Boolean)
      console.log('[Auth] RPC permissions:', codes.length, 'codes for user', userId, codes)
      return codes
    }
    if (error) {
      console.warn('[Auth] RPC get_user_permissions failed:', error.message)
    }
    if (data && data.length === 0) {
      console.warn('[Auth] RPC returned 0 permissions for user:', userId)
    }
  } catch (e: any) {
    console.warn('[Auth] RPC get_user_permissions exception:', e?.message)
  }

  // 方式2：手动查询（fallback）
  try {
    // 获取用户的所有角色ID
    const { data: userRoles, error: urError } = await supabase
      .from('jkb_user_roles')
      .select('role_id')
      .eq('user_id', userId)

    if (urError) {
      console.warn('[Auth] jkb_user_roles query failed:', urError.message)
    }

    if (!userRoles || userRoles.length === 0) {
      console.warn('[Auth] No roles found for user:', userId, userRoles)
      return []
    }

    const roleIds = userRoles.map((ur: any) => ur.role_id)
    console.log('[Auth] Found', roleIds.length, 'roles for user:', userId, roleIds)

    // 获取这些角色的所有权限ID
    const { data: rolePerms, error: rpError } = await supabase
      .from('jkb_role_permissions')
      .select('permission_id')
      .in('role_id', roleIds)

    if (rpError) {
      console.warn('[Auth] jkb_role_permissions query failed:', rpError.message)
    }

    if (!rolePerms || rolePerms.length === 0) {
      console.warn('[Auth] No role_permissions found for roleIds:', roleIds)
      return []
    }

    const permIds = [...new Set(rolePerms.map((rp: any) => rp.permission_id))]

    // 获取权限码
    const { data: perms, error: pError } = await supabase
      .from('jkb_permissions')
      .select('code')
      .in('id', permIds)

    if (pError) {
      console.warn('[Auth] jkb_permissions query failed:', pError.message)
    }

    const codes = perms?.map((p: any) => p.code).filter(Boolean) || []
    console.log('[Auth] Fallback permissions:', codes.length, 'codes for user', userId, codes)
    return codes
  } catch (e: any) {
    console.error('[Auth] Fallback permission query exception:', e?.message)
    return []
  }
}

// 获取用户 RBAC 角色列表
async function getUserRbacRoles(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('jkb_user_roles')
    .select('role:jkb_roles(*)')
    .eq('user_id', userId)
  if (error || !data) return []
  return data.map((ur: any) => ur.role).filter(Boolean)
}

export const authService = {
  login: async (phone: string, password: string): Promise<{
    user: JkbUserProfile
    token: string
    permissions: string[]
  }> => {
    try {
      const { data: userData, error: userError } = await supabase
        .from('jkb_users')
        .select('*')
        .eq('phone', phone)
        .single()

      if (userError || !userData) {
        throw new Error('用户不存在或手机号错误')
      }

      if (!userData.is_active) {
        throw new Error('该账户已被停用，请联系管理员')
      }

      const passwordMatch = await cryptoService.verifyPassword(
        password,
        userData.password_hash
      )

      if (!passwordMatch) {
        throw new Error('密码错误，请检查后重试')
      }

      const token = cryptoService.generateToken()
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

      const { error: sessionError } = await supabase
        .from('jkb_sessions')
        .insert({
          user_id: userData.id,
          token,
          expires_at: expiresAt.toISOString(),
        })

      if (sessionError) {
        throw new Error('创建会话失败，请重试')
      }

      await supabase
        .from('jkb_users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', userData.id)

      // 获取 RBAC 角色和权限
      const rbacRoles = await getUserRbacRoles(userData.id)
      const permissions = await getUserPermissionCodes(userData.id)
      const derived = deriveRoleFromRbac(rbacRoles)

      console.log('[Auth] Login user:', userData.id, 'role:', userData.role, 'rbacRoles:', rbacRoles.length, 'permissions:', permissions.length, permissions)

      // 同步 jkb_users.role 以兼容旧逻辑
      if (userData.role !== derived.code) {
        await supabase.from('jkb_users').update({ role: derived.code }).eq('id', userData.id)
        userData.role = derived.code
      }
      userData.role_name = derived.name

      return {
        user: userData as JkbUserProfile,
        token,
        permissions,
      }
    } catch (error: any) {
      throw new Error(error.message || '登录失败，请重试')
    }
  },

  // 验证 token 时同时检查用户是否被停用，并获取最新 RBAC 权限
  verifyToken: async (token: string): Promise<{ user: JkbUserProfile; permissions: string[] } | null> => {
    try {
      const { data: sessionData } = await supabase
        .from('jkb_sessions')
        .select('user_id, expires_at')
        .eq('token', token)
        .single()

      if (!sessionData) return null

      if (new Date(sessionData.expires_at) < new Date()) {
        await supabase.from('jkb_sessions').delete().eq('token', token)
        return null
      }

      const { data: userData } = await supabase
        .from('jkb_users')
        .select('*')
        .eq('id', sessionData.user_id)
        .single()

      if (!userData) return null

      // 如果用户被停用，删除所有会话，强制下线
      if (!userData.is_active) {
        await supabase
          .from('jkb_sessions')
          .delete()
          .eq('user_id', sessionData.user_id)
        return null
      }

      // 获取 RBAC 角色和权限
      const rbacRoles = await getUserRbacRoles(userData.id)
      const permissions = await getUserPermissionCodes(userData.id)
      const derived = deriveRoleFromRbac(rbacRoles)

      console.log('[Auth] VerifyToken user:', userData.id, 'role:', userData.role, 'rbacRoles:', rbacRoles.length, 'permissions:', permissions.length, permissions)
      if (userData.role !== derived.code) {
        await supabase.from('jkb_users').update({ role: derived.code }).eq('id', userData.id)
        userData.role = derived.code
      }
      userData.role_name = derived.name

      return { user: userData as JkbUserProfile, permissions }
    } catch (error) {
      return null
    }
  },

  logout: async (token: string): Promise<void> => {
    await supabase.from('jkb_sessions').delete().eq('token', token)
  },

  // 停用用户时同时清除所有会话（强制下线）
  deactivateUser: async (userId: string): Promise<void> => {
    // 先删除所有会话（强制下线）
    await supabase.from('jkb_sessions').delete().eq('user_id', userId)

    // 再停用用户
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
}