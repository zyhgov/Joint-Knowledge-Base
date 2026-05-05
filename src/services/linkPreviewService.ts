// 链接预览服务 - 获取网页 Open Graph 元数据

export interface LinkPreviewData {
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
  favicon: string | null
  url: string
}

// 检测字符串是否为有效的 URL
const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i

export function isValidUrl(text: string): boolean {
  return URL_REGEX.test(text.trim())
}

// 从文本中提取第一个 URL
export function extractFirstUrl(text: string): string | null {
  const urlRegex = /https?:\/\/[^\s]+/g
  const match = text.trim().match(urlRegex)
  return match ? match[0] : null
}

// 从文本中提取所有 URL（去重）
export function extractAllUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+/g
  const matches = text.match(urlRegex)
  if (!matches) return []
  // 去重保留顺序
  return [...new Set(matches)]
}

// 服务端 API 地址（从环境变量推导）
function getServerApiUrl(): string {
  const wsUrl = import.meta.env.VITE_COLLAB_SERVER_URL || 'ws://localhost:8787'
  return wsUrl.replace(/^ws(s?):\/\//, 'http$1://')
}

// 从 HTML 中提取 OG 元数据（客户端解析）
function parseHtmlOGData(html: string, pageUrl: string): LinkPreviewData {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const getMeta = (property: string): string | null => {
    const el = doc.querySelector(`meta[property="${property}"], meta[name="${property}"]`)
    return el ? el.getAttribute('content') : null
  }

  // 标题
  let title = getMeta('og:title') || getMeta('twitter:title')
  if (!title) {
    title = doc.querySelector('title')?.textContent?.trim() || null
  }

  // 描述
  let description = getMeta('og:description') || getMeta('twitter:description') || getMeta('description')

  // 图片
  let image = getMeta('og:image') || getMeta('twitter:image')
  if (image && image.startsWith('/')) {
    try { image = new URL(image, pageUrl).href } catch {}
  }

  // 站点名
  const siteName = getMeta('og:site_name')

  // favicon
  let favicon: string | null = null
  const linkEl = doc.querySelector('link[rel="icon"], link[rel="shortcut icon"]')
  if (linkEl) {
    const href = linkEl.getAttribute('href')
    if (href) {
      favicon = href.startsWith('//') ? 'https:' + href : href.startsWith('/') ? new URL(href, pageUrl).href : href
    }
  }
  if (!favicon) {
    try { favicon = new URL('/favicon.ico', pageUrl).href } catch {}
  }

  return { title, description, image, siteName, favicon, url: pageUrl }
}

// 通过 CORS 代理获取 HTML
async function fetchViaCorsProxy(url: string): Promise<string | null> {
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ]

  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) })
      if (res.ok) {
        const text = await res.text()
        if (text && text.length > 100) return text
      }
    } catch {
      continue
    }
  }
  return null
}

// 获取链接预览数据（多策略回退）
export async function fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
  // 策略1：尝试 collab-server API
  try {
    const apiUrl = `${getServerApiUrl()}/api/link-preview?url=${encodeURIComponent(url)}`
    const response = await fetch(apiUrl, { signal: AbortSignal.timeout(4000) })
    if (response.ok) {
      const data = await response.json()
      if (!data.error) {
        return {
          title: data.title || null,
          description: data.description || null,
          image: data.image || null,
          siteName: data.siteName || null,
          favicon: data.favicon || null,
          url: data.url || url,
        }
      }
    }
  } catch {
    // 服务端不可用，继续尝试其他方案
  }

  // 策略2：通过 CORS 代理获取 HTML 后在客户端解析
  const html = await fetchViaCorsProxy(url)
  if (html) {
    try {
      return parseHtmlOGData(html, url)
    } catch {
      // 解析失败
    }
  }

  return null
}
