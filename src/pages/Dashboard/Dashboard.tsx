import React, { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '@/store/authStore'
import { fileService } from '@/services/fileService'
import { workspaceService } from '@/services/workspaceService'
import { departmentService } from '@/services/departmentService'
import { userService } from '@/services/userService'
import { JkbFile, JkbWorkspace } from '@/types/files'
import {
  DocumentTextIcon,
  FolderIcon,
  UserGroupIcon,
  ArrowRightIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  CloudArrowUpIcon,
  EyeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import { getFileIconConfig, isImageFile } from '@/components/files/FileIcon'
import { WelcomeSkeleton, StatCardSkeleton, ListSkeleton, CardSkeleton } from '@/components/common/Skeleton'
import { renderWorkspaceIcon } from '@/components/common/IconPicker'
import DashboardAnnouncements from '@/components/common/DashboardAnnouncements'
import {
  isAdmin,
  hasPermission,
  hasAnyPermission,
  PERM,
  getAllDepartmentIdsWithAncestors,
  filterFilesByPermission,
  filterWorkspacesByPermission,
} from '@/utils/permission'
import { transferFanService } from '@/services/transferFanService'
import { UserWithDepartments } from '@/types/database'
import { getTodayInfo, getRandomCardBg, getNextCardBg, type TodayInfo } from '@/utils/lunar'
import { fetchLocationInfo } from '@/services/locationService'
import type { LocationInfo } from '@/services/locationService'
import { fetchWeather } from '@/services/weatherService'
import type { WeatherData } from '@/services/weatherService'

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export default function Dashboard() {
  const { user, userPermissions } = useAuthStore()
  const [files, setFiles] = useState<JkbFile[]>([])
  const [workspaces, setWorkspaces] = useState<JkbWorkspace[]>([])
  const [loading, setLoading] = useState(true)
  const [userDeptIds, setUserDeptIds] = useState<string[]>([])
  const [allUsers, setAllUsers] = useState<UserWithDepartments[]>([])
  const [orderStats, setOrderStats] = useState({
    total: 0,
    submitted: 0,
    pending: 0,
    processed: 0,
    cancelled: 0,
    rejected: 0,
  })
  const [todayInfo, setTodayInfo] = useState<TodayInfo | null>(null)
  const [cardBg, setCardBg] = useState('')
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null)
  const [weatherInfo, setWeatherInfo] = useState<WeatherData | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [filesData, wsData, deptsData, usersData] = await Promise.all([
          fileService.getFiles({ sort_by: 'created_at', sort_order: 'desc' }),
          workspaceService.getAllWorkspaces(),
          departmentService.getAllDepartments(),
          userService.getAllUsers(),
        ])
        setFiles(filesData)
        setWorkspaces(wsData)
        setAllUsers(usersData)

        // 计算用户部门（含祖先），用于权限判断
        if (user && !isAdmin(user)) {
          try {
            const userDepts = await departmentService.getUserDepartments(user.id)
            const directDeptIds = userDepts.map((d) => d.department.id)
            const allDeptIds = getAllDepartmentIdsWithAncestors(directDeptIds, deptsData)
            setUserDeptIds(allDeptIds)
          } catch {
            setUserDeptIds([])
          }
        } else {
          setUserDeptIds([])
        }

        // 获取当前用户的转粉工单统计
        if (user) {
          try {
            const stats = await transferFanService.getUserOrderStats(user.id)
            setOrderStats(stats)
          } catch {
            // 静默失败
          }
        }
      } catch (error) {
        console.error('Failed to load dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
    setTodayInfo(getTodayInfo())
    setCardBg(getRandomCardBg())

    // 获取位置和天气（位置数据有缓存，通常立即返回）
    fetchLocationInfo().then((loc) => {
      setLocationInfo(loc)
      if (loc.city || loc.prov) {
        fetchWeather(loc).then((w) => {
          if (w) setWeatherInfo(w)
        })
      }
    })
  }, [user?.id])

  // 权限判断
  const hasFileRead = useMemo(() => {
    return hasPermission(user, userPermissions, PERM.FILE_READ)
  }, [user, userPermissions])

  const hasWorkspaceRead = useMemo(() => {
    return hasPermission(user, userPermissions, PERM.WORKSPACE_READ)
  }, [user, userPermissions])

  // 权限过滤（用于最近文件、工作区概览的显示）
  const permittedFiles = useMemo(() => {
    return filterFilesByPermission(files, user, userDeptIds, workspaces)
  }, [files, user, userDeptIds, workspaces])

  const permittedWorkspaces = useMemo(() => {
    return filterWorkspacesByPermission(workspaces, user, userDeptIds)
  }, [workspaces, user, userDeptIds])

  // 当前用户所在部门的用户 ID 集合
  const departmentUserIds = useMemo(() => {
    if (!user || !userDeptIds.length || !allUsers.length) return [user?.id].filter(Boolean) as string[]
    if (isAdmin(user)) return allUsers.map(u => u.id)
    return allUsers
      .filter(u => {
        const primaryId = (u as any).primary_department?.id
        const extraIds = ((u as any).extra_departments || []).map((d: any) => d.id)
        return userDeptIds.includes(primaryId) || extraIds.some((eid: string) => userDeptIds.includes(eid))
      })
      .map(u => u.id)
  }, [user, userDeptIds, allUsers])

  // 部门范围内的文件（用于统计）
  const departmentFiles = useMemo(() => {
    if (!user) return []
    if (isAdmin(user)) return permittedFiles
    if (!departmentUserIds.length) return []
    return files.filter(f => departmentUserIds.includes(f.uploaded_by))
  }, [files, departmentUserIds, user, permittedFiles])

  // 部门范围内的工作区（用于统计）
  const departmentWorkspaces = useMemo(() => {
    if (!user) return []
    if (isAdmin(user)) return permittedWorkspaces
    if (!userDeptIds.length) return []
    return workspaces.filter(ws =>
      ws.department_ids?.some((dId: string) => userDeptIds.includes(dId))
    )
  }, [workspaces, userDeptIds, user, permittedWorkspaces])

  const stats = [
    {
      label: '文件总数',
      value: departmentFiles.length,
      icon: DocumentTextIcon,
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: '工作区',
      value: departmentWorkspaces.length,
      icon: FolderIcon,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      label: '团队成员',
      value: departmentUserIds.length,
      icon: UserGroupIcon,
      color: 'text-violet-600',
      bg: 'bg-violet-50 dark:bg-violet-900/20',
    },
    {
      label: '总浏览量',
      value: departmentFiles.reduce((sum, f) => sum + (f.view_count || 0), 0),
      icon: EyeIcon,
      color: 'text-amber-600',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
    },
  ]

  // 转粉工单统计数据
  const orderStatItems = [
    { label: '总工单数', value: orderStats.total, icon: DocumentTextIcon, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: '已提交', value: orderStats.submitted, icon: ArrowTrendingUpIcon, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: '待处理', value: orderStats.pending, icon: ClockIcon, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: '已处理', value: orderStats.processed, icon: CheckCircleIcon, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { label: '已取消', value: orderStats.cancelled, icon: XCircleIcon, color: 'text-gray-600', bg: 'bg-gray-50 dark:bg-gray-800/20' },
    { label: '已驳回', value: orderStats.rejected, icon: ExclamationCircleIcon, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
  ]

  const recentFiles = permittedFiles.slice(0, 5)

  // 时段问候语
  const getGreeting = () => {
    const totalMinutes = new Date().getHours() * 60 + new Date().getMinutes()
    if (totalMinutes >= 0 && totalMinutes < 7 * 60) return '夜深了该睡觉了'
    if (totalMinutes >= 7 * 60 && totalMinutes < 8 * 60) return '上午好，该吃早餐了'
    if (totalMinutes >= 8 * 60 && totalMinutes < 9 * 60) return '上午好'
    if (totalMinutes >= 9 * 60 && totalMinutes < 11 * 60 + 30) return '上午好'
    if (totalMinutes >= 11 * 60 + 30 && totalMinutes < 13 * 60) return '中午好，该吃午饭了'
    if (totalMinutes >= 13 * 60 && totalMinutes < 18 * 60) return '下午好'
    if (totalMinutes >= 18 * 60 && totalMinutes < 19 * 60) return '下午好，该吃晚饭了'
    if (totalMinutes >= 19 * 60 && totalMinutes < 20 * 60) return '晚上好'
    if (totalMinutes >= 20 * 60 && totalMinutes < 22 * 60) return '晚上好，准备休息吧'
    return '夜深了该睡觉了'
  }

  const handleSwitchBg = () => {
    setCardBg((prev) => getNextCardBg(prev))
  }

  // 天气现象 → emoji
  const weatherEmoji = (weather: string): string => {
    if (weather.includes('晴')) return '☀️'
    if (weather.includes('多云') || weather.includes('少云')) return '⛅'
    if (weather.includes('阴')) return '☁️'
    if (weather.includes('阵雨') || weather.includes('雷阵雨')) return '🌦️'
    if (weather.includes('雨') && weather.includes('雪')) return '🌨️'
    if (weather.includes('雨')) return '🌧️'
    if (weather.includes('雪')) return '❄️'
    if (weather.includes('雾') || weather.includes('霾')) return '🌫️'
    if (weather.includes('风')) return '💨'
    return '🌡️'
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <WelcomeSkeleton />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <div>
          <div className="h-6 w-32 bg-muted rounded animate-pulse mb-4" />
          <ListSkeleton rows={5} />
        </div>
        <div>
          <div className="h-6 w-28 bg-muted rounded animate-pulse mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* 欢迎区 - 背景图+黄历信息 */}
      <div className="relative overflow-hidden rounded-2xl border border-border/50">
        {/* 背景图片 - 用 object-cover 等比铺满 */}
        {cardBg && (
          <img
            src={cardBg}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {/* 灰黑色蒙版 - 保证任何背景图上文字都清晰 */}
        <div className="absolute inset-0 bg-black/60" />

        {/* 切换背景按钮 - 右上角 */}
        <button
          onClick={handleSwitchBg}
          className="absolute top-3 right-3 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white/80 hover:text-white transition-all"
          title="切换背景"
        >
          <ArrowPathIcon className="h-4 w-4" />
        </button>

        {/* 内容 */}
        <div className="relative z-10 p-6 sm:p-8 flex flex-col gap-4 min-h-[220px] sm:min-h-[240px]">
          {/* 顶部问候 */}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white drop-shadow-sm">
              {getGreeting()}，{user?.display_name || '用户'}
            </h1>

            {/* IP + 城市 + 天气信息 */}
            {(locationInfo || weatherInfo) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-xs">
                {locationInfo?.countryCode && (
                  <span
                    className={cn('fi', `fi-${locationInfo.countryCode.toLowerCase()}`, 'rounded-sm shadow-sm')}
                    style={{ width: 18, height: 14, display: 'inline-block' }}
                  />
                )}
                {locationInfo?.city && (
                  <span className="text-white/80 font-medium">{locationInfo.city}</span>
                )}
                {locationInfo?.ip && (
                  <span className="text-white/50 font-mono tracking-tight">{locationInfo.ip}</span>
                )}
                {weatherInfo && (
                  <>
                    <span className="text-white/30">|</span>
                    <span className="text-white/80">
                      {weatherEmoji(weatherInfo.weather)} {weatherInfo.temperature}°C
                    </span>
                    <span className="text-white/50">{weatherInfo.weather}</span>
                  </>
                )}
              </div>
            )}

            {todayInfo && (
              <p className="text-white/75 mt-2 text-sm sm:text-base leading-relaxed drop-shadow-sm">
                今天是{todayInfo.gregorian}，<br />今天也是高效工作的一天。让我们一起看看最新的动态。
              </p>
            )}
          </div>

          {/* 底部黄历信息 */}
          {todayInfo && (
            <div className="mt-auto space-y-2.5">
              {/* 农历 + 节气 */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-white/90 text-base sm:text-lg font-medium drop-shadow-sm">
                  {todayInfo.lunar}（{todayInfo.shengxiao}年）
                </span>
                {todayInfo.jieqi && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-400/30 backdrop-blur-sm">
                    🎋 {todayInfo.jieqi}
                  </span>
                )}
              </div>

              {/* 宜 / 忌 - 响应式换行 */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {todayInfo.yi.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-white/60 text-xs font-medium drop-shadow-sm">宜</span>
                    <div className="flex flex-wrap gap-1.5">
                      {todayInfo.yi.map((item) => (
                        <span
                          key={item}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-300 border border-green-400/30 backdrop-blur-sm"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {todayInfo.ji.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-white/60 text-xs font-medium drop-shadow-sm">忌</span>
                    <div className="flex flex-wrap gap-1.5">
                      {todayInfo.ji.map((item) => (
                        <span
                          key={item}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-300 border border-red-400/30 backdrop-blur-sm"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-card rounded-xl p-5 border border-border hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">{stat.label}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{stat.value.toLocaleString()}</p>
              </div>
              <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', stat.bg)}>
                <stat.icon className={cn('h-5 w-5', stat.color)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 转粉工单统计 */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">我的转粉工单</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {orderStatItems.map((item) => (
            <div
              key={item.label}
              className="bg-card rounded-xl p-5 border border-border hover:shadow-md transition-all group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm">{item.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{item.value.toLocaleString()}</p>
                </div>
                <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', item.bg)}>
                  <item.icon className={cn('h-5 w-5', item.color)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 公告与任务 */}
      <DashboardAnnouncements />

      {/* 最近文件 - 仅当有 file_read 权限时显示 */}
      {hasFileRead && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">最近上传的文件</h2>
            <a href="/files" className="text-sm text-primary hover:underline flex items-center gap-1">
              查看全部
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {recentFiles.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CloudArrowUpIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">暂无文件</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors cursor-pointer group"
                    onClick={() => window.location.href = '/files'}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isImageFile(file.file_ext) ? (
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                          <img
                            src={file.thumbnail_url || file.public_url}
                            alt={file.display_name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', getFileIconConfig(file.file_ext).bgColor)}>
                          {getFileIconConfig(file.file_ext).icon}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">
                          {file.display_name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {formatFileSize(file.file_size)}
                          </span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">
                            {file.uploader?.display_name || '未知'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ClockIcon className="h-3.5 w-3.5" />
                        {new Date(file.created_at).toLocaleDateString('zh-CN', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      <ArrowRightIcon className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 工作区概览 - 仅当有 workspace_read 权限时显示 */}
      {hasWorkspaceRead && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">工作区概览</h2>
            <a href="/workspaces" className="text-sm text-primary hover:underline flex items-center gap-1">
              管理工作区
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {permittedWorkspaces.slice(0, 3).map((ws) => (
              <div
                key={ws.id}
                className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-all cursor-pointer group"
                onClick={() => window.location.href = '/workspaces'}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
                    {renderWorkspaceIcon(ws.icon)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">
                      {ws.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {ws.description || '暂无描述'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {permittedWorkspaces.length === 0 && (
              <div className="col-span-full text-center py-8 text-muted-foreground">
                <FolderIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">暂无工作区</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}