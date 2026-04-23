import React from 'react'
import { cn } from '@/lib/utils'
import {
  DocumentIcon,
  PhotoIcon,
  VideoCameraIcon,
  MusicalNoteIcon,
  PaperClipIcon,
} from '@heroicons/react/24/outline'

// 根据文件扩展名获取图标配置
export function getFileIconConfig(ext: string | null): {
  icon: React.ReactNode
  bgColor: string
  label: string
} {
  if (!ext) {
    return {
      icon: <PaperClipIcon className="h-5 w-5" />,
      bgColor: 'bg-gray-100 dark:bg-gray-800 text-gray-500',
      label: '未知',
    }
  }

  const e = ext.toLowerCase().replace('.', '')

  // Word 文档
  if (['doc', 'docx'].includes(e)) {
    return {
      icon: <WordIcon />,
      bgColor: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600',
      label: 'Word',
    }
  }

  // Excel 表格
  if (['xls', 'xlsx', 'csv'].includes(e)) {
    return {
      icon: <ExcelIcon />,
      bgColor: 'bg-green-50 dark:bg-green-900/20 text-green-600',
      label: 'Excel',
    }
  }

  // PPT 演示
  if (['ppt', 'pptx'].includes(e)) {
    return {
      icon: <PptIcon />,
      bgColor: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600',
      label: 'PPT',
    }
  }

  // PDF
  if (e === 'pdf') {
    return {
      icon: <PdfIcon />,
      bgColor: 'bg-red-50 dark:bg-red-900/20 text-red-600',
      label: 'PDF',
    }
  }

  // 文本
  if (['txt', 'md', 'markdown', 'rtf'].includes(e)) {
    return {
      icon: <TxtIcon />,
      bgColor: 'bg-gray-50 dark:bg-gray-800 text-gray-600',
      label: '文本',
    }
  }

  // 压缩包
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e)) {
    return {
      icon: <ZipIcon />,
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600',
      label: '压缩包',
    }
  }

  // 代码
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'html', 'css', 'scss', 'less', 'json', 'xml', 'yaml', 'yml', 'sql', 'sh'].includes(e)) {
    return {
      icon: <CodeIcon />,
      bgColor: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600',
      label: '代码',
    }
  }

  // 图片
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'].includes(e)) {
    return {
      icon: <PhotoIcon className="h-5 w-5" />,
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600',
      label: '图片',
    }
  }

  // 视频
  if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm'].includes(e)) {
    return {
      icon: <VideoCameraIcon className="h-5 w-5" />,
      bgColor: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600',
      label: '视频',
    }
  }

  // 音频
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(e)) {
    return {
      icon: <MusicalNoteIcon className="h-5 w-5" />,
      bgColor: 'bg-pink-50 dark:bg-pink-900/20 text-pink-600',
      label: '音频',
    }
  }

  return {
    icon: <PaperClipIcon className="h-5 w-5" />,
    bgColor: 'bg-gray-50 dark:bg-gray-800 text-gray-500',
    label: '文件',
  }
}

// 判断是否为图片文件
export function isImageFile(ext: string | null): boolean {
  if (!ext) return false
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'].includes(
    ext.toLowerCase().replace('.', '')
  )
}

// 判断是否可内嵌预览
export function isPreviewableInIframe(ext: string | null): boolean {
  if (!ext) return false
  const e = ext.toLowerCase().replace('.', '')
  return ['pdf', 'txt', 'md', 'html', 'svg'].includes(e)
}

// 判断是否可通过 Office Online 预览
export function isOfficePreviewable(ext: string | null): boolean {
  if (!ext) return false
  const e = ext.toLowerCase().replace('.', '')
  return ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(e)
}

// ---- SVG 自定义图标 ----

function WordIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M6 2h12c1.1 0 2 .9 2 2v16c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2zm1 4v1h4v-1H7zm0 3v1h10v-1H7zm0 3v1h10v-1H7zm0 3v1h7v-1H7z" opacity="0.3"/>
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
      <text x="10" y="16" fontSize="6" fontWeight="bold" fill="currentColor">W</text>
    </svg>
  )
}

function ExcelIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M6 2h12c1.1 0 2 .9 2 2v16c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2zm1 4v1h4v-1H7zm0 3v1h10v-1H7zm0 3v1h10v-1H7zm0 3v1h7v-1H7z" opacity="0.3"/>
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
      <text x="10" y="16" fontSize="6" fontWeight="bold" fill="currentColor">X</text>
    </svg>
  )
}

function PptIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M6 2h12c1.1 0 2 .9 2 2v16c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2zm1 4v1h4v-1H7zm0 3v1h10v-1H7zm0 3v1h10v-1H7zm0 3v1h7v-1H7z" opacity="0.3"/>
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
      <text x="10" y="16" fontSize="6" fontWeight="bold" fill="currentColor">P</text>
    </svg>
  )
}

function PdfIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
      <text x="7" y="16" fontSize="5" fontWeight="bold" fill="currentColor">PDF</text>
    </svg>
  )
}

function TxtIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15h8v1H8v-1zm0-2h8v1H8v-1zm0-2h5v1H8v-1z"/>
    </svg>
  )
}

function ZipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-8 12H8v-2h4v2zm0-4H8v-2h4v2zm0-4H8V8h4v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V8h2v2z"/>
    </svg>
  )
}

function CodeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
    </svg>
  )
}

// 文件图标组件（用于文件列表）
export function FileIcon({ ext, size = 'md' }: { ext: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const config = getFileIconConfig(ext)
  const sizeClass = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-12 h-12' : 'w-10 h-10'

  return (
    <div className={cn('rounded-lg flex items-center justify-center flex-shrink-0', sizeClass, config.bgColor)}>
      {config.icon}
    </div>
  )
}

// 文件缩略图组件（用于文件列表中的图片）
export function FileThumbnail({ file, className }: { file: { public_url: string; thumbnail_url: string | null; file_ext: string | null; category: string }; className?: string }) {
  const ext = file.file_ext

  // 图片类型：显示缩略图
  if (isImageFile(ext)) {
    return (
      <div className={cn('rounded-lg overflow-hidden flex-shrink-0 bg-muted', className)}>
        <img
          src={file.thumbnail_url || file.public_url}
          alt="thumbnail"
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => {
            const target = e.target as HTMLImageElement
            target.style.display = 'none'
            if (target.parentElement) {
              target.parentElement.innerHTML = ''
              target.parentElement.classList.add('flex', 'items-center', 'justify-center')
              const iconConfig = getFileIconConfig(ext)
              target.parentElement.className = cn('rounded-lg flex items-center justify-center flex-shrink-0', className || '', iconConfig.bgColor)
            }
          }}
        />
      </div>
    )
  }

  // 其他类型：显示文件图标
  return <FileIcon ext={ext} size={className?.includes('w-12') ? 'lg' : 'md'} />
}
