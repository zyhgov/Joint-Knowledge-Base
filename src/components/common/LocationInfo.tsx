import React, { useEffect, useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { fetchLocationInfo, refreshLocationInfo } from '@/services/locationService'
import type { LocationInfo as LocationInfoData } from '@/services/locationService'
import { fetchWeather, clearWeatherCache } from '@/services/weatherService'
import type { WeatherData } from '@/services/weatherService'
import {
  GlobeAltIcon,
  ComputerDesktopIcon,
  MapPinIcon,
  LanguageIcon,
  ShieldExclamationIcon,
  ClockIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import 'flag-icons/css/flag-icons.min.css'

const POLL_INTERVAL = 60_000 // 60 秒轮询检测网络变化

export default function LocationInfo() {
  const [location, setLocation] = useState<LocationInfoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const prevProxyRef = useRef<boolean | null>(null)

  // ===== 获取天气 =====
  const doFetchWeather = async (loc: LocationInfoData) => {
    if (!loc.city && !loc.prov) return
    setWeatherLoading(true)
    try {
      const w = await fetchWeather(loc)
      if (w) setWeather(w)
    } finally {
      setWeatherLoading(false)
    }
  }

  // ===== 初始加载 =====
  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetchLocationInfo().then((data) => {
      if (mounted) {
        setLocation(data)
        prevProxyRef.current = data.isProxy
        setLoading(false)
        // 并行拉天气
        doFetchWeather(data)
      }
    })
    return () => { mounted = false }
  }, [])

  // ===== 轮询检测网络/VPN 变更 =====
  useEffect(() => {
    if (loading) return

    const interval = setInterval(async () => {
      try {
        const newData = await refreshLocationInfo()
        const prevProxy = prevProxyRef.current

        setLocation(newData)
        prevProxyRef.current = newData.isProxy

        // Proxy 状态变化 -> 刷新天气
        if (prevProxy !== null && newData.isProxy !== prevProxy) {
          clearWeatherCache()
          doFetchWeather(newData)
          if (newData.isProxy) {
            showNetworkChangeToast('VPN_OPENED', newData)
          } else {
            showNetworkChangeToast('VPN_CLOSED', newData)
          }
        }
      } catch {
        // 静默失败
      }
    }, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [loading])

  const browserLanguage = navigator.language || 'zh-CN'
  const countryCode = location?.countryCode?.toLowerCase() || ''

  const topLabel =
    location?.city ||
    location?.prov ||
    location?.country ||
    location?.ip ||
    '定位中...'

  const isProxy = !!location?.isProxy

  return (
    <>
      {/* ===== 触发按钮 ===== */}
      <button
        onClick={() => setDialogOpen(true)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors text-xs',
          'hover:bg-accent',
          isProxy
            ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
            : 'text-muted-foreground hover:text-foreground',
          loading && 'opacity-50 cursor-wait'
        )}
        title={
          isProxy
            ? `⚠ ${location?.proxyDesc}`
            : location
              ? `${location.country} ${location.prov} ${location.city}`.trim() || location.ip
              : '查看网络位置信息'
        }
      >
        {isProxy && (
          <ShieldExclamationIcon className="h-4 w-4 text-amber-500 flex-shrink-0" />
        )}
        {countryCode ? (
          <span
            className={cn('fi', `fi-${countryCode}`, 'rounded-sm shadow-sm flex-shrink-0')}
            style={{ width: 22, height: 16, display: 'inline-block' }}
          />
        ) : (
          <GlobeAltIcon className="h-4 w-4 flex-shrink-0" />
        )}
        <span className="max-w-[80px] truncate font-medium">{topLabel}</span>
        {location?.ip && (
          <span className="hidden md:inline text-muted-foreground/70 font-mono tracking-tight text-[11px]">
            {location.ip}
          </span>
        )}
      </button>

      {/* ===== 详细信息弹窗 ===== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GlobeAltIcon className="h-5 w-5 text-primary" />
              网络位置信息
            </DialogTitle>
            <DialogDescription>
              当前设备的公网 IP、地理位置及网络状态
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
            {/* VPN/代理警告 */}
            {isProxy && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                <ShieldExclamationIcon className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                    检测到代理 / VPN
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    {location?.proxyDesc}
                  </p>
                </div>
              </div>
            )}

            {/* 国家 + 大号国旗 */}
            <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-xl">
              {countryCode ? (
                <span
                  className={cn('fi', `fi-${countryCode}`, 'rounded shadow-sm flex-shrink-0')}
                  style={{ width: 56, height: 40, display: 'inline-block' }}
                />
              ) : (
                <div className="w-14 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                  <GlobeAltIcon className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-base font-semibold text-foreground truncate">
                  {location?.country || '未知'}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {[location?.prov, location?.city].filter(Boolean).join(' · ') || ''}
                </p>
              </div>
            </div>

            {/* ===== ☀️ 实时天气 ===== */}
            {weather && (
              <div className="rounded-xl bg-gradient-to-br from-sky-50 to-blue-50 dark:from-sky-950/30 dark:to-blue-950/30 border border-sky-100 dark:border-sky-900 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    <span className="text-sm">{getWeatherEmoji(weather.weather)}</span>
                    实时天气 · {weather.city}
                  </p>
                  <span className="text-[10px] text-muted-foreground/50">
                    {weather.reporttime ? formatTime(weather.reporttime) : ''}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  {/* 大号温度 */}
                  <div className="flex-shrink-0">
                    <span className="text-3xl font-bold text-foreground tracking-tight">
                      {weather.temperature}°
                    </span>
                    <span className="text-sm text-muted-foreground ml-0.5">C</span>
                  </div>

                  {/* 天气详情 */}
                  <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <WeatherDetail label="天气" value={weather.weather} />
                    <WeatherDetail label="湿度" value={`${weather.humidity}%`} />
                    <WeatherDetail label="风向" value={weather.winddirection} />
                    <WeatherDetail label="风力" value={`${weather.windpower}级`} />
                  </div>
                </div>
              </div>
            )}

            {/* 天气加载中 */}
            {weatherLoading && !weather && (
              <div className="rounded-xl bg-muted/30 border border-border p-4 flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2" />
                <span className="text-xs text-muted-foreground">加载天气数据...</span>
              </div>
            )}

            {/* 详细信息列表 */}
            <div className="space-y-1">
              <InfoRow
                icon={<ComputerDesktopIcon className="h-4 w-4" />}
                label="公网 IP"
                value={location?.ip || '正在获取...'}
                monospace
              />

              <InfoRow
                icon={<MapPinIcon className="h-4 w-4" />}
                label="运营商"
                value={location?.isp || '未知'}
                scrollable
              />

              <InfoRow
                icon={<MapPinIcon className="h-4 w-4" />}
                label="位置信息"
                value={
                  [location?.country, location?.prov, location?.city]
                    .filter(Boolean)
                    .join(' · ') || '未知'
                }
                scrollable
              />

              <InfoRow
                icon={<GlobeAltIcon className="h-4 w-4" />}
                label="经纬度"
                value={
                  location?.lat != null && location?.lon != null
                    ? `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`
                    : '未知'
                }
                monospace
              />

              <InfoRow
                icon={<ClockIcon className="h-4 w-4" />}
                label="时区"
                value={location?.timezone || '未知'}
              />

              <InfoRow
                icon={<LanguageIcon className="h-4 w-4" />}
                label="浏览器语言"
                value={browserLanguage}
              />

              <InfoRow
                icon={
                  <ShieldExclamationIcon
                    className={cn('h-4 w-4', isProxy ? 'text-amber-500' : 'text-green-500')}
                  />
                }
                label="代理检测"
                value={isProxy ? '检测到 VPN / 代理' : '未检测到代理'}
                valueClassName={isProxy ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-green-600 dark:text-green-400'}
              />
            </div>

            {/* 说明 */}
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 leading-relaxed">
              <p>位置数据由 <strong>ipinfo.io</strong> 提供。</p>
              <p className="mt-1">天气数据由 <strong>高德地图</strong> 提供。</p>
              <p className="mt-1">代理检测基于 IP 特征库 + 浏览器时区比对，仅供参考。</p>
              <p className="mt-1 text-[10px] text-muted-foreground/50">
                每 60 秒自动检测网络环境变更
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ============ 工具函数 ============ */

/** 天气现象→emoji */
function getWeatherEmoji(weather: string): string {
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

/** 天气详情小标签 */
function WeatherDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

/** 格式化高德时间 "2025-03-18 14:30:00" → "14:30" */
function formatTime(reporttime: string): string {
  const match = reporttime.match(/(\d{2}:\d{2})$/)
  return match ? match[1] : reporttime.slice(11, 16)
}

/* ============ 网络变更通知吐司 ============ */

function showNetworkChangeToast(
  type: 'VPN_OPENED' | 'VPN_CLOSED',
  data: LocationInfoData
) {
  import('react-hot-toast').then(({ toast }) => {
    toast.custom(
      (t) => (
        <div
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-2xl ring-1 ring-black/5',
            'bg-white dark:bg-card',
            type === 'VPN_OPENED'
              ? 'border-amber-200 dark:border-amber-800'
              : 'border-green-200 dark:border-green-800'
          )}
          style={{ width: 360 }}
        >
          <div
            className={cn(
              'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
              type === 'VPN_OPENED'
                ? 'bg-amber-100 dark:bg-amber-900/30'
                : 'bg-green-100 dark:bg-green-900/30'
            )}
          >
            <ShieldExclamationIcon
              className={cn(
                'h-5 w-5',
                type === 'VPN_OPENED' ? 'text-amber-500' : 'text-green-500'
              )}
            />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {type === 'VPN_OPENED' ? '检测到 VPN / 代理已开启' : 'VPN / 代理已关闭'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {type === 'VPN_OPENED'
                ? data.proxyDesc || '网络出口发生变化'
                : '网络已恢复为直连'}
            </p>
            {data.ip && (
              <p className="text-[11px] font-mono text-muted-foreground/60 mt-1">
                IP: {data.ip}
              </p>
            )}
          </div>

          <button
            onClick={() => toast.dismiss(t.id)}
            className="flex-shrink-0 p-1 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      ),
      { duration: 8000, position: 'top-right' }
    )
  })
}

/* ============ 单行信息 ============ */

function InfoRow({
  icon,
  label,
  value,
  monospace = false,
  scrollable = false,
  valueClassName,
}: {
  icon: React.ReactNode
  label: string
  value: string
  monospace?: boolean
  scrollable?: boolean
  valueClassName?: string
}) {
  return (
    <div className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-muted/30 transition-colors">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div
          className={cn(
            'max-w-full',
            scrollable
              ? 'overflow-x-auto whitespace-nowrap scrollbar-thin'
              : 'truncate'
          )}
        >
          <span
            className={cn(
              'text-sm font-medium',
              monospace ? 'font-mono text-xs tracking-wide' : '',
              valueClassName || 'text-foreground'
            )}
          >
            {value}
          </span>
        </div>
      </div>
    </div>
  )
}
