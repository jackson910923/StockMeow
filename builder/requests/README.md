# 一鍵加入追蹤清單（冷門股請求區）

前端卡片「一鍵送出追蹤請求」按鈕**優先**用 GitHub issue 全自動處理（見
`.github/workflows/add-request.yml`：讀 issue 標題的代號、併入
`watchlist.txt`、觸發更新、回覆並關閉 issue，全程不用人碰）。這需要在
`app.js` 的 `ISSUE_TOKEN` 填一個 fine-grained token（僅 Issues:write、只
綁這個 repo）；沒填、或 API 呼叫失敗，就會自動退回這裡的備援連結流程：

點下去會直接開啟 GitHub 的「建立新檔案」頁面，檔名與內容都已經預填好
（例如 `3031.txt`，內容 `3031`），只要按綠色的「Commit new file」就完成
了——不用手動編輯 `watchlist.txt`，也不用本機跑指令。

commit 之後會觸發 `.github/workflows/update.yml`（因為改到這個資料夾），
`builder/build.py` 的 `load_watchlist()` 會自動把這裡的代號併入
`watchlist.txt`（永久保留）並清空這個資料夾，接著照常抓資料、產生
`data.json`。所以正常情況下這裡應該是空的——有檔案代表正在等下一次
CI 執行處理。
