import React, { useState, useEffect, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts/core'
import { LineChart, PieChart, BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { systemAuditService, OnlineStats, LoginLog } from '@/services/systemAuditService'
import { useThemeStore } from '@/store/themeStore'
import { cn } from '@/lib/utils'
import {
  UserGroupIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  ComputerDesktopIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MapPinIcon,
  DevicePhoneMobileIcon,
  ServerIcon,
} from '@heroicons/react/24/outline'

echarts.use([
  LineChart,
  PieChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  CanvasRenderer,
])

const PAGE_SIZE_OPTIONS = [15, 30, 50, 100]

// ─── 统计卡片组件 ─────────────────
function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  color?: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 flex-1 min-w-[160px]">
      <div className={cn(
        'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
        color ? '' : 'bg-primary/10'
      )}
        style={color ? { backgroundColor: color + '20' } : undefined}
      >
        <Icon className={cn('h-5 w-5', color ? '' : 'text-primary')} style={color ? { color } : undefined} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// ─── 主组件 ─────────────────────
export default function SystemAudit() {
  const { actualTheme } = useThemeStore()
  const isDark = actualTheme === 'dark'

  const [stats, setStats] = useState<OnlineStats | null>(null)
  const [hourlyData, setHourlyData] = useState<Array<{ hour: string; count: number }>>([])
  const [deviceData, setDeviceData] = useState<Array<{ name: string; value: number }>>([])
  const [browserData, setBrowserData] = useState<Array<{ name: string; value: number }>>([])
  const [trendData, setTrendData] = useState<Array<{ date: string; count: number }>>([])

  // 登录日志列表
  const [logs, setLogs] = useState<LoginLog[]>([])
  const [logTotal, setLogTotal] = useState(0)
  const [logPage, setLogPage] = useState(1)
  const [logPageSize, setLogPageSize] = useState(15)
  const [logSearch, setLogSearch] = useState('')
  const [logLoading, setLogLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadAllData = useCallback(async () => {
    setLoading(true)
    try {
      const [s, h, d, b, t] = await Promise.all([
        systemAuditService.getOnlineStats(),
        systemAuditService.getHourlyLoginChart(),
        systemAuditService.getDeviceStats(),
        systemAuditService.getBrowserStats(),
        systemAuditService.getDailyLoginTrend(7),
      ])
      setStats(s)
      setHourlyData(h)
      setDeviceData(d)
      setBrowserData(b)
      setTrendData(t)
    } catch (err) {
      console.error('加载统计数据失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadLogs = useCallback(async () => {
    setLogLoading(true)
    try {
      const result = await systemAuditService.getLoginLogs(logPage, logPageSize, logSearch)
      setLogs(result.data)
      setLogTotal(result.total)
    } catch (err) {
      console.error('加载登录日志失败:', err)
    } finally {
      setLogLoading(false)
    }
  }, [logPage, logPageSize, logSearch])

  useEffect(() => { loadAllData() }, [loadAllData])
  useEffect(() => { loadLogs() }, [loadLogs])

  // ── ECharts 主题色 ──
  const textColor = isDark ? '#a1a1aa' : '#71717a'
  const axisColor = isDark ? '#27272a' : '#e4e4e7'
  const primaryColor = '#007aff'

  // ── 24小时登录分布（折线图） ──
  const hourlyOption = {
    tooltip: { trigger: 'axis' as const, backgroundColor: isDark ? '#1c1c1e' : '#fff', borderColor: axisColor },
    grid: { left: '3%', right: '4%', bottom: '8%', top: '8%', containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: hourlyData.map(d => d.hour),
      axisLabel: { color: textColor, fontSize: 10, rotate: 45 },
      axisLine: { lineStyle: { color: axisColor } },
    },
    yAxis: {
      type: 'value' as const,
      minInterval: 1,
      axisLabel: { color: textColor, fontSize: 10 },
      splitLine: { lineStyle: { color: axisColor } },
    },
    series: [{
      type: 'line' as const,
      data: hourlyData.map(d => d.count),
      smooth: true,
      lineStyle: { width: 2, color: primaryColor },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: primaryColor + '50' },
          { offset: 1, color: primaryColor + '05' },
        ]),
      },
      symbol: 'circle' as const,
      symbolSize: 4,
    }],
  }

  // ── 设备类型分布（饼图） ──
  const deviceColors = ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#8e8e93']
  const deviceOption = {
    tooltip: { trigger: 'item' as const, backgroundColor: isDark ? '#1c1c1e' : '#fff', borderColor: axisColor },
    legend: {
      orient: 'vertical' as const,
      right: '5%',
      top: 'center',
      textStyle: { color: textColor, fontSize: 11 },
      itemWidth: 10,
      itemHeight: 10,
    },
    series: [{
      type: 'pie' as const,
      radius: ['45%', '70%'],
      center: ['35%', '50%'],
      avoidLabelOverlap: true,
      label: { show: false },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' },
      },
      data: deviceData.map((d, i) => ({ ...d, itemStyle: { color: deviceColors[i % deviceColors.length] } })),
    }],
  }

  // ── 浏览器分布（饼图） ──
  const browserColors = ['#34c759', '#007aff', '#ff9500', '#af52de', '#ff3b30', '#8e8e93']
  const browserOption = {
    tooltip: { trigger: 'item' as const, backgroundColor: isDark ? '#1c1c1e' : '#fff', borderColor: axisColor },
    legend: {
      orient: 'vertical' as const,
      right: '5%',
      top: 'center',
      textStyle: { color: textColor, fontSize: 11 },
      itemWidth: 10,
      itemHeight: 10,
    },
    series: [{
      type: 'pie' as const,
      radius: ['45%', '70%'],
      center: ['35%', '50%'],
      avoidLabelOverlap: true,
      label: { show: false },
      data: browserData.map((d, i) => ({ ...d, itemStyle: { color: browserColors[i % browserColors.length] } })),
    }],
  }

  // ── 近7天登录趋势（柱状图） ──
  const trendOption = {
    tooltip: { trigger: 'axis' as const, backgroundColor: isDark ? '#1c1c1e' : '#fff', borderColor: axisColor },
    grid: { left: '3%', right: '4%', bottom: '6%', top: '8%', containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: trendData.map(d => d.date),
      axisLabel: { color: textColor, fontSize: 10 },
      axisLine: { lineStyle: { color: axisColor } },
    },
    yAxis: {
      type: 'value' as const,
      minInterval: 1,
      axisLabel: { color: textColor, fontSize: 10 },
      splitLine: { lineStyle: { color: axisColor } },
    },
    series: [{
      type: 'bar' as const,
      data: trendData.map(d => d.count),
      barWidth: '50%',
      itemStyle: {
        borderRadius: [4, 4, 0, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: primaryColor },
          { offset: 1, color: primaryColor + '40' },
        ]),
      },
    }],
  }

  // ── 渲染 ──
  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center gap-3">
        <ServerIcon className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-foreground">系统日志审查</h1>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          icon={UserGroupIcon}
          label="当前在线用户"
          value={loading ? '...' : (stats?.currentOnline ?? 0)}
          sub="实时在线人数"
          color="#007aff"
        />
        <StatCard
          icon={ClockIcon}
          label="30分钟内活跃"
          value={loading ? '...' : (stats?.online30min ?? 0)}
          sub="近30分钟有操作"
          color="#34c759"
        />
        <StatCard
          icon={ArrowTrendingUpIcon}
          label="今日登录次数"
          value={loading ? '...' : (stats?.todayLogins ?? 0)}
          sub="含重复登录"
          color="#ff9500"
        />
        <StatCard
          icon={GlobeAltIcon}
          label="今日登录用户"
          value={loading ? '...' : (stats?.uniqueUsersToday ?? 0)}
          sub="去重独立用户"
          color="#af52de"
        />
        <StatCard
          icon={ComputerDesktopIcon}
          label="平台总用户"
          value={loading ? '...' : (stats?.totalUsers ?? 0)}
          sub="全部注册用户"
          color="#8e8e93"
        />
      </div>

      {/* ECharts 图表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 24小时登录分布 */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">24小时登录分布</h3>
          <div className="h-[250px]">
            <ReactECharts option={hourlyOption} style={{ height: '100%' }} echarts={echarts} />
          </div>
        </div>
        {/* 设备类型分布 */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">设备类型分布</h3>
          <div className="h-[250px]">
            <ReactECharts option={deviceOption} style={{ height: '100%' }} echarts={echarts} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 近7天登录趋势 */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">近7天登录趋势</h3>
          <div className="h-[250px]">
            <ReactECharts option={trendOption} style={{ height: '100%' }} echarts={echarts} />
          </div>
        </div>
        {/* 浏览器分布 */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">浏览器分布</h3>
          <div className="h-[250px]">
            <ReactECharts option={browserOption} style={{ height: '100%' }} echarts={echarts} />
          </div>
        </div>
      </div>

      {/* 登录日志列表 */}
      <div className="bg-card border border-border rounded-xl">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground">登录日志</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={logSearch}
                onChange={e => { setLogSearch(e.target.value); setLogPage(1) }}
                placeholder="搜索用户/IP/设备..."
                className="h-8 w-48 pl-8 pr-3 rounded-lg bg-background border border-input text-xs outline-none focus:ring-2 focus:ring-ring/20 transition-all"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">时间</th>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">用户</th>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">IP 地址</th>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">设备</th>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">浏览器</th>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">位置</th>
              </tr>
            </thead>
            <tbody>
              {logLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground">加载中...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground">暂无登录记录</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-2.5 text-foreground whitespace-nowrap">
                      {new Date(log.login_time).toLocaleString('zh-CN', {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-foreground">{log.display_name || '未知'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground font-mono">{log.ip_address || '-'}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {log.device_type === '手机' ? <DevicePhoneMobileIcon className="h-3 w-3" /> : <ComputerDesktopIcon className="h-3 w-3" />}
                        {log.device_type || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{log.browser || '-'}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        {log.location && <MapPinIcon className="h-3 w-3" />}
                        {log.location || '-'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        <div className="px-4 py-3 border-t border-border flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>共 {logTotal} 条</span>
            <select
              value={logPageSize}
              onChange={e => { setLogPageSize(Number(e.target.value)); setLogPage(1) }}
              className="bg-background border border-input rounded px-2 py-1 text-xs outline-none"
            >
              {PAGE_SIZE_OPTIONS.map(size => (
                <option key={size} value={size}>每页 {size} 条</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setLogPage(p => Math.max(1, p - 1))}
              disabled={logPage <= 1}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-30 text-muted-foreground"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span className="text-xs text-muted-foreground px-2">
              {logPage} / {Math.max(1, Math.ceil(logTotal / logPageSize))}
            </span>
            <button
              onClick={() => setLogPage(p => Math.min(Math.ceil(logTotal / logPageSize), p + 1))}
              disabled={logPage >= Math.ceil(logTotal / logPageSize)}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-30 text-muted-foreground"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
