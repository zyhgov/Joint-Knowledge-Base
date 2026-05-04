/**
 * IP 定位服务（使用 ipinfo.io）
 *
 * 数据源：ipinfo.io（优先，使用用户提供的 API Token）
 * 回退：浏览器时区 / 语言等本地信息
 *
 * ipinfo.io 返回格式示例：
 * {
 *   ip: "111.181.143.28",
 *   city: "Wuhan",
 *   region: "Hubei",
 *   country: "CN",
 *   loc: "30.5801,114.2734",
 *   org: "AS9808 China Mobile",
 *   timezone: "Asia/Shanghai",
 *   privacy: { vpn:false, proxy:false, tor:false, hosting:false, ... }
 * }
 */

const IPINFO_TOKEN = 'b2a740212238f8'

export interface LocationInfo {
  ip: string
  country: string       // 中文，如"中国"
  countryCode: string   // ISO，如"CN"
  prov: string          // 省份，如"Hubei"
  city: string          // 城市，如"Wuhan"
  isp: string           // 运营商
  lat: number | null
  lon: number | null
  timezone: string
  isProxy: boolean
  proxyType: string     // vpn / proxy / tor / hosting / tz_mismatch
  proxyDesc: string
}

// ISO 国家代码 -> 中文名称（ipinfo.io 返回 code，需要转成中文显示）
const COUNTRY_CODE_TO_CN: Record<string, string> = {
  CN: '中国', HK: '香港', MO: '澳门', TW: '台湾',
  US: '美国', JP: '日本', KR: '韩国', KP: '朝鲜',
  GB: '英国', FR: '法国', DE: '德国', CA: '加拿大',
  AU: '澳大利亚', SG: '新加坡', MY: '马来西亚', TH: '泰国',
  VN: '越南', IN: '印度', RU: '俄罗斯', NL: '荷兰',
  IT: '意大利', ES: '西班牙', BR: '巴西', NZ: '新西兰',
  SE: '瑞典', NO: '挪威', FI: '芬兰', DK: '丹麦',
  CH: '瑞士', BE: '比利时', AT: '奥地利', IE: '爱尔兰',
  PT: '葡萄牙', PL: '波兰', UA: '乌克兰', TR: '土耳其',
  IL: '以色列', SA: '沙特阿拉伯', AE: '阿联酋', EG: '埃及',
  ZA: '南非', AR: '阿根廷', MX: '墨西哥', ID: '印度尼西亚',
  PH: '菲律宾',
}

function countryCodeToCn(code: string): string {
  return COUNTRY_CODE_TO_CN[code.toUpperCase()] || code
}

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

let cachedLocation: LocationInfo | null = null
let cachedPromise: Promise<LocationInfo> | null = null

/** ipinfo.io API 返回类型 */
interface IpinfoResponse {
  ip: string
  hostname?: string
  city?: string
  region?: string
  country?: string
  loc?: string       // "lat,lon"
  org?: string
  postal?: string
  timezone?: string
  bogon?: boolean    // 内网/保留 IP 时为 true
  privacy?: {
    vpn?: boolean
    proxy?: boolean
    tor?: boolean
    relay?: boolean
    hosting?: boolean
    service?: string
  }
  /** 错误时返回 */
  error?: {
    title: string
    message: string
  }
}

async function fetchFromIpinfo(): Promise<LocationInfo> {
  // 用普通参数拼接，保证兼容
  const url = `https://ipinfo.io/json?token=${IPINFO_TOKEN}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  const data: IpinfoResponse = await res.json()

  console.debug('[LocationService] ipinfo.io 返回:', data)

  // 错误处理
  if (data.error) {
    throw new Error(data.error.message || data.error.title || 'ipinfo 查询失败')
  }

  const ip = data.ip || ''
  const countryCode = (data.country || '').toUpperCase()
  const country = countryCodeToCn(countryCode)
  const prov = data.region || ''
  const city = data.city || ''

  // 解析 org：去掉 AS 号前缀，如 "AS9808 China Mobile" -> "China Mobile"
  let isp = data.org || ''
  if (isp) {
    const asMatch = isp.match(/^AS\d+\s+(.*)/)
    if (asMatch) isp = asMatch[1].trim()
  }

  // 解析 loc："lat,lon"
  let lat: number | null = null
  let lon: number | null = null
  if (data.loc) {
    const parts = data.loc.split(',')
    if (parts.length === 2) {
      const parsedLat = parseFloat(parts[0])
      const parsedLon = parseFloat(parts[1])
      if (!isNaN(parsedLat)) lat = parsedLat
      if (!isNaN(parsedLon)) lon = parsedLon
    }
  }

  const timezone = data.timezone || ''
  const isBogon = data.bogon === true

  // ---- VPN / 代理检测 ----
  let isProxy = false
  let proxyType = ''
  let proxyDesc = ''

  // 1. ipinfo.io privacy 字段（可能有，也可能没有，取决于套餐）
  const privacy = data.privacy
  if (privacy) {
    if (privacy.vpn) {
      isProxy = true
      proxyType = 'vpn'
      proxyDesc = privacy.service
        ? `检测到 VPN 连接（${privacy.service}）`
        : '检测到 VPN 连接'
    } else if (privacy.proxy) {
      isProxy = true
      proxyType = 'proxy'
      proxyDesc = '检测到代理连接'
    } else if (privacy.tor) {
      isProxy = true
      proxyType = 'tor'
      proxyDesc = '检测到 Tor 匿名网络'
    } else if (privacy.hosting) {
      isProxy = true
      proxyType = 'hosting'
      proxyDesc = '检测到数据中心 IP（可能为代理或云服务器）'
    } else if (privacy.relay) {
      isProxy = true
      proxyType = 'relay'
      proxyDesc = '检测到中继连接'
    }
  }

  // 2. bogon IP（内网地址）
  if (isBogon) {
    isProxy = false
    proxyType = ''
    proxyDesc = ''
  }

  // 3. 浏览器时区 vs IP 时区一致性检测（补充，即使 privacy 没数据也能检测）
  const browserTz = getBrowserTimezone()
  if (!isProxy && !isBogon && browserTz && timezone && browserTz !== timezone) {
    isProxy = true
    proxyType = 'tz_mismatch'
    proxyDesc = `时区不匹配（浏览器: ${browserTz}，IP归属: ${timezone}），可能使用了代理或 VPN`
  }

  return {
    ip,
    country,
    countryCode,
    prov,
    city,
    isp,
    lat,
    lon,
    timezone,
    isProxy,
    proxyType,
    proxyDesc,
  }
}

/**
 * 获取当前设备的位置信息
 */
export async function fetchLocationInfo(): Promise<LocationInfo> {
  if (cachedLocation) return cachedLocation
  if (cachedPromise) return cachedPromise

  cachedPromise = (async () => {
    try {
      cachedLocation = await fetchFromIpinfo()
    } catch (err) {
      console.warn('[LocationService] ipinfo.io 请求失败，使用浏览器信息兜底:', err)
      const browserTz = getBrowserTimezone()
      cachedLocation = {
        ip: '',
        country: '',
        countryCode: '',
        prov: '',
        city: '',
        isp: '',
        lat: null,
        lon: null,
        timezone: browserTz,
        isProxy: false,
        proxyType: '',
        proxyDesc: '',
      }
    }
    cachedPromise = null
    return cachedLocation
  })()

  return cachedPromise
}

/**
 * 强制刷新（绕过缓存，重新请求）
 */
export async function refreshLocationInfo(): Promise<LocationInfo> {
  clearLocationCache()
  return fetchLocationInfo()
}

export function clearLocationCache() {
  cachedLocation = null
  cachedPromise = null
}
