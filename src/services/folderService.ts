import { supabase } from './supabase'
import { JkbFolder } from '@/types/files'

export const folderService = {
  // 获取所有文件夹
  getAllFolders: async (): Promise<JkbFolder[]> => {
    const { data, error } = await supabase
      .from('jkb_folders')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) {
      // 如果表不存在，返回空数组
      console.warn('获取文件夹失败:', error.message)
      return []
    }
    return data || []
  },

  // 创建文件夹
  createFolder: async (data: {
    name: string
    parent_id: string | null
    owner_id: string
    color?: string
    description?: string
    workspace_ids?: string[]
    access_level?: string
    visible_department_ids?: string[]
    visible_workspace_ids?: string[]
  }): Promise<JkbFolder> => {
    const { data: folder, error } = await supabase
      .from('jkb_folders')
      .insert({
        name: data.name,
        parent_id: data.parent_id,
        owner_id: data.owner_id,
        color: data.color || '#6366f1',
        description: data.description || null,
        workspace_ids: data.workspace_ids || [],
        access_level: data.access_level || 'public',
        visible_department_ids: data.visible_department_ids || [],
        visible_workspace_ids: data.visible_workspace_ids || [],
        sort_order: 0,
        is_archived: false,
      })
      .select()
      .single()

    if (error) throw error
    return folder
  },

  // 更新文件夹
  updateFolder: async (
    folderId: string,
    data: Partial<{
      name: string
      description: string | null
      color: string
      access_level: string
      visible_department_ids: string[]
      visible_workspace_ids: string[]
      sort_order: number
      is_archived: boolean
    }>
  ): Promise<JkbFolder> => {
    const { data: updated, error } = await supabase
      .from('jkb_folders')
      .update(data)
      .eq('id', folderId)
      .select()
      .single()

    if (error) throw error
    return updated
  },

  // 删除文件夹
  deleteFolder: async (folderId: string): Promise<void> => {
    const { error } = await supabase
      .from('jkb_folders')
      .delete()
      .eq('id', folderId)

    if (error) throw error
  },

  // 移动文件到文件夹
  moveFileToFolder: async (fileId: string, folderId: string | null): Promise<void> => {
    const { error } = await supabase
      .from('jkb_files')
      .update({ folder_id: folderId })
      .eq('id', fileId)

    if (error) throw error
  },

  // 获取文件夹路径（从根到当前文件夹）
  getFolderPath: async (folderId: string): Promise<JkbFolder[]> => {
    const path: JkbFolder[] = []
    let currentId: string | null = folderId

    while (currentId) {
      const { data, error } = await supabase
        .from('jkb_folders')
        .select('*')
        .eq('id', currentId)
        .single() as { data: JkbFolder | null; error: any }

      if (error || !data) break
      path.unshift(data as JkbFolder)
      currentId = data.parent_id
    }

    return path
  },
}
