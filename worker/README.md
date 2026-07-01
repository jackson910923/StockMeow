# StockMeow 即時報價 Worker

冷門股加持股後「立刻有資料」用的小後端（Cloudflare Workers，免費額度每天
10 萬次請求，個人用量用不完）。跟主網站（GitHub Pages 靜態站）是分開部署的
兩個東西：

- 主網站：`data.json` 每天靠 GitHub Actions 批次更新，含完整資料（法人、
  情緒、注意/處置風險）。
- 這支 Worker：即時查單一代號，只回傳「今日收盤、近5日大戶動向、30天走勢、
  今日法人買賣超」——**沒有**情緒（要 Playwright，Worker 跑不動）跟注意/處置
  風險（要全市場均價，太重）。前端只在某支股票不在 `data.json`（冷門股剛加）
  時才會呼叫這支 Worker，補上基本資料；等明天每日更新跑過，就會有完整版。

## 部署（一次性設定）

1. 沒有 Cloudflare 帳號就先申請一個（免費，https://dash.cloudflare.com/sign-up）。
2. 產生一個 API Token：Cloudflare 後台 → My Profile → API Tokens → Create Token
   →「Edit Cloudflare Workers」範本即可。這組 token 只在部署時用一次，
   不會寫進任何檔案或 repo。
3. 在 `worker/` 目錄下：
   ```
   CLOUDFLARE_API_TOKEN=<剛剛那組token> npx wrangler deploy
   ```
   第一次跑會問要不要建立 `stockmeow-quote` 這個 Worker，選是。
4. 設定 FinMind token（可選，不設也能跑，只是走 FinMind 匿名額度、比較容易被限流）：
   ```
   CLOUDFLARE_API_TOKEN=<token> npx wrangler secret put FINMIND_TOKEN
   ```
   會提示貼上 FinMind token 值。
5. 部署完成後 wrangler 會印出網址，例如
   `https://stockmeow-quote.<你的subdomain>.workers.dev`。把這個網址填進
   `../app.js` 的 `WORKER_URL` 常數，commit + push 主網站的 repo。

## 測試

```
curl "https://stockmeow-quote.<subdomain>.workers.dev/quote?code=3031"
```
應該回傳 JSON（price/day_change_pct/spark/...）。代號打錯或查無資料會回
`{"error": "..."}`。
