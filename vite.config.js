import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'icon/*.png'],
            manifest: {
                name: '联合知识库',
                short_name: '联合知识库',
                description: '让团队协作如呼吸般自然',
                theme_color: '#863bff',
                background_color: '#863bff',
                display: 'standalone',
                scope: '/',
                start_url: '/',
                orientation: 'portrait-primary',
                icons: [
                    { src: '/icon/android-icon-36x36.png', sizes: '36x36', type: 'image/png' },
                    { src: '/icon/android-icon-48x48.png', sizes: '48x48', type: 'image/png' },
                    { src: '/icon/android-icon-72x72.png', sizes: '72x72', type: 'image/png' },
                    { src: '/icon/android-icon-96x96.png', sizes: '96x96', type: 'image/png' },
                    { src: '/icon/android-icon-144x144.png', sizes: '144x144', type: 'image/png' },
                    { src: '/icon/android-icon-192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: '/icon/android-icon-192x192.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
                ],
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                maximumFileSizeToCacheInBytes: 35 * 1024 * 1024, // 35MB（项目 JS 包约 31.9MB）
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/[^.]+\.supabase\.co\/.*$/i,
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'supabase-api-cache',
                            expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
                            networkTimeoutSeconds: 10,
                        },
                    },
                ],
            },
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        host: '0.0.0.0',
        port: 3000,
        strictPort: false,
        open: false,
    },
});
