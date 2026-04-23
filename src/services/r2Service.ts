import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

// 初始化 R2 客户端
const createR2Client = () => {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${import.meta.env.VITE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: import.meta.env.VITE_R2_ACCESS_KEY_ID,
      secretAccessKey: import.meta.env.VITE_R2_SECRET_ACCESS_KEY,
    },
  })
}

// 文件类型分类
const getFileCategory = (file: File): 'image' | 'video' | 'audio' | 'document' | 'file' => {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (
    file.type.includes('pdf') ||
    file.type.includes('doc') ||
    file.type.includes('sheet') ||
    file.type.includes('presentation')
  )
    return 'document'
  return 'file'
}

// 生成唯一文件名
const generateFileName = (file: File): string => {
  const timestamp = Date.now()
  const randomStr = Math.random().toString(36).substring(2, 10)
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  return `${timestamp}_${randomStr}.${ext}`
}

export type UploadFolder = 'avatars' | 'covers' | 'documents' | 'files' | 'images' | 'videos' | 'audios' | 'icons'

export interface UploadResult {
  url: string
  key: string
  fileName: string
  fileSize: number
  fileType: string
  fileExt: string
  category: 'image' | 'video' | 'audio' | 'document' | 'file'
}

export const r2Service = {
  // 上传单个文件
  uploadFile: async (
    file: File,
    folder: UploadFolder = 'files',
    onProgress?: (progress: number) => void
  ): Promise<UploadResult> => {
    const client = createR2Client()
    const fileName = generateFileName(file)
    const key = `${folder}/${fileName}`
    const category = getFileCategory(file)

    try {
      // 读取文件内容
      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      // 模拟进度（S3 SDK 不支持上传进度，但我们可以模拟）
      onProgress?.(10)

      // 上传到 R2
      await client.send(
        new PutObjectCommand({
          Bucket: import.meta.env.VITE_R2_BUCKET_NAME,
          Key: key,
          Body: uint8Array,
          ContentType: file.type,
          ContentDisposition: `inline; filename="${encodeURIComponent(file.name)}"`,
        })
      )

      onProgress?.(100)

      const url = `${import.meta.env.VITE_R2_PUBLIC_DOMAIN}/${key}`
      const ext = file.name.split('.').pop()?.toLowerCase() || ''

      return {
        url,
        key,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileExt: ext,
        category,
      }
    } catch (error: any) {
      console.error('R2 上传失败:', error)
      throw new Error(`上传失败: ${error.message}`)
    }
  },

  // 删除文件
  deleteFile: async (key: string): Promise<void> => {
    const client = createR2Client()

    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: import.meta.env.VITE_R2_BUCKET_NAME,
          Key: key,
        })
      )
    } catch (error: any) {
      console.error('R2 删除失败:', error)
      throw new Error(`删除失败: ${error.message}`)
    }
  },

  // 获取文件公开 URL
  getFileUrl: (key: string): string => {
    return `${import.meta.env.VITE_R2_PUBLIC_DOMAIN}/${key}`
  },

  // 验证文件
  validateFile: (
    file: File,
    options?: {
      maxSizeMB?: number
      allowedTypes?: string[]
    }
  ): { valid: boolean; error?: string } => {
    const maxSizeMB = options?.maxSizeMB || 500
    const allowedTypes = options?.allowedTypes

    // 检查文件大小
    if (file.size > maxSizeMB * 1024 * 1024) {
      return {
        valid: false,
        error: `文件大小不能超过 ${maxSizeMB}MB`,
      }
    }

    // 检查文件类型
    if (allowedTypes && allowedTypes.length > 0) {
      const fileExt = file.name.split('.').pop()?.toLowerCase() || ''
      const mimeType = file.type.toLowerCase()
      const isAllowed = allowedTypes.some(
        (type) => mimeType.includes(type) || fileExt === type
      )
      if (!isAllowed) {
        return {
          valid: false,
          error: `不支持的文件类型，允许的类型: ${allowedTypes.join(', ')}`,
        }
      }
    }

    return { valid: true }
  },
}