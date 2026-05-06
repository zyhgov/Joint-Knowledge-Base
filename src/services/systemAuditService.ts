import { supabase } from './supabase'

export interface LoginLog {
  id: string
  user_id: string
  display_name: string | null
  ip_address: string | null
  user_agent: string | null
  device_type: string | null
  browser: string | null
  location: string | null
  login_time: string
  created_at: string
}

export interface OnlineStats {
  currentOnline: number
  online30min: number
  todayLogins: number
  uniqueUsersToday: number
  totalUsers: number
}

export interface HourlyLoginData {
  hour: string
  count: number
}

export interface DailyLoginTrend {
  date: string
  count: number
}

export interface DeviceStats {
  name: string
  value: number
}

// 解析 User-Agent 获取设备信息
function parseUserAgent(ua: string): { device_type: string; browser: string } {
  const uaLower = ua.toLowerCase()

  let device_type = '桌面端'
  if (/mobile|android|iphone|ipad|ipod/i.test(uaLower)) {
    device_type = /ipad|tablet/i.test(uaLower) ? '平板' : '手机'
  }

  let browser = '其他'
  if (uaLower.includes('chrome') && !uaLower.includes('edg')) browser = 'Chrome'
  else if (uaLower.includes('firefox')) browser = 'Firefox'
  else if (uaLower.includes('safari') && !uaLower.includes('chrome')) browser = 'Safari'
  else if (uaLower.includes('edg')) browser = 'Edge'
  else if (uaLower.includes('opera') || uaLower.includes('opr')) browser = 'Opera'

  return { device_type, browser }
}

export const systemAuditService = {
  // 记录登录日志
  logLogin: async (userId: string, displayName: string | null, ip: string, userAgent: string): Promise<void> => {
    const { device_type, browser } = parseUserAgent(userAgent)
    const { error } = await supabase
      .from('login_logs')
      .insert({
        user_id: userId,
        display_name: displayName,
        ip_address: ip,
        user_agent: userAgent,
        device_type,
        browser,
        login_time: new Date().toISOString(),
      })
    if (error) {
      console.warn('[SystemAudit] logLogin failed:', error.message)
    }
  },

  // 获取登录日志列表（分页）
  getLoginLogs: async (
    page: number,
    pageSize: number,
    search?: string
  ): Promise<{ data: LoginLog[]; total: number }> => {
    let query = supabase
      .from('login_logs')
      .select('*', { count: 'exact' })
      .order('login_time', { ascending: false })

    if (search?.trim()) {
      const term = `%${search.trim()}%`
      query = query.or(`display_name.ilike.${term},ip_address.ilike.${term},location.ilike.${term},device_type.ilike.${term},browser.ilike.${term}`)
    }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, error, count } = await query.range(from, to)

    if (error) throw error
    return { data: (data as LoginLog[]) || [], total: count || 0 }
  },

  // 获取在线统计数据
  getOnlineStats: async (): Promise<OnlineStats> => {
    const now = new Date()
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

    try {
      // 当前在线
      const { count: currentOnline } = await supabase
        .from('chat_presence')
        .select('*', { count: 'exact', head: true })
        .eq('is_online', true)

      // 30分钟内有过活跃的
      const { count: online30min } = await supabase
        .from('chat_presence')
        .select('*', { count: 'exact', head: true })
        .gt('last_seen_at', thirtyMinAgo)

      // 今日登录次数
      const { count: todayLogins } = await supabase
        .from('login_logs')
        .select('*', { count: 'exact', head: true })
        .gte('login_time', todayStart)

      // 今日登录独立用户
      const { count: uniqueUsersToday } = await supabase
        .from('login_logs')
        .select('user_id', { count: 'exact', head: true })
        .gte('login_time', todayStart)
        .limit(10000)

      // 总用户数
      const { count: totalUsers } = await supabase
        .from('jkb_users')
        .select('*', { count: 'exact', head: true })

      return {
        currentOnline: currentOnline || 0,
        online30min: online30min || 0,
        todayLogins: todayLogins || 0,
        uniqueUsersToday: (uniqueUsersToday as any) || 0, // supabase count with head=true might not return proper count
        totalUsers: totalUsers || 0,
      }
    } catch {
      return { currentOnline: 0, online30min: 0, todayLogins: 0, uniqueUsersToday: 0, totalUsers: 0 }
    }
  },

  // 获取 24 小时登录分布
  getHourlyLoginChart: async (): Promise<HourlyLoginData[]> => {
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    const { data } = await supabase
      .from('login_logs')
      .select('login_time')
      .gte('login_time', oneDayAgo)
      .order('login_time', { ascending: true })

    // 初始化24小时数据
    const hourly: Record<string, number> = {}
    for (let i = 0; i < 24; i++) {
      const h = `${now.getHours() - i < 0 ? now.getHours() - i + 24 : now.getHours() - i}`
      hourly[h] = 0
    }

    if (data) {
      data.forEach((log: any) => {
        const d = new Date(log.login_time)
        const h = String(d.getHours())
        if (hourly[h] !== undefined) hourly[h]++
      })
    }

    // 按时间顺序排序
    const baseHour = now.getHours()
    const result: HourlyLoginData[] = []
    for (let i = 23; i >= 0; i--) {
      const h = (baseHour - i + 24) % 24
      result.push({ hour: `${h}:00`, count: hourly[String(h)] || 0 })
    }
    return result
  },

  // 获取设备类型分布
  getDeviceStats: async (): Promise<DeviceStats[]> => {
    const { data } = await supabase
      .from('login_logs')
      .select('device_type')
      .limit(5000)

    const counts: Record<string, number> = {}
    if (data) {
      data.forEach((log: any) => {
        const type = log.device_type || '未知'
        counts[type] = (counts[type] || 0) + 1
      })
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  },

  // 获取近7天登录趋势
  getDailyLoginTrend: async (days = 7): Promise<DailyLoginTrend[]> => {
    const now = new Date()
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

    const { data } = await supabase
      .from('login_logs')
      .select('login_time')
      .gte('login_time', start)
      .order('login_time', { ascending: true })

    // 初始化每天数据
    const daily: Record<string, number> = {}
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const key = d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
      daily[key] = 0
    }

    if (data) {
      data.forEach((log: any) => {
        const d = new Date(log.login_time)
        const key = d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
        if (daily[key] !== undefined) daily[key]++
      })
    }

    return Object.entries(daily).map(([date, count]) => ({ date, count }))
  },

  // 获取浏览器分布
  getBrowserStats: async (): Promise<DeviceStats[]> => {
    const { data } = await supabase
      .from('login_logs')
      .select('browser')
      .limit(5000)

    const counts: Record<string, number> = {}
    if (data) {
      data.forEach((log: any) => {
        const b = log.browser || '其他'
        counts[b] = (counts[b] || 0) + 1
      })
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  },
}
