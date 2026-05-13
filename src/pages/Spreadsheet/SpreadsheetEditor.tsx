import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { spreadsheetService, exportWorkbookToXLSX, exportWorkbookToCSV } from '@/services/spreadsheetService'
import { Spreadsheet } from '@/types/database'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Save, Loader2, Clock, Users, Share2, Globe, Lock, Building2, Upload, FileUp, Ban, Shield, UserCheck, AlertTriangle, Search as SearchIcon, FileDown, ChevronDown } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { supabase } from '@/services/supabase'
import {
  canExportSpreadsheet,
  canShareSpreadsheet,
} from '@/utils/permission'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import DepartmentTreeSelector from '@/components/common/DepartmentTreeSelector'
import { departmentService } from '@/services/departmentService'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import type { DepartmentTreeNode, JkbDepartment } from '@/types/database'

import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets'
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core'
import UniverPresetSheetsCoreZhCN from '@univerjs/preset-sheets-core/locales/zh-CN'
import '@univerjs/preset-sheets-core/lib/index.css'

import { ICommandService, IUniverInstanceService } from '@univerjs/core'
import { SetRangeValuesMutation } from '@univerjs/sheets'
import { IRenderManagerService } from '@univerjs/engine-render'

// Univer 高级功能插件
import { UniverSheetsCrosshairHighlightPlugin } from '@univerjs/sheets-crosshair-highlight'
import { UniverSheetsFindReplacePlugin } from '@univerjs/sheets-find-replace'
import { UniverSheetsThreadCommentPlugin } from '@univerjs/sheets-thread-comment'
import { UniverThreadCommentUIPlugin } from '@univerjs/thread-comment-ui'
import { UniverSheetsThreadCommentUIPlugin } from '@univerjs/sheets-thread-comment-ui'
import { UniverWatermarkPlugin } from '@univerjs/watermark'
import { UniverSheetsDrawingPlugin } from '@univerjs/sheets-drawing'
import { UniverSheetsDrawingUIPlugin } from '@univerjs/sheets-drawing-ui'
import '@univerjs/sheets-crosshair-highlight/lib/index.css'
import '@univerjs/sheets-drawing-ui/lib/index.css'

import SpreadsheetCollabProvider, { type CollabUser } from '@/components/editor/SpreadsheetCollabProvider'
import SpreadsheetPermissionDialog from '@/components/editor/SpreadsheetPermissionDialog'
import type { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'

// 默认工作表数据（createWorkbook 必须有参数）
const DEFAULT_WORKBOOK_DATA = {
  name: 'Sheet1',
  sheetOrder: ['sheet1'],
  sheets: {
    sheet1: {
      id: 'sheet1',
      name: 'Sheet1',
      cellData: {},
      rowCount: 100,
      columnCount: 26,
      defaultRowHeight: 24,
      defaultColumnWidth: 88,
      rowHeader: { width: 46 },
      columnHeader: { height: 20 },
    },
  },
} as any

/** 校验快照是否有效（必须有 sheetOrder 和 sheets） */
function isValidWorkbookSnapshot(snap: any): boolean {
  if (!snap || typeof snap !== 'object') return false
  if (!Array.isArray(snap.sheetOrder) || snap.sheetOrder.length === 0) return false
  if (!snap.sheets || typeof snap.sheets !== 'object') return false
  // 至少有一个 sheet 在 sheetOrder 中存在
  return snap.sheetOrder.some((id: string) => snap.sheets[id])
}

/** 根据实际行列数据计算单元格精确位置（优先使用实时 RowManager/ColumnManager） */
function getCellPixelPosition(ws: any, row: number, col: number) {
  if (!ws?._snapshot) return { top: 0, left: 0 }
  const snap = ws._snapshot
  const defaultRowHeight = snap.defaultRowHeight ?? 24
  const defaultColWidth = snap.defaultColumnWidth ?? 88
  const headerHeight = snap.columnHeader?.height ?? 20
  const headerWidth = snap.rowHeader?.width ?? 46

  // ★ 优先使用实时行列管理器获取精确尺寸
  const getRowHeight = (i: number) => {
    try { return ws.getRowHeight(i) } catch {}
    return snap.rowData?.[i]?.height ?? defaultRowHeight
  }
  const getColWidth = (j: number) => {
    try { return ws.getColumnWidth(j) } catch {}
    return snap.columnData?.[j]?.width ?? defaultColWidth
  }

  let top = headerHeight
  for (let i = 0; i < row; i++) top += getRowHeight(i)

  let left = headerWidth
  for (let j = 0; j < col; j++) left += getColWidth(j)

  return { top, left }
}

/** 将行列转为 A1 格式单元格标签 */
function toCellLabel(row: number, col: number): string {
  let colStr = ''
  let c = col
  while (c >= 0) {
    colStr = String.fromCharCode(65 + (c % 26)) + colStr
    c = Math.floor(c / 26) - 1
  }
  return colStr + (row + 1)
}

/** 单元格级差异同步：仅更新变更的单元格+注册新样式，不触发全量 reload */
function applyCellDiff(
  univerAPI: any,
  sheetId: string,
  oldCellData: Record<string, any> | undefined,
  newCellData: Record<string, any> | undefined,
  oldSnapshot?: any,
  newSnapshot?: any
): boolean {
  if (!oldCellData && !newCellData) return true
  if (!oldCellData && newCellData) return false // 新工作表需要全量加载
  if (!newCellData) return true

  const oldCells = oldCellData!
  const newCells = newCellData

  const cellValue: Record<string, Record<string, any>> = {}
  const allRowKeys = new Set([...Object.keys(oldCells), ...Object.keys(newCells)])

  for (const rowKey of allRowKeys) {
    const oldRow = oldCells[rowKey] || {}
    const newRow = newCells[rowKey] || {}
    const allColKeys = new Set([...Object.keys(oldRow), ...Object.keys(newRow)])

    for (const colKey of allColKeys) {
      const oldCell = JSON.stringify(oldRow[colKey])
      const newCell = JSON.stringify(newRow[colKey])
      if (oldCell !== newCell) {
        if (!cellValue[rowKey]) cellValue[rowKey] = {}
        cellValue[rowKey][colKey] = newRow[colKey] !== undefined ? newRow[colKey] : {}
      }
    }
  }

  const rows = Object.keys(cellValue)
  const hasCellChanges = rows.length > 0

  // ★★★ 注册新样式（用 IUniverInstanceService 获取内部 Workbook，确保样式正确注册）
  if (newSnapshot?.styles && oldSnapshot?.styles) {
    try {
      // 筛选出新增的样式
      const oldStyleKeys = new Set(Object.keys(oldSnapshot.styles))
      const newStyles: Record<string, any> = {}
      for (const [key, value] of Object.entries(newSnapshot.styles)) {
        if (!oldStyleKeys.has(key) && value != null) {
          newStyles[key] = value
        }
      }

      if (Object.keys(newStyles).length > 0) {
        const injector = (univerAPI as any)._injector
        const instanceService = injector?.get(IUniverInstanceService)
        const fWb = univerAPI.getActiveWorkbook()
        const unitId = fWb?.getId()
        if (instanceService && unitId) {
          const internalWb = instanceService.getUnit(unitId)
          if (internalWb?.addStyles) {
            internalWb.addStyles(newStyles)
          }
          // 兜底：直接更新内部 snapshot
          const snapshotWb = (internalWb as any)?._snapshot
          if (snapshotWb?.styles) {
            Object.assign(snapshotWb.styles, newStyles)
          }
        }
      }
    } catch {}
  }

  // ★★★ 应用单元格值/样式引用变更
  if (hasCellChanges) {
    let minRow = Infinity, maxRow = -Infinity, minCol = Infinity, maxCol = -Infinity
    for (const rk of rows) {
      const r = parseInt(rk)
      const cols = Object.keys(cellValue[rk])
      for (const ck of cols) {
        const c = parseInt(ck)
        if (r < minRow) minRow = r; if (r > maxRow) maxRow = r
        if (c < minCol) minCol = c; if (c > maxCol) maxCol = c
      }
    }

    try {
      const injector = (univerAPI as any)._injector
      const commandService = injector?.get(ICommandService)
      if (!commandService) return false

      const workbook = univerAPI.getActiveWorkbook()
      if (!workbook) return false

      commandService.executeCommand(SetRangeValuesMutation.id, {
        unitId: workbook.getId(),
        subUnitId: sheetId,
        cellValue,
        ranges: [{ startRow: minRow, startColumn: minCol, endRow: maxRow, endColumn: maxCol }],
      })
    } catch (e) {
      console.error('单元格差异同步失败:', e)
      return false
    }
  }

  return true
}

/** 就地应用工作表结构变更（删除/新增/重命名/排序），无需全量 reload */
function applySheetChanges(
  univerAPI: any,
  oldSheets: Record<string, any>,
  newSheets: Record<string, any>,
  oldOrder: string[],
  newOrder: string[]
): boolean {
  try {
    const fWorkbook = univerAPI.getActiveWorkbook()
    if (!fWorkbook) return false

    // 1. 处理删除
    for (const sid of Object.keys(oldSheets)) {
      if (!newSheets[sid]) {
        fWorkbook.deleteSheet(sid)
      }
    }

    // 2. 处理新增（在对应位置插入）
    for (let i = 0; i < newOrder.length; i++) {
      const sid = newOrder[i]
      if (!oldSheets[sid]) {
        const sheetData = newSheets[sid]
        if (sheetData) {
          fWorkbook.insertSheet(sheetData.name, {
            index: i,
            sheet: sheetData,
          })
        }
      }
    }

    // 3. 处理重命名
    for (const sid of Object.keys(newSheets)) {
      if (oldSheets[sid] && oldSheets[sid].name !== newSheets[sid].name) {
        const fSheet = fWorkbook.getSheetBySheetId(sid)
        if (fSheet) {
          fSheet.setName(newSheets[sid].name)
        }
      }
    }

    // 4. 处理排序
    if (JSON.stringify(oldOrder) !== JSON.stringify(newOrder)) {
      for (let i = 0; i < newOrder.length; i++) {
        const sid = newOrder[i]
        const currentSheets = fWorkbook.getSheets()
        let currentIndex = -1
        for (let j = 0; j < currentSheets.length; j++) {
          const s = currentSheets[j] as any
          const sId = s.getSheetId?.() || ''
          if (sId === sid) { currentIndex = j; break }
        }
        if (currentIndex !== -1 && currentIndex !== i) {
          const fSheet = fWorkbook.getSheetBySheetId(sid)
          if (fSheet) {
            fWorkbook.moveSheet(fSheet, i)
          }
        }
      }
    }

    return true
  } catch (e) {
    console.error('应用工作表结构变更失败:', e)
    return false
  }
}

export default function SpreadsheetEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const userPermissions = useAuthStore((s) => s.userPermissions)
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const univerRef = useRef<any>(null)
  const setCursorRef = useRef<((row: number | null, col: number | null) => void) | null>(null)

  const [sheet, setSheet] = useState<Spreadsheet | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const dirtyRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const canEditRef = useRef(false)
  const docRef = useRef<Y.Doc | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // 滚动/缩放数据（初始值必须与 Univer 默认一致：rowHeight=24, colWidth=88）
  const scrollDataRef = useRef({ scrollTop: 0, scrollLeft: 0, zoom: 1, rowHeight: 24, colWidth: 88, headerWidth: 46, headerHeight: 20 })
  const [scrollTick, setScrollTick] = useState(0)
  const renderManagerRef = useRef<any>(null)
  const isFirstSyncRef = useRef(true)
  const canvasOffsetRef = useRef({ x: 0, y: 0 })
  const scrollPollIdRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sheetNamesRef = useRef<Record<string, string>>({}) // 跟踪工作表名称
  const sheetOrderRef = useRef<string[]>([]) // 跟踪工作表顺序

  // 分享弹窗状态
  const [shareOpen, setShareOpen] = useState(false)
  const [shareAccess, setShareAccess] = useState<'public' | 'department' | 'private'>('public')
  const [shareEditPermission, setShareEditPermission] = useState<'editable' | 'readonly'>('editable')
  const [shareDeptIds, setShareDeptIds] = useState<string[]>([])
  const [departmentTree, setDepartmentTree] = useState<DepartmentTreeNode[]>([])
  const [shareSaving, setShareSaving] = useState(false)



  // 在线用户管理（仅创建者）
  const [manageUsersOpen, setManageUsersOpen] = useState(false)
  const [bannedUsers, setBannedUsers] = useState<string[]>([])

  // 权限管理弹窗
  const [permDialogOpen, setPermDialogOpen] = useState(false)

  // 加载表格数据
  useEffect(() => {
    if (!id) return
    setLoading(true)
    spreadsheetService.getSpreadsheet(id).then((data) => {
      if (!data) {
        setError('表格不存在或无权访问')
        setLoading(false)
        return
      }
      setSheet(data)
      const isOwner = data.created_by === user?.id
      const editPerm = data.edit_permission !== 'readonly'
      const notPrivate = data.access_level !== 'private'
      const canEditVal = isOwner || (editPerm && notPrivate)
      setCanEdit(canEditVal)
      canEditRef.current = canEditVal
      setLoading(false)
    })
  }, [id, user?.id])

  // 初始化 Univer
  useEffect(() => {
    if (!containerRef.current || !sheet || loading) return

    try {
      const { univer, univerAPI } = createUniver({
        locale: LocaleType.ZH_CN,
        locales: {
          [LocaleType.ZH_CN]: mergeLocales(UniverPresetSheetsCoreZhCN),
        },
        presets: [
          UniverSheetsCorePreset({
            container: containerRef.current,
            ribbonType: 'classic',
            contextMenu: true,
          }),
        ],
      })

      univerRef.current = univerAPI

      // 注册高级功能插件
      try {
        const u = univer as any
        u.registerPlugin(UniverSheetsCrosshairHighlightPlugin)
        u.registerPlugin(UniverSheetsThreadCommentPlugin)
        u.registerPlugin(UniverThreadCommentUIPlugin)
        u.registerPlugin(UniverSheetsThreadCommentUIPlugin)
        u.registerPlugin(UniverSheetsFindReplacePlugin)
        u.registerPlugin(UniverWatermarkPlugin, {
          watermarkConfig: {
            text: user?.display_name || '用户',
          },
        })
        u.registerPlugin(UniverSheetsDrawingPlugin)
        u.registerPlugin(UniverSheetsDrawingUIPlugin)
      } catch (e) {
        console.warn('部分 Univer 插件注册失败:', e)
      }

      // 同步获取渲染引擎服务
      try {
        const rootInjector = (univerAPI as any)._injector
        if (rootInjector) {
          renderManagerRef.current = rootInjector.get(IRenderManagerService)
        }
      } catch (e) {
        console.warn('获取 IRenderManagerService 失败:', e)
      }

      // 创建 workbook
      if (isValidWorkbookSnapshot(sheet.snapshot)) {
        try {
          univerAPI.createWorkbook(sheet.snapshot as any)
        } catch {
          univerAPI.createWorkbook(DEFAULT_WORKBOOK_DATA)
        }
      } else {
        // 快照无效时创建默认工作表
        univerAPI.createWorkbook(DEFAULT_WORKBOOK_DATA)
      }


      // 初始记录工作表结构
      try {
        const _wb = univerAPI.getActiveWorkbook()
        if (_wb) {
          const _sheets = _wb.getSheets?.() || []
          const _names: Record<string, string> = {}
          const _order: string[] = []
          for (const _sheet of _sheets) {
            try {
              const __s = _sheet as any
              const _sid = __s.getSheetId?.() || __s._worksheet?.getSheetId?.() || ''
              const _sname = __s.getName?.() || __s._worksheet?.getName?.() || ''
              _names[_sid] = _sname
              _order.push(_sid)
            } catch {}
          }
          sheetNamesRef.current = _names
          sheetOrderRef.current = _order
        }
      } catch {}

      // 订阅选区变化以广播光标（必须在 createWorkbook 之后）
      let cursorDisposable: any = null
      try {
        const workbook = univerAPI.getActiveWorkbook()
        if (workbook && setCursorRef.current) {
          cursorDisposable = workbook.onSelectionChange((selections: any[]) => {
            if (selections && selections.length > 0) {
              const range = selections[0]
              setCursorRef.current!(range.startRow, range.startColumn)
            }
          })
        }
      } catch {}

      // 监听数据变化标记脏数据
      const intervalId = setInterval(() => {
        dirtyRef.current = true
      }, 5000)

      // 滚动定位轮询（通过渲染引擎 Scene 获取实时滚动位置）
      const scrollPoll = setInterval(() => {
        try {
          const wb = univerRef.current?.getActiveWorkbook()
          if (!wb) return
          const fSheet = wb.getActiveSheet()
          if (!fSheet) return
          const sheet = fSheet.getSheet()
          if (!sheet) return

          // 从渲染场景获取实时滚动位置
          let scrollTop = 0
          let scrollLeft = 0
          try {
            const renderManager = renderManagerRef.current
            if (renderManager) {
              const unitId = wb.getId()
              const render = renderManager.getRenderById(unitId)
              if (render) {
                const viewport = render.scene.getMainViewport()
                if (viewport) {
                  scrollLeft = viewport.viewportScrollX ?? 0
                  scrollTop = viewport.viewportScrollY ?? 0
                }
              }
            }
          } catch {}

          // 兜底：从 workbook snapshot 获取
          if (scrollTop === 0 && scrollLeft === 0) {
            try {
              const ws = (fSheet as any).getSheet()
              if (ws?._snapshot) {
                scrollTop = ws._snapshot.scrollTop ?? 0
                scrollLeft = ws._snapshot.scrollLeft ?? 0
              }
            } catch {}
          }

          // 检测 canvas 在容器中的偏移（Univer 可能渲染工具栏等 UI 元素）
          try {
            if (containerRef.current) {
              const canvas = containerRef.current.querySelector('canvas')
              if (canvas) {
                const cRect = containerRef.current.getBoundingClientRect()
                const cvRect = canvas.getBoundingClientRect()
                canvasOffsetRef.current = {
                  x: cvRect.left - cRect.left,
                  y: cvRect.top - cRect.top,
                }
              }
            }
          } catch {}

          const zoom = sheet.getZoomRatio() || 1
          scrollDataRef.current.scrollTop = scrollTop
          scrollDataRef.current.scrollLeft = scrollLeft
          scrollDataRef.current.zoom = zoom
          setScrollTick(v => v + 1)
        } catch {}
      }, 200)
      scrollPollIdRef.current = scrollPoll

      return () => {
        clearInterval(intervalId)
        clearInterval(scrollPoll)
        scrollPollIdRef.current = null
        try {
          if (cursorDisposable) cursorDisposable.dispose()
        } catch {}
        try {
          univerAPI.dispose()
        } catch {}
        univerRef.current = null
      }
    } catch (e: any) {
      console.error('Univer 初始化失败:', e)
      setError('表格编辑器初始化失败: ' + (e.message || ''))
    }
  }, [sheet, loading])

  // 自动保存（每 30 秒检查）
  useEffect(() => {
    if (!canEdit || !id) return

    const autoSave = async () => {
      if (!dirtyRef.current) return
      await handleSave(true)
    }

    const interval = setInterval(autoSave, 5000)
    return () => clearInterval(interval)
  }, [canEdit, id])

  // 实时监听权限变更
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`spreadsheet-perm-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'spreadsheets',
        filter: `id=eq.${id}`,
      }, (payload: any) => {
        const newData = payload.new
        if (!newData) return
        const isOwner = newData.created_by === user?.id
        const editPerm = newData.edit_permission !== 'readonly'
        const notPrivate = newData.access_level !== 'private'
        const newCanEdit = isOwner || (editPerm && notPrivate)

        if (!newCanEdit && canEditRef.current) {
          toast('该表格已被设置为只读模式', { icon: '🔒' })
          try {
            const wb = univerRef.current?.getActiveWorkbook()
            if (wb) wb.setEditable(false)
          } catch {}
        } else if (newCanEdit && !canEditRef.current) {
          toast('该表格已被设置为可编辑模式', { icon: '✏️' })
          try {
            const wb = univerRef.current?.getActiveWorkbook()
            if (wb) wb.setEditable(true)
          } catch {}
        }
        setCanEdit(newCanEdit)
        canEditRef.current = newCanEdit
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id, user?.id])

  // 加载部门树
  useEffect(() => {
    departmentService.getAllDepartments().then((depts: JkbDepartment[]) => {
      const tree = departmentService.buildDepartmentTree(depts)
      setDepartmentTree(tree || [])
    })
  }, [])

  // 打开分享弹窗
  const handleOpenShare = useCallback(() => {
    if (!sheet) return
    setShareAccess(sheet.access_level || 'public')
    setShareEditPermission(sheet.edit_permission || 'editable')
    setShareDeptIds(sheet.visible_department_ids || [])
    setShareOpen(true)
  }, [sheet])

  // 保存分享设置
  const handleSaveShare = useCallback(async () => {
    if (!id || !sheet) return
    setShareSaving(true)
    const ok = await spreadsheetService.updateSpreadsheetPermissions(id, shareAccess, shareDeptIds, shareEditPermission)
    if (ok) {
      toast.success('分享设置已保存')
      setShareOpen(false)
      // 更新本地 sheet 状态
      setSheet(prev => prev ? { ...prev, access_level: shareAccess, edit_permission: shareEditPermission, visible_department_ids: shareDeptIds } : prev)
    } else {
      toast.error('保存分享设置失败')
    }
    setShareSaving(false)
  }, [id, sheet, shareAccess, shareEditPermission, shareDeptIds])

  // 在线状态心跳
  useEffect(() => {
    if (!id || !user) return
    const hb = async () => {
      await spreadsheetService.upsertPresence(id, user.id, user.display_name || '用户')
    }
    hb()
    const interval = setInterval(hb, 30000)
    return () => {
      clearInterval(interval)
      spreadsheetService.deletePresence(id, user.id)
    }
  }, [id, user?.id, user?.display_name])

  // 保存 snapshot（DB 保存成功后才同步到 Yjs）
  const handleSave = useCallback(async (isAuto = false) => {
    if (!id || !univerRef.current) return

    try {
      if (!isAuto) setSaving(true)

      // 获取当前 workbook snapshot
      const workbook = univerRef.current.getActiveWorkbook()
      const snapshot = workbook?.save() || {}

      // ★★★ 先保存到 DB，成功后才同步 Yjs（防止 DB 失败导致数据转移）
      const ok = await spreadsheetService.saveSnapshot(id, snapshot)
      if (ok) {
        dirtyRef.current = false
        setLastSaved(new Date())
        // ★★★ DB 保存成功后才同步到 Yjs（供其他协作者实时接收）
        if (docRef.current && snapshot) {
          try {
            const snapshotMap = docRef.current.getMap('spreadsheet')
            docRef.current.transact(() => {
              snapshotMap.set('snapshot', JSON.stringify(snapshot))
              snapshotMap.set('saveToken', Date.now() + Math.random())
              snapshotMap.set('updatedAt', Date.now())
            })
          } catch {}
        }
        if (!isAuto) toast.success('已保存')
      } else {
        if (!isAuto) toast.error('保存失败')
      }
    } catch (e: any) {
      console.error('保存出错:', e)
      if (!isAuto) toast.error('保存出错')
    } finally {
      if (!isAuto) setSaving(false)
    }
  }, [id])

  // 离开时自动保存
  useEffect(() => {
    return () => {
      if (dirtyRef.current && id && univerRef.current) {
        handleSave(true)
      }
    }
  }, [id])

  // Ctrl+S 保存快捷键
  useEffect(() => {
    if (!canEdit) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canEdit, handleSave])

  // 修复文本转数字同步问题：监听单元格变更事件并强制存盘
  useEffect(() => {
    if (!univerRef.current || !id) return
    const checkCellChanges = setInterval(() => {
      try {
        const wb = univerRef.current?.getActiveWorkbook()
        if (!wb) return
        const sheet = wb.getActiveSheet()
        if (!sheet) return
        // 主动触发保存（如果 3 秒内有变更则会保存）
        dirtyRef.current = true
      } catch {}
    }, 3000)
    return () => clearInterval(checkCellChanges)
  }, [id])

  // 检测工作表结构变更（重命名、删除工作表）并强制保存+同步
  useEffect(() => {
    if (!univerRef.current || !id) return
    const checkSheetChanges = setInterval(() => {
      try {
        const wb = univerRef.current?.getActiveWorkbook()
        if (!wb) return
        const sheets = wb.getSheets?.() || []
        const names: Record<string, string> = {}
        const order: string[] = []
        for (const sheet of sheets) {
          const s = sheet as any
          const sid = s.getSheetId?.() || s._worksheet?.getSheetId?.() || ''
          const sname = s.getName?.() || s._worksheet?.getName?.() || ''
          names[sid] = sname
          order.push(sid)
        }

        const oldNamesStr = JSON.stringify(sheetNamesRef.current)
        const newNamesStr = JSON.stringify(names)
        const oldOrderStr = JSON.stringify(sheetOrderRef.current)
        const newOrderStr = JSON.stringify(order)

        if (oldNamesStr !== newNamesStr || oldOrderStr !== newOrderStr) {
          sheetNamesRef.current = names
          sheetOrderRef.current = order
          dirtyRef.current = true
          // 立即保存并同步到 Yjs
          handleSave(true)
        }
      } catch {}
    }, 2000)
    return () => clearInterval(checkSheetChanges)
  }, [id, handleSave])

  // 只读模式 CSS 控制
  useEffect(() => {
    if (!containerRef.current) return
    const parent = containerRef.current.closest('.h-full')
    if (!parent) return
    if (!canEdit) {
      parent.classList.add('readonly-mode')
      try {
        const wb = univerRef.current?.getActiveWorkbook()
        if (wb) wb.setEditable(false)
      } catch {}
    } else {
      parent.classList.remove('readonly-mode')
      try {
        const wb = univerRef.current?.getActiveWorkbook()
        if (wb) wb.setEditable(true)
      } catch {}
    }
  }, [canEdit])

  // 导出状态
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportBtnPosRef = useRef<{ top: number; right: number }>({ top: 0, right: 0 })
  const handleToggleExportMenu = useCallback(() => {
    if (exportBtnRef.current) {
      const rect = exportBtnRef.current.getBoundingClientRect()
      exportBtnPosRef.current = { top: rect.bottom + 4, right: window.innerWidth - rect.right }
    }
    setShowExportMenu(v => !v)
  }, [])
  const exportBtnRef = useRef<HTMLButtonElement>(null)

  // 导出 XLSX
  const handleExportXLSX = useCallback(() => {
    if (!univerRef.current) return
    try {
      const workbook = univerRef.current.getActiveWorkbook()
      const snapshot = workbook?.save()
      if (!snapshot) { toast.error('无法获取工作簿数据'); return }
      const data = exportWorkbookToXLSX(snapshot)
      const blob = new Blob([data as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${sheet?.name || 'export'}.xlsx`
      a.click(); URL.revokeObjectURL(url)
      setShowExportMenu(false)
      toast.success('导出 XLSX 成功')
    } catch (e: any) { toast.error('导出失败: ' + (e.message || '')) }
  }, [sheet?.name])

  // 导出 CSV
  const handleExportCSV = useCallback(() => {
    if (!univerRef.current) return
    try {
      const workbook = univerRef.current.getActiveWorkbook()
      const snapshot = workbook?.save()
      if (!snapshot) { toast.error('无法获取工作簿数据'); return }
      const csv = exportWorkbookToCSV(snapshot)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${sheet?.name || 'export'}.csv`
      a.click(); URL.revokeObjectURL(url)
      setShowExportMenu(false)
      toast.success('导出 CSV 成功')
    } catch (e: any) { toast.error('导出失败: ' + (e.message || '')) }
  }, [sheet?.name])

  // 踢出用户
  const handleKickUser = useCallback(async (userId: string) => {
    if (!id) return
    try {
      await fetch(`/api/spreadsheet/${id}/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      toast.success('用户已被踢出')
    } catch {
      toast.error('踢出用户失败')
    }
  }, [id])

  // 封禁用户
  const handleBanUser = useCallback(async (userId: string) => {
    if (!id) return
    try {
      await fetch(`/api/spreadsheet/${id}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      setBannedUsers(prev => [...prev, userId])
      toast.success('用户已被封禁')
    } catch {
      toast.error('封禁用户失败')
    }
  }, [id])

  // 解封用户
  const handleUnbanUser = useCallback(async (userId: string) => {
    if (!id) return
    try {
      await fetch(`/api/spreadsheet/${id}/unban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      setBannedUsers(prev => prev.filter(u => u !== userId))
      toast.success('用户已被解封')
    } catch {
      toast.error('解封用户失败')
    }
  }, [id])

  // Yjs 单元格级同步：远程变更 diff 后只更新变更单元格，不触发 reload
  useEffect(() => {
    if (!docRef.current || !id || loading) return

    const snapshotMap = docRef.current.getMap('spreadsheet')
    isFirstSyncRef.current = true

    const observer = (_event: Y.YMapEvent<any>, _transaction: Y.Transaction) => {
      if (_transaction.local) return
      if (!_event.changes.keys.has('snapshot')) return

      try {
        // ★★★ 首次同步跳过：数据已在 createWorkbook 时从 DB 加载
        if (isFirstSyncRef.current) {
          isFirstSyncRef.current = false
          return
        }

        const keyChange = _event.changes.keys.get('snapshot')
        if (!keyChange || !univerRef.current) return

        const oldRaw = keyChange.oldValue
        const newRaw = snapshotMap.get('snapshot')
        if (!oldRaw || !newRaw) return

        const oldSnapshot = typeof oldRaw === 'string' ? JSON.parse(oldRaw) : oldRaw
        const newSnapshot = typeof newRaw === 'string' ? JSON.parse(newRaw) : newRaw
        if (!newSnapshot?.sheets) return

        // ★★★ 按 sheet 逐页 diff 单元格
        const univerAPI = univerRef.current
        const oldSheets = oldSnapshot.sheets || {}
        const newSheets = newSnapshot.sheets
        let needFallbackReload = false

        // ★ 检测工作表结构变化：删除/新增/重命名
        const oldSheetKeys = Object.keys(oldSheets)
        const newSheetKeys = Object.keys(newSheets)

        // 检测删除：旧有但新无
        for (const sid of oldSheetKeys) {
          if (!newSheets[sid]) { needFallbackReload = true; break }
        }
        if (!needFallbackReload) {
          // 检测新增：旧无但新有
          for (const sid of newSheetKeys) {
            if (!oldSheets[sid]) { needFallbackReload = true; break }
          }
        }
        if (!needFallbackReload) {
          // 检测重命名：相同 sheetId 但 name 不同
          for (const sid of newSheetKeys) {
            if (oldSheets[sid]?.name !== newSheets[sid]?.name) {
              needFallbackReload = true
              break
            }
          }
        }
        // 检测工作表顺序变化
        if (!needFallbackReload) {
          if (JSON.stringify(oldSnapshot.sheetOrder) !== JSON.stringify(newSnapshot.sheetOrder)) {
            needFallbackReload = true
          }
        }

        if (!needFallbackReload) {
          for (const sheetId of Object.keys(newSheets)) {
            // ★★★ 检测合并区域变更（合并/unmerge 需要 fallback reload）
            const oldMergeData = oldSheets[sheetId]?.mergeData || []
            const newMergeData = newSheets[sheetId]?.mergeData || []
            if (JSON.stringify(oldMergeData) !== JSON.stringify(newMergeData)) {
              needFallbackReload = true
              break
            }
            const applied = applyCellDiff(
              univerAPI,
              sheetId,
              oldSheets[sheetId]?.cellData,
              newSheets[sheetId]?.cellData,
              oldSnapshot,
              newSnapshot
            )
            if (!applied) {
              needFallbackReload = true
              break
            }
          }
        }

        // ★★★ 尝试无感应用工作表结构变更，避免全量重载
        if (needFallbackReload && !loading) {
          const sheetApplied = applySheetChanges(
            univerAPI,
            oldSheets,
            newSheets,
            oldSnapshot.sheetOrder || Object.keys(oldSheets),
            newSnapshot.sheetOrder || Object.keys(newSheets)
          )
          if (!sheetApplied) {
            // 降级：全量刷新
            setSheet(prev => prev ? { ...prev, snapshot: newSnapshot } : prev)
            setReloadKey(k => k + 1)
          }
        }
      } catch {}
    }

    snapshotMap.observe(observer)
    return () => {
      snapshotMap.unobserve(observer)
      isFirstSyncRef.current = true
    }
  }, [id, loading])

  // 重新加载时重置首次同步标记
  useEffect(() => {
    isFirstSyncRef.current = true
  }, [reloadKey])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>加载中...</span>
        </div>
      </div>
    )
  }

  if (error || !sheet) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm">
          <h3 className="text-base font-semibold text-foreground mb-2">无法加载表格</h3>
          <p className="text-sm text-muted-foreground mb-4">{error || '未知错误'}</p>
          <Button variant="outline" onClick={() => navigate('/spreadsheets')}>
            <ArrowLeft className="h-4 w-4 mr-1" />返回列表
          </Button>
        </div>
      </div>
    )
  }

  return (
    <SpreadsheetCollabProvider spreadsheetId={id!}>
      {({ users, connectionStatus, setCursor, doc }: { users: CollabUser[]; connectionStatus: 'connecting' | 'connected' | 'disconnected'; setCursor: (row: number | null, col: number | null) => void; doc: Y.Doc }) => {
        setCursorRef.current = setCursor
        docRef.current = doc
        // 计算其他用户的光标位置（使用滚动/缩放补偿）
        const sd = scrollDataRef.current
        const remoteCursors = users.slice(1).filter(u => u.cursor)
        return (
    <>
    <div className="h-full flex flex-col">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-border bg-card/60 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/spreadsheets')} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-foreground">{sheet.name}</span>
          {lastSaved && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {lastSaved.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* 连接状态 */}
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' :
              connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
            }`} />
            <span className="text-xs text-muted-foreground">
              {connectionStatus === 'connected' ? `${users.length}人在线` :
               connectionStatus === 'connecting' ? '连接中' : '已断开'}
            </span>
          </div>

          {/* 在线用户头像列表 */}
          {users.length > 0 && (
            <div className="flex items-center -space-x-1.5">
              {users.map((u) => (
                <Avatar key={u.clientId} className="w-6 h-6 border-2 border-background">
                  {u.avatarUrl ? (
                    <AvatarImage src={u.avatarUrl} alt={u.name} />
                  ) : null}
                  <AvatarFallback
                    className="text-[10px] font-medium"
                    style={{ backgroundColor: u.color, color: '#fff' }}
                    title={u.name + (u.cursor ? ` (${toCellLabel(u.cursor.row, u.cursor.col)})` : '')}
                  >
                    {u.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
          )}

          {!canEdit && (
            <>
              <span className="text-xs text-muted-foreground px-2 py-1 rounded-md bg-muted/50">只读</span>
              {!sheet?.created_by || sheet.created_by === user?.id ? null : null}
            </>
          )}
          {canEdit && (
            <>
              {/* 导出按钮 */}
              {canExportSpreadsheet(user, userPermissions) && (
              <Button ref={exportBtnRef} variant="outline" size="sm" onClick={handleToggleExportMenu} className="gap-1.5 h-8">
                <FileDown className="h-3.5 w-3.5" />
                导出
                <ChevronDown className="h-3 w-3" />
              </Button>
              )}

              {canShareSpreadsheet(user, { created_by: sheet.created_by }, userPermissions) && (
              <Button variant="outline" size="sm" onClick={handleOpenShare} className="gap-1.5 h-8">
                <Share2 className="h-3.5 w-3.5" />
                分享
              </Button>
              )}
              {/* 权限管理按钮（仅创建者） */}
              {user?.id === sheet.created_by && (
                <Button variant="outline" size="sm" onClick={() => setPermDialogOpen(true)} className="gap-1.5 h-8">
                  <Shield className="h-3.5 w-3.5" />
                  权限管理
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => handleSave()} disabled={saving} className="gap-1.5 h-8">
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saving ? '保存中...' : '保存'}
              </Button>
            </>
          )}
          {/* 在线用户管理按钮（仅创建者） */}
          {user?.id === sheet.created_by && users.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setManageUsersOpen(true)} className="gap-1 h-8 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span className="text-xs">管理在线用户</span>
            </Button>
          )}
        </div>
      </div>

      {/* 在线用户栏（多于1人时显示） */}
      {users.length > 1 && (
        <div className="flex items-center gap-1 px-4 py-1 border-b bg-muted/30 flex-shrink-0">
          <Users className="h-3 w-3 text-muted-foreground mr-1" />
          {users.map((u) => (
            <span
              key={u.clientId}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: u.color + '20', color: u.color }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: u.color }} />
              {u.name}
              {u.cursor && <span className="opacity-60">{toCellLabel(u.cursor.row, u.cursor.col)}</span>}
            </span>
          ))}
        </div>
      )}

      {/* 光标叠加层：使用场景实时坐标精确定位 */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" />
        {remoteCursors.map((u) => {
          let cellLeft = 0, cellTop = 0, cellWidth = 100, cellHeight = 24
          let useSkeleton = false

          // ★ 首选：用场景组件获取精确单元格位置
          try {
            const wb = univerRef.current?.getActiveWorkbook()
            if (wb && u.cursor) {
              const unitId = wb.getId()
              const renderManager = renderManagerRef.current
              if (renderManager) {
                const renderUnit = renderManager.getRenderById(unitId)
                if (renderUnit) {
                  const mainComp = renderUnit.mainComponent as any
                  if (mainComp?.getNoMergeCellPositionByIndex) {
                    const pos = mainComp.getNoMergeCellPositionByIndex(u.cursor.row, u.cursor.col)
                    if (pos) {
                      // ★ 直接从场景获取实时的滚动和缩放值
                      const scene = renderUnit.scene as any
                      let sceneScrollX = 0
                      let sceneScrollY = 0
                      let sceneScaleX = 1
                      let sceneScaleY = 1
                      if (scene) {
                        sceneScrollX = scene.scrollX || 0
                        sceneScrollY = scene.scrollY || 0
                        sceneScaleX = scene.scaleX || 1
                        sceneScaleY = scene.scaleY || 1
                      }

                      // ★ 获取 canvas 屏幕位置
                      const sceneEngine = scene?.getEngine?.()
                      const sceneCanvas = sceneEngine?.getCanvasElement?.() as HTMLCanvasElement | undefined
                      if (containerRef.current) {
                        const cRect = containerRef.current.getBoundingClientRect()
                        if (sceneCanvas) {
                          const cvRect = sceneCanvas.getBoundingClientRect()
                          const screenLeft = cvRect.left + (pos.startX - sceneScrollX) * sceneScaleX
                          const screenTop = cvRect.top + (pos.startY - sceneScrollY) * sceneScaleY
                          cellLeft = screenLeft - cRect.left
                          cellTop = screenTop - cRect.top
                        } else {
                          // 降级：用容器偏移
                          const offset = canvasOffsetRef.current
                          cellLeft = (pos.startX - sceneScrollX) * sceneScaleX + offset.x
                          cellTop = (pos.startY - sceneScrollY) * sceneScaleY + offset.y
                        }
                      }
                      cellWidth = (pos.endX - pos.startX) * sceneScaleX
                      cellHeight = (pos.endY - pos.startY) * sceneScaleY
                      useSkeleton = true
                    }
                  }
                }
              }
            }
          } catch {}

          // 兜底计算
          if (!useSkeleton && u.cursor) {
            try {
              const fSheet = univerRef.current?.getActiveWorkbook()?.getActiveSheet()
              if (fSheet) {
                const ws = (fSheet as any).getSheet()
                const pos = getCellPixelPosition(ws, u.cursor.row, u.cursor.col)
                const pos2 = getCellPixelPosition(ws, u.cursor.row, u.cursor.col + 1)
                const offset = canvasOffsetRef.current
                cellLeft = (pos.left - sd.scrollLeft) * sd.zoom + offset.x
                cellTop = (pos.top - sd.scrollTop) * sd.zoom + offset.y
                cellWidth = (pos2.left - pos.left) * sd.zoom
                cellHeight = 24 * sd.zoom
              }
            } catch {
              const offset = canvasOffsetRef.current
              cellLeft = (u.cursor.col * 88 + 46 - sd.scrollLeft) * sd.zoom + offset.x
              cellTop = (u.cursor.row * 24 + 20 - sd.scrollTop) * sd.zoom + offset.y
            }
          }

          return (
          <div
            key={u.clientId}
            className="absolute pointer-events-none z-50"
            style={{
              top: `${cellTop}px`,
              left: `${cellLeft}px`,
              width: `${cellWidth}px`,
              height: `${cellHeight}px`,
            }}
          >
            <div
              className="absolute inset-0 rounded-[1px]"
              style={{ backgroundColor: u.color + '33', border: `2px solid ${u.color}` }}
            />
            <span
              className="absolute -top-[18px] left-0 text-[10px] leading-none px-1 py-0.5 whitespace-nowrap rounded-t-sm"
              style={{ backgroundColor: u.color, color: '#fff' }}
            >
              {u.name}
              {u.cursor && <span className="ml-1 opacity-80">({toCellLabel(u.cursor.row, u.cursor.col)})</span>}
            </span>
          </div>
        )})}
      </div>
    </div>

      {/* 分享弹窗 */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>分享设置 - {sheet?.name}</DialogTitle>
            <DialogDescription>设置谁可以查看和编辑此表格</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">访问权限</label>
              <Select value={shareAccess} onValueChange={(v: any) => setShareAccess(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">
                    <span className="flex items-center gap-2"><Lock className="h-4 w-4" />仅我自己</span>
                  </SelectItem>
                  <SelectItem value="department">
                    <span className="flex items-center gap-2"><Building2 className="h-4 w-4" />仅我分享的好友</span>
                  </SelectItem>
                  <SelectItem value="public">
                    <span className="flex items-center gap-2"><Globe className="h-4 w-4" />所有人</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">编辑权限</label>
              <Select value={shareEditPermission} onValueChange={(v: any) => setShareEditPermission(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editable">允许编辑</SelectItem>
                  <SelectItem value="readonly">仅查看</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {shareAccess === 'department' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">选择部门/好友</label>
                <DepartmentTreeSelector
                  tree={departmentTree}
                  selectedIds={shareDeptIds}
                  onChange={setShareDeptIds}
                />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShareOpen(false)}>取消</Button>
            <Button onClick={handleSaveShare} disabled={shareSaving}>
              {shareSaving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 在线用户管理弹窗（仅创建者） */}
      <Dialog open={manageUsersOpen} onOpenChange={setManageUsersOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>在线用户管理 - {sheet?.name}</DialogTitle>
            <DialogDescription>管理当前在线用户，可踢出或封禁用户</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">当前没有在线用户</p>
            ) : (
              users.map((u) => {
                const isSelf = u.clientId === (users[0]?.clientId) // 自己永远在第一个
                return (
                  <div key={u.clientId} className="flex items-center justify-between p-2.5 rounded-lg bg-card border border-border">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar className="w-7 h-7 border border-border">
                        {u.avatarUrl ? <AvatarImage src={u.avatarUrl} alt={u.name} /> : null}
                        <AvatarFallback className="text-xs font-medium" style={{ backgroundColor: u.color, color: '#fff' }}>
                          {u.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{u.name}</p>
                        <div className="flex items-center gap-1.5">
                          {isSelf && <span className="text-xs text-blue-500">（自己）</span>}
                          {bannedUsers.includes(u.clientId.toString()) && (
                            <span className="text-xs text-destructive flex items-center gap-0.5"><Ban className="h-3 w-3" />已封禁</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!isSelf && (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-amber-600" onClick={() => handleKickUser(u.clientId.toString())}>
                            <AlertTriangle className="h-3 w-3" />
                            踢出
                          </Button>
                          {bannedUsers.includes(u.clientId.toString()) ? (
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-green-600" onClick={() => handleUnbanUser(u.clientId.toString())}>
                              <UserCheck className="h-3 w-3" />
                              解封
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={() => handleBanUser(u.clientId.toString())}>
                              <Ban className="h-3 w-3" />
                              封禁
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageUsersOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 权限管理弹窗 */}
      <SpreadsheetPermissionDialog
        open={permDialogOpen}
        onOpenChange={setPermDialogOpen}
        univerAPI={univerRef.current}
      />

      {/* 导出下拉菜单（fixed 定位在 body 层级，完全脱离所有容器 stacking context） */}
      {showExportMenu && (
        <>
          <div className="fixed inset-0 z-[9999]" onClick={() => setShowExportMenu(false)} />
          <div
            className="fixed w-40 rounded-lg border border-border bg-card shadow-lg"
            style={{ top: exportBtnPosRef.current.top, right: exportBtnPosRef.current.right, zIndex: 10000 }}
          >
            <button onClick={handleExportXLSX} className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2 rounded-t-lg">
              <FileDown className="h-3.5 w-3.5" />导出 XLSX
            </button>
            <button onClick={handleExportCSV} className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2 rounded-b-lg border-t border-border">
              <FileDown className="h-3.5 w-3.5" />导出 CSV
            </button>
          </div>
        </>
      )}

      {/* 只读模式 CSS：隐藏工具栏 / 公式栏 / 页脚 */}
      <style>{`
        .readonly-mode .univer-toolbar { display: none !important; }
        .readonly-mode .univer-formula-bar { display: none !important; }
        .readonly-mode .univer-footer { display: none !important; }
        .readonly-mode .univer-sheet-bar { display: none !important; }
      `}</style>
    </>
  )
  }}
    </SpreadsheetCollabProvider>
  )
}