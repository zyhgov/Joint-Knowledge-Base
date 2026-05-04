/**
 * 图片压缩与格式转换工具
 * 自动压缩图片并转换为 AVIF 格式（浏览器支持时），不支持则回退 WebP
 */

const MAX_WIDTH = 1920
const MAX_HEIGHT = 1920
const QUALITY = 0.8

export interface CompressResult {
  blob: Blob
  url: string
  width: number
  height: number
  format: 'avif' | 'webp' | 'jpeg'
  size: number
}

/**
 * 压缩图片并转换为最佳格式
 * 优先级：AVIF > WebP > JPEG
 */
export async function compressImage(file: File): Promise<CompressResult> {
  // 读取文件为 ImageData
  const img = await loadImage(file)
  const { width, height } = getScaledDimensions(img.width, img.height)

  // 创建 canvas 绘制缩放的图片
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, width, height)

  // 检测支持的格式
  const format = await detectBestFormat()

  // 转为 blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error('图片压缩失败'))
      },
      `image/${format}`,
      QUALITY
    )
  })

  return {
    blob,
    url: URL.createObjectURL(blob),
    width,
    height,
    format,
    size: blob.size,
  }
}

/**
 * 生成压缩后的 File 对象（适合上传到 R2）
 */
export async function compressToFile(
  file: File,
  fileName?: string
): Promise<File> {
  const result = await compressImage(file)
  const ext = result.format === 'jpeg' ? 'jpg' : result.format
  const name = fileName || file.name.replace(/\.[^.]+$/, `.${ext}`)
  return new File([result.blob], name, {
    type: `image/${result.format}`,
  })
}

// 加载图片
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })
}

// 计算缩放后的尺寸（保持宽高比）
function getScaledDimensions(
  width: number,
  height: number
): { width: number; height: number } {
  if (width <= MAX_WIDTH && height <= MAX_HEIGHT) {
    return { width, height }
  }
  const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height)
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  }
}

// 检测浏览器支持的最佳图片格式
async function detectBestFormat(): Promise<'avif' | 'webp' | 'jpeg'> {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1

  // 测试 AVIF
  const avifBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/avif', 0.1)
  })
  if (avifBlob && avifBlob.size > 0) return 'avif'

  // 测试 WebP
  const webpBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/webp', 0.1)
  })
  if (webpBlob && webpBlob.size > 0) return 'webp'

  return 'jpeg'
}

/**
 * 获取图片可公开访问的 URL（由后端 R2 托管）
 * 支持将 R2 key 或完整 URL 转为公开访问链接
 */
export function getPublicImageUrl(urlOrKey: string): string {
  if (urlOrKey.startsWith('http://') || urlOrKey.startsWith('https://')) {
    return urlOrKey
  }
  const domain = import.meta.env.VITE_R2_PUBLIC_DOMAIN || ''
  return `${domain}/${urlOrKey}`
}
