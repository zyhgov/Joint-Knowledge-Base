/**
 * 强制刷新：清除所有缓存、反注册 Service Worker，再跳转到新 URL
 * 确保用户加载到的始终是最新代码
 */
export function hardRefresh() {
  // 标记正在刷新，阻止 index.html 的 controllerchange 自动 reload
  ;(window as any).__HARD_REFRESHING__ = true

  Promise.all([
    // 反注册所有 Service Worker
    navigator.serviceWorker?.getRegistrations().then(regs =>
      Promise.all(regs.map(r => r.unregister()))
    ).catch(() => {}),
    // 清除所有缓存
    caches?.keys().then(names =>
      Promise.all(names.map(n => caches.delete(n)))
    ).catch(() => {}),
  ]).finally(() => {
    // 用时间戳参数跳转，彻底避开浏览器缓存
    const url = new URL(window.location.href)
    url.searchParams.set('_t', Date.now().toString())
    window.location.href = url.toString()
  })
}
