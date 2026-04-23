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
import DocumentsPage from '@/pages/Document/DocumentsPage'
import { DocumentEditorWrapper } from '@/pages/Document/DocumentEditor'
import DocumentShareView from '@/pages/Document/DocumentShareView'

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
            <ProtectedRoute>
              <MainLayout title="用户管理">
                <UserManagement />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/roles"
          element={
            <ProtectedRoute>
              <MainLayout title="角色权限">
                <RoleManagement />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/departments"
          element={
            <ProtectedRoute>
              <MainLayout title="部门管理">
                <DepartmentManagement />
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
            <ProtectedRoute>
              <MainLayout title="文件管理">
                <FilesPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/workspaces"
          element={
            <ProtectedRoute>
              <MainLayout title="工作区">
                <WorkspacesPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/notifications"
          element={
            <ProtectedRoute>
              <MainLayout title="通知管理">
                <NotificationManagement />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/announcements"
          element={
            <ProtectedRoute>
              <MainLayout title="公告与任务">
                <AnnouncementManagement />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/stats"
          element={
            <ProtectedRoute>
              <MainLayout title="文件统计">
                <FileStats />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        {/* 协作文档 */}
        <Route
          path="/documents"
          element={
            <ProtectedRoute>
              <MainLayout title="协作文档">
                <DocumentsPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/documents/:docId"
          element={
            <ProtectedRoute>
              <MainLayout title="文档编辑">
                <DocumentEditorWrapper />
              </MainLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  )
}

export default App