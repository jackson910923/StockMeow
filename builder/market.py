"""真．全體有價證券平均六日漲跌% — 用 TWSE MI_INDEX 歷史全市場收盤算等權平均（免費）。

注意標準的「全體有價證券平均」用這個算才精準（比加權指數 TAIEX 近似準）。
資料：TWSE 網站 MI_INDEX?date=&type=ALL（每日全部收盤），普通股(4碼非0開頭)等權平均。
快取 market_cache.json，每天只增量抓新交易日、自動 prune。失敗時 build.py 會改用 TAIEX 後備。
"""
import json
import time
import urllib.request
from datetime import date, timedelta
from pathlib import Path

UA = "Mozilla/5.0"
CACHE = Path(__file__).resolve().parent / "market_cache.json"
KEEP = 24


def _fetch(d):
    url = f"https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date={d.strftime('%Y%m%d')}&type=ALL"
    j = None
    for attempt in range(2):                          # 失敗重試一次（避開暫時性/尖峰）
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            j = json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8"))
            break
        except Exception:
            time.sleep(2.0)
    if not j or j.get("stat") != "OK":                 # 非交易日/尖峰暫停/失敗 → 跳過（由 TAIEX 後備）
        return None
    for t in j.get("tables", []):
        f = t.get("fields", [])
        if "收盤價" in f and len(t.get("data", [])) > 100:
            ci = f.index("收盤價")
            out = {}
            for row in t["data"]:
                code = str(row[0]).strip()
                if len(code) == 4 and code.isdigit() and code[0] != "0":
                    v = str(row[ci]).replace(",", "").strip()
                    try:
                        out[code] = float(v)
                    except ValueError:
                        pass
            return out
    return None


def ensure_market(keep=KEEP):
    """確保快取有最近 keep 個交易日的全市場普通股收盤。回傳 {date: {code: close}}。"""
    cache = {}
    if CACHE.exists():
        try:
            cache = json.loads(CACHE.read_text(encoding="utf-8"))
        except Exception:
            cache = {}
    d, got, tried = date.today(), 0, 0
    while got < keep and tried < keep * 2 + 12:
        ds = d.isoformat()
        if ds in cache:
            got += 1
        else:
            c = _fetch(d)
            if c:
                cache[ds] = c
                got += 1
            time.sleep(1.2)                            # 對證交所客氣點，避免被擋
        d -= timedelta(days=1)
        tried += 1
    for k in sorted(cache)[:-keep]:           # prune 舊的
        cache.pop(k, None)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return cache


def market_cum_map(cache, offset=6):
    """{date: 全體等權六日漲跌%}（base=offset 個交易日前）。"""
    dates = sorted(cache)
    out = {}
    for i in range(offset, len(dates)):
        d0, d6 = cache[dates[i]], cache[dates[i - offset]]
        rs = [d0[c] / d6[c] - 1 for c in d0 if c in d6 and d6[c] > 0]
        if rs:
            out[dates[i]] = sum(rs) / len(rs) * 100
    return out


def market_tomorrow_pct(cache, offset=6):
    """明天全體六日%（假設全市場明天持平）。base=今天-(offset-1)。"""
    dates = sorted(cache)
    if len(dates) < offset + 1:
        return None
    d0, dbase = cache[dates[-1]], cache[dates[-offset]]
    rs = [d0[c] / dbase[c] - 1 for c in d0 if c in dbase and dbase[c] > 0]
    return sum(rs) / len(rs) * 100 if rs else None
