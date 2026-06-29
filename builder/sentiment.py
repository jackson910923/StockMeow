"""CMoney 股市同學會：抓持股的「今日討論熱度 + 近期多空」彙總統計（不存原文）。

做法：用無頭瀏覽器當一般訪客把個股頁載入（頁面會自己取得匿名 guest Bearer token）。
我們從它自己的 /api/mach 請求攔下 token，再帶『正確的 headers（token + x-version: 3.0）』
直接抓兩支 JSON：
  - Channel/ArticlesCount/Today  → 今日發文數（熱度）
  - Article/Stocks/{id}/AllHottest → 近期熱門貼文，每篇帶發文者自標的 bullOrBear（方向）
直接帶 headers 抓、不靠捲動 lazy-load，所以在 headless CI 也穩。
只爬傳進來的代號（＝build 的 watchlist＝你的持股）。最佳努力，失敗回空、不影響其他資料。
"""
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

_FETCH_JS = """async ({url, headers}) => {
    try {
        const r = await fetch(url, {headers});
        return r.ok ? await r.json() : {__err: r.status};
    } catch (e) { return {__err: String(e)}; }
}"""


def _one(page, sid):
    tok = {"v": None}        # 匿名 Bearer token（攔自頁面自己的請求）
    count = {"n": None}      # 今日發文數（抓頁面自己的 ArticlesCount 回應，CI 也穩）
    arts_cap = []            # 頁面自己載入的文章（備援）

    def on_request(req):
        if tok["v"] is None and "/api/mach" in req.url:
            a = req.headers.get("authorization")
            if a and a.lower().startswith("bearer"):
                tok["v"] = a

    def on_response(resp):
        try:
            if "ArticlesCount/Today" in resp.url and count["n"] is None:
                count["n"] = (resp.json() or {}).get("count")
            elif "AllHottest" in resp.url and "json" in resp.headers.get("content-type", "").lower():
                arts_cap.extend((resp.json() or {}).get("articles") or [])
        except Exception:
            pass

    page.on("request", on_request)
    page.on("response", on_response)
    page.goto(f"https://www.cmoney.tw/forum/stock/{sid}",
              wait_until="domcontentloaded", timeout=30000)
    for _ in range(20):                       # 等 token 與今日發文數
        if tok["v"] and count["n"] is not None:
            break
        page.wait_for_timeout(1000)

    # 方向：直接抓文章（limit 上限 20、需 x-version:3.0）＋頁面自己載入的，合併去重
    arts = list(arts_cap)
    if tok["v"]:
        headers = {"authorization": tok["v"], "x-version": "3.0",
                   "accept": "application/json, text/plain, */*"}
        r = page.evaluate(_FETCH_JS, {
            "url": f"https://www.cmoney.tw/api/mach/api/Article/Stocks/{sid}/AllHottest?limit=20",
            "headers": headers})
        arts.extend((r or {}).get("articles") or [])

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
    return {"posts": count["n"], "bull": bull, "bear": bear}


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
