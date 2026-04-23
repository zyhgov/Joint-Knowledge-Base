import React, { useState, useEffect, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts/core'
import { LineChart, PieChart, BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { fileService } from '@/services/fileService'
import { JkbFile } from '@/types/files'
import { useThemeStore } from '@/store/themeStore'
import {
  ArrowTrendingUpIcon,
  ChartPieIcon,
  TrophyIcon,
  EyeIcon,
  DocumentTextIcon,
  PaperClipIcon,
  ArrowDownTrayIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { getFileIconConfig } from '@/components/files/FileIcon'
import { formatFileSize } from '@/pages/Files/FilesPage'
import { StatCardSkeleton, ChartSkeleton } from '@/components/common/Skeleton'

echarts.use([
  LineChart,
  PieChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
])



export default function FileStats() {
  const { actualTheme } = useThemeStore()
  const [files, setFiles] = useState<JkbFile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fileService.getFiles({ sort_by: 'created_at', sort_order: 'desc' })
        setFiles(data)
      } catch (error: any) {
        console.error('Failed to load file stats:', error)
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

  // 文件上传趋势（按日/周/月）
  const uploadTrendOption = useMemo(() => {
    // 按天聚合
    const dayMap = new Map<string, number>()
    files.forEach((file) => {
      const date = new Date(file.created_at).toISOString().slice(0, 10)
      dayMap.set(date, (dayMap.get(date) || 0) + 1)
    })

    const sortedDays = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    // 最近30天
    const recentDays = sortedDays.slice(-30)

    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: isDark ? '#27272a' : '#fff',
        borderColor: borderColor,
        textStyle: { color: textColor },
      },
      grid: { left: '3%', right: '4%', bottom: '12%', top: '10%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: recentDays.map(([d]) => d.slice(5)),
        axisLine: { lineStyle: { color: borderColor } },
        axisLabel: { color: textColor, fontSize: 11 },
      },
      yAxis: {
        type: 'value' as const,
        axisLine: { show: false },
        axisLabel: { color: textColor, fontSize: 11 },
        splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
      },
      dataZoom: [
        {
          type: 'inside' as const,
          start: 0,
          end: 100,
        },
      ],
      series: [
        {
          name: '上传文件数',
          type: 'line',
          data: recentDays.map(([, count]) => count),
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { width: 2.5, color: '#3b82f6' },
          itemStyle: { color: '#3b82f6' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(59,130,246,0.3)' },
              { offset: 1, color: 'rgba(59,130,246,0.02)' },
            ]),
          },
        },
      ],
    }
  }, [files, isDark])

  // 文件类型占比
  const categoryPieOption = useMemo(() => {
    const categoryMap = new Map<string, { count: number; size: number }>()
    const categoryNames: Record<string, string> = {
      document: '文档',
      image: '图片',
      video: '视频',
      audio: '音频',
      file: '其他',
    }

    files.forEach((file) => {
      const cat = file.category || 'file'
      const existing = categoryMap.get(cat) || { count: 0, size: 0 }
      existing.count++
      existing.size += file.file_size || 0
      categoryMap.set(cat, existing)
    })

    const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#6b7280']

    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: isDark ? '#27272a' : '#fff',
        borderColor: borderColor,
        textStyle: { color: textColor },
        formatter: (params: any) => {
          return `${params.name}<br/>文件数: ${params.data.value} 个 (${params.percent}%)<br/>总大小: ${formatFileSize(params.data.size)}`
        },
      },
      legend: {
        orient: 'vertical' as const,
        right: '5%',
        top: 'center',
        textStyle: { color: textColor, fontSize: 12 },
      },
      series: [
        {
          name: '文件类型',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['35%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: bgColor, borderWidth: 2 },
          label: { show: false },
          emphasis: {
            label: { show: true, fontSize: 14, fontWeight: 'bold' },
          },
          data: Array.from(categoryMap.entries()).map(([cat, data], index) => ({
            name: categoryNames[cat] || cat,
            value: data.count,
            size: data.size,
            itemStyle: { color: colors[index % colors.length] },
          })),
        },
      ],
    }
  }, [files, isDark])

  // 上传文件排行榜（按文件大小）
  const uploadRankOption = useMemo(() => {
    const topFiles = [...files]
      .sort((a, b) => (b.file_size || 0) - (a.file_size || 0))
      .slice(0, 10)

    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: isDark ? '#27272a' : '#fff',
        borderColor: borderColor,
        textStyle: { color: textColor },
        formatter: (params: any) => {
          const p = params[0]
          return `${p.name}<br/>大小: ${formatFileSize(p.value)}`
        },
      },
      grid: { left: '3%', right: '10%', bottom: '3%', top: '10%', containLabel: true },
      xAxis: {
        type: 'value' as const,
        axisLabel: {
          color: textColor,
          fontSize: 11,
          formatter: (value: number) => formatFileSize(value),
        },
        splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
      },
      yAxis: {
        type: 'category' as const,
        data: topFiles.map((f) => f.display_name.length > 15 ? f.display_name.slice(0, 15) + '...' : f.display_name).reverse(),
        axisLabel: { color: textColor, fontSize: 11 },
        axisLine: { lineStyle: { color: borderColor } },
      },
      series: [
        {
          name: '文件大小',
          type: 'bar',
          data: topFiles.map((f) => f.file_size || 0).reverse(),
          barWidth: '60%',
          itemStyle: {
            borderRadius: [0, 4, 4, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#3b82f6' },
              { offset: 1, color: '#60a5fa' },
            ]),
          },
        },
      ],
    }
  }, [files, isDark])

  // 文件查看次数排行榜
  const viewRankOption = useMemo(() => {
    const topFiles = [...files]
      .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
      .slice(0, 10)

    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: isDark ? '#27272a' : '#fff',
        borderColor: borderColor,
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
        data: topFiles.map((f) => f.display_name.length > 15 ? f.display_name.slice(0, 15) + '...' : f.display_name).reverse(),
        axisLabel: { color: textColor, fontSize: 11 },
        axisLine: { lineStyle: { color: borderColor } },
      },
      series: [
        {
          name: '浏览次数',
          type: 'bar',
          data: topFiles.map((f) => f.view_count || 0).reverse(),
          barWidth: '60%',
          itemStyle: {
            borderRadius: [0, 4, 4, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#10b981' },
              { offset: 1, color: '#34d399' },
            ]),
          },
        },
      ],
    }
  }, [files, isDark])

  // 上传趋势按月
  const monthlyTrendOption = useMemo(() => {
    const monthMap = new Map<string, { count: number; size: number }>()
    files.forEach((file) => {
      const month = new Date(file.created_at).toISOString().slice(0, 7)
      const existing = monthMap.get(month) || { count: 0, size: 0 }
      existing.count++
      existing.size += file.file_size || 0
      monthMap.set(month, existing)
    })

    const sortedMonths = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))

    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: isDark ? '#27272a' : '#fff',
        borderColor: borderColor,
        textStyle: { color: textColor },
        formatter: (params: any) => {
          let html = params[0].axisValue + '<br/>'
          params.forEach((p: any) => {
            html += `${p.marker} ${p.seriesName}: ${p.seriesName === '存储量' ? formatFileSize(p.value) : p.value + ' 个'}<br/>`
          })
          return html
        },
      },
      legend: {
        data: ['上传数量', '存储量'],
        textStyle: { color: textColor, fontSize: 12 },
      },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: sortedMonths.map(([m]) => m),
        axisLine: { lineStyle: { color: borderColor } },
        axisLabel: { color: textColor, fontSize: 11 },
      },
      yAxis: [
        {
          type: 'value' as const,
          name: '文件数',
          axisLabel: { color: textColor, fontSize: 11 },
          splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
        },
        {
          type: 'value' as const,
          name: '存储量',
          axisLabel: {
            color: textColor,
            fontSize: 11,
            formatter: (value: number) => formatFileSize(value),
          },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '上传数量',
          type: 'bar',
          data: sortedMonths.map(([, d]) => d.count),
          barWidth: '40%',
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: '#3b82f6',
          },
        },
        {
          name: '存储量',
          type: 'line',
          yAxisIndex: 1,
          data: sortedMonths.map(([, d]) => d.size),
          smooth: true,
          lineStyle: { width: 2.5, color: '#f59e0b' },
          itemStyle: { color: '#f59e0b' },
        },
      ],
    }
  }, [files, isDark])

  // 文件下载次数排行榜
  const downloadRankOption = useMemo(() => {
    const topFiles = [...files]
      .sort((a, b) => (b.download_count || 0) - (a.download_count || 0))
      .slice(0, 10)

    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: isDark ? '#27272a' : '#fff',
        borderColor: borderColor,
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
        data: topFiles.map((f) => f.display_name.length > 15 ? f.display_name.slice(0, 15) + '...' : f.display_name).reverse(),
        axisLabel: { color: textColor, fontSize: 11 },
        axisLine: { lineStyle: { color: borderColor } },
      },
      series: [
        {
          name: '下载次数',
          type: 'bar',
          data: topFiles.map((f) => f.download_count || 0).reverse(),
          barWidth: '60%',
          itemStyle: {
            borderRadius: [0, 4, 4, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#f59e0b' },
              { offset: 1, color: '#fbbf24' },
            ]),
          },
        },
      ],
    }
  }, [files, isDark])

  // 上传者排行
  const uploaderRankOption = useMemo(() => {
    const uploaderMap = new Map<string, { name: string; count: number; size: number }>()
    files.forEach((file) => {
      const uploaderId = file.uploaded_by
      const uploaderName = file.uploader?.display_name || '未知'
      const existing = uploaderMap.get(uploaderId) || { name: uploaderName, count: 0, size: 0 }
      existing.count++
      existing.size += file.file_size || 0
      uploaderMap.set(uploaderId, existing)
    })

    const topUploaders = Array.from(uploaderMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)

    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: isDark ? '#27272a' : '#fff',
        borderColor: borderColor,
        textStyle: { color: textColor },
        formatter: (params: any) => {
          const p = params[0]
          const uploader = topUploaders.find(([, d]) => d.name === p.name)
          return `${p.name}<br/>上传文件: ${p.value} 个<br/>总大小: ${formatFileSize(uploader?.[1].size || 0)}`
        },
      },
      grid: { left: '3%', right: '10%', bottom: '3%', top: '10%', containLabel: true },
      xAxis: {
        type: 'value' as const,
        axisLabel: { color: textColor, fontSize: 11 },
        splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
      },
      yAxis: {
        type: 'category' as const,
        data: topUploaders.map(([, d]) => d.name).reverse(),
        axisLabel: { color: textColor, fontSize: 11 },
        axisLine: { lineStyle: { color: borderColor } },
      },
      series: [
        {
          name: '上传数',
          type: 'bar',
          data: topUploaders.map(([, d]) => d.count).reverse(),
          barWidth: '60%',
          itemStyle: {
            borderRadius: [0, 4, 4, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#8b5cf6' },
              { offset: 1, color: '#a78bfa' },
            ]),
          },
        },
      ],
    }
  }, [files, isDark])

  // 文件存储占用趋势（按月）
  const storageTrendOption = useMemo(() => {
    const sortedFiles = [...files].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    // 按月累计存储量
    let cumulative = 0
    const allMonths = new Set<string>()
    sortedFiles.forEach((f) => {
      const month = new Date(f.created_at).toISOString().slice(0, 7)
      allMonths.add(month)
    })

    const monthFiles = new Map<string, number>()
    sortedFiles.forEach((f) => {
      const month = new Date(f.created_at).toISOString().slice(0, 7)
      monthFiles.set(month, (monthFiles.get(month) || 0) + (f.file_size || 0))
    })

    const sortedMonths = Array.from(allMonths).sort()
    const cumulativeData: number[] = []
    sortedMonths.forEach((m) => {
      cumulative += monthFiles.get(m) || 0
      cumulativeData.push(cumulative)
    })

    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: isDark ? '#27272a' : '#fff',
        borderColor: borderColor,
        textStyle: { color: textColor },
        formatter: (params: any) => {
          const p = params[0]
          return `${p.axisValue}<br/>累计存储: ${formatFileSize(p.value)}`
        },
      },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: sortedMonths,
        axisLine: { lineStyle: { color: borderColor } },
        axisLabel: { color: textColor, fontSize: 11 },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: {
          color: textColor,
          fontSize: 11,
          formatter: (value: number) => formatFileSize(value),
        },
        splitLine: { lineStyle: { color: borderColor, type: 'dashed' as const } },
      },
      series: [
        {
          name: '累计存储',
          type: 'line',
          data: cumulativeData,
          smooth: true,
          lineStyle: { width: 2.5, color: '#f59e0b' },
          itemStyle: { color: '#f59e0b' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(245,158,11,0.3)' },
              { offset: 1, color: 'rgba(245,158,11,0.02)' },
            ]),
          },
        },
      ],
    }
  }, [files, isDark])

  // 统计概览数字
  const stats = useMemo(() => {
    const totalSize = files.reduce((sum, f) => sum + (f.file_size || 0), 0)
    const totalViews = files.reduce((sum, f) => sum + (f.view_count || 0), 0)
    const totalDownloads = files.reduce((sum, f) => sum + (f.download_count || 0), 0)
    const imageCount = files.filter((f) => f.category === 'image').length
    const docCount = files.filter((f) => f.category === 'document').length
    const videoCount = files.filter((f) => f.category === 'video').length
    const audioCount = files.filter((f) => f.category === 'audio').length
    const otherCount = files.filter((f) => f.category === 'file').length

    return { totalSize, totalViews, totalDownloads, imageCount, docCount, videoCount, audioCount, otherCount }
  }, [files])

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-9 w-28 bg-muted rounded animate-pulse" />
          <div className="h-4 w-48 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ChartSkeleton className="lg:col-span-2" />
          <ChartSkeleton />
        </div>
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
        <h1 className="text-3xl font-bold text-foreground">文件统计</h1>
        <p className="text-muted-foreground mt-1">
          文件上传趋势、类型分布和访问排行
        </p>
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="总文件数"
          value={files.length.toString()}
          icon={<DocumentTextIcon className="h-5 w-5" />}
          color="text-blue-600"
          bg="bg-blue-50 dark:bg-blue-900/20"
        />
        <StatCard
          label="总存储量"
          value={formatFileSize(stats.totalSize)}
          icon={<PaperClipIcon className="h-5 w-5" />}
          color="text-violet-600"
          bg="bg-violet-50 dark:bg-violet-900/20"
        />
        <StatCard
          label="总浏览量"
          value={stats.totalViews.toLocaleString()}
          icon={<EyeIcon className="h-5 w-5" />}
          color="text-emerald-600"
          bg="bg-emerald-50 dark:bg-emerald-900/20"
        />
        <StatCard
          label="总下载量"
          value={stats.totalDownloads.toLocaleString()}
          icon={<ArrowTrendingUpIcon className="h-5 w-5" />}
          color="text-amber-600"
          bg="bg-amber-50 dark:bg-amber-900/20"
        />
      </div>

      {/* 上传趋势 + 类型占比 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <ArrowTrendingUpIcon className="h-5 w-5 text-primary" />
            上传趋势（近30天）
          </h3>
          <ReactECharts
            echarts={echarts}
            option={uploadTrendOption}
            style={{ height: 320 }}
            notMerge={true}
            lazyUpdate={true}
          />
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <ChartPieIcon className="h-5 w-5 text-primary" />
            文件类型占比
          </h3>
          <ReactECharts
            echarts={echarts}
            option={categoryPieOption}
            style={{ height: 320 }}
            notMerge={true}
            lazyUpdate={true}
          />
        </div>
      </div>

      {/* 月度趋势 */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <ArrowTrendingUpIcon className="h-5 w-5 text-primary" />
          月度上传趋势
        </h3>
        <ReactECharts
          echarts={echarts}
          option={monthlyTrendOption}
          style={{ height: 350 }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>

      {/* 排行榜 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrophyIcon className="h-5 w-5 text-amber-500" />
            文件大小排行榜 (Top 10)
          </h3>
          <ReactECharts
            echarts={echarts}
            option={uploadRankOption}
            style={{ height: 380 }}
            notMerge={true}
            lazyUpdate={true}
          />
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <EyeIcon className="h-5 w-5 text-emerald-500" />
            浏览次数排行榜 (Top 10)
          </h3>
          <ReactECharts
            echarts={echarts}
            option={viewRankOption}
            style={{ height: 380 }}
            notMerge={true}
            lazyUpdate={true}
          />
        </div>
      </div>

      {/* 下载排行 + 上传者排行 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <ArrowDownTrayIcon className="h-5 w-5 text-amber-500" />
            下载次数排行榜 (Top 10)
          </h3>
          <ReactECharts
            echarts={echarts}
            option={downloadRankOption}
            style={{ height: 380 }}
            notMerge={true}
            lazyUpdate={true}
          />
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <DocumentTextIcon className="h-5 w-5 text-violet-500" />
            上传者排行榜 (Top 10)
          </h3>
          <ReactECharts
            echarts={echarts}
            option={uploaderRankOption}
            style={{ height: 380 }}
            notMerge={true}
            lazyUpdate={true}
          />
        </div>
      </div>

      {/* 存储趋势 */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <ClockIcon className="h-5 w-5 text-amber-500" />
          累计存储趋势
        </h3>
        <ReactECharts
          echarts={echarts}
          option={storageTrendOption}
          style={{ height: 350 }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>

      {/* 文件类型详细统计 */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-foreground mb-4">各类型文件统计</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <TypeStatCard label="文档" count={stats.docCount} files={files} category="document" />
          <TypeStatCard label="图片" count={stats.imageCount} files={files} category="image" />
          <TypeStatCard label="视频" count={stats.videoCount} files={files} category="video" />
          <TypeStatCard label="音频" count={stats.audioCount} files={files} category="audio" />
          <TypeStatCard label="其他" count={stats.otherCount} files={files} category="file" />
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  color,
  bg,
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

function TypeStatCard({
  label,
  count,
  files,
  category,
}: {
  label: string
  count: number
  files: JkbFile[]
  category: string
}) {
  const categoryFiles = files.filter((f) => f.category === category)
  const totalSize = categoryFiles.reduce((sum, f) => sum + (f.file_size || 0), 0)
  const totalViews = categoryFiles.reduce((sum, f) => sum + (f.view_count || 0), 0)

  return (
    <div className="border border-border rounded-xl p-4 text-center">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3', getFileIconConfig(category === 'document' ? 'docx' : category === 'image' ? 'png' : category === 'video' ? 'mp4' : category === 'audio' ? 'mp3' : 'zip').bgColor)}>
        <div className="scale-125">{getFileIconConfig(category === 'document' ? 'docx' : category === 'image' ? 'png' : category === 'video' ? 'mp4' : category === 'audio' ? 'mp3' : 'zip').icon}</div>
      </div>
      <p className="font-semibold text-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground mt-1">{count}</p>
      <div className="mt-2 space-y-1">
        <p className="text-xs text-muted-foreground">存储: {formatFileSize(totalSize)}</p>
        <p className="text-xs text-muted-foreground">浏览: {totalViews} 次</p>
      </div>
    </div>
  )
}
