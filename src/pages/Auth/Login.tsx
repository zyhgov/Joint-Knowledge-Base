import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'react-hot-toast'

// 登录页左侧轮播图片
const LOGIN_IMAGES = [
  '/login-img/Grass.webp',
  '/login-img/Frame.webp',
  '/login-img/wuhan.webp',
  '/login-img/wuhan2.webp',
  '/login-img/wuhan3.webp',
]

// 生成简单数学验证题
function generateMathCaptcha() {
  const ops = ['+', '-']
  const op = ops[Math.floor(Math.random() * 2)]
  let a: number, b: number
  if (op === '+') {
    // 加法：两个1~20的数相加，结果不超过40
    a = Math.floor(Math.random() * 20) + 1
    b = Math.floor(Math.random() * 20) + 1
  } else {
    // 减法：大数减小数，结果不为负
    a = Math.floor(Math.random() * 20) + 10
    b = Math.floor(Math.random() * (a - 1)) + 1
  }
  return { a, b, op }
}

export default function Login() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [mathAnswer, setMathAnswer] = useState('')
  const { login, isLoading, isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  // ======== 图片轮播 ========
  const [currentImgIndex, setCurrentImgIndex] = useState(() =>
    Math.floor(Math.random() * LOGIN_IMAGES.length)
  )
  const [nextImgIndex, setNextImgIndex] = useState<number | null>(null)
  const [transitioning, setTransitioning] = useState(false)
  const imgTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    imgTimerRef.current = setInterval(() => {
      setNextImgIndex((prev) => {
        const current = prev !== null ? prev : currentImgIndex
        return (current + 1) % LOGIN_IMAGES.length
      })
      setTransitioning(true)
    }, 6000)

    return () => {
      if (imgTimerRef.current) clearInterval(imgTimerRef.current)
    }
  }, [currentImgIndex])

  // 图片过渡完成后的回调
  const handleTransitionEnd = useCallback(() => {
    if (transitioning && nextImgIndex !== null) {
      setCurrentImgIndex(nextImgIndex)
      setNextImgIndex(null)
      setTransitioning(false)
    }
  }, [transitioning, nextImgIndex])

  // ======== 数学验证码 ========
  const [mathCaptcha, setMathCaptcha] = useState(generateMathCaptcha)

  const correctAnswer = (() => {
    if (mathCaptcha.op === '+') return mathCaptcha.a + mathCaptcha.b
    return mathCaptcha.a - mathCaptcha.b
  })()

  const refreshCaptcha = () => {
    setMathCaptcha(generateMathCaptcha())
    setMathAnswer('')
  }

  // ======== 认证跳转 ========
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phone || !password) {
      toast.error('请输入手机号和密码')
      return
    }
    if (!mathAnswer) {
      toast.error('请完成验证')
      return
    }
    if (parseInt(mathAnswer) !== correctAnswer) {
      toast.error('验证答案不正确')
      refreshCaptcha()
      return
    }
    try {
      await login(phone, password)
      toast.success('登录成功，欢迎回来！')
    } catch (error: any) {
      toast.error(error.message || '登录失败，请重试')
      refreshCaptcha()
    }
  }

  const currentYear = new Date().getFullYear()

  return (
    <div className="min-h-screen flex">
      {/* 左侧图片区 - 大屏显示 */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        {/* 背景图片 - 当前图 */}
        <img
          key={`current-${currentImgIndex}`}
          src={LOGIN_IMAGES[currentImgIndex]}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* 背景图片 - 下一张（淡入） */}
        {transitioning && nextImgIndex !== null && (
          <img
            key={`next-${nextImgIndex}`}
            src={LOGIN_IMAGES[nextImgIndex]}
            alt=""
            className="absolute inset-0 w-full h-full object-cover animate-fade-in"
            onLoad={handleTransitionEnd}
            onError={handleTransitionEnd}
          />
        )}
        {/* 深色遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-black/70" />

        {/* 左侧内容 */}
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full text-white">
          {/* 顶部品牌 */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="text-xl font-semibold tracking-wide">联合知识库</span>
          </div>

          {/* 中部主文案 */}
          <div className="space-y-6 max-w-lg">
            <h1 className="text-4xl xl:text-5xl font-bold leading-tight tracking-tight">
              让团队协作<br />如呼吸般自然
            </h1>
            <p className="text-lg text-white/75 leading-relaxed max-w-md">
              安全、高效的协作文档与知识管理平台，助力团队跨越信息孤岛，实现知识共创与共享。
            </p>

            {/* 特性列表 */}
            <div className="flex flex-col gap-4 pt-4">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center shrink-0">
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium">企业级安全保障</p>
                  <p className="text-xs text-white/50">RBAC 权限体系，数据端到端加密</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center shrink-0">
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium">实时多人协作</p>
                  <p className="text-xs text-white/50">同时编辑，光标同步，所见即所得</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center shrink-0">
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium">全生命周期管理</p>
                  <p className="text-xs text-white/50">文档创建、协作、归档，一站式完成</p>
                </div>
              </div>
            </div>
          </div>

          {/* 底部版权与安全信息 */}
          <div className="space-y-2">
            <p className="text-xs text-white/30">
              © {currentYear} 联合库UNHub · 杖雍皓制作
            </p>
            <div className="flex items-center gap-1.5 text-white/25">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <span className="text-[11px]">Cloudflare 提供全程网络安全与防护</span>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧登录区 */}
      <div className="flex-1 flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-[400px] space-y-8">
          {/* 移动端品牌 */}
          <div className="lg:hidden text-center space-y-3 mb-4">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-primary/10 rounded-2xl">
              <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-foreground">联合知识库</h1>
            <p className="text-sm text-muted-foreground">安全高效的团队协作平台</p>
          </div>

          {/* 标题 */}
          <div>
            <h2 className="text-2xl font-semibold text-foreground">欢迎登录</h2>
            <p className="text-muted-foreground mt-1.5 text-sm">请输入您的账号信息以继续</p>
          </div>

          {/* 登录表单 */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                手机号
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="请输入手机号"
                autoComplete="off"
                className="w-full h-11 px-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="off"
                className="w-full h-11 px-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
                disabled={isLoading}
              />
            </div>

            {/* 数学验证码 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                安全验证
              </label>
              <div className="flex gap-3">
                <div className="h-11 px-4 rounded-xl border border-input bg-muted flex items-center gap-2 min-w-[140px] select-none">
                  <span className="text-sm font-semibold text-foreground">
                    {mathCaptcha.a} {mathCaptcha.op} {mathCaptcha.b} = ?
                  </span>
                  <button
                    type="button"
                    onClick={refreshCaptcha}
                    className="p-1 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground shrink-0"
                    title="换一题"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                    </svg>
                  </button>
                </div>
                <input
                  type="number"
                  value={mathAnswer}
                  onChange={(e) => setMathAnswer(e.target.value)}
                  placeholder="答案"
                  autoComplete="off"
                  className="flex-1 h-11 px-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
                  disabled={isLoading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full h-11 rounded-xl font-medium text-white transition-all text-sm ${
                isLoading
                  ? 'bg-primary/60 cursor-not-allowed'
                  : 'bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  登录中...
                </span>
              ) : (
                '登录'
              )}
            </button>
          </form>

          <footer className="text-center space-y-1 pt-4">
            <p className="text-xs text-muted-foreground">© {currentYear} 联合库UNHub · 杖雍皓制作</p>
            <div className="flex items-center justify-center gap-1 text-muted-foreground/60">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <span className="text-[11px]">Cloudflare 提供全程网络安全与防护</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}
