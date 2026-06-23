import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * 本機開發用：把 `api/` 底下的 Vercel Serverless Function 掛到 Vite dev server。
 * `npm run dev`（純 vite）不會執行 `api/`，故 POST /api/* 會 404；此 plugin 在 dev
 * 時用 ssrLoadModule 直接載入對應 TS 並補上 Vercel 的 res.status()/res.json() 介面，
 * 讓註冊/登入等流程在本機即可運作。正式部署仍由 Vercel 跑同一份函式。
 */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next()
        const name = req.url.split('?')[0].replace(/^\/api\//, '').replace(/\/+$/, '')
        const modPath = resolve(__dirname, 'api', `${name}.ts`)
        if (!name || !existsSync(modPath)) return next()

        try {
          // 讀取並解析 JSON body（後端 readBody 接受 object 或 string）
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const raw = Buffer.concat(chunks).toString('utf8')
          let body: unknown = {}
          if (raw) { try { body = JSON.parse(raw) } catch { body = raw } }
          ;(req as any).body = body

          // 補上 Vercel res 介面
          const r = res as any
          r.status = (code: number) => { res.statusCode = code; return r }
          r.json = (obj: unknown) => {
            if (!res.headersSent) res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(obj))
            return r
          }

          const mod = await server.ssrLoadModule(modPath)
          await mod.default(req, res)
        } catch (e) {
          server.config.logger.error(`[dev-api] ${name}: ${String(e)}`)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
          }
          res.end(JSON.stringify({ error: 'dev api error' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [
    devApi(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '府城守護網',
        short_name: '守護網',
        description: '台南東區智慧防災系統',
        lang: 'zh-TW',
        theme_color: '#1e40af',
        background_color: '#0a1628',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,png,svg,ico}'],
        // buildings-east.json 約 3.2MB，超過 Workbox 預設 2MB 上限；放寬以利離線快取
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[a-d]\.basemaps\.cartocdn\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'carto-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
})
