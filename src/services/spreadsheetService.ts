import { supabase } from './supabase'
import { Spreadsheet, SpreadsheetShare } from '@/types/database'
import * as XLSX from 'xlsx'

const generateShareCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 8 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('')
}

/** 将 SheetJS 格式转为 Univer 快照格式 */
function excelSnapshotFromAoa(aoa: any[][], sheetNames: string[]): any {
  const sheetOrder: string[] = []
  const sheets: Record<string, any> = {}
  const defaultRowCount = Math.max(aoa.length, 100)
  const defaultColCount = Math.max(...aoa.map(r => r.length), 26)

  // 如果有多个 sheet，按 sheetNames 分组
  // 暂简化：整个文件作为一个 sheet
  const sheetId = 'sheet1'
  sheetOrder.push(sheetId)
  const cellData: Record<string, Record<string, any>> = {}

  aoa.forEach((row, r) => {
    const rowData: Record<string, any> = {}
    row.forEach((cell, c) => {
      if (cell !== undefined && cell !== null && cell !== '') {
        rowData[c] = { v: typeof cell === 'object' ? JSON.stringify(cell) : cell }
      }
    })
    if (Object.keys(rowData).length > 0) {
      cellData[r] = rowData
    }
  })

  sheets[sheetId] = {
    id: sheetId,
    name: sheetNames[0] || 'Sheet1',
    cellData,
    rowCount: defaultRowCount,
    columnCount: defaultColCount,
    defaultRowHeight: 24,
    defaultColumnWidth: 88,
    rowHeader: { width: 46 },
    columnHeader: { height: 20 },
  }

  return { sheetOrder, sheets, styles: {} }
}

/** 导出为 Excel 二进制数据 */
export function exportWorkbookToXLSX(snapshot: any): Uint8Array {
  const wb = XLSX.utils.book_new()
  const sheets = snapshot.sheets || {}
  const sheetOrder = snapshot.sheetOrder || Object.keys(sheets)

  for (const sheetId of sheetOrder) {
    const sheetData = sheets[sheetId]
    if (!sheetData) continue
    const cellData = sheetData.cellData || {}
    const rowKeys = Object.keys(cellData).map(Number).sort((a, b) => a - b)
    const wsData: any[][] = []

    for (const rk of rowKeys) {
      const row = cellData[rk]
      if (!row) continue
      const colKeys = Object.keys(row).map(Number).sort((a, b) => a - b)
      const wsRow: any[] = []
      let maxCol = 0
      if (colKeys.length > 0) maxCol = Math.max(...colKeys)
      for (let c = 0; c <= maxCol; c++) {
        const cell = row[c]
        wsRow.push(cell?.v !== undefined ? cell.v : '')
      }
      wsData.push(wsRow)
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData)
    XLSX.utils.book_append_sheet(wb, ws, sheetData.name || 'Sheet')
  }

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}

/** 导出为 CSV 字符串（默认第一个 sheet） */
export function exportWorkbookToCSV(snapshot: any, sheetIndex = 0): string {
  const sheets = snapshot.sheets || {}
  const sheetOrder = snapshot.sheetOrder || Object.keys(sheets)
  const sheetId = sheetOrder[sheetIndex]
  if (!sheetId) return ''
  const sheetData = sheets[sheetId]
  if (!sheetData) return ''
  const cellData = sheetData.cellData || {}
  const rowKeys = Object.keys(cellData).map(Number).sort((a, b) => a - b)
  const wsData: any[][] = []

  for (const rk of rowKeys) {
    const row = cellData[rk]
    if (!row) continue
    const colKeys = Object.keys(row).map(Number).sort((a, b) => a - b)
    const wsRow: any[] = []
    let maxCol = 0
    if (colKeys.length > 0) maxCol = Math.max(...colKeys)
    for (let c = 0; c <= maxCol; c++) {
      wsRow.push(row[c]?.v !== undefined ? row[c].v : '')
    }
    wsData.push(wsRow)
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  return XLSX.utils.sheet_to_csv(ws)
}

/** 从 ArrayBuffer 解析 Excel 文件为 Univer 快照 */
export function parseExcelToSnapshot(arrayBuffer: ArrayBuffer): {
  snapshot: any
  fileName: string
} {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const allAoa: any[][] = []
  const allNames = workbook.SheetNames

  // 取第一个 sheet
  const firstSheet = workbook.Sheets[allNames[0]]
  const aoa = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][]
  const snapshot = excelSnapshotFromAoa(aoa, allNames)

  return { snapshot, fileName: allNames[0] || 'Sheet1' }
}

export const spreadsheetService = {
  // 获取用户可见的表格列表（不含 snapshot，减少传输量）
  getSpreadsheets: async (userId: string, userDeptIds: string[] = []): Promise<Spreadsheet[]> => {
    const { data, error } = await supabase
      .from('spreadsheets')
      .select('id, name, created_by, access_level, edit_permission, icon, description, visible_department_ids, is_deleted, created_at, updated_at')
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('获取表格列表失败:', error)
      return []
    }

    const all = (data || []) as unknown as Spreadsheet[]

    // 应用层权限过滤
    return all.filter((s) => {
      if (s.access_level === 'public') return true
      if (s.created_by === userId) return true
      if (s.access_level === 'department') {
        const sheetDepts = s.visible_department_ids || []
        if (sheetDepts.length === 0) return false
        return userDeptIds.some((d) => sheetDepts.includes(d))
      }
      return false
    })
  },

  // 获取单个表格（含 snapshot）
  getSpreadsheet: async (id: string): Promise<Spreadsheet | null> => {
    const { data, error } = await supabase
      .from('spreadsheets')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('获取表格失败:', error)
      return null
    }
    return data as Spreadsheet
  },

  // 创建空白表格（可选传入快照数据）
  createSpreadsheet: async (name: string, userId: string, snapshot?: any): Promise<Spreadsheet | null> => {
    const { data, error } = await supabase
      .from('spreadsheets')
      .insert({
        name,
        created_by: userId,
        snapshot: snapshot || {},
        edit_permission: 'editable',
        icon: '',
        description: '',
      })
      .select()
      .single()

    if (error) {
      console.error('创建表格失败:', error)
      return null
    }
    return data as Spreadsheet
  },

  // 更新表格（名称/权限/snapshot）
  updateSpreadsheet: async (id: string, data: Partial<Spreadsheet>): Promise<boolean> => {
    const { error } = await supabase
      .from('spreadsheets')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('更新表格失败:', error)
      return false
    }
    return true
  },

  // 更新权限
  updateSpreadsheetPermissions: async (
    id: string,
    access_level: 'public' | 'department' | 'private',
    visible_department_ids: string[],
    edit_permission?: 'editable' | 'readonly'
  ): Promise<boolean> => {
    const payload: any = { access_level, visible_department_ids, updated_at: new Date().toISOString() }
    if (edit_permission) payload.edit_permission = edit_permission
    const { error } = await supabase
      .from('spreadsheets')
      .update(payload)
      .eq('id', id)

    if (error) {
      console.error('更新表格权限失败:', error)
      return false
    }
    return true
  },

  // 软删除
  deleteSpreadsheet: async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('spreadsheets')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('删除表格失败:', error)
      return false
    }
    return true
  },

  // 保存 snapshot（编辑器用）
  saveSnapshot: async (id: string, snapshot: any): Promise<boolean> => {
    return spreadsheetService.updateSpreadsheet(id, { snapshot } as any)
  },

  // 密码哈希（SHA-256）
  hashPassword: async (password: string): Promise<string> => {
    const encoder = new TextEncoder()
    const data = encoder.encode(password)
    const hash = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  },

  // 创建分享链接
  createShareLink: async (
    spreadsheetId: string,
    userId: string,
    options?: { expiresAt?: string; password?: string; canEdit?: boolean }
  ): Promise<SpreadsheetShare | null> => {
    let shareCode = generateShareCode()
    // 确保 share_code 唯一
    const existing = await supabase.from('spreadsheet_shares').select('id').eq('share_code', shareCode).maybeSingle()
    if (existing.data) shareCode = generateShareCode()

    const payload: any = {
      spreadsheet_id: spreadsheetId,
      share_code: shareCode,
      created_by: userId,
      can_edit: options?.canEdit ?? false,
    }

    if (options?.expiresAt) {
      payload.expires_at = options.expiresAt
    }

    if (options?.password) {
      payload.password_hash = await spreadsheetService.hashPassword(options.password)
    }

    const { data, error } = await supabase
      .from('spreadsheet_shares')
      .insert(payload)
      .select()
      .single()

    if (error) {
      console.error('创建分享链接失败:', error)
      return null
    }
    return data as SpreadsheetShare
  },

  // 获取表格的所有分享链接
  getSharesBySpreadsheet: async (spreadsheetId: string): Promise<SpreadsheetShare[]> => {
    const { data, error } = await supabase
      .from('spreadsheet_shares')
      .select('*')
      .eq('spreadsheet_id', spreadsheetId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('获取分享链接列表失败:', error)
      return []
    }
    return (data || []) as SpreadsheetShare[]
  },

  // 删除分享链接
  deleteShareLink: async (shareId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('spreadsheet_shares')
      .delete()
      .eq('id', shareId)

    if (error) {
      console.error('删除分享链接失败:', error)
      return false
    }
    return true
  },

  // 验证分享链接
  verifyShareAccess: async (
    shareCode: string,
    password?: string
  ): Promise<{ valid: boolean; share?: SpreadsheetShare; message?: string }> => {
    const { data, error } = await supabase
      .from('spreadsheet_shares')
      .select('*')
      .eq('share_code', shareCode)
      .single()

    if (error || !data) {
      return { valid: false, message: '分享链接不存在' }
    }

    const share = data as SpreadsheetShare

    // 检查过期
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return { valid: false, message: '分享链接已过期' }
    }

    // 验证密码
    if (share.password_hash) {
      if (!password) {
        return { valid: false, message: '需要密码', share }
      }
      const hash = await spreadsheetService.hashPassword(password)
      if (hash !== share.password_hash) {
        return { valid: false, message: '密码错误', share }
      }
    }

    return { valid: true, share }
  },

  // 通过分享码获取表格数据
  getSpreadsheetByShareCode: async (shareCode: string): Promise<{ spreadsheet: Spreadsheet | null; canEdit: boolean }> => {
    const result = await spreadsheetService.verifyShareAccess(shareCode)
    if (!result.valid || !result.share) {
      return { spreadsheet: null, canEdit: false }
    }

    const sheet = await spreadsheetService.getSpreadsheet(result.share.spreadsheet_id)
    if (!sheet) {
      return { spreadsheet: null, canEdit: false }
    }

    // 私密表格即使通过分享码也再检查一次权限
    if (sheet.access_level === 'private' && result.share.can_edit) {
      return { spreadsheet: sheet, canEdit: true }
    }

    // 公开/部门表格 + 分享码权限
    return { spreadsheet: sheet, canEdit: result.share.can_edit }
  },

  // 更新在线状态（心跳）
  upsertPresence: async (spreadsheetId: string, userId: string, displayName: string): Promise<boolean> => {
    const { error } = await supabase
      .from('spreadsheet_presence')
      .upsert({
        spreadsheet_id: spreadsheetId,
        user_id: userId,
        display_name: displayName,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'spreadsheet_id, user_id' })

    if (error) {
      console.error('更新在线状态失败:', error)
      return false
    }
    return true
  },

  // 删除在线状态
  deletePresence: async (spreadsheetId: string, userId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('spreadsheet_presence')
      .delete()
      .eq('spreadsheet_id', spreadsheetId)
      .eq('user_id', userId)

    if (error) {
      console.error('删除在线状态失败:', error)
      return false
    }
    return true
  },

  // 生成分享链接 URL
  generateShareLink: (shareCode: string): string => {
    return `${window.location.origin}/shared-spreadsheet/${shareCode}`
  },
}
