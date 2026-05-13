import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { spreadsheetService } from '@/services/spreadsheetService'
import { Spreadsheet } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Lock, Loader2, AlertCircle, Users } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { supabase } from '@/services/supabase'

import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets'
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core'
import UniverPresetSheetsCoreZhCN from '@univerjs/preset-sheets-core/locales/zh-CN'
import '@univerjs/preset-sheets-core/lib/index.css'

import { ICommandService, IUniverInstanceService } from '@univerjs/core'
import { SetRangeValuesMutation } from '@univerjs/sheets'

import SpreadsheetCollabProvider from '@/components/editor/SpreadsheetCollabProvider'
import type { CollabUser } from '@/components/editor/SpreadsheetCollabProvider'
import { useAuthStore } from '@/store/authStore'
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
  if (!oldCellData && newCellData) return false
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

export default function SharedSpreadsheet() {
  const { shareCode } = useParams<{ shareCode: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const containerRef = useRef<HTMLDivElement>(null)

  const [step, setStep] = useState<'loading' | 'password' | 'error' | 'editor'>('loading')
  const [sheet, setSheet] = useState<Spreadsheet | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [password, setPassword] = useState('')
  const [passwordChecking, setPasswordChecking] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const initializedRef = useRef(false)
  const setCursorRef = useRef<((row: number | null, col: number | null) => void) | null>(null)
  const univerRef = useRef<any>(null)
  const docRef = useRef<Y.Doc | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const scrollDataRef = useRef({ scrollTop: 0, scrollLeft: 0, zoom: 1, rowHeight: 24, colWidth: 88, headerWidth: 46, headerHeight: 20 })
  const [scrollTick, setScrollTick] = useState(0)
  const renderManagerRef = useRef<any>(null)
  const isFirstSyncRef = useRef(true)
  const canvasOffsetRef = useRef({ x: 0, y: 0 })

  // 验证分享链接
  useEffect(() => {
    if (!shareCode) return
    const verify = async () => {
      const result = await spreadsheetService.verifyShareAccess(shareCode)
      if (!result.valid) {
        if (result.message === '需要密码') {
          setStep('password')
        } else {
          setErrorMsg(result.message || '分享链接无效')
          setStep('error')
        }
        return
      }
      if (result.share) {
        const data = await spreadsheetService.getSpreadsheet(result.share.spreadsheet_id)
        if (data) {
          setSheet(data)
          setCanEdit(result.share.can_edit)
          setStep('editor')
        } else {
          setErrorMsg('表格不存在或已被删除')
          setStep('error')
        }
      }
    }
    verify()
  }, [shareCode])

  // 提交密码
  const handlePasswordSubmit = async () => {
    if (!shareCode || !password.trim()) return
    setPasswordChecking(true)
    setPasswordError('')
    const result = await spreadsheetService.verifyShareAccess(shareCode, password.trim())
    if (result.valid && result.share) {
      const data = await spreadsheetService.getSpreadsheet(result.share.spreadsheet_id)
      if (data) {
        setSheet(data)
        setCanEdit(result.share.can_edit)
        setStep('editor')
      } else {
        setErrorMsg('表格不存在或已被删除')
        setStep('error')
      }
    } else {
      setPasswordError(result.message || '密码错误')
    }
    setPasswordChecking(false)
  }

  // 初始化 Univer 编辑器
  useEffect(() => {
    if (step !== 'editor' || !containerRef.current || !sheet) return
    if (initializedRef.current && !reloadKey) return
    initializedRef.current = true

    try {
      const { univerAPI } = createUniver({
        locale: LocaleType.ZH_CN,
        locales: {
          [LocaleType.ZH_CN]: mergeLocales(UniverPresetSheetsCoreZhCN),
        },
        presets: [
          UniverSheetsCorePreset({ container: containerRef.current, ribbonType: 'classic' }),
        ],
      })

      univerRef.current = univerAPI

      // 异步获取渲染引擎服务（动态导入避免传递依赖问题）
      import('@univerjs/engine-render').then(({ IRenderManagerService }: any) => {
        try {
          const rootInjector = (univerAPI as any)._injector
          renderManagerRef.current = rootInjector.get(IRenderManagerService)
        } catch {}
      }).catch(() => {})

      // 加载 snapshot
      if (isValidWorkbookSnapshot(sheet.snapshot)) {
        try {
          univerAPI.createWorkbook(sheet.snapshot as any)
        } catch {
          univerAPI.createWorkbook(DEFAULT_WORKBOOK_DATA)
        }
      } else {
        univerAPI.createWorkbook(DEFAULT_WORKBOOK_DATA)
      }

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

      // 如果不是可编辑模式，设置为只读
      if (!canEdit) {
        setTimeout(() => {
          try {
            const wb = univerAPI.getActiveWorkbook()
            if (wb) wb.setEditable(false)
          } catch {}
        }, 500)
      }

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

          // 兜底：从 workbook snapshot 获取（不精确但至少不是 0）
          if (scrollTop === 0 && scrollLeft === 0) {
            try {
              const ws = (fSheet as any).getSheet()
              if (ws?._snapshot) {
                scrollTop = ws._snapshot.scrollTop ?? 0
                scrollLeft = ws._snapshot.scrollLeft ?? 0
              }
            } catch {}
          }

          const zoom = sheet.getZoomRatio() || 1
          // 检测 canvas 在容器中的偏移
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
          scrollDataRef.current.scrollTop = scrollTop
          scrollDataRef.current.scrollLeft = scrollLeft
          scrollDataRef.current.zoom = zoom
          setScrollTick(v => v + 1)
        } catch {}
      }, 200)

      return () => {
        try {
          if (cursorDisposable) cursorDisposable.dispose()
        } catch {}
        clearInterval(scrollPoll)
        try { univerAPI.dispose() } catch {}
      }
    } catch {}
  }, [step, sheet, canEdit, reloadKey])

  // 在线状态心跳
  useEffect(() => {
    if (!sheet?.id || !user) return
    const hb = async () => {
      await spreadsheetService.upsertPresence(sheet.id, user.id, user.display_name || '用户')
    }
    hb()
    const interval = setInterval(hb, 30000)
    return () => {
      clearInterval(interval)
      spreadsheetService.deletePresence(sheet.id, user.id)
    }
  }, [sheet?.id, user?.id, user?.display_name])

  // Yjs 单元格级同步：远程变更 diff 后只更新变更单元格，不触发 reload
  useEffect(() => {
    if (!docRef.current || !sheet?.id) return

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

        for (const sheetId of Object.keys(newSheets)) {
          if (!oldSheets[sheetId]) {
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

        // ★★★ 降级方案：如果单元格级 diff 失败，fallback 全量刷新
        if (needFallbackReload) {
          setSheet(prev => prev ? { ...prev, snapshot: newSnapshot } : prev)
          setReloadKey(k => k + 1)
        }
      } catch {}
    }

    snapshotMap.observe(observer)
    return () => {
      snapshotMap.unobserve(observer)
      isFirstSyncRef.current = true
    }
  }, [sheet?.id])

  // 重新加载时重置首次同步标记
  useEffect(() => {
    isFirstSyncRef.current = true
  }, [reloadKey])

  // 密码输入页面
  if (step === 'password') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-sm w-full">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">此分享需要密码</h2>
            <p className="text-sm text-muted-foreground mt-1">请输入密码以查看表格</p>
          </div>
          <div className="space-y-3">
            <Input
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordSubmit() }}
              placeholder="输入密码"
              type="password"
              autoFocus
            />
            {passwordError && (
              <p className="text-xs text-destructive">{passwordError}</p>
            )}
            <Button onClick={handlePasswordSubmit} disabled={passwordChecking || !password.trim()} className="w-full">
              {passwordChecking ? '验证中...' : '确认'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // 错误页面
  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1">无法访问</h2>
          <p className="text-sm text-muted-foreground mb-4">{errorMsg}</p>
          <Button variant="outline" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-1" />返回首页
          </Button>
        </div>
      </div>
    )
  }

  // 编辑器页面
  if (step === 'editor') {
    const spreadsheetId = sheet?.id || ''
    return (
      <SpreadsheetCollabProvider spreadsheetId={spreadsheetId}>
        {({ users, connectionStatus, setCursor, doc }: any) => {
          setCursorRef.current = setCursor
          docRef.current = doc
          const sd = scrollDataRef.current
          const remoteCursors = users.slice(1).filter((u: CollabUser) => u.cursor)
          return (
            <div className="h-screen flex flex-col bg-background">
              <div className="flex items-center justify-between px-4 h-12 border-b border-border bg-card/60 backdrop-blur-sm flex-shrink-0">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" onClick={() => navigate('/spreadsheets')} className="h-8 w-8">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium text-foreground">{sheet?.name}</span>
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
                      {users.map((u: CollabUser) => (
                        <span
                          key={u.clientId}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-medium border-2 border-background cursor-default"
                          style={{ backgroundColor: u.color, color: '#fff' }}
                          title={u.name + (u.cursor ? ` (${toCellLabel(u.cursor.row, u.cursor.col)})` : '')}
                        >
                          {u.name.charAt(0)}
                        </span>
                      ))}
                    </div>
                  )}

                  <span className="text-xs text-muted-foreground px-2 py-1 rounded-md bg-muted/50">
                    {canEdit ? '可编辑' : '仅查看'}
                  </span>
                </div>
              </div>

              {/* 协作用户栏（多于1人时显示） */}
              {users.length > 1 && (
                <div className="flex items-center gap-1 px-4 py-1 border-b bg-muted/30 flex-shrink-0">
                  <Users className="h-3 w-3 text-muted-foreground mr-1" />
                  {users.map((u: CollabUser) => (
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

              {/* 光标叠加层：使用 Skeleton 精确获取单元格像素位置 */}
              <div className="flex-1 min-h-0 relative overflow-hidden">
                <div ref={containerRef} className="absolute inset-0" />
                {remoteCursors.map((u: CollabUser) => {
                  let cellLeft = 0, cellTop = 0, cellWidth = 100, cellHeight = 24
                  let useSkeleton = false

                  // ★ 首选：用 Spreadsheet.getNoMergeCellPositionByIndex 获取精确单元格位置
                  try {
                    const wb = univerRef.current?.getActiveWorkbook()
                    if (wb && u.cursor) {
                      const renderUnit = renderManagerRef.current?.getRenderById(wb.getId())
                      const mainComp = renderUnit?.mainComponent as any
                      if (mainComp && mainComp.getNoMergeCellPositionByIndex) {
                        const pos = mainComp.getNoMergeCellPositionByIndex(u.cursor.row, u.cursor.col)
                        if (pos) {
                          // 用场景的滚动和缩放，与 getNoMergeCellPositionByIndex 同源
                          const scene = renderUnit?.scene as any
                          const sceneScrollX = scene?.scrollX || 0
                          const sceneScrollY = scene?.scrollY || 0
                          const sceneScaleX = scene?.scaleX || 1
                          const sceneScaleY = scene?.scaleY || 1
                          
                          // getNoMergeCellPositionByIndex 返回场景绝对坐标，需要减滚动
                          cellLeft = (pos.startX - sceneScrollX) * sceneScaleX
                          cellTop = (pos.startY - sceneScrollY) * sceneScaleY
                          cellWidth = (pos.endX - pos.startX) * sceneScaleX
                          cellHeight = (pos.endY - pos.startY) * sceneScaleY
                          useSkeleton = true
                        }
                      }
                    }
                  } catch {}

                  // 兜底：手动计算
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
                      <span className="ml-1 opacity-60">t:{cellTop.toFixed(0)}</span>
                    </span>
                  </div>
                )})}
              </div>
            </div>
          )
        }}
      </SpreadsheetCollabProvider>
    )
  }

  // 加载中
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>加载中...</span>
      </div>
    </div>
  )
}
