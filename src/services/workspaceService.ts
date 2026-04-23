import { supabase } from './supabase'
import { JkbWorkspace } from '@/types/files'

export const workspaceService = {
  // 获取所有工作区
  getAllWorkspaces: async (): Promise<JkbWorkspace[]> => {
    const { data, error } = await supabase
      .from('jkb_workspaces')
      .select(`
        *,
        owner:jkb_users!jkb_workspaces_owner_id_fkey(id, display_name, avatar_url)
      `)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  // 获取我的工作区（我是成员或 owner）
  getMyWorkspaces: async (userId: string): Promise<JkbWorkspace[]> => {
    const { data: memberOf } = await supabase
      .from('jkb_workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)

    const workspaceIds = memberOf?.map((m: any) => m.workspace_id) || []

    const { data, error } = await supabase
      .from('jkb_workspaces')
      .select(`
        *,
        owner:jkb_users!jkb_workspaces_owner_id_fkey(id, display_name, avatar_url)
      `)
      .eq('is_archived', false)
      .or(`owner_id.eq.${userId},id.in.(${workspaceIds.join(',')})`)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  // 创建工作区
  createWorkspace: async (data: {
    name: string
    description?: string
    icon?: string
    department_ids?: string[]
    is_public?: boolean
    owner_id: string
  }): Promise<JkbWorkspace> => {
    const { data: workspace, error } = await supabase
      .from('jkb_workspaces')
      .insert({
        name: data.name,
        description: data.description || null,
        icon: data.icon || '📁',
        department_ids: data.department_ids || [],
        is_public: data.is_public || false,
        owner_id: data.owner_id,
      })
      .select()
      .single()

    if (error) throw error

    // 创建者自动成为 owner 成员
    await supabase.from('jkb_workspace_members').insert({
      workspace_id: workspace.id,
      user_id: data.owner_id,
      role: 'owner',
    })

    return workspace
  },

  // 更新工作区
  updateWorkspace: async (
    id: string,
    data: Partial<{
      name: string
      description: string
      icon: string
      department_ids: string[]
      is_public: boolean
      is_archived: boolean
    }>
  ): Promise<JkbWorkspace> => {
    const { data: updated, error } = await supabase
      .from('jkb_workspaces')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return updated
  },

  // 删除工作区
  deleteWorkspace: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('jkb_workspaces')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // 获取工作区成员
  getMembers: async (workspaceId: string) => {
    const { data, error } = await supabase
      .from('jkb_workspace_members')
      .select(`
        *,
        user:jkb_users!jkb_workspace_members_user_id_fkey(id, display_name, avatar_url, phone)
      `)
      .eq('workspace_id', workspaceId)

    if (error) throw error
    return data || []
  },

  // 添加成员
  addMember: async (
    workspaceId: string,
    userId: string,
    role: 'editor' | 'viewer' = 'viewer'
  ): Promise<void> => {
    const { error } = await supabase.from('jkb_workspace_members').insert({
      workspace_id: workspaceId,
      user_id: userId,
      role,
    })

    if (error) throw error
  },

  // 移除成员
  removeMember: async (workspaceId: string, userId: string): Promise<void> => {
    const { error } = await supabase
      .from('jkb_workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)

    if (error) throw error
  },
}