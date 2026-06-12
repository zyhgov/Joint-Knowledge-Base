import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { UserWithDepartments, TransferFanReasonType, TRANSFER_FAN_REASON_LABELS } from '@/types/database'
import { SearchableUserSelect } from './FilterComponents'
import { XMarkIcon, PhotoIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { r2Service } from '@/services/r2Service'
import { compressToFile, validateAttachment, getPublicImageUrl } from '@/utils/imageCompress'
import { cn } from '@/lib/utils'

export interface ManualTransferData {
  seatUserId: string
  reasonType: TransferFanReasonType
  reasonDetail: string
  attachmentUrls: Array<{ url: string; key: string; uploaded_at: string }>
}

interface ManualTransferDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (data: ManualTransferData) => void
  sourceIds: string[]
  targetUserName: string
  targetDepartmentName: string
  users: UserWithDepartments[]
}

const REASON_OPTIONS: { value: TransferFanReasonType; label: string }[] = [
  { value: 'seat_rest', label: '坐席休息' },
  { value: 'seat_resign', label: '坐席离职' },
  { value: 'wechat_transfer', label: '微信用户转粉' },
  { value: 'other', label: '其他原因' },
]

export default function ManualTransferDialog({
  open,
  onClose,
  onConfirm,
  sourceIds,
  targetUserName,
  targetDepartmentName,
  users,
}: ManualTransferDialogProps) {
  const [seatUserId, setSeatUserId] = useState('')
  const [reasonType, setReasonType] = useState<TransferFanReasonType>('seat_rest')
  const [reasonDetail, setReasonDetail] = useState('')
  const [attachments, setAttachments] = useState<Array<{ url: string; key: string; uploaded_at: string; size: number }>>([])
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // 公共文件处理逻辑（选择、拖拽、粘贴共用）
  const processFiles = useCallback(async (files: File[]) => {
    for (const file of files) {
      const validation = validateAttachment(file, {
        maxSizeMB: 5,
        maxCount: 3,
        currentCount: attachments.length,
      })
      if (!validation.valid) {
        toast.error(validation.error!)
        break
      }

      try {
        setUploading(true)
        const compressed = await compressToFile(file, undefined, 5 * 1024 * 1024)
        const result = await r2Service.uploadFile(compressed, 'transfer-attachments')
        setAttachments(prev => [...prev, {
          url: result.url,
          key: result.key,
          uploaded_at: new Date().toISOString(),
          size: compressed.size,
        }])
      } catch (err: any) {
        toast.error('截图上传失败: ' + err.message)
      } finally {
        setUploading(false)
      }
    }
  }, [attachments.length])

  // 选择文件
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    await processFiles(Array.from(files))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // 拖拽事件
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) {
      toast.error('请拖入图片文件')
      return
    }
    await processFiles(files)
  }, [processFiles])

  // 粘贴事件监听
  useEffect(() => {
    if (!open) return
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const imageFiles: File[] = []
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) imageFiles.push(file)
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault()
        await processFiles(imageFiles)
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [open, processFiles])

  // 所有 hooks 必须在此行之上，early return 在此之后
  if (!open) return null

  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const handleConfirm = () => {
    if (!seatUserId) {
      toast.error('请选择ID转前的归属坐席')
      return
    }
    if (reasonType === 'other' && !reasonDetail.trim()) {
      toast.error('请填写其他原因详情')
      return
    }
    if (reasonType === 'other' && reasonDetail.trim().length > 50) {
      toast.error('其他原因不能超过50个字')
      return
    }
    if (attachments.length === 0) {
      toast.error('请上传至少一张佐证截图')
      return
    }

    setConfirming(true)
    onConfirm({
      seatUserId,
      reasonType,
      reasonDetail: reasonType === 'other' ? reasonDetail.trim() : '',
      attachmentUrls: attachments,
    })
    // 重置
    setSeatUserId('')
    setReasonType('seat_rest')
    setReasonDetail('')
    setAttachments([])
    setConfirming(false)
  }

  const handleClose = () => {
    setSeatUserId('')
    setReasonType('seat_rest')
    setReasonDetail('')
    setAttachments([])
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background rounded-xl shadow-xl border border-border max-w-lg w-[92%] overflow-hidden">
        {/* 标题 */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-base font-semibold">人工转粉工单申请</h3>
          <button onClick={handleClose} className="p-1 hover:bg-accent rounded transition-colors">
            <XMarkIcon className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-5 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* 源用户ID */}
          <div>
            <Label className="text-xs text-muted-foreground">源用户ID（已锁定）</Label>
            <div className="mt-1 text-sm font-medium bg-muted/50 rounded-md px-3 py-2">
              {sourceIds.join('、')}
            </div>
          </div>

          {/* 坐席用户选择 */}
          <div>
            <SearchableUserSelect
              value={seatUserId}
              onValueChange={setSeatUserId}
              users={users}
              placeholder="选择坐席用户"
              label="ID转前的归属坐席"
            />
          </div>

          {/* 目标用户（只读） */}
          <div>
            <Label className="text-xs text-muted-foreground">目标用户（已锁定）</Label>
            <div className="mt-1 text-sm font-medium bg-muted/50 rounded-md px-3 py-2">
              {targetUserName}
              <span className="text-xs text-muted-foreground ml-2">({targetDepartmentName})</span>
            </div>
          </div>

          {/* 申请原因 */}
          <div>
            <Label className="text-xs">申请原因</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {REASON_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setReasonType(opt.value)}
                  className={`px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                    reasonType === opt.value
                      ? 'border-primary bg-primary/5 text-primary font-medium'
                      : 'border-border hover:border-primary/50 text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 其他原因输入 */}
          {reasonType === 'other' && (
            <div>
              <Label className="text-xs">原因详情（最多50字）</Label>
              <Textarea
                value={reasonDetail}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                  if (e.target.value.length <= 50) setReasonDetail(e.target.value)
                }}
                placeholder="请简要说明申请原因..."
                className="mt-1 min-h-[60px]"
                maxLength={50}
              />
              <div className="text-xs text-muted-foreground text-right mt-0.5">
                {reasonDetail.length}/50
              </div>
            </div>
          )}

          {/* 截图上传 */}
          <div
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'mt-2 rounded-lg border-2 border-dashed transition-colors',
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/40'
            )}
          >
            <Label className="text-xs">上传情况截图 <span className="text-red-500">*</span></Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              为确保转粉公平性，情况截图为必填项，管理员将依据截图来审核是否能转，最多3张，单张5MB以内。
            </p>
            <div className="p-3">
              {/* 已上传的缩略图 */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {attachments.map((att, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-lg border border-border overflow-hidden group">
                      <img
                        src={getPublicImageUrl(att.url)}
                        alt={`截图 ${idx + 1}`}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setPreviewUrl(att.url)}
                      />
                      <button
                        onClick={() => handleRemoveAttachment(idx)}
                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <XMarkIcon className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* 上传区域 */}
              {attachments.length < 3 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full h-24 rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                      <span className="text-xs">上传中...</span>
                    </>
                  ) : (
                    <>
                      <ArrowUpTrayIcon className="h-6 w-6" />
                      <span className="text-xs">点击选择、拖入或 Ctrl+V 粘贴图片</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif,image/bmp"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </div>

        {/* 底部 */}
        <div className="border-t border-border px-5 py-3 flex justify-end gap-2 bg-muted/30">
          <Button variant="outline" size="sm" onClick={handleClose}>
            取消
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={confirming || uploading}>
            {confirming ? '添加中...' : '确认添加'}
          </Button>
        </div>
      </div>

      {/* 图片预览 */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={getPublicImageUrl(previewUrl)}
              alt="截图预览"
              className="max-w-[85vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-white/15 backdrop-blur-sm text-white hover:bg-white/25 flex items-center justify-center transition-colors"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}