import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'

// PWA 自動更新：新版部署後，Service Worker 啟用即自動 reload，
// 讓使用者（含已安裝 PWA、長開分頁、指揮中心 /rescue）拿到最新版本，
// 不會卡在舊的快取畫面。autoUpdate 模式下 registerSW 內建 activated→reload。
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
