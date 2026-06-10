// 极简 Service Worker：清除旧缓存，不做任何预缓存
// 目的：替代之前 vite-plugin-pwa 生成的 84MB 预缓存 SW
// 当用户浏览器检测到这个新 SW 时，它会瞬间安装、清除所有旧缓存、让浏览器直接从网络加载

// 安装阶段：立即跳过等待，不预缓存任何文件
self.addEventListener('install', function(event) {
  self.skipWaiting();
});

// 激活阶段：清除所有旧缓存，然后接管所有客户端
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          return caches.delete(cacheName);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// fetch 事件：不拦截任何请求，让浏览器正常从网络加载
// 这确保了所有页面都能获取到最新版本
