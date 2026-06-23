# 府城守護網（Tainan Guardian Net）

智慧城市防災 PWA：P2P Mesh 互助通訊、群眾回報、三層 SOS、避難所監測與指揮中心。
前端為 Vite + React，後端為 Vercel Serverless Functions（`api/`）。

## 本機開發

```bash
npm install
npm run dev        # 啟動前端 (Vite)
```

其他指令：

```bash
npm run build      # 產生圖示 + tsc 型別檢查 + vite 打包
npm run preview    # 預覽打包結果
npm run lint       # ESLint
```

> 注意：`api/` 為 Vercel Serverless Functions。`npm run dev` 只跑前端；要在本機連同後端一起跑，請用 `vercel dev`（需安裝 Vercel CLI）。

## 後端資料持久化（KV / Upstash Redis）— 重要

後端 4 個端點（`api/account`、`api/sos`、`api/announce`、`api/shelter-ai-status`）採同一套儲存策略：

- **有設定 KV 環境變數** → 寫入 Redis（REST），帳號 / SOS / 公告 / 避難所狀態**持久保存**。
- **未設定** → 降級為 Serverless Function 的**模組內記憶體**，**冷啟動或換實例就會清空**。

⚠️ 這正是「帳號註冊後過一陣子登入卻顯示『查無此帳號』」的根因：未設定 KV 時，帳號表存在記憶體中，Vercel 冷啟動後就消失。**正式 / 共用環境務必設定 KV。**

### 設定步驟（Vercel + Upstash Redis）

1. 在 [Upstash](https://upstash.com/) 建立一個 **Redis** 資料庫（或在 Vercel Dashboard → Storage 直接建立 Vercel KV）。
2. 取得該資料庫的 **REST URL** 與 **REST Token**。
3. 在 Vercel 專案 → **Settings → Environment Variables** 新增以下兩個變數（套用到 Production / Preview / Development）：

   | 變數名稱 | 值 |
   | --- | --- |
   | `KV_REST_API_URL` | Upstash / Vercel KV 的 REST URL |
   | `KV_REST_API_TOKEN` | 對應的 REST Token |

   後端也接受 Upstash 原生命名，擇一即可：

   | 變數名稱 | 值 |
   | --- | --- |
   | `UPSTASH_REDIS_REST_URL` | Upstash 的 REST URL |
   | `UPSTASH_REDIS_REST_TOKEN` | 對應的 REST Token |

   > 程式判定：`KV_REST_API_*` 優先，其次 `UPSTASH_REDIS_REST_*`；只要其中一組齊全即啟用 Redis（見各 `api/*.ts` 的 `USE_KV`）。**兩個變數要成對設定**，缺一仍會降級為記憶體。

4. **重新部署**（Redeploy）讓環境變數生效。

### 本機驗證是否啟用

啟用後，註冊帳號 → 等幾分鐘（讓 Function 冷啟動）→ 重新登入應正常，不再出現「查無此帳號」。

### 本機開發要不要設 KV？

不一定。本機用 `vercel dev` 時若沒設 KV，資料只存在記憶體、重啟即清空 — 單機自測通常足夠。需要跨裝置或長時間保存時，在本機 `.env`（或 `vercel env pull`）放上同樣兩個變數即可。

> 補充：前端在**這台裝置曾成功登入過**的帳號，即使後端暫時查無，也會用本機快取（salt + PIN 雜湊）離線驗證放行；但跨裝置 / 全新裝置仍仰賴後端，故 KV 仍是根本解。
