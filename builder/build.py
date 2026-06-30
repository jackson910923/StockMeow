#!/usr/bin/env python3
"""StockMeow 資料產生器（自包含）：抓近期行情 + 今日熱門 → data.json + names.json。

可在 GitHub Actions 雲端跑，也能本機跑。需要環境變數 FINMIND_TOKEN。
輸出寫到 OUT_DIR（預設＝這支的上一層＝repo 根，static 檔所在）。
只用 FinMind 單檔查詢（免費版允許）＋證交所 OpenAPI（熱門榜，免 token）。
"""
import os
import json
import urllib.request
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
from FinMind.data import DataLoader

ROOT = Path(__file__).resolve().parent.parent              # repo 根
OUT_DIR = Path(os.getenv("DASHBOARD_OUT", str(ROOT)))      # data.json / names.json 寫這
WATCHLIST_FILE = Path(__file__).resolve().parent / "watchlist.txt"
DEFAULT_STOCKS = ["3481", "6116"]
STOCK_NAMES_OVERRIDE = {}

WINDOW = 5; MONTH_DAYS = 20; DEADZONE = 0.20; SPARK_DAYS = 30; RECENT_DAYS = 75; HOT_N = 10
TWSE_TOP20 = "https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX20"


def log(m):
    print(m, flush=True)


def classify_big_player(net):
    s = pd.Series(net).dropna().tail(WINDOW)
    if s.empty:
        return "flat"
    gross = float(s.abs().sum())
    if gross == 0:
        return "flat"
    r = float(s.sum()) / gross
    return "buy" if r >= DEADZONE else ("sell" if r <= -DEADZONE else "flat")


def month_change_pct(close):
    s = pd.Series(close).dropna()
    if len(s) < 2:
        return 0.0
    prev = float(s.iloc[-(MONTH_DAYS + 1)]) if len(s) > MONTH_DAYS else float(s.iloc[0])
    return 0.0 if prev == 0 else round((float(s.iloc[-1]) / prev - 1) * 100, 1)


def top_volume_stocks(n=HOT_N):
    try:
        with urllib.request.urlopen(TWSE_TOP20, timeout=25) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        log(f"[warn] 證交所熱門股抓取失敗：{e!r}")
        return []
    rows = []
    for x in data:
        c = str(x.get("Code", "")).strip()
        if len(c) == 4 and c.isdigit() and c[0] != "0":   # 4 碼非0開頭＝個股（濾掉 ETF/權證）
            rows.append((c, str(x.get("Name", "")).strip(), int(x.get("TradeVolume", 0) or 0)))
    rows.sort(key=lambda t: t[2], reverse=True)
    return rows[:n]


def fetch_recent(dl, sid, start, end):
    price = dl.taiwan_stock_daily(stock_id=sid, start_date=start, end_date=end)
    if price is None or len(price) == 0 or "close" not in price.columns:
        return None
    df = price[["date", "close"]].copy()
    inst = dl.taiwan_stock_institutional_investors(stock_id=sid, start_date=start, end_date=end)
    if inst is not None and len(inst):
        inst = inst.copy()
        inst["net"] = (inst["buy"] - inst["sell"]) / 1000.0
        tot = inst.groupby("date")["net"].sum().rename("inst_total_net").reset_index()
        df = df.merge(tot, on="date", how="left")
    if "inst_total_net" not in df.columns:
        df["inst_total_net"] = 0.0
    df["inst_total_net"] = df["inst_total_net"].fillna(0.0)
    return df.sort_values("date")


def make_record(name, df):
    if df is None or df.empty or "close" not in df.columns:
        return None, None
    closes = df["close"].dropna()
    price = float(closes.iloc[-1])
    if price <= 0:
        return None, None
    day = round((float(closes.iloc[-1]) / float(closes.iloc[-2]) - 1) * 100, 2) if len(closes) >= 2 else 0.0
    rec = {"name": name, "price": price,
           "big_player": classify_big_player(df["inst_total_net"]),
           "day_change_pct": day, "month_change_pct": month_change_pct(df["close"]),
           "buzz": None, "spark": [round(float(v), 2) for v in closes.tail(SPARK_DAYS)]}
    return str(df["date"].iloc[-1]), rec


def load_watchlist():
    if WATCHLIST_FILE.exists():
        codes = []
        for line in WATCHLIST_FILE.read_text(encoding="utf-8").splitlines():
            line = line.split("#")[0].strip()
            if line:
                codes.append(line)
        if codes:
            return codes
    return DEFAULT_STOCKS


def main():
    token = os.getenv("FINMIND_TOKEN", "")
    dl = DataLoader()
    if token:
        dl.login_by_token(api_token=token)
    else:
        log("[warn] 沒有 FINMIND_TOKEN，匿名額度很容易被限流")

    names = {}
    try:
        info = dl.taiwan_stock_info()
        names = dict(zip(info["stock_id"].astype(str), info["stock_name"]))
    except Exception as e:
        log(f"[warn] 取股名失敗：{e!r}")
    names.update(STOCK_NAMES_OVERRIDE)

    hot = top_volume_stocks(HOT_N)
    hot_codes = [c for c, _, _ in hot]
    for c, n, _ in hot:
        names.setdefault(c, n)
    log("今日熱門：" + ("、".join(f"{n}{c}" for c, n, _ in hot) or "（無）"))

    ids = list(dict.fromkeys(load_watchlist() + hot_codes))
    end = date.today().isoformat()
    start = (date.today() - timedelta(days=RECENT_DAYS)).isoformat()
    log(f"近期抓取 {start} ~ {end}，共 {len(ids)} 檔")

    # 全體有價證券平均六日漲跌% — 注意標準要用。先試「真．全市場等權平均」(MI_INDEX 免費)，
    # 失敗用加權指數(TAIEX)後備。
    tx_map = {}
    try:
        tx = dl.taiwan_stock_total_return_index(index_id="TAIEX", start_date=start, end_date=end)
        tx_map = dict(zip(tx["date"].astype(str), tx["price"]))
    except Exception as e:
        log(f"[warn] 大盤指數抓取失敗：{e!r}")
    market_map, market_tom, market_src = None, None, "taiex"
    try:
        from market import ensure_market, market_cum_map, market_tomorrow_pct
        cache = ensure_market()
        market_map = market_cum_map(cache, offset=6)
        market_tom = market_tomorrow_pct(cache, offset=6)
        if market_map:
            market_src = "twse_all(真.全體等權)"
    except Exception as e:
        log(f"[warn] 全體平均(MI_INDEX)失敗，改用大盤近似：{e!r}")
    # 覆蓋不足（快取沒填滿）→ 近10日會少算，寧可用 TAIEX(全覆蓋)。等快取填滿才用真.全體。
    if market_map and tx_map:
        recent = sorted(tx_map)[-14:]
        covered = sum(1 for d in recent if d in market_map)
        if covered < 12:
            log(f"真.全體僅覆蓋近 {covered}/14 日 → 暫用 TAIEX 後備（待快取填滿）")
            market_map, market_tom, market_src = None, None, f"taiex(真.全體{covered}/14)"
    if not market_map and tx_map:                       # TAIEX 後備
        td = sorted(tx_map)
        market_map = {td[i]: (tx_map[td[i]] / tx_map[td[i - 6]] - 1) * 100
                      for i in range(6, len(td)) if tx_map[td[i - 6]]}
        if len(td) > 6 and tx_map[td[-6]]:
            market_tom = (tx_map[td[-1]] / tx_map[td[-6]] - 1) * 100
    log(f"全體平均來源：{market_src}（{len(market_map or {})} 日）")

    stocks, dates = {}, []
    for sid in ids:
        df = fetch_recent(dl, sid, start, end)
        d, rec = make_record(names.get(sid, sid), df)
        if rec:
            # 注意/處置風險（最佳努力）
            if market_map and df is not None:
                try:
                    from notice import compute_notice
                    rows = [(dt, cl) for dt, cl in zip(df["date"].astype(str), df["close"])]
                    # 本益比為負/0(虧損)或≥60 → 法規豁免同類 → 精準；否則標保守估算
                    exempt = False
                    try:
                        pp = dl.taiwan_stock_per_pbr(stock_id=sid,
                                                     start_date=(date.today() - timedelta(days=20)).isoformat(),
                                                     end_date=end)
                        if len(pp):
                            per = float(pp["PER"].iloc[-1])
                            exempt = (per <= 0 or per >= 60)
                    except Exception:
                        pass
                    nt = compute_notice(rows, market_map, market_tom, exempt=exempt)
                    if nt:
                        rec["notice"] = nt
                except Exception as e:
                    log(f"[warn] {sid} 注意/處置略過：{e!r}")
            stocks[sid] = rec
            dates.append(d)
            log(f"{sid} {rec['name']}: {rec['price']} | 今日 {rec['day_change_pct']}% | 大戶 {rec['big_player']}"
                + (f" | 注意{rec['notice']['consec']}連/{rec['notice']['in10']}(10日) 距處置{rec['notice']['to_disp']}" if rec.get("notice") else ""))
        else:
            log(f"[warn] {sid} 無資料，跳過")

    # 情緒（最佳努力）：爬 data.json 裡全部股票＝今日熱門 ∪ watchlist(持股)，
    # 只存彙總統計；失敗不影響其他資料。
    try:
        from sentiment import fetch_sentiment
        targets = list(stocks)
        for sid, sent in fetch_sentiment(targets).items():
            if sid in stocks and sent.get("posts") is not None:
                stocks[sid]["sentiment"] = sent
                log(f"情緒 {sid}: {sent}")
    except Exception as e:
        log(f"[warn] 情緒分析整段略過（不影響其他資料）：{e!r}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if names:
        (OUT_DIR / "names.json").write_text(json.dumps(names, ensure_ascii=False), encoding="utf-8")
    if not stocks:
        log("[error] 沒有任何股票成功產出，data.json 不寫出")
        raise SystemExit(1)
    out = {"updated": max(dates), "is_sample": False,
           "hot": [c for c in hot_codes if c in stocks], "stocks": stocks}
    (OUT_DIR / "data.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"完成：{len(stocks)} 檔（含熱門 {len(out['hot'])}）→ {OUT_DIR}\\data.json, names.json")


if __name__ == "__main__":
    main()
