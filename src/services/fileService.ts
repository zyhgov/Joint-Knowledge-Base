import { supabase } from './supabase'
import { r2Service } from './r2Service'
import { JkbFile, FileFilter, JkbFileShare, ShareType } from '@/types/files'

// 生成随机分享码
const generateShareCode = (length: number = 8): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('')
}

export const fileService = {
  // 获取文件列表
  getFiles: async (filter: FileFilter = {}): Promise<JkbFile[]> => {
    // 先尝试带 is_deleted 过滤的查询
    let data: any[] | null = null
    let error: any = null

    const buildQuery = (filterDeleted: boolean) => {
      let q = supabase
        .from('jkb_files')
        .select(`
          *,
          uploader:jkb_users!jkb_files_uploaded_by_fkey(id, display_name, avatar_url)
        `)
        .order('created_at', { ascending: false })

      if (filterDeleted) {
        q = q.eq('is_deleted', false)
      }

      if (filter.search) {
        q = q.or(
          `display_name.ilike.%${filter.search}%,description.ilike.%${filter.search}%`
        )
      }

      if (filter.category) {
        q = q.eq('category', filter.category)
      }

      if (filter.tags && filter.tags.length > 0) {
        q = q.overlaps('tags', filter.tags)
      }

      if (filter.workspace_id) {
        q = q.contains('workspace_ids', [filter.workspace_id])
      }

      if (filter.date_from) {
        q = q.gte('created_at', filter.date_from)
      }

      if (filter.date_to) {
        q = q.lte('created_at', filter.date_to)
      }

      const sortBy = filter.sort_by || 'created_at'
      const sortOrder = filter.sort_order || 'desc'
      q = q.order(sortBy, { ascending: sortOrder === 'asc' })

      return q
    }

    // 先尝试带 is_deleted 过滤
    const res1 = await buildQuery(true)
    if (res1.error) {
      // is_deleted 列可能不存在，尝试不带该列的查询
      console.warn('[fileService] 带 is_deleted 查询失败，降级查询:', res1.error.message)
      const res2 = await buildQuery(false)
      data = res2.data
      error = res2.error
    } else {
      data = res1.data
    }

    if (error) throw error

    // 获取上传者的部门信息
    const files: JkbFile[] = data || []
    const uploaderIds = [...new Set(files.map((f: any) => f.uploaded_by).filter(Boolean))]

    if (uploaderIds.length > 0) {
      const { data: userDepts } = await supabase
        .from('jkb_user_departments')
        .select('user_id, is_primary, department:jkb_departments(id, name)')
        .in('user_id', uploaderIds)
        .eq('is_primary', true)

      if (userDepts) {
        const deptMap = new Map<string, { id: string; name: string }>()
        userDepts.forEach((ud: any) => {
          if (ud.department && ud.user_id) {
            deptMap.set(ud.user_id, ud.department)
          }
        })

        files.forEach((file: any) => {
          if (file.uploaded_by && deptMap.has(file.uploaded_by)) {
            file.uploader_department = deptMap.get(file.uploaded_by)!
            if (file.uploader) {
              file.uploader.department_id = deptMap.get(file.uploaded_by)!.id
            }
          }
        })
      }
    }

    return files
  },

  // 上传单个文件
  uploadFile: async (
    file: File,
    options: {
      display_name: string
      description?: string
      tags?: string[]
      workspace_ids?: string[]
      userId: string
      folder_id?: string | null
      access_level?: 'public' | 'workspace' | 'department' | 'private'
      visible_department_ids?: string[]
      visible_workspace_ids?: string[]
      expires_at?: string | null
      onProgress?: (progress: number) => void
    }
  ): Promise<JkbFile> => {
    const category = fileService.getCategory(file)
    const folder = fileService.getFolder(category)

    // 上传到 R2
    const uploadResult = await r2Service.uploadFile(file, folder, options.onProgress)

    // 保存到数据库
    const insertData: any = {
      original_name: file.name,
      display_name: options.display_name || file.name,
      description: options.description || null,
      r2_key: uploadResult.key,
      public_url: uploadResult.url,
      file_size: file.size,
      file_type: file.type,
      file_ext: uploadResult.fileExt,
      category,
      tags: options.tags || [],
      workspace_ids: options.workspace_ids || [],
      uploaded_by: options.userId,
      access_level: options.access_level || 'public',
      visible_department_ids: options.visible_department_ids || [],
      visible_workspace_ids: options.visible_workspace_ids || [],
      expires_at: options.expires_at || null,
      metadata: {},
    }

    // 添加 folder_id（如果列存在）
    if (options.folder_id) {
      insertData.folder_id = options.folder_id
    }

    const { data, error } = await supabase
      .from('jkb_files')
      .insert(insertData)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // 更新文件信息
  updateFile: async (
    fileId: string,
    data: Partial<{
      display_name: string
      description: string
      tags: string[]
      workspace_ids: string[]
      access_level: 'public' | 'workspace' | 'department' | 'private'
      visible_department_ids: string[]
      visible_workspace_ids: string[]
      expires_at: string | null
    }>
  ): Promise<JkbFile> => {
    const { data: updated, error } = await supabase
      .from('jkb_files')
      .update(data)
      .eq('id', fileId)
      .select()
      .single()

    if (error) throw error
    return updated
  },

  // 删除文件（软删除）
  deleteFile: async (fileId: string): Promise<void> => {
    const { error } = await supabase
      .from('jkb_files')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', fileId)

    if (error) throw error
  },

  // 永久删除文件（同时删除 R2）
  permanentDeleteFile: async (fileId: string): Promise<void> => {
    const { data: file } = await supabase
      .from('jkb_files')
      .select('r2_key')
      .eq('id', fileId)
      .single()

    if (file?.r2_key) {
      await r2Service.deleteFile(file.r2_key)
    }

    const { error } = await supabase
      .from('jkb_files')
      .delete()
      .eq('id', fileId)

    if (error) throw error
  },

  // 下载文件（直接下载，不打开新标签页）
  downloadFile: async (file: JkbFile): Promise<void> => {
    try {
      const response = await fetch(file.public_url)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.display_name || file.original_name
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('下载失败:', error)
      throw error
    }
  },

  // 增加浏览计数
  incrementViewCount: async (fileId: string): Promise<void> => {
    const { data: file } = await supabase
      .from('jkb_files')
      .select('view_count')
      .eq('id', fileId)
      .single()

    if (file) {
      await supabase
        .from('jkb_files')
        .update({ view_count: (file.view_count || 0) + 1 })
        .eq('id', fileId)
    }
  },

  // 增加下载计数
  incrementDownloadCount: async (fileId: string): Promise<void> => {
    const { data: file } = await supabase
      .from('jkb_files')
      .select('download_count')
      .eq('id', fileId)
      .single()

    if (file) {
      await supabase
        .from('jkb_files')
        .update({ download_count: (file.download_count || 0) + 1 })
        .eq('id', fileId)
    }
  },

  // 创建分享链接
  createShare: async (
    fileId: string,
    options: {
      share_type: ShareType
      password?: string
      expires_at?: string | null
      max_views?: number | null
      allow_download?: boolean
      created_by: string
    }
  ): Promise<JkbFileShare> => {
    const shareCode = generateShareCode(8)

    const { data, error } = await supabase
      .from('jkb_file_shares')
      .insert({
        file_id: fileId,
        share_code: shareCode,
        share_type: options.share_type,
        password: options.password || null,
        expires_at: options.expires_at || null,
        max_views: options.max_views || null,
        allow_download: options.allow_download ?? true,
        is_active: true,
        created_by: options.created_by,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  // 获取文件的分享列表
  getFileShares: async (fileId: string): Promise<JkbFileShare[]> => {
    const { data, error } = await supabase
      .from('jkb_file_shares')
      .select('*')
      .eq('file_id', fileId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  // 验证分享码
  verifyShare: async (
    shareCode: string,
    password?: string
  ): Promise<{ valid: boolean; file?: JkbFile; share?: JkbFileShare; error?: string }> => {
    const { data: share } = await supabase
      .from('jkb_file_shares')
      .select('*')
      .eq('share_code', shareCode)
      .eq('is_active', true)
      .single()

    if (!share) return { valid: false, error: '分享链接不存在或已失效' }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return { valid: false, error: '分享链接已过期' }
    }

    if (share.max_views && share.view_count >= share.max_views) {
      return { valid: false, error: '分享链接已达到最大访问次数' }
    }

    if (
      (share.share_type === 'password' || share.share_type === 'password_time') &&
      share.password !== password
    ) {
      return { valid: false, error: '密码错误' }
    }

    // 获取文件信息
    const { data: file } = await supabase
      .from('jkb_files')
      .select('*')
      .eq('id', share.file_id)
      .single()

    if (!file) return { valid: false, error: '文件不存在' }

    // 增加访问计数
    await supabase
      .from('jkb_file_shares')
      .update({ view_count: share.view_count + 1 })
      .eq('id', share.id)

    return { valid: true, file, share }
  },

  // 撤销分享
  revokeShare: async (shareId: string): Promise<void> => {
    const { error } = await supabase
      .from('jkb_file_shares')
      .update({ is_active: false })
      .eq('id', shareId)

    if (error) throw error
  },

  // 获取文件分类
  getCategory: (file: File): JkbFile['category'] => {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const type = file.type.toLowerCase()

    if (type.startsWith('image/')) return 'image'
    if (type.startsWith('video/')) return 'video'
    if (type.startsWith('audio/')) return 'audio'
    if (
      ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'].includes(ext) ||
      type.includes('pdf') ||
      type.includes('document') ||
      type.includes('sheet') ||
      type.includes('presentation')
    )
      return 'document'
    return 'file'
  },

  // 获取上传目录
  getFolder: (category: JkbFile['category']): any => {
    const map: Record<string, string> = {
      image: 'images',
      video: 'videos',
      audio: 'audios',
      document: 'documents',
      file: 'files',
    }
    return map[category] || 'files'
  },

  // 保存链接资源（不实际上传文件，只保存元数据到数据库）
  uploadLinkResource: async (params: {
    url: string
    display_name: string
    category: string
    mime_type: string
    file_ext: string
    tags: string[]
    workspace_ids: string[]
    userId: string
    folder_id: string | null
    access_level: string
    visible_department_ids: string[]
    visible_workspace_ids: string[]
    expires_at: string | null
  }): Promise<JkbFile> => {
    const { url, display_name, category, mime_type, file_ext, tags, workspace_ids, userId, folder_id, access_level, visible_department_ids, visible_workspace_ids, expires_at } = params

    const insertData: any = {
      original_name: display_name,
      display_name,
      description: `外部链接: ${url}`,
      r2_key: `links/${Date.now()}-${display_name}`,
      public_url: url,
      file_size: 0,
      file_type: mime_type,
      file_ext,
      category,
      tags,
      workspace_ids,
      uploaded_by: userId,
      folder_id: folder_id || null,
      access_level,
      visible_department_ids,
      visible_workspace_ids,
      expires_at,
      metadata: { is_link: true, source_url: url },
    }

    const { data, error } = await supabase
      .from('jkb_files')
      .insert(insertData)
      .select(`
        *,
        uploader:jkb_users!jkb_files_uploaded_by_fkey(id, display_name, avatar_url)
      `)
      .single()

    if (error) throw error
    return data
  },
}