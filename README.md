# 我的持股 · 家人看得懂的股票小網頁

一個**純靜態**的持股儀表板：手機優先、大字、紅綠、全白話。
不跑 Python、不含任何 token、不在前端抓資料。可以直接丟 GitHub Pages。

## 特色
- **依使用者自己設定持股**：哪幾檔、幾張、成本，都在「⚙️ 設定」裡增刪改，不限股票數量。**任何上市櫃股票**都能加（打代號或名字搜尋）。
- **持股不進 repo**：你的部位/成本只存在瀏覽器本機（localStorage），就算 repo 公開也不會外洩。
- **每檔卡片**：損益、**今日漲跌**、最近收盤、30 天走勢線、大戶買/賣、月漲跌、白話提醒（跌破成本/大戶連賣）。
- **資產配置圖**：一個甜甜圈圖看每檔佔總市值的比例。
- **🔥 今日熱門**：證交所成交量前 10 個股，已持有的標「已持有」、其他可一鍵加入。
- **可切換**：漲跌顏色（台股漲紅跌綠／歐美漲綠跌紅）、金額單位（萬／元）。
- **加到主畫面像 App**：PWA（manifest + service worker + 圖示），手機加到主畫面後全螢幕開、可離線看上次資料。

## 冷門股怎麼辦？（家人有不在熱門榜的股票）
前端是靜態頁、不能自己抓行情，所以**要顯示損益/走勢的股票得先被抓進 `data.json`**。流程：
1. 在 `⚙️ 設定` 直接打那檔代號加進來（卡片會先顯示「資料準備中」+ 正確股名）。
2. 管理者（有 token 的人）把代號加進專案根目錄的 `watchlist.txt`，跑一次 `update.bat`，那檔的價格/大戶/走勢就會進 `data.json`，卡片就完整了。

## 檔案
```
index.html    版面結構（含 PWA / 設定抽屜）
styles.css    樣式
app.js        讀 data.json + 算損益 + 走勢/配置圖 + 設定面板
data.json     市場資料（每檔：名字/現價/今日漲跌/大戶/月漲跌/走勢）— 後端產生，無持股
names.json    全市場股名對照（讓任一代號都顯示中文名）
manifest.json / sw.js / icon*.png   PWA：加到主畫面、離線
```

## 本機預覽
- 直接雙擊 `index.html` 也能看（瀏覽器擋掉 `file://` 讀檔時，會用 `app.js` 內建的備援假資料把畫面撐起來）。
- 想用真正的 `data.json` 在本機測，在這個資料夾開個小伺服器：
  ```bash
  python -m http.server 8000
  # 瀏覽器開 http://localhost:8000
  ```

## 放上 GitHub Pages
1. 把這個資料夾推上一個 GitHub repo。
2. repo → Settings → Pages → Source 選 `main` 分支、`/ (root)`。
3. 幾分鐘後用它給的網址打開即可（手機加到主畫面就像 App）。

> **隱私提醒（重要）**：
> - 免費 GitHub Pages 部署出來的**網頁是公開可達的**——有連結的人都打得開，即使 repo 設 private 也一樣（private 只藏原始碼，藏不了部署出來的頁面）。
> - 因此本專案預設 `DEFAULT_HOLDINGS = []`（**不把任何持股放進公開頁面**）。你自己的持股只在「⚙️ 設定」新增、存在你這台瀏覽器(localStorage)，不會進 repo。
> - `data.json` 只含市場資料（價格/大戶/走勢），**沒有張數、成本、損益**，看不出你的部位大小。

## data.json 格式（由 build_dashboard_data.py 產生）
```json
{
  "updated": "2026-06-26",
  "is_sample": false,
  "hot": ["3481", "2303", "..."],
  "stocks": {
    "3481": { "name": "群創", "price": 65.0, "big_player": "sell",
              "day_change_pct": -8.32, "month_change_pct": 40.1,
              "buzz": null, "spark": [37.5, 35.4, "...近30日收盤"] }
  }
}
```
- `big_player`: `"buy"` / `"sell"` / `"flat"`（近期法人合計淨額趨勢換算）
- `day_change_pct` / `month_change_pct`: 今日 / 近一個月收盤漲跌 %
- `spark`: 近 30 個交易日收盤（畫走勢線用）
- `sentiment`: `{ "posts": 125, "bull": 7, "bear": 3 }` 或不存在。CMoney 股市同學會的彙總統計：今日發文數(熱度) + 彙總發文者自標的看多/看空(方向)。**只對 watchlist（你的持股）抓**，只存彙總數字、不存原文。由 `builder/sentiment.py` 用無頭瀏覽器當訪客讀（最佳努力，失敗不影響其他資料）。
- `buzz`: 舊欄位，目前一律 `null`（已由 `sentiment` 取代）
- `hot`: 今日熱門個股代號清單

**注意**：`data.json` 只放市場資料，**永遠不要**把 FinMind token 或個人持股寫進去。
