import { supabase } from './supabase'

export interface Document {
  id: string
  title: string
  workspace_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  is_public: boolean
  deleted_at: string | null
  workspaces?: { name: string }[] | null
}

export interface DocumentMember {
  id: string
  document_id: string
  user_id: string
  role: 'owner' | 'editor' | 'viewer'
  created_at: string
  users?: { display_name: string; avatar_url: string | null }[] | null
}

// 获取文档列表
export async function getDocuments(options?: {
  workspaceId?: string
  search?: string
  limit?: number
  offset?: number
}) {
  let query = supabase
    .from('jkb_documents')
    .select('id, title, workspace_id, created_by, created_at, updated_at, is_public, workspaces(name)')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  if (options?.workspaceId) {
    query = query.eq('workspace_id', options.workspaceId)
  }

  if (options?.search) {
    query = query.ilike('title', `%${options.search}%`)
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 20) - 1)
  }

  const { data, error } = await query
  if (error) throw error
  return data as Document[]
}

// 获取单个文档
export async function getDocument(docId: string) {
  const { data, error } = await supabase
    .from('jkb_documents')
    .select('*')
    .eq('id', docId)
    .is('deleted_at', null)
    .single()

  if (error) throw error
  return data as Document
}

// 创建文档
export async function createDocument(params: {
  title: string
  workspace_id?: string | null
}) {
  const { data, error } = await supabase
    .from('jkb_documents')
    .insert({
      title: params.title,
      workspace_id: params.workspace_id || null,
    })
    .select('id, title')
    .single()

  if (error) throw error
  return data
}

// 更新文档
export async function updateDocument(docId: string, updates: Partial<Pick<Document, 'title' | 'workspace_id' | 'is_public'>>) {
  const { data, error } = await supabase
    .from('jkb_documents')
    .update(updates)
    .eq('id', docId)
    .select()
    .single()

  if (error) throw error
  return data
}

// 软删除文档
export async function deleteDocument(docId: string) {
  const { error } = await supabase
    .from('jkb_documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', docId)

  if (error) throw error
}

// 获取文档成员
export async function getDocumentMembers(docId: string) {
  const { data, error } = await supabase
    .from('jkb_document_members')
    .select('id, document_id, user_id, role, created_at, users(display_name, avatar_url)')
    .eq('document_id', docId)

  if (error) throw error
  return data as DocumentMember[]
}

// 添加文档成员
export async function addDocumentMember(docId: string, userId: string, role: 'editor' | 'viewer' = 'viewer') {
  const { data, error } = await supabase
    .from('jkb_document_members')
    .insert({
      document_id: docId,
      user_id: userId,
      role,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// 更新文档成员角色
export async function updateDocumentMember(memberId: string, role: 'editor' | 'viewer') {
  const { data, error } = await supabase
    .from('jkb_document_members')
    .update({ role })
    .eq('id', memberId)
    .select()
    .single()

  if (error) throw error
  return data
}

// 移除文档成员
export async function removeDocumentMember(memberId: string) {
  const { error } = await supabase
    .from('jkb_document_members')
    .delete()
    .eq('id', memberId)

  if (error) throw error
}

// 检查用户对文档的权限
export async function checkDocumentPermission(docId: string, userId: string, requiredRole: 'owner' | 'editor' | 'viewer' = 'viewer') {
  const { data, error } = await supabase
    .from('jkb_document_members')
    .select('role')
    .eq('document_id', docId)
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    // 检查是否是公开文档
    const { data: doc } = await supabase
      .from('jkb_documents')
      .select('is_public, created_by')
      .eq('id', docId)
      .single()

    if (doc?.is_public && requiredRole === 'viewer') return true
    if (doc?.created_by === userId) return true
    return false
  }

  const roleHierarchy = { owner: 3, editor: 2, viewer: 1 }
  return roleHierarchy[data.role as keyof typeof roleHierarchy] >= roleHierarchy[requiredRole]
}
