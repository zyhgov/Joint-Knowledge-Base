import React, { useState, useRef } from 'react'
import { r2Service } from '@/services/r2Service'
import { userService } from '@/services/userService'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { CameraIcon } from '@heroicons/react/24/outline'

interface AvatarUploadProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeConfig = {
  sm: 'w-12 h-12 text-sm',
  md: 'w-16 h-16 text-base',
  lg: 'w-20 h-20 text-xl',
  xl: 'w-24 h-24 text-2xl',
}

export default function AvatarUpload({ size = 'xl' }: AvatarUploadProps) {
  const { user, updateUser } = useAuthStore()
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validation = r2Service.validateFile(file, {
      maxSizeMB: 2,
      allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    })

    if (!validation.valid) {
      toast.error(validation.error || '文件验证失败')
      return
    }

    setUploading(true)
    setProgress(0)

    // 先用本地预览（立即响应）
    const localUrl = URL.createObjectURL(file)
    updateUser({ avatar_url: localUrl })

    try {
      const result = await r2Service.uploadFile(file, 'avatars', (p) => {
        setProgress(p)
      })

      // 用真实 URL 替换本地预览
      updateUser({ avatar_url: result.url })

      // 保存到数据库
      if (user) {
        await userService.updateUser(user.id, { avatar_url: result.url })
      }

      toast.success('头像已更新')
    } catch (error: any) {
      // 失败时恢复原头像
      updateUser({ avatar_url: user?.avatar_url || null })
      toast.error(error.message || '上传失败，请重试')
    } finally {
      setUploading(false)
      setProgress(0)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const avatarUrl = user?.avatar_url
  const displayName = user?.display_name
  const initial = displayName?.charAt(0)?.toUpperCase() || 'U'

  return (
    <div className="flex flex-col items-center gap-3">
      {/* 头像 */}
      <div
        className={cn(
          'relative rounded-full overflow-hidden cursor-pointer group flex-shrink-0',
          sizeConfig[size]
        )}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName || '头像'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold">
            {initial}
          </div>
        )}

        {/* Hover / 上传中遮罩 */}
        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center bg-black/50 transition-opacity',
            uploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
        >
          {uploading ? (
            <div className="text-center px-2">
              <div className="text-white text-xs font-bold">{progress}%</div>
              <div className="w-10 h-1 bg-white/30 rounded-full mt-1 mx-auto overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <CameraIcon className="h-5 w-5 text-white" />
          )}
        </div>
      </div>

      {/* 文字按钮 */}
      <div className="text-center">
        <button
          onClick={() => !uploading && fileInputRef.current?.click()}
          disabled={uploading}
          className="text-sm text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? `上传中 ${progress}%` : '更换头像'}
        </button>
        <p className="text-xs text-muted-foreground mt-0.5">
          JPG、PNG、WebP，最大 2MB
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  )
}