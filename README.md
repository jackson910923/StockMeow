# 我的持股 · 家人看得懂的股票小網頁

一個**純靜態**的持股儀表板：手機優先、大字、紅綠、全白話。
不跑 Python、不含任何 token、不在前端抓資料。可以直接丟 GitHub Pages。

## 特色
- **依使用者自己設定持股**：哪幾檔、幾張、成本，都在畫面右上角「⚙️ 設定」裡增刪改，不限股票數量。
- **持股不進 repo**：你的部位/成本只存在瀏覽器本機（localStorage），就算 repo 公開也不會外洩。
- **可切換**：漲跌顏色（台股漲紅跌綠／歐美漲綠跌紅）、金額單位（萬／元）。
- **白話狀態**：法人 → 「最近大戶在買／在賣」；月漲跌 → 「這個月漲了 X%」；熱度 → 「網路上很熱／很安靜」（沒資料就不顯示）。

## 檔案
```
index.html    版面結構
styles.css    樣式
app.js        讀 data.json + 算市值損益 + 設定面板
data.json     市場資料（每檔：名字/現價/大戶/月漲跌/熱度）— 由後端產生，只有市場資料
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

## data.json 格式（之後由 build_dashboard_data.py 產生）
```json
{
  "updated": "2026-06-18",
  "is_sample": false,
  "stocks": {
    "3481": { "name": "群創", "price": 64.40, "big_player": "sell", "month_change_pct": 28, "buzz": "high" }
  }
}
```
- `big_player`: `"buy"` / `"sell"` / `"flat"`（由 `chips_features_*` 的近期外資/法人淨額趨勢換算）
- `month_change_pct`: 這個月收盤漲跌 %
- `buzz`: `"high"` / `"quiet"` / `null`（情緒來源；還沒接 PTT/CMoney 前一律給 `null`，前端會自動不顯示）

**注意**：`data.json` 只放市場資料，**永遠不要**把 FinMind token 或個人持股寫進去。
