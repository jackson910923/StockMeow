"""CMoney 股市同學會：抓持股的「今日討論熱度 + 多空」彙總統計（不存原文）。

做法：用無頭瀏覽器當一般訪客把個股頁載入（頁面會自己取得匿名 token），
攔截它自己載入的回應（AllHottest 文章、今日發文數），彙總成數字。
- 熱度＝今日發文數
- 方向＝彙總每篇『發文者自己標的看多/看空(bullOrBear)』，比硬猜文字準
只爬傳進來的代號（＝build 的 watchlist＝你的持股）。給 build.py 最佳努力呼叫，
失敗就回空、不影響其他資料。
"""
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")


def _one(page, sid):
    arts, count = [], [None]

    def on_resp(resp):
        u = resp.url
        try:
            if "AllHottest" in u and "json" in resp.headers.get("content-type", "").lower():
                arts.extend((resp.json() or {}).get("articles") or [])
            elif "ArticlesCount/Today" in u:
                count[0] = (resp.json() or {}).get("count")
        except Exception:
            pass

    page.on("response", on_resp)
    page.goto(f"https://www.cmoney.tw/forum/stock/{sid}",
              wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(6000)                       # 等它拿到匿名 token、載入文章
    for _ in range(3):
        page.mouse.wheel(0, 4000)
        page.wait_for_timeout(2000)

    seen, bull, bear = set(), 0, 0
    for a in arts:
        aid = a.get("id")
        if aid in seen:
            continue
        seen.add(aid)
        for t in (a.get("content", {}) or {}).get("commodityTags") or []:
            if t.get("key") == sid:
                b = t.get("bullOrBear")
                if b == 1:
                    bull += 1
                elif b == -1:
                    bear += 1
    return {"posts": count[0], "bull": bull, "bear": bear}


def fetch_sentiment(stock_ids):
    """{sid: {'posts','bull','bear'}}。只爬傳進來的；任何一檔失敗就略過該檔。"""
    out = {}
    ids = [str(s) for s in (stock_ids or [])]
    if not ids:
        return out
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        br = p.chromium.launch(headless=True)
        try:
            for sid in ids:
                page = br.new_page(user_agent=UA)
                try:
                    out[sid] = _one(page, sid)
                except Exception as e:
                    print(f"[warn] 情緒 {sid} 失敗：{e!r}", flush=True)
                finally:
                    page.close()
        finally:
            br.close()
    return out


if __name__ == "__main__":
    import sys
    print(fetch_sentiment(sys.argv[1:] or ["3481"]))
