import React, { useState, useEffect, useMemo } from 'react'
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
import { transferFanStatsService } from '@/services/transferFanStatsService'
import { userService } from '@/services/userService'
import { departmentService } from '@/services/departmentService'
import { TransferFanOrder, TRANSFER_FAN_STATUS_LABELS, TRANSFER_FAN_STATUS_COLORS, UserWithDepartments, DepartmentTreeNode, UrgentLog } from '@/types/database'
import { useThemeStore } from '@/store/themeStore'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DocumentTextIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowTrendingUpIcon,
  ChartPieIcon,
  TrophyIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  BoltIcon,
} from '@heroicons/react/24/outline'
import { StatCardSkeleton, ChartSkeleton } from '@/components/common/Skeleton'

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

const WEEK_DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export default function TransferFanStats() {
  const { actualTheme } = useThemeStore()
  const [orders, setOrders] = useState<TransferFanOrder[]>([])
  const [allUsers, setAllUsers] = useState<UserWithDepartments[]>([])
  const [urgentLogs, setUrgentLogs] = useState<UrgentLog[]>([])
  const [loading, setLoading] = useState(true)

  // 时间段筛选
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [tempFrom, setTempFrom] = useState('')
  const [tempTo, setTempTo] = useState('')

  // 周/月趋势切换
  const [trendMode, setTrendMode] = useState<'weekly' | 'monthly'>('weekly')

  useEffect(() => {
    const loadData = async () => {
      try {
        const [data, users, urgent] = await Promise.all([
          transferFanStatsService.getAllOrders(),
          userService.getAllUsers(),
          transferFanStatsService.getUrgentLogs(),
        ])
        setOrders(data)
        setAllUsers(users)
        setUrgentLogs(urgent)

        // 默认显示最近3个月数据
        const now = new Date()
        const threeMonthsAgo = new Date(now)
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
        const fromStr = threeMonthsAgo.toISOString().slice(0, 10)
        const toStr = now.toISOString().slice(0, 10)
        setDateFrom(fromStr)
        setDateTo(toStr)
        setTempFrom(fromStr)
        setTempTo(toStr)
      } catch (error: any) {
        console.error('Failed to load transfer fan stats:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const isDark = actualTheme === 'dark'
  const textColor = isDark ? '#a1a1aa' : '#71717a'
  const bgColor = isDark ? '#18181b' : '#ffffff'
  const borderColor = isDark ? '#27272a' : '#e4e4e7'

  // 应用时间段筛选
  const applyFilter = () => {
    setDateFrom(tempFrom)
    setDateTo(tempTo)
  }

  // 按时间段过滤
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const d = new Date(o.created_at)
      if (dateFrom && d < new Date(dateFrom)) return false
      if (dateTo && d > new Date(dateTo + 'T23:59:59.999Z')) return false
      return true
    })
  }, [orders, dateFrom, dateTo])

  // 统计概览
  const stats = useMemo(() => {
    const total = filteredOrders.length
    const submitted = filteredOrders.filter(o => o.status === 'submitted').length
    const pending = filteredOrders.filter(o => o.status === 'pending').length
    const processed = filteredOrders.filter(o => o.status === 'processed').length
    const cancelled = filteredOrders.filter(o => o.status === 'cancelled').length
    const rejected = filteredOrders.filter(o => o.status === 'rejected').length
    return { total, submitted, pending, processed, cancelled, rejected }
  }, [filteredOrders])

  // ─── 状态分布饼图 ─────────────────────────────
  const statusPieOption = useMemo(() => {
    const statusOrder = ['submitted', 'pending', 'processed', 'cancelled', 'rejected']
    const colors: Record<string, string> = {
      submitted: '#3b82f6', pending: '#f59e0b', processed: '#10b981',
      cancelled: '#6b7280', rejected: '#ef4444',
    }
    const data = statusOrder
      .filter(s => stats[s as keyof typeof stats] > 0)
      .map(s => ({
        name: TRANSFER_FAN_STATUS_LABELS[s] || s,
        value: stats[s as keyof typeof stats] as number,
        itemStyle: { color: colors[s] },
      }))
    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: isDark ? '#27272a' : '#fff',
        borderColor,
        textStyle: { color: textColor },
        formatter: (params: any) => `${params.name}<br/>工单数: ${params.value} 个 (${params.percent}%)`,
      },
      legend: {
        orient: 'vertical' as const, right: '5%', top: 'center',
        textStyle: { color: textColor, fontSize: 12 },
      },
      series: [{
        name: '工单状态', type: 'pie', radius: ['40%', '70%'], center: ['35%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: bgColor, borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
        data,
      }],
    }
  }, [stats, isDark, bgColor, borderColor, textColor])

  // ─── 趋势图（支持周/月切换） ─────────────────────
  const trendOption = useMemo(() => {
    if (trendMode === 'weekly') {
      // 本周趋势：过去7天按日统计
      const now = new Date(dateTo || new Date().toISOString().slice(0, 10))
      const dayMap = new Map<string, { count: number; processed: number }>()
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(d.getDate() - i)
        const key = d.toISOString().slice(0, 10)
        dayMap.set(key, { count: 0, processed: 0 })
      }
      filteredOrders.forEach(o => {
        const key = new Date(o.created_at).toISOString().slice(0, 10)
        if (dayMap.has(key)) {
          dayMap.get(key)!.count++
          if (o.status === 'processed') dayMap.get(key)!.processed++
        }
      })
      const sorted = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      const labels = sorted.map(([d]) => {
        const dt = new Date(d)
        return `${dt.getMonth() + 1}/${dt.getDate()} ${WEEK_DAYS[dt.getDay()]}`
      })
      return {
        backgroundColor: bgColor,
        tooltip: {
          trigger: 'axis' as const,
          backgroundColor: isDark ? '#27272a' : '#fff',
          borderColor,
          textStyle: { color: textColor },
          formatter: (params: any) => {
            let html = params[0].axisValue + '<br/>'
            params.forEach((p: any) => { html += `${p.marker} ${p.seriesName}: ${p.value}<br/>` })
            return html
          },
        },
        legend: { data: ['新建工单', '已处理'], textStyle: { color: textColor, fontSize: 12 } },
        grid: { left: '3%', right: '4%', bottom: '12%', top: '15%', containLabel: true },
        xAxis: {
          type: 'category' as const, data: labels,
          axisLine: { lineStyle: { color: borderColor } },
          axisLabel: { color: textColor, fontSize: 11 },
        },
        yAxis: {
          type: 'value' as const,
          axisLine: { show: false },
          axisLabel: { color: textColor, fontSize: 11 },
          splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
        },
        series: [
          {
            name: '新建工单', type: 'bar', barWidth: '36%',
            data: sorted.map(([, d]) => d.count),
            itemStyle: { borderRadius: [4, 4, 0, 0], color: '#3b82f6' },
          },
          {
            name: '已处理', type: 'line', smooth: true,
            data: sorted.map(([, d]) => d.processed),
            symbol: 'circle', symbolSize: 6,
            lineStyle: { width: 2.5, color: '#10b981' },
            itemStyle: { color: '#10b981' },
          },
        ],
      }
    } else {
      // 月度趋势
      const monthMap = new Map<string, { count: number; processed: number }>()
      filteredOrders.forEach(order => {
        const month = new Date(order.created_at).toISOString().slice(0, 7)
        const existing = monthMap.get(month) || { count: 0, processed: 0 }
        existing.count++
        if (order.status === 'processed') existing.processed++
        monthMap.set(month, existing)
      })
      const sortedMonths = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      return {
        backgroundColor: bgColor,
        tooltip: {
          trigger: 'axis' as const,
          backgroundColor: isDark ? '#27272a' : '#fff',
          borderColor,
          textStyle: { color: textColor },
          formatter: (params: any) => {
            let html = params[0].axisValue + '<br/>'
            params.forEach((p: any) => { html += `${p.marker} ${p.seriesName}: ${p.value}<br/>` })
            return html
          },
        },
        legend: { data: ['新建工单', '已处理'], textStyle: { color: textColor, fontSize: 12 } },
        grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
        xAxis: {
          type: 'category' as const, data: sortedMonths.map(([m]) => m),
          axisLine: { lineStyle: { color: borderColor } },
          axisLabel: { color: textColor, fontSize: 11 },
        },
        yAxis: {
          type: 'value' as const,
          axisLabel: { color: textColor, fontSize: 11 },
          splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
        },
        series: [
          {
            name: '新建工单', type: 'bar', barWidth: '40%',
            data: sortedMonths.map(([, d]) => d.count),
            itemStyle: { borderRadius: [4, 4, 0, 0], color: '#3b82f6' },
          },
          {
            name: '已处理', type: 'line', smooth: true,
            data: sortedMonths.map(([, d]) => d.processed),
            lineStyle: { width: 2.5, color: '#10b981' },
            itemStyle: { color: '#10b981' },
          },
        ],
      }
    }
  }, [filteredOrders, trendMode, isDark, bgColor, borderColor, textColor, dateTo])

  // ─── 部门工单数量趋势 ──────────────────────────
  const deptTrendOption = useMemo(() => {
    // 构建用户 → 部门映射
    const userDeptMap = new Map<string, string>()
    const deptNameMap = new Map<string, string>()
    allUsers.forEach(u => {
      if (u.primary_department) {
        userDeptMap.set(u.id, u.primary_department.id)
        deptNameMap.set(u.primary_department.id, u.primary_department.name)
      }
    })

    // 按部门分组统计工单数
    const deptCountMap = new Map<string, number>()
    filteredOrders.forEach(o => {
      const deptId = userDeptMap.get(o.created_by)
      if (deptId) {
        deptCountMap.set(deptId, (deptCountMap.get(deptId) || 0) + 1)
      }
    })

    const sortedDepts = Array.from(deptCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)

    const deptNames = sortedDepts.map(([id]) => {
      const name = deptNameMap.get(id) || '未知部门'
      return name.length > 10 ? name.slice(0, 10) + '...' : name
    }).reverse()
    const deptCounts = sortedDepts.map(([, c]) => c).reverse()

    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: isDark ? '#27272a' : '#fff',
        borderColor,
        textStyle: { color: textColor },
        formatter: (params: any) => {
          const p = params[0]
          return `${p.name}<br/>工单数: ${p.value} 个`
        },
      },
      grid: { left: '3%', right: '10%', bottom: '3%', top: '10%', containLabel: true },
      xAxis: {
        type: 'value' as const,
        axisLabel: { color: textColor, fontSize: 11 },
        splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
      },
      yAxis: {
        type: 'category' as const, data: deptNames,
        axisLabel: { color: textColor, fontSize: 11 },
        axisLine: { lineStyle: { color: borderColor } },
      },
      series: [{
        name: '工单数', type: 'bar', barWidth: '60%',
        data: deptCounts,
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#06b6d4' },
            { offset: 1, color: '#22d3ee' },
          ]),
        },
        label: {
          show: true, position: 'right',
          color: textColor, fontSize: 11,
          formatter: (params: any) => `${params.value} 个`,
        },
      }],
    }
  }, [filteredOrders, allUsers, isDark, bgColor, borderColor, textColor])

  // ─── 目标用户排行 ─────────────────────────────
  const targetUserRankOption = useMemo(() => {
    const userMap = new Map<string, { name: string; count: number }>()
    filteredOrders.forEach(order => {
      const userId = order.target_user_id
      const userName = order.target_user?.display_name || order.target_user?.phone || userId
      const existing = userMap.get(userId) || { name: userName, count: 0 }
      existing.count += order.source_user_ids.length
      if (userName !== existing.name) existing.name = userName
      userMap.set(userId, existing)
    })
    const topUsers = Array.from(userMap.values()).sort((a, b) => b.count - a.count).slice(0, 10)
    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: isDark ? '#27272a' : '#fff',
        borderColor,
        textStyle: { color: textColor },
      },
      grid: { left: '3%', right: '10%', bottom: '3%', top: '10%', containLabel: true },
      xAxis: {
        type: 'value' as const,
        axisLabel: { color: textColor, fontSize: 11 },
        splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
      },
      yAxis: {
        type: 'category' as const,
        data: topUsers.map(u => u.name.length > 12 ? u.name.slice(0, 12) + '...' : u.name).reverse(),
        axisLabel: { color: textColor, fontSize: 11 },
        axisLine: { lineStyle: { color: borderColor } },
      },
      series: [{
        name: '被转粉数', type: 'bar', barWidth: '60%',
        data: topUsers.map(u => u.count).reverse(),
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#8b5cf6' },
            { offset: 1, color: '#a78bfa' },
          ]),
        },
      }],
    }
  }, [filteredOrders, isDark, bgColor, borderColor, textColor])

  // ─── 创建人工单排行 ───────────────────────────
  const creatorRankOption = useMemo(() => {
    const creatorMap = new Map<string, { name: string; count: number }>()
    filteredOrders.forEach(order => {
      const creatorId = order.created_by
      const creatorName = order.creator?.display_name || order.creator?.phone || creatorId
      const existing = creatorMap.get(creatorId) || { name: creatorName, count: 0 }
      existing.count++
      if (creatorName !== existing.name) existing.name = creatorName
      creatorMap.set(creatorId, existing)
    })
    const topCreators = Array.from(creatorMap.values()).sort((a, b) => b.count - a.count).slice(0, 10)
    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: isDark ? '#27272a' : '#fff',
        borderColor,
        textStyle: { color: textColor },
      },
      grid: { left: '3%', right: '10%', bottom: '3%', top: '10%', containLabel: true },
      xAxis: {
        type: 'value' as const,
        axisLabel: { color: textColor, fontSize: 11 },
        splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
      },
      yAxis: {
        type: 'category' as const,
        data: topCreators.map(u => u.name.length > 12 ? u.name.slice(0, 12) + '...' : u.name).reverse(),
        axisLabel: { color: textColor, fontSize: 11 },
        axisLine: { lineStyle: { color: borderColor } },
      },
      series: [{
        name: '提交工单数', type: 'bar', barWidth: '60%',
        data: topCreators.map(u => u.count).reverse(),
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#f59e0b' },
            { offset: 1, color: '#fbbf24' },
          ]),
        },
      }],
    }
  }, [filteredOrders, isDark, bgColor, borderColor, textColor])

  // ─── 加急按钮点击排行 ───────────────────────
  const urgentRankOption = useMemo(() => {
    // 按时间段过滤加急日志
    const filteredUrgent = urgentLogs.filter(l => {
      const d = new Date(l.created_at)
      if (dateFrom && d < new Date(dateFrom)) return false
      if (dateTo && d > new Date(dateTo + 'T23:59:59.999Z')) return false
      return true
    })

    const userClickMap = new Map<string, { name: string; count: number }>()
    filteredUrgent.forEach(log => {
      const userId = log.user_id
      const userName = log.user?.display_name || log.user?.phone || userId
      const existing = userClickMap.get(userId) || { name: userName, count: 0 }
      existing.count++
      if (userName !== existing.name) existing.name = userName
      userClickMap.set(userId, existing)
    })

    const topUsers = Array.from(userClickMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const hasData = topUsers.length > 0

    if (!hasData) {
      return {
        backgroundColor: bgColor,
        grid: { left: '3%', right: '10%', bottom: '3%', top: '10%', containLabel: true },
        xAxis: { type: 'value' as const, axisLabel: { color: textColor, fontSize: 11 }, splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } } },
        yAxis: { type: 'category' as const, data: [], axisLabel: { color: textColor, fontSize: 11 }, axisLine: { lineStyle: { color: borderColor } } },
        series: [{
          name: '加急点击次数', type: 'bar', barWidth: '60%',
          data: [],
          itemStyle: { borderRadius: [0, 4, 4, 0], color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#ea580c' },
            { offset: 1, color: '#f97316' },
          ]) },
        }],
        title: {
          text: '暂无数据', left: 'center', top: 'center',
          textStyle: { color: textColor, fontSize: 14, fontWeight: 'normal' as const },
        },
      }
    }

    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: isDark ? '#27272a' : '#fff',
        borderColor,
        textStyle: { color: textColor },
      },
      grid: { left: '3%', right: '10%', bottom: '3%', top: '10%', containLabel: true },
      xAxis: {
        type: 'value' as const,
        axisLabel: { color: textColor, fontSize: 11 },
        splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
      },
      yAxis: {
        type: 'category' as const,
        data: topUsers.map(u => u.name.length > 12 ? u.name.slice(0, 12) + '...' : u.name).reverse(),
        axisLabel: { color: textColor, fontSize: 11 },
        axisLine: { lineStyle: { color: borderColor } },
      },
      series: [{
        name: '加急点击次数', type: 'bar', barWidth: '60%',
        data: topUsers.map(u => u.count).reverse(),
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#ea580c' },
            { offset: 1, color: '#f97316' },
          ]),
        },
        label: {
          show: true, position: 'right',
          color: textColor, fontSize: 11,
          formatter: (params: any) => `${params.value} 次`,
        },
      }],
    }
  }, [urgentLogs, dateFrom, dateTo, isDark, bgColor, borderColor, textColor])

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-9 w-36 bg-muted rounded animate-pulse" />
          <div className="h-4 w-52 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ChartSkeleton className="lg:col-span-2" />
          <ChartSkeleton />
        </div>
        <ChartSkeleton />
        <ChartSkeleton />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">转粉统计</h1>
        <p className="text-muted-foreground mt-1">
          转粉工单数据概览、趋势分析和用户排行
        </p>
      </div>

      {/* 时间段筛选 */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-end gap-4">
          <div>
            <Label className="text-xs">起始日期</Label>
            <Input
              type="date"
              value={tempFrom}
              onChange={(e) => setTempFrom(e.target.value)}
              className="mt-1 h-9 w-44"
            />
          </div>
          <div>
            <Label className="text-xs">截止日期</Label>
            <Input
              type="date"
              value={tempTo}
              onChange={(e) => setTempTo(e.target.value)}
              className="mt-1 h-9 w-44"
            />
          </div>
          <Button size="sm" className="h-9" onClick={applyFilter}>
            应用筛选
          </Button>
          {(dateFrom || dateTo) && (
            <span className="text-xs text-muted-foreground ml-2">
              当前筛选: {dateFrom || '不限'} ~ {dateTo || '不限'} | 共 {filteredOrders.length} 条数据（总 {orders.length} 条）
            </span>
          )}
        </div>
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="总工单数" value={stats.total.toString()} icon={<DocumentTextIcon className="h-5 w-5" />} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/20" />
        <StatCard label="已提交" value={stats.submitted.toString()} icon={<ClockIcon className="h-5 w-5" />} color="text-blue-500" bg="bg-blue-50 dark:bg-blue-900/20" />
        <StatCard label="待处理" value={stats.pending.toString()} icon={<ArrowTrendingUpIcon className="h-5 w-5" />} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/20" />
        <StatCard label="已处理" value={stats.processed.toString()} icon={<CheckCircleIcon className="h-5 w-5" />} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-900/20" />
        <StatCard label="已取消" value={stats.cancelled.toString()} icon={<XCircleIcon className="h-5 w-5" />} color="text-gray-600" bg="bg-gray-50 dark:bg-gray-900/20" />
        <StatCard label="已驳回" value={stats.rejected.toString()} icon={<XCircleIcon className="h-5 w-5" />} color="text-red-600" bg="bg-red-50 dark:bg-red-900/20" />
      </div>

      {/* 工单趋势 + 状态分布 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <ArrowTrendingUpIcon className="h-5 w-5 text-primary" />
              {trendMode === 'weekly' ? '本周工单趋势' : '月度工单趋势'}
            </h3>
            <div className="flex gap-1 bg-muted rounded-lg p-0.5">
              <button
                onClick={() => setTrendMode('weekly')}
                className={cn(
                  'px-3 py-1 text-xs rounded-md transition-colors',
                  trendMode === 'weekly'
                    ? 'bg-background text-foreground shadow-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                本周
              </button>
              <button
                onClick={() => setTrendMode('monthly')}
                className={cn(
                  'px-3 py-1 text-xs rounded-md transition-colors',
                  trendMode === 'monthly'
                    ? 'bg-background text-foreground shadow-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                月度
              </button>
            </div>
          </div>
          <ReactECharts
            echarts={echarts}
            option={trendOption}
            style={{ height: 320 }}
            notMerge={true}
            lazyUpdate={true}
          />
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <ChartPieIcon className="h-5 w-5 text-primary" />
            工单状态分布
          </h3>
          <ReactECharts
            echarts={echarts}
            option={statusPieOption}
            style={{ height: 320 }}
            notMerge={true}
            lazyUpdate={true}
          />
        </div>
      </div>

      {/* 部门工单趋势 */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <BuildingOfficeIcon className="h-5 w-5 text-cyan-500" />
          各部门工单数量排行
        </h3>
        <ReactECharts
          echarts={echarts}
          option={deptTrendOption}
          style={{ height: 350 }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>

      {/* 加急按钮点击排行 */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <BoltIcon className="h-5 w-5 text-orange-500" />
          加急按钮点击排行 (Top 10)
        </h3>
        <ReactECharts
          echarts={echarts}
          option={urgentRankOption}
          style={{ height: 350 }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>

      {/* 排行榜 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrophyIcon className="h-5 w-5 text-violet-500" />
            目标用户转粉排行 (Top 10)
          </h3>
          <ReactECharts
            echarts={echarts}
            option={targetUserRankOption}
            style={{ height: 380 }}
            notMerge={true}
            lazyUpdate={true}
          />
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <UserGroupIcon className="h-5 w-5 text-amber-500" />
            创建人工单排行 (Top 10)
          </h3>
          <ReactECharts
            echarts={echarts}
            option={creatorRankOption}
            style={{ height: 380 }}
            notMerge={true}
            lazyUpdate={true}
          />
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label, value, icon, color, bg,
}: {
  label: string
  value: string
  icon: React.ReactNode
  color: string
  bg: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground mt-1">{value}</p>
        </div>
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', bg, color)}>
          {icon}
        </div>
      </div>
    </div>
  )
}
