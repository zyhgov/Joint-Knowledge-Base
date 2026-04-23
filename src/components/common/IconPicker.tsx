import React, { useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { r2Service } from '@/services/r2Service'
import { toast } from 'react-hot-toast'
import { PhotoIcon, FaceSmileIcon, SparklesIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline'

// 常用 emoji 列表
const EMOJI_LIST = [
  '📁', '📂', '📋', '📌', '📎', '🗂️', '📊', '📈', '📉', '🗂️',
  '💡', '🔍', '🎯', '🏆', '⭐', '🚀', '🔥', '💎', '🌟', '✨',
  '🏢', '🏗️', '🏠', '🏭', '⚙️', '🔧', '🛠️', '💻', '🖥️', '📱',
  '📚', '📖', '📝', '✏️', '📐', '📏', '🎓', '🧪', '🔬', '🔭',
  '🎨', '🎭', '🎬', '🎵', '🎶', '🎸', '🎹', '🎻', '🥁', '🎺',
  '🌍', '🌎', '🌏', '🗺️', '🏔️', '🌋', '🌊', '🌅', '🌄', '🌤️',
  '❤️', '💚', '💙', '💜', '🧡', '💛', '🤍', '🖤', '💝', '💖',
  '🤝', '👥', '👨‍💼', '👩‍💼', '🧑‍💻', '👨‍🔬', '👩‍🔬', '🧑‍🎨', '👨‍🏫', '👩‍🏫',
  '🍎', '🍊', '🍋', '🍇', '🍓', '🍑', '🍒', '🥝', '🍌', '🥑',
  '🐱', '🐶', '🦊', '🐻', '🐼', '🦁', '🐯', '🐨', '🐰', '🦄',
]

// Lucide 图标名列表（通过 react-icons/md 使用）
const ICON_LIST = [
  'MdFolder', 'MdDescription', 'MdAnalytics', 'MdDashboard', 'MdSettings',
  'MdPeople', 'MdSchool', 'MdScience', 'MdWork', 'MdBusiness',
  'MdCode', 'MdDesignServices', 'MdCampaign', 'MdSecurity', 'MdStorage',
  'MdCloud', 'MdEmail', 'MdChat', 'MdCalendarMonth', 'MdTaskAlt',
]

interface IconPickerProps {
  value: string
  onChange: (value: string) => void
  onImageUpload?: (url: string) => void
  iconType?: 'emoji' | 'icon' | 'image'
  onIconTypeChange?: (type: 'emoji' | 'icon' | 'image') => void
}

export default function IconPicker({
  value,
  onChange,
  onImageUpload,
  iconType = 'emoji',
  onIconTypeChange,
}: IconPickerProps) {
  const [activeTab, setActiveTab] = useState<'emoji' | 'icon' | 'image'>(iconType)
  const [uploading, setUploading] = useState(false)
  const [imageUrl, setImageUrl] = useState<string>(
    value.startsWith('http') ? value : ''
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleTabChange = (tab: 'emoji' | 'icon' | 'image') => {
    setActiveTab(tab)
    onIconTypeChange?.(tab)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validation = r2Service.validateFile(file, {
      maxSizeMB: 2,
      allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    })

    if (!validation.valid) {
      toast.error(validation.error || '文件验证失败')
      return
    }

    setUploading(true)
    try {
      const result = await r2Service.uploadFile(file, 'icons')
      setImageUrl(result.url)
      onImageUpload?.(result.url)
      onChange(result.url)
      toast.success('图标已上传')
    } catch (error: any) {
      toast.error(error.message || '上传失败')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // 渲染当前选中的图标预览
  const renderPreview = () => {
    if (activeTab === 'image' && value.startsWith('http')) {
      return (
        <img src={value} alt="workspace icon" className="w-full h-full object-cover rounded-lg" />
      )
    }
    if (activeTab === 'icon' && value.startsWith('icon:')) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary">
          <SvgIconByName name={value.replace('icon:', '')} size={28} />
        </div>
      )
    }
    // emoji
    return (
      <div className="w-full h-full flex items-center justify-center text-2xl">
        {value || '📁'}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* 图标预览 */}
      <div className="w-16 h-16 rounded-xl border border-border overflow-hidden mx-auto">
        {renderPreview()}
      </div>

      {/* Tab 切换 */}
      <div className="flex rounded-lg border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => handleTabChange('emoji')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
            activeTab === 'emoji'
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-muted-foreground hover:bg-accent'
          )}
        >
          <FaceSmileIcon className="h-3.5 w-3.5" />
          Emoji
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('icon')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-x border-border',
            activeTab === 'icon'
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-muted-foreground hover:bg-accent'
          )}
        >
          <SparklesIcon className="h-3.5 w-3.5" />
          图标
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('image')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
            activeTab === 'image'
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-muted-foreground hover:bg-accent'
          )}
        >
          <ArrowUpTrayIcon className="h-3.5 w-3.5" />
          图片
        </button>
      </div>

      {/* Emoji 选择面板 */}
      {activeTab === 'emoji' && (
        <div className="grid grid-cols-10 gap-1 p-2 max-h-48 overflow-y-auto border border-border rounded-lg bg-card">
          {EMOJI_LIST.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onChange(emoji)}
              className={cn(
                'w-8 h-8 flex items-center justify-center rounded-md text-lg hover:bg-accent transition-colors',
                value === emoji && 'bg-primary/10 ring-1 ring-primary'
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Icon 选择面板 */}
      {activeTab === 'icon' && (
        <div className="grid grid-cols-5 gap-2 p-3 max-h-48 overflow-y-auto border border-border rounded-lg bg-card">
          {ICON_LIST.map((iconName) => (
            <button
              key={iconName}
              type="button"
              onClick={() => onChange(`icon:${iconName}`)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 p-2 rounded-lg hover:bg-accent transition-colors border',
                value === `icon:${iconName}`
                  ? 'border-primary bg-primary/5'
                  : 'border-transparent'
              )}
            >
              <SvgIconByName name={iconName} size={24} />
              <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                {iconName.replace('Md', '')}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 图片上传面板 */}
      {activeTab === 'image' && (
        <div className="space-y-3">
          {imageUrl ? (
            <div className="relative group">
              <img
                src={imageUrl}
                alt="workspace icon"
                className="w-24 h-24 object-cover rounded-xl border border-border mx-auto"
              />
              <button
                type="button"
                onClick={() => {
                  setImageUrl('')
                  onChange('📁')
                  onImageUpload?.('')
                }}
                className="absolute top-1 right-1 p-1 bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full py-3 border-2 border-dashed border-border rounded-xl hover:border-primary/50 hover:bg-accent/30 transition-all text-sm text-muted-foreground flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                上传中...
              </>
            ) : (
              <>
                <PhotoIcon className="h-5 w-5" />
                上传图标图片
              </>
            )}
          </button>
          <p className="text-xs text-muted-foreground text-center">
            支持 JPG、PNG、WebP、SVG，最大 2MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/svg+xml"
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>
      )}
    </div>
  )
}

// 根据 icon 名渲染对应的 SVG
function SvgIconByName({ name, size = 24 }: { name: string; size?: number }) {
  // 简化版 - 使用 SVG 路径绘制常见图标
  const icons: Record<string, string> = {
    MdFolder: 'M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
    MdDescription: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
    MdAnalytics: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z',
    MdDashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
    MdSettings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
    MdPeople: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    MdSchool: 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z',
    MdScience: 'M7 2v2h1v14c0 2.21 1.79 4 4 4s4-1.79 4-4V4h1V2H7zm8 16c0 1.1-.9 2-2 2s-2-.9-2-2V4h4v14z',
    MdWork: 'M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z',
    MdBusiness: 'M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z',
    MdCode: 'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
    MdDesignServices: 'M16.24 11.51l1.57-1.57-3.75-3.75-1.57 1.57-4.14-4.14-1.41 1.41 4.14 4.14-8.09 8.09V19h2.74l8.09-8.09 4.14 4.14 1.41-1.41-4.13-4.13zM7.33 17H5.01v-2.32l7.6-7.6 2.32 2.32L7.33 17z',
    MdCampaign: 'M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39.4-.53.8-1.07 1.2-1.6-.99-.74-2.24-1.68-3.2-2.4-.4.54-.8 1.08-1.2 1.61zM20.4 5.6c-.4-.53-.8-1.07-1.2-1.6-.99.74-2.24 1.68-3.2 2.4.4.53.8 1.07 1.2 1.6.96-.72 2.21-1.65 3.2-2.4zM4 9c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v4h2v-4h1l5 3V6L8 9H4zm11.5 3c0-1.33-.58-2.53-1.5-3.35v6.69c.92-.81 1.5-2.01 1.5-3.34z',
    MdSecurity: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z',
    MdStorage: 'M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z',
    MdCloud: 'M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z',
    MdEmail: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
    MdChat: 'M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z',
    MdCalendarMonth: 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z',
    MdTaskAlt: 'M22 5.18L10.59 16.6l-4.24-4.24 1.41-1.41 2.83 2.83 10-10L22 5.18zM12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8c1.57 0 3.04.46 4.28 1.25l1.45-1.45C16.1 2.67 14.13 2 12 2 6.48 2 2 6.48 2 12s4.48 10 10 10c1.73 0 3.36-.44 4.78-1.22l-1.5-1.5c-1 .46-2.12.72-3.28.72z',
  }

  const path = icons[name]
  if (!path) {
    // fallback
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
      </svg>
    )
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d={path} />
    </svg>
  )
}

// 渲染工作区图标的辅助函数（用于卡片展示）
export function renderWorkspaceIcon(icon: string, className?: string) {
  if (icon.startsWith('http')) {
    return (
      <img
        src={icon}
        alt="workspace icon"
        className={cn('w-full h-full object-cover rounded-xl', className)}
      />
    )
  }
  if (icon.startsWith('icon:')) {
    return (
      <div className={cn('w-full h-full flex items-center justify-center bg-primary/10 text-primary rounded-xl', className)}>
        <SvgIconByName name={icon.replace('icon:', '')} size={24} />
      </div>
    )
  }
  // emoji
  return (
    <div className={cn('w-full h-full flex items-center justify-center text-2xl rounded-xl', className)}>
      {icon || '📁'}
    </div>
  )
}
