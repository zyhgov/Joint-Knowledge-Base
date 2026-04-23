import React, { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { usePoemStore, PoemItem } from '@/store/poemStore'
import { userService } from '@/services/userService'
import { toast } from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UserCircleIcon, KeyIcon, PaintBrushIcon, BookOpenIcon } from '@heroicons/react/24/outline'
import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/solid'
import { cn } from '@/lib/utils'
import AvatarUpload from '@/components/common/AvatarUpload'

export default function Settings() {
  const { user, initAuth } = useAuthStore()
  const { theme, setTheme } = useThemeStore()

  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  // 当 user 数据加载完成后同步到表单
  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '')
      setBio(user.bio || '')
    }
  }, [user?.id]) // 只在 user.id 变化时重置，避免输入中途被覆盖

  // 保存个人信息
  const handleSaveProfile = async () => {
    if (!user) return

    if (!displayName.trim()) {
      toast.error('显示名称不能为空')
      return
    }

    setSavingProfile(true)
    try {
      await userService.updateUser(user.id, {
        display_name: displayName.trim(),
        bio: bio.trim(),
      })
      await initAuth()
      toast.success('个人信息已保存')
    } catch (error: any) {
      toast.error(error.message || '保存失败')
    } finally {
      setSavingProfile(false)
    }
  }

  // 修改密码
  const handleChangePassword = async () => {
    if (!user) return

    if (!newPassword) {
      toast.error('请输入新密码')
      return
    }

    if (newPassword.length < 6) {
      toast.error('密码长度不能少于 6 位')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('两次输入的密码不一致')
      return
    }

    setSavingPassword(true)
    try {
      await userService.updatePassword(user.id, newPassword)
      setNewPassword('')
      setConfirmPassword('')
      toast.success('密码已更新')
    } catch (error: any) {
      toast.error(error.message || '修改密码失败')
    } finally {
      setSavingPassword(false)
    }
  }

  const themeOptions = [
    { value: 'light', label: '亮色', icon: SunIcon },
    { value: 'dark', label: '暗色', icon: MoonIcon },
    { value: 'system', label: '跟随系统', icon: ComputerDesktopIcon },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">设置</h1>
        <p className="text-muted-foreground mt-1">
          管理您的账户信息和系统偏好
        </p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className={cn('grid w-full mb-6', user?.role === 'super_admin' ? 'grid-cols-4' : 'grid-cols-3')}>
          <TabsTrigger value="profile" className="gap-2">
            <UserCircleIcon className="h-4 w-4" />
            <span className="hidden sm:inline">个人资料</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <KeyIcon className="h-4 w-4" />
            <span className="hidden sm:inline">安全</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <PaintBrushIcon className="h-4 w-4" />
            <span className="hidden sm:inline">外观</span>
          </TabsTrigger>
          {user?.role === 'super_admin' && (
            <TabsTrigger value="poems" className="gap-2">
              <BookOpenIcon className="h-4 w-4" />
              <span className="hidden sm:inline">古诗管理</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* ===== 个人资料 ===== */}
        <TabsContent value="profile">
          <div className="bg-card border border-border rounded-xl p-6 space-y-6">
            {/* 头像上传区 */}
            <div className="flex flex-col items-center pb-6 border-b border-border">
              <AvatarUpload size="xl" />
            </div>

            {/* 表单 */}
            <div className="space-y-4">
              {/* 显示名称 */}
              <div>
                <Label htmlFor="display-name">显示名称</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="请输入显示名称"
                  className="mt-2"
                  maxLength={50}
                />
              </div>

              {/* 手机号（只读） */}
              <div>
                <Label htmlFor="phone">手机号</Label>
                <Input
                  id="phone"
                  value={user?.phone || ''}
                  disabled
                  className="mt-2 bg-muted cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  手机号是登录凭据，如需修改请联系管理员
                </p>
              </div>

              {/* 个人简介 */}
              <div>
                <Label htmlFor="bio">个人简介</Label>
                <textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="简单介绍一下自己..."
                  rows={3}
                  maxLength={200}
                  className="mt-2 w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/20 transition-all"
                />
                <p className="text-xs text-muted-foreground text-right mt-1">
                  {bio.length}/200
                </p>
              </div>
            </div>

            {/* 保存按钮 */}
            <div className="flex justify-end pt-2 border-t border-border">
              <Button
                onClick={handleSaveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? '保存中...' : '保存更改'}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ===== 安全 ===== */}
        <TabsContent value="security">
          <div className="bg-card border border-border rounded-xl p-6 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                修改密码
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                建议定期更换密码以保障账户安全
              </p>
            </div>

            <div className="space-y-4">
              {/* 新密码 */}
              <div>
                <Label htmlFor="new-password">新密码</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少 6 位"
                  className="mt-2"
                />
              </div>

              {/* 确认密码 */}
              <div>
                <Label htmlFor="confirm-password">确认新密码</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                  className="mt-2"
                />
                {/* 密码匹配提示 */}
                {confirmPassword.length > 0 && (
                  <p
                    className={cn(
                      'text-xs mt-1',
                      newPassword === confirmPassword
                        ? 'text-green-500'
                        : 'text-destructive'
                    )}
                  >
                    {newPassword === confirmPassword
                      ? '密码一致'
                      : '密码不一致'}
                  </p>
                )}
              </div>
            </div>

            {/* 密码强度提示 */}
            {newPassword.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">密码强度</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((level) => {
                    const strength =
                      newPassword.length >= 12
                        ? 4
                        : newPassword.length >= 8
                        ? 3
                        : newPassword.length >= 6
                        ? 2
                        : 1
                    return (
                      <div
                        key={level}
                        className={cn(
                          'h-1.5 flex-1 rounded-full transition-colors',
                          level <= strength
                            ? strength === 1
                              ? 'bg-destructive'
                              : strength === 2
                              ? 'bg-orange-400'
                              : strength === 3
                              ? 'bg-yellow-400'
                              : 'bg-green-500'
                            : 'bg-muted'
                        )}
                      />
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {newPassword.length >= 12
                    ? '强'
                    : newPassword.length >= 8
                    ? '中等'
                    : newPassword.length >= 6
                    ? '弱'
                    : '太短'}
                </p>
              </div>
            )}

            {/* 保存按钮 */}
            <div className="flex justify-end pt-2 border-t border-border">
              <Button
                onClick={handleChangePassword}
                disabled={
                  savingPassword ||
                  !newPassword ||
                  !confirmPassword ||
                  newPassword !== confirmPassword
                }
              >
                {savingPassword ? '更新中...' : '更新密码'}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ===== 外观 ===== */}
        <TabsContent value="appearance">
          <div className="bg-card border border-border rounded-xl p-6 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground">主题</h3>
              <p className="text-sm text-muted-foreground mt-1">
                选择您偏好的界面主题风格
              </p>
            </div>

            {/* 主题选择 */}
            <div className="grid grid-cols-3 gap-4">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() =>
                    setTheme(option.value as 'light' | 'dark' | 'system')
                  }
                  className={cn(
                    'relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all hover:shadow-md',
                    theme === option.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40 hover:bg-accent/50'
                  )}
                >
                  <option.icon
                    className={cn(
                      'h-7 w-7',
                      theme === option.value
                        ? 'text-primary'
                        : 'text-muted-foreground'
                    )}
                  />
                  <span
                    className={cn(
                      'text-sm font-medium',
                      theme === option.value
                        ? 'text-primary'
                        : 'text-foreground'
                    )}
                  >
                    {option.label}
                  </span>

                  {/* 选中指示点 */}
                  {theme === option.value && (
                    <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>

            {/* 主题预览 */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="bg-muted px-4 py-2 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <div className="w-2 h-2 rounded-full bg-yellow-400" />
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-xs text-muted-foreground ml-2">
                  预览
                </span>
              </div>
              <div className="p-5 bg-background space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary flex-shrink-0" />
                  <div className="space-y-1 flex-1">
                    <div className="h-2.5 bg-foreground/20 rounded-full w-24" />
                    <div className="h-2 bg-muted rounded-full w-16" />
                  </div>
                </div>
                <div className="h-3 bg-muted rounded-full w-full" />
                <div className="h-3 bg-muted rounded-full w-5/6" />
                <div className="h-3 bg-muted rounded-full w-4/6" />
                <div className="flex gap-2 pt-1">
                  <div className="h-8 bg-primary rounded-lg flex-1" />
                  <div className="h-8 bg-secondary rounded-lg w-20" />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ===== 古诗管理 ===== */}
        {user?.role === 'super_admin' && (
          <TabsContent value="poems">
            <PoemManagement />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

// 古诗管理组件
function PoemManagement() {
  const { poems, addPoem, updatePoem, deletePoem, togglePoem, togglePinned, setWeight, reorderPoems } = usePoemStore()
  const [newText, setNewText] = useState('')
  const [newAuthor, setNewAuthor] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editAuthor, setEditAuthor] = useState('')

  const handleAdd = () => {
    if (!newText.trim()) {
      toast.error('请输入古诗内容')
      return
    }
    addPoem({ text: newText.trim(), author: newAuthor.trim() || '佚名', enabled: true, pinned: false, weight: 1 })
    setNewText('')
    setNewAuthor('')
    toast.success('古诗已添加')
  }

  const handleEdit = (poem: PoemItem) => {
    setEditingId(poem.id)
    setEditText(poem.text)
    setEditAuthor(poem.author)
  }

  const handleSaveEdit = () => {
    if (!editingId) return
    if (!editText.trim()) {
      toast.error('古诗内容不能为空')
      return
    }
    updatePoem(editingId, { text: editText.trim(), author: editAuthor.trim() || '佚名' })
    setEditingId(null)
    toast.success('古诗已更新')
  }

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      reorderPoems(index, index - 1)
    }
  }

  const handleMoveDown = (index: number) => {
    if (index < poems.length - 1) {
      reorderPoems(index, index + 1)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <BookOpenIcon className="h-5 w-5 text-primary" />
          加载页古诗管理
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          管理系统初始化加载页面展示的古诗。支持启用/禁用、置顶优先展示、权重调整出现概率
        </p>
      </div>

      {/* 添加古诗 */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">添加新古诗</p>
        <div className="space-y-2">
          <div>
            <Label htmlFor="poem-text">古诗内容</Label>
            <Input
              id="poem-text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="如：大漠孤烟直，长河落日圆。"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="poem-author">作者</Label>
            <Input
              id="poem-author"
              value={newAuthor}
              onChange={(e) => setNewAuthor(e.target.value)}
              placeholder="如：王维"
              className="mt-1"
            />
          </div>
          <Button onClick={handleAdd} size="sm">添加</Button>
        </div>
      </div>

      {/* 古诗列表 */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          古诗列表（共 {poems.length} 首，已启用 {poems.filter(p => p.enabled).length} 首，置顶 {poems.filter(p => p.pinned && p.enabled).length} 首）
        </p>
        {poems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            暂无古诗，请添加
          </div>
        ) : (
          <div className="space-y-2">
            {poems.map((poem, index) => (
              <div
                key={poem.id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                  poem.enabled
                    ? 'border-border bg-background'
                    : 'border-border bg-muted/30 opacity-60'
                )}
              >
                {/* 序号和排序 */}
                <div className="flex flex-col items-center gap-0.5 flex-shrink-0 pt-1">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="p-0.5 hover:bg-accent rounded disabled:opacity-30"
                    title="上移"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <span className="text-xs text-muted-foreground w-4 text-center">{index + 1}</span>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === poems.length - 1}
                    className="p-0.5 hover:bg-accent rounded disabled:opacity-30"
                    title="下移"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>

                {/* 内容区 */}
                <div className="flex-1 min-w-0">
                  {editingId === poem.id ? (
                    <div className="space-y-2">
                      <Input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="text-sm"
                      />
                      <div className="flex items-center gap-2">
                        <Input
                          value={editAuthor}
                          onChange={(e) => setEditAuthor(e.target.value)}
                          placeholder="作者"
                          className="text-sm w-32"
                        />
                        <Button onClick={handleSaveEdit} size="sm" className="h-8 text-xs">保存</Button>
                        <Button onClick={() => setEditingId(null)} size="sm" variant="outline" className="h-8 text-xs">取消</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className={cn('text-sm', poem.enabled ? 'text-foreground' : 'text-muted-foreground')}>
                        {poem.text}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        —— {poem.author}
                      </p>
                    </>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                  {/* 置顶 */}
                  <button
                    onClick={() => togglePinned(poem.id)}
                    className={cn(
                      'p-1.5 rounded transition-colors',
                      poem.pinned
                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                        : 'hover:bg-accent text-muted-foreground'
                    )}
                    title={poem.pinned ? '取消置顶' : '置顶（优先展示）'}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill={poem.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={poem.pinned ? 0 : 1.5}>
                      <path d="M3 3l3.5 7L3 17h6l3.5-7L9 3H3zm8 0l3.5 7L11 17h6l3.5-7L17 3h-6z" />
                    </svg>
                  </button>
                  {/* 权重 */}
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => setWeight(poem.id, (poem.weight || 1) - 1)}
                      disabled={(poem.weight || 1) <= 1}
                      className="p-0.5 hover:bg-accent rounded disabled:opacity-30 text-muted-foreground"
                      title="降低权重"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <span className={cn(
                      'text-xs w-5 text-center font-medium',
                      (poem.weight || 1) > 1 ? 'text-primary' : 'text-muted-foreground'
                    )}>
                      {poem.weight || 1}
                    </span>
                    <button
                      onClick={() => setWeight(poem.id, (poem.weight || 1) + 1)}
                      disabled={(poem.weight || 1) >= 10}
                      className="p-0.5 hover:bg-accent rounded disabled:opacity-30 text-muted-foreground"
                      title="提高权重"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                  {/* 启用/禁用 */}
                  <button
                    onClick={() => togglePoem(poem.id)}
                    className={cn(
                      'px-2 py-1 rounded text-xs transition-colors',
                      poem.enabled
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    )}
                    title={poem.enabled ? '点击禁用' : '点击启用'}
                  >
                    {poem.enabled ? '已启用' : '已禁用'}
                  </button>
                  {editingId !== poem.id && (
                    <button
                      onClick={() => handleEdit(poem)}
                      className="p-1.5 hover:bg-accent rounded transition-colors"
                      title="编辑"
                    >
                      <svg className="h-4 w-4 text-muted-foreground" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm('确定删除这首古诗吗？')) {
                        deletePoem(poem.id)
                        toast.success('古诗已删除')
                      }
                    }}
                    className="p-1.5 hover:bg-destructive/10 rounded transition-colors"
                    title="删除"
                  >
                    <svg className="h-4 w-4 text-muted-foreground hover:text-destructive" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}