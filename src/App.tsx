import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { usePoemStore, type PoemItem } from '@/store/poemStore'
import { Toaster } from 'react-hot-toast'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import MainLayout from '@/components/layout/MainLayout'
import Login from '@/pages/Auth/Login'
import Dashboard from '@/pages/Dashboard/Dashboard'
import Settings from '@/pages/Settings/Settings'
import UserManagement from '@/pages/Admin/UserManagement'
import RoleManagement from '@/pages/Admin/RoleManagement'
import DepartmentManagement from '@/pages/Admin/DepartmentManagement'
import NotificationManagement from '@/pages/Admin/NotificationManagement'
import AnnouncementManagement from '@/pages/Admin/AnnouncementManagement'
import FilesPage from '@/pages/Files/FilesPage'
import FileShareView from '@/pages/Files/FileShareView'
import WorkspacesPage from '@/pages/Workspaces/WorkspacesPage'
import FileStats from '@/pages/Stats/FileStats'
import TransferFanStats from '@/pages/Stats/TransferFanStats'
import DocumentsPage from '@/pages/Document/DocumentsPage'
import { DocumentEditorWrapper } from '@/pages/Document/DocumentEditor'
import DocumentShareView from '@/pages/Document/DocumentShareView'
import TransferFanPage from '@/pages/TransferFan/TransferFanPage'
import AIChat from '@/pages/AIChat/AIChat'
import AIChatAdmin from '@/pages/AIChat/AIChatAdmin'
import PreviewPlaceholder from '@/pages/Admin/PreviewPlaceholder'
import RuoshanPage from '@/pages/Ruoshan/RuoshanPage'
import ChatPage from '@/pages/Chat/ChatPage'
import ChatManagement from '@/pages/Admin/ChatManagement'

// Windows 10/11 风格加载页
function LoadingScreen() {
  const { getWeightedRandomPoem } = usePoemStore()
  const [currentPoem, setCurrentPoem] = useState<PoemItem | null>(null)
  const [poemKey, setPoemKey] = useState(0)

  // 初始随机加载一条
  useEffect(() => {
    const first = getWeightedRandomPoem()
    if (first) setCurrentPoem(first)
  }, [getWeightedRandomPoem])

  // 每3秒加权随机切换下一条（不重复上一条）
  useEffect(() => {
    if (!currentPoem) return
    const timer = setInterval(() => {
      const next = getWeightedRandomPoem(currentPoem.id)
      if (next) {
        setCurrentPoem(next)
        setPoemKey((prev) => prev + 1)
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [currentPoem?.id, getWeightedRandomPoem])

  // 旋转粒子样式（内联样式，避免 Tailwind 干扰）
  const dotStyle = (delay: number): React.CSSProperties => ({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    justifyContent: 'center',
    animation: `win-dot-spin 2s ${delay}ms infinite`,
  })

  return (
    <div style={{
      height: '100vh', width: '100vw',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#005a9e', color: 'white',
      userSelect: 'none', overflow: 'hidden',
    }}>
      {/* 旋转粒子 - 居中偏上 */}
      <div style={{ marginBottom: 64 }}>
        <div style={{ width: 60, height: 60, position: 'relative' }}>
          <div style={dotStyle(0)}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.9)' }} />
          </div>
          <div style={dotStyle(100)}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.9)' }} />
          </div>
          <div style={dotStyle(200)}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.9)' }} />
          </div>
          <div style={dotStyle(300)}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.9)' }} />
          </div>
          <div style={dotStyle(400)}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.9)' }} />
          </div>
        </div>
      </div>

      {/* 古诗词 */}
      <div style={{
        textAlign: 'center', marginBottom: 32,
        minHeight: 100, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        {currentPoem && (
          <div key={poemKey} className="poem-fade-in">
            <p style={{
              fontSize: 22, fontWeight: 300,
              letterSpacing: '0.25em', marginBottom: 8,
              opacity: 0.9, fontFamily: '"KaiTi", "STKaiti", serif',
            }}>
              {currentPoem.text}
            </p>
            <p style={{
              fontSize: 14, opacity: 0.5, letterSpacing: '0.1em',
            }}>
              —— {currentPoem.author}
            </p>
          </div>
        )}
      </div>

      {/* 请稍等... */}
      <p style={{
        fontSize: 16, opacity: 0.6, letterSpacing: '0.2em',
        fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif',
      }}>
        请稍等...
      </p>
    </div>
  )
}
function App() {
  const { initAuth, isAuthenticated, isLoading } = useAuthStore()
  const { updateActualTheme } = useThemeStore()

  useEffect(() => {
    initAuth()
    updateActualTheme()
  }, [])

  if (isLoading) {
    return <LoadingScreen />
  }

  return (
    <Router>
      <Toaster
        position="top-center"
        reverseOrder={false}
        toastOptions={{
          className: 'bg-card border border-border text-foreground',
          duration: 3000,
        }}
      />
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* 分享页面 - 不需要登录 */}
        <Route
          path="/share/doc/:shareCode"
          element={<DocumentShareView />}
        />
        <Route
          path="/share/:shareCode"
          element={<FileShareView />}
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <MainLayout title="仪表板">
                <Dashboard />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <MainLayout title="设置">
                <Settings />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/users"
          element={
            <ProtectedRoute requiredPerms={['user_read', 'user_manage']}>
              <MainLayout title="用户管理">
                <UserManagement />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/roles"
          element={
            <ProtectedRoute requiredPerms={['role_read', 'role_manage']}>
              <MainLayout title="角色权限">
                <RoleManagement />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/departments"
          element={
            <ProtectedRoute requiredPerms={['department_read', 'department_manage']}>
              <MainLayout title="部门管理">
                <DepartmentManagement />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/hr"
          element={
            <ProtectedRoute requiredPerms={['hr_read', 'hr_manage']}>
              <MainLayout title="人力资源管理">
                <PreviewPlaceholder title="人力资源管理" />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/approval"
          element={
            <ProtectedRoute requiredPerms={['approval_read', 'approval_manage']}>
              <MainLayout title="审批管理">
                <PreviewPlaceholder title="审批管理" />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/ai-chat"
          element={
            <ProtectedRoute requiredPerms={['ai_chat_manage']}>
              <MainLayout title="AI 对话管理">
                <AIChatAdmin />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/files"
          element={
            <ProtectedRoute requiredPerms={['file_read']}>
              <MainLayout title="文件管理">
                <FilesPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/workspaces"
          element={
            <ProtectedRoute requiredPerms={['workspace_read']}>
              <MainLayout title="工作区">
                <WorkspacesPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/notifications"
          element={
            <ProtectedRoute requiredPerms={['notification_read', 'notification_manage']}>
              <MainLayout title="通知管理">
                <NotificationManagement />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/announcements"
          element={
            <ProtectedRoute requiredPerms={['announcement_read', 'announcement_manage']}>
              <MainLayout title="公告与任务">
                <AnnouncementManagement />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/stats"
          element={
            <ProtectedRoute requiredPerms={['stats_read']}>
              <MainLayout title="文件统计">
                <FileStats />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        {/* 转粉统计 */}
        <Route
          path="/stats/transfer-fan"
          element={
            <ProtectedRoute requiredPerms={['stats_read']}>
              <MainLayout title="转粉统计">
                <TransferFanStats />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        {/* 协作文档 */}
        <Route
          path="/documents"
          element={
            <ProtectedRoute requiredPerms={['document_read']}>
              <MainLayout title="协作文档">
                <DocumentsPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/documents/:docId"
          element={
            <ProtectedRoute requiredPerms={['document_read']}>
              <MainLayout title="文档编辑">
                <DocumentEditorWrapper />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        {/* 转粉工单 */}
        <Route
          path="/ai-chat"
          element={
            <ProtectedRoute requiredPerms={['ai_chat_read']}>
              <MainLayout title="和豆包聊聊" noPadding>
                <AIChat />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        {/* 转粉工单 */}
        <Route
          path="/transfer-fan"
          element={
            <ProtectedRoute requiredPerms={['transfer_fan_read', 'transfer_fan_create', 'transfer_fan_manage']}>
              <MainLayout title="转粉工单">
                <TransferFanPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        {/* 若善云系统 */}
        <Route
          path="/ruoshan"
          element={
            <ProtectedRoute>
              <MainLayout title="若善云系统" noPadding>
                <RuoshanPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        {/* 即时通讯 */}
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <MainLayout title="即时通讯" noPadding>
                <ChatPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        {/* 聊天记录管理 */}
        <Route
          path="/admin/chat"
          element={
            <ProtectedRoute requiredPerms={['chat_manage']}>
              <MainLayout title="聊天记录管理">
                <ChatManagement />
              </MainLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  )
}

export default App