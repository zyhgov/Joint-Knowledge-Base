import { supabase } from './supabase'
import {
  JkbDepartment,
  DepartmentTreeNode,
  UserDepartmentInfo,
} from '@/types/database'

export const departmentService = {
  // 获取所有部门（平铺列表）
  getAllDepartments: async (): Promise<JkbDepartment[]> => {
    const { data, error } = await supabase
      .from('jkb_departments')
      .select('*')
      .eq('is_active', true)
      .order('level', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error
    return data
  },

  // 构建部门树
  buildDepartmentTree: (departments: JkbDepartment[]): DepartmentTreeNode[] => {
    const map = new Map<string, DepartmentTreeNode>()
    const roots: DepartmentTreeNode[] = []

    // 初始化节点
    departments.forEach((dept) => {
      map.set(dept.id, { ...dept, children: [] })
    })

    // 构建树形结构
    departments.forEach((dept) => {
      const node = map.get(dept.id)!
      if (dept.parent_id && map.has(dept.parent_id)) {
        map.get(dept.parent_id)!.children.push(node)
      } else {
        roots.push(node)
      }
    })

    return roots
  },

  // 创建部门
  createDepartment: async (data: {
    name: string
    code?: string
    description?: string
    parent_id?: string | null
    manager_id?: string | null
    sort_order?: number
  }): Promise<JkbDepartment> => {
    const { data: newDept, error } = await supabase
      .from('jkb_departments')
      .insert({
        name: data.name,
        code: data.code || null,
        description: data.description || null,
        parent_id: data.parent_id || null,
        manager_id: data.manager_id || null,
        sort_order: data.sort_order || 0,
        is_active: true,
      })
      .select()
      .single()

    if (error) throw error
    return newDept
  },

  // 更新部门
  updateDepartment: async (
    id: string,
    data: Partial<{
      name: string
      code: string
      description: string
      parent_id: string | null
      manager_id: string | null
      sort_order: number
      is_active: boolean
    }>
  ): Promise<JkbDepartment> => {
    const { data: updated, error } = await supabase
      .from('jkb_departments')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return updated
  },

  // 删除部门
  deleteDepartment: async (id: string): Promise<void> => {
    // 检查是否有子部门
    const { data: children } = await supabase
      .from('jkb_departments')
      .select('id')
      .eq('parent_id', id)
      .limit(1)

    if (children && children.length > 0) {
      throw new Error('请先删除或移动该部门下的子部门')
    }

    // 检查是否有成员
    const { data: members } = await supabase
      .from('jkb_user_departments')
      .select('id')
      .eq('department_id', id)
      .limit(1)

    if (members && members.length > 0) {
      throw new Error('请先移除该部门下的所有成员')
    }

    const { error } = await supabase
      .from('jkb_departments')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // 获取用户的部门信息
  getUserDepartments: async (userId: string): Promise<UserDepartmentInfo[]> => {
    const { data, error } = await supabase
      .from('jkb_user_departments')
      .select(`
        is_primary,
        position,
        department:jkb_departments(*)
      `)
      .eq('user_id', userId)

    if (error) throw error

    return (data || []).map((item: any) => ({
      department: item.department,
      is_primary: item.is_primary,
      position: item.position,
    }))
  },

  // 批量设置用户部门
  setUserDepartments: async (
    userId: string,
    departments: Array<{
      department_id: string
      is_primary: boolean
      position?: string
    }>
  ): Promise<void> => {
    // 删除旧的部门关联
    await supabase
      .from('jkb_user_departments')
      .delete()
      .eq('user_id', userId)

    if (departments.length === 0) return

    // 确保只有一个主部门
    let hasPrimary = false
    const depts = departments.map((d) => {
      if (d.is_primary && !hasPrimary) {
        hasPrimary = true
        return { ...d, is_primary: true }
      }
      return { ...d, is_primary: false }
    })

    // 插入新的部门关联
    const { error } = await supabase.from('jkb_user_departments').insert(
      depts.map((d) => ({
        user_id: userId,
        department_id: d.department_id,
        is_primary: d.is_primary,
        position: d.position || null,
      }))
    )

    if (error) throw error
  },

  // 批量设置部门成员
  setDepartmentMembers: async (
    departmentId: string,
    userIds: string[],
    isPrimary: boolean = false
  ): Promise<void> => {
    // 先删除该部门所有成员
    await supabase
      .from('jkb_user_departments')
      .delete()
      .eq('department_id', departmentId)

    if (userIds.length === 0) return

    // 插入新成员
    const { error } = await supabase.from('jkb_user_departments').insert(
      userIds.map((userId) => ({
        user_id: userId,
        department_id: departmentId,
        is_primary: isPrimary,
      }))
    )

    if (error) throw error
  },

  // 获取部门成员
  getDepartmentMembers: async (departmentId: string) => {
    const { data, error } = await supabase
      .from('jkb_user_departments')
      .select(`
        is_primary,
        position,
        user:jkb_users(id, phone, display_name, avatar_url, role, is_active)
      `)
      .eq('department_id', departmentId)

    if (error) throw error
    return data || []
  },

  // 获取部门成员数量
  getDepartmentMemberCounts: async (): Promise<Record<string, number>> => {
    const { data, error } = await supabase
      .from('jkb_user_departments')
      .select('department_id')

    if (error) throw error

    const counts: Record<string, number> = {}
    data?.forEach((item: any) => {
      counts[item.department_id] = (counts[item.department_id] || 0) + 1
    })
    return counts
  },
}