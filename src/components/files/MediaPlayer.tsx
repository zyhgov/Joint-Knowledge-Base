import React, { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  XMarkIcon,
  PlayIcon,
  PauseIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  ArrowsPointingOutIcon,
  ArrowPathIcon,
  ForwardIcon,
  BackwardIcon,
} from '@heroicons/react/24/outline'

interface MediaPlayerProps {
  src: string
  title?: string
  type: 'video' | 'audio'
  poster?: string
  onClose?: () => void
  embedded?: boolean  // 内嵌模式：不显示关闭按钮，贴合容器
}

// 格式化时间
const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || !isFinite(seconds)) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function MediaPlayer({ src, title, type, poster, onClose, embedded = false }: MediaPlayerProps) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [buffered, setBuffered] = useState(0)
  const [loading, setLoading] = useState(true)

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 鼠标移动时显示控制栏
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (playing) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 3000)
    }
  }, [playing])

  // 播放/暂停
  const togglePlay = () => {
    if (!mediaRef.current) return
    if (playing) { mediaRef.current.pause() } else { mediaRef.current.play().catch(() => {}) }
  }

  // 进度跳转
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !mediaRef.current) return
    const rect = progressRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    mediaRef.current.currentTime = ratio * duration
  }

  // 音量
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    setVolume(v)
    if (mediaRef.current) mediaRef.current.volume = v
    setMuted(v === 0)
  }

  // 全屏
  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!fullscreen) {
      containerRef.current.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }

  // 快进/快退
  const seek = (delta: number) => {
    if (!mediaRef.current) return
    mediaRef.current.currentTime = Math.max(0, Math.min(duration, currentTime + delta))
  }

  // 事件监听
  useEffect(() => {
    const media = mediaRef.current
    if (!media) return

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onTimeUpdate = () => {
      setCurrentTime(media.currentTime)
      // 缓冲进度
      if (media.buffered.length > 0) {
        setBuffered(media.buffered.end(media.buffered.length - 1))
      }
    }
    const onLoadedMetadata = () => {
      setDuration(media.duration)
      setLoading(false)
    }
    const onWaiting = () => setLoading(true)
    const onCanPlay = () => setLoading(false)

    media.addEventListener('play', onPlay)
    media.addEventListener('pause', onPause)
    media.addEventListener('timeupdate', onTimeUpdate)
    media.addEventListener('loadedmetadata', onLoadedMetadata)
    media.addEventListener('waiting', onWaiting)
    media.addEventListener('canplay', onCanPlay)

    return () => {
      media.removeEventListener('play', onPlay)
      media.removeEventListener('pause', onPause)
      media.removeEventListener('timeupdate', onTimeUpdate)
      media.removeEventListener('loadedmetadata', onLoadedMetadata)
      media.removeEventListener('waiting', onWaiting)
      media.removeEventListener('canplay', onCanPlay)
    }
  }, [])

  // 全屏监听
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // 键盘控制
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
        case 'k': e.preventDefault(); togglePlay(); break
        case 'ArrowLeft': e.preventDefault(); seek(-5); break
        case 'ArrowRight': e.preventDefault(); seek(5); break
        case 'ArrowUp': e.preventDefault(); setVolume(v => Math.min(1, v + 0.1)); break
        case 'ArrowDown': e.preventDefault(); setVolume(v => Math.max(0, v - 0.1)); break
        case 'f': e.preventDefault(); toggleFullscreen(); break
        case 'm': e.preventDefault(); setMuted(m => !m); break
        case 'Escape': onClose?.(); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentTime, duration, onClose])

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0

  return (
    <div
      ref={containerRef}
      className={cn(
        embedded
          ? 'relative w-full h-full bg-black/90 rounded-xl overflow-hidden'
          : 'fixed inset-0 z-50 flex items-center justify-center bg-black'
      )}
      onMouseMove={showControlsTemporarily}
    >
      {/* 关闭按钮 - 内嵌模式不显示 */}
      {!embedded && (
        <button
          onClick={onClose}
          className={cn(
            'absolute top-4 right-4 z-20 p-2 rounded-full transition-all duration-300',
            'bg-white/10 backdrop-blur-md text-white/80 hover:bg-white/20 hover:text-white',
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      )}

      {/* 标题 */}
      {title && (
        <div className={cn(
          'absolute top-4 left-4 z-20 transition-all duration-300',
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}>
          <p className="text-white/90 text-sm font-medium bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full">
            {title}
          </p>
        </div>
      )}

      {/* 视频元素 */}
      {type === 'video' && (
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          src={src}
          poster={poster}
          className="w-full h-full object-contain"
          onClick={togglePlay}
          playsInline
        />
      )}

      {/* 音频元素 + 可视化背景 */}
      {type === 'audio' && (
        <div className="flex flex-col items-center gap-8" onClick={togglePlay}>
          <div className="w-48 h-48 rounded-2xl bg-gradient-to-br from-pink-500/30 via-purple-500/30 to-blue-500/30 backdrop-blur-xl flex items-center justify-center shadow-2xl">
            <SpeakerWaveIcon className="h-20 w-20 text-white/60" />
          </div>
          {title && <p className="text-white/80 text-lg font-medium">{title}</p>}
          <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={src} />
        </div>
      )}

      {/* 加载指示器 */}
      {loading && playing && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-white/80 animate-spin" />
        </div>
      )}

      {/* 大播放按钮（暂停时显示） */}
      {!playing && !loading && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center z-10 cursor-pointer"
        >
          <div className="w-20 h-20 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center hover:bg-white/25 transition-colors shadow-2xl">
            <PlayIcon className="h-10 w-10 text-white ml-1" />
          </div>
        </button>
      )}

      {/* 玻璃磨砂控制栏 */}
      <div className={cn(
        'absolute bottom-0 left-0 right-0 z-20 transition-all duration-300',
        showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      )}>
        {/* 渐变遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none" />

        <div className="relative px-6 pb-6 pt-12">
          {/* 进度条 - 玻璃磨砂质感 */}
          <div
            ref={progressRef}
            onClick={handleProgressClick}
            className="group relative h-1.5 rounded-full cursor-pointer mb-4 hover:h-2.5 transition-all"
          >
            {/* 缓冲进度 */}
            <div className="absolute inset-0 rounded-full bg-white/10 backdrop-blur-sm" />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/20"
              style={{ width: `${bufferedProgress}%` }}
            />
            {/* 播放进度 */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400 to-blue-400"
              style={{ width: `${progress}%` }}
            />
            {/* 进度指示点 */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white shadow-lg shadow-cyan-400/30 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${progress}%` }}
            />
          </div>

          {/* 控制按钮行 - 玻璃磨砂背景 */}
          <div className="flex items-center gap-3">
            {/* 快退 */}
            <button onClick={() => seek(-10)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/70 hover:text-white" title="快退10秒">
              <BackwardIcon className="h-4 w-4" />
            </button>

            {/* 播放/暂停 */}
            <button onClick={togglePlay} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white">
              {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
            </button>

            {/* 快进 */}
            <button onClick={() => seek(10)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/70 hover:text-white" title="快进10秒">
              <ForwardIcon className="h-4 w-4" />
            </button>

            {/* 时间 */}
            <span className="text-xs text-white/60 font-mono tabular-nums min-w-[100px]">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {/* 间隔 */}
            <div className="flex-1" />

            {/* 音量 */}
            <div className="flex items-center gap-1.5 group/vol">
              <button
                onClick={() => { setMuted(!muted); if (mediaRef.current) mediaRef.current.muted = !muted }}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/70 hover:text-white"
              >
                {muted || volume === 0 ? <SpeakerXMarkIcon className="h-4 w-4" /> : <SpeakerWaveIcon className="h-4 w-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-0 group-hover/vol:w-20 transition-all duration-200 h-1 accent-white cursor-pointer bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              />
            </div>

            {/* 全屏 */}
            {type === 'video' && (
              <button onClick={toggleFullscreen} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/70 hover:text-white" title="全屏">
                <ArrowsPointingOutIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
