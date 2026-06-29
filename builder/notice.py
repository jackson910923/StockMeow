"""注意/處置風險（自包含）：用收盤價＋大盤算每檔的注意狀態、距離處置、明天門檻價。

門檻（TWSE 第四條第一項第一款，已對原文確認）：
  目一：六日(含當日)累積收盤漲跌% 超過 ±32%，且與全體平均差幅 ≥ ±20%。
  目二：六日累積% 超過 ±25%，且差幅 ≥ ±20%，且該六日起迄兩日收盤價差 ≥ 50 元。
  虧損股(本益比為負)豁免「同類股」→ 只比全體；本版以加權指數(大盤)近似全體。
處置（依現行 TWSE 處置公告：連續三次 / 最近十個營業日六次 → 處置）。
明天門檻價：反解，假設大盤明天持平。皆為估算，只涵蓋『漲跌幅』那條（量能/週轉率不保證）。
"""
T_STRONG, T_WEAK, DIFF, GAP, MIN_PRICE = 32.0, 25.0, 20.0, 50.0, 5.0
OFFSET = 6                 # 六日累積基準=窗口前一日(D-6)；TWSE「六日前收盤」慣例
CONSEC_DISP, WIN10, CNT10 = 3, 10, 6   # 連續3次 或 10日內6次 → 處置


def _cum(seq, i, offset):
    if i - offset < 0 or seq[i - offset] == 0:
        return None
    return (seq[i] / seq[i - offset] - 1.0) * 100.0


def _is_notice(stock_cum, tx_cum, close_now, close_first):
    if stock_cum is None or tx_cum is None or close_now < MIN_PRICE:
        return False
    diff = stock_cum - tx_cum
    gap = abs(close_now - close_first) if close_first is not None else 0.0
    if stock_cum > T_STRONG and diff >= DIFF:
        return True
    if stock_cum > T_WEAK and diff >= DIFF and gap >= GAP:
        return True
    if stock_cum < -T_STRONG and diff <= -DIFF:
        return True
    if stock_cum < -T_WEAK and diff <= -DIFF and gap >= GAP:
        return True
    return False


def compute_notice(rows, offset=OFFSET):
    """rows: [(date, stock_close, taiex_close), ...] 依日期升冪。回傳狀態 dict 或 None。"""
    if not rows or len(rows) < offset + 2:
        return None
    closes = [r[1] for r in rows]
    txs = [r[2] for r in rows]
    flags = []
    for i in range(len(rows)):
        sc = _cum(closes, i, offset)
        tc = _cum(txs, i, offset)
        first = closes[i - (offset - 1)] if i - (offset - 1) >= 0 else None
        flags.append(_is_notice(sc, tc, closes[i], first))

    consec = 0
    for f in reversed(flags):
        if f:
            consec += 1
        else:
            break
    in10 = sum(1 for f in flags[-WIN10:] if f)
    to_disp = min(max(0, CONSEC_DISP - consec), max(0, CNT10 - in10))

    # 明天門檻價（假設大盤持平）
    base_s, base_t = closes[-offset], txs[-offset]
    first_close, today = closes[-5], closes[-1]
    tx_cum = (txs[-1] / base_t - 1) * 100 if base_t else 0.0
    up1 = base_s * (1 + max(T_STRONG, tx_cum + DIFF) / 100)
    up2 = max(base_s * (1 + max(T_WEAK, tx_cum + DIFF) / 100), first_close + GAP)
    up = min(up1, up2)
    dn1 = base_s * (1 + min(-T_STRONG, tx_cum - DIFF) / 100)
    dn2 = min(base_s * (1 + min(-T_WEAK, tx_cum - DIFF) / 100), first_close - GAP)
    dn = max(dn1, dn2)
    return {
        "on_notice": bool(flags[-1]),
        "consec": consec,
        "in10": in10,
        "to_disp": to_disp,
        "up": round(up, 2), "up_reach": up <= today * 1.10,
        "down": round(dn, 2), "down_reach": dn >= today * 0.90,
    }
