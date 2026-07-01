/**
 * StockMeow 即時報價 Worker：讓冷門股「一加就有資料」，不用等每日 CI 更新。
 * 前端直接 fetch 這支 Worker（伺服器端呼叫 FinMind，不受瀏覽器 CORS 限制），
 * 回傳的欄位形狀對齊 data.json 的 stocks[code]。情緒(sentiment)沒有——那需要
 * Playwright 開瀏覽器爬CMoney，Worker 這種輕量環境跑不動，還是得等每日批次。
 * 注意/處置風險(notice)有做，但用 TAIEX(加權指數)當全體市場的近似基準——
 * 跟 builder/notice.py 同一套算法(見該檔案開頭門檻說明)，只是用大盤指數
 * 取代「真.全市場等權平均」(那個要抓全市場幾千檔資料，太重，只有每日批次做)。
 *
 * 路由：GET /quote?code=3031
 * 密鑰：FINMIND_TOKEN 用 `wrangler secret put FINMIND_TOKEN` 設，不寫進這支檔案。
 */

const FINMIND = "https://api.finmindtrade.com/api/v4/data";
const RECENT_DAYS = 75;
const SPARK_DAYS = 30;
const MONTH_DAYS = 20;
const DEADZONE = 0.2;
const QUOTE_CACHE_SECONDS = 4 * 60 * 60;   // 收盤價一天只變一次，快取 4 小時夠用
const ERROR_CACHE_SECONDS = 10 * 60;       // 查無資料/代號打錯，短快取避免一直重打 FinMind

// ── 注意/處置風險（門檻同 builder/notice.py，見該檔案開頭的 TWSE 條文說明）──
const T_STRONG = 32.0, T_WEAK = 25.0, DIFF = 20.0, GAP = 50.0, MIN_PRICE = 5.0;
const OFFSET = 6, CONSEC_DISP = 3, WIN10 = 10, CNT10 = 6;
const LIMIT_PCT = 10.0, MAX_SIM_DAYS = 15;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));
    if (url.pathname !== "/quote") return withCors(json({ error: "not found" }, 404));

    const code = (url.searchParams.get("code") || "").trim();
    if (!/^\d{4,6}[A-Za-z]?$/.test(code)) return withCors(json({ error: "invalid code" }, 400));

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    const cached = await cache.match(cacheKey);
    if (cached) return withCors(cached);

    let resp;
    try {
      const quote = await buildQuote(code, env.FINMIND_TOKEN || "");
      resp = quote
        ? json(quote, 200, { "Cache-Control": `public, max-age=${QUOTE_CACHE_SECONDS}` })
        : json({ error: "no data" }, 404, { "Cache-Control": `public, max-age=${ERROR_CACHE_SECONDS}` });
    } catch (e) {
      resp = json({ error: String(e && e.message || e) }, 502, { "Cache-Control": `public, max-age=${ERROR_CACHE_SECONDS}` });
    }
    ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return withCors(resp);
  }
};

function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ "Content-Type": "application/json" }, extraHeaders || {})
  });
}
function withCors(resp) {
  const r = new Response(resp.body, resp);
  r.headers.set("Access-Control-Allow-Origin", "*");
  r.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  return r;
}
function round(v, d) {
  const m = Math.pow(10, d);
  return Math.round(v * m) / m;
}
function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function fm(dataset, code, start, end, token) {
  const u = `${FINMIND}?dataset=${dataset}&data_id=${code}&start_date=${start}&end_date=${end}` +
            (token ? `&token=${token}` : "");
  const r = await fetch(u);
  if (!r.ok) throw new Error(`FinMind ${dataset} HTTP ${r.status}`);
  const j = await r.json();
  if (j.status !== 200) throw new Error(`FinMind ${dataset}: ${j.msg}`);
  return j.data || [];
}

// ── 注意/處置風險：逐行對照 builder/notice.py 的邏輯 ──
function cumPct(seq, i, offset) {
  if (i - offset < 0 || seq[i - offset] === 0) return null;
  return (seq[i] / seq[i - offset] - 1.0) * 100.0;
}
function isNoticeDay(stockCum, mktCum, closeNow, closeFirst) {
  if (stockCum == null || mktCum == null || closeNow < MIN_PRICE) return false;
  const diff = stockCum - mktCum;
  const gap = closeFirst != null ? Math.abs(closeNow - closeFirst) : 0.0;
  if (stockCum > T_STRONG && diff >= DIFF) return true;
  if (stockCum > T_WEAK && diff >= DIFF && gap >= GAP) return true;
  if (stockCum < -T_STRONG && diff <= -DIFF) return true;
  if (stockCum < -T_WEAK && diff <= -DIFF && gap >= GAP) return true;
  return false;
}
function simulateWorstCase(closes, flags, marketFlat, offset) {
  let best = null;
  for (const [direction, sign] of [["up", 1], ["down", -1]]) {
    const sim = closes.slice();
    const window = flags.slice(-WIN10);
    for (let day = 1; day <= MAX_SIM_DAYS; day++) {
      sim.push(sim[sim.length - 1] * (1 + sign * LIMIT_PCT / 100));
      const i = sim.length - 1;
      const sc = cumPct(sim, i, offset);
      const first = i - (offset - 1) >= 0 ? sim[i - (offset - 1)] : null;
      const flag = isNoticeDay(sc, marketFlat, sim[i], first);
      window.push(flag);
      if (window.length > WIN10) window.shift();
      let consec = 0;
      for (let k = window.length - 1; k >= 0; k--) { if (window[k]) consec++; else break; }
      const in10 = window.filter(Boolean).length;
      if (consec >= CONSEC_DISP || in10 >= CNT10) {
        if (best == null || day < best.days) best = { days: day, dir: direction };
        break;
      }
    }
  }
  return best;
}
function computeNotice(dates, closes, marketMap, marketTomorrow, exempt, offset) {
  offset = offset || OFFSET;
  if (!dates.length || dates.length < offset + 2) return null;
  const flags = dates.map((d, i) => {
    const sc = cumPct(closes, i, offset);
    const mc = marketMap[d];
    const first = i - (offset - 1) >= 0 ? closes[i - (offset - 1)] : null;
    return isNoticeDay(sc, mc == null ? null : mc, closes[i], first);
  });
  let consec = 0;
  for (let i = flags.length - 1; i >= 0; i--) { if (flags[i]) consec++; else break; }
  const in10 = flags.slice(-WIN10).filter(Boolean).length;
  const toDisp = Math.min(Math.max(0, CONSEC_DISP - consec), Math.max(0, CNT10 - in10));

  const baseS = closes[closes.length - offset];
  const firstClose = closes[closes.length - 5], today = closes[closes.length - 1];
  const mkt = marketTomorrow != null ? marketTomorrow : 0.0;
  const up1 = baseS * (1 + Math.max(T_STRONG, mkt + DIFF) / 100);
  const up2 = Math.max(baseS * (1 + Math.max(T_WEAK, mkt + DIFF) / 100), firstClose + GAP);
  const up = Math.min(up1, up2);
  const dn1 = baseS * (1 + Math.min(-T_STRONG, mkt - DIFF) / 100);
  const dn2 = Math.min(baseS * (1 + Math.min(-T_WEAK, mkt - DIFF) / 100), firstClose - GAP);
  const dn = Math.max(dn1, dn2);
  const upReach = up <= today * 1.10, dnReach = dn >= today * 0.90;

  let soonest;
  if (toDisp === 0) soonest = 0;
  else if (upReach || dnReach) soonest = toDisp;
  else soonest = null;

  let soonestWorst = null, worstDir = null;
  if (soonest === null) {
    const sim = simulateWorstCase(closes, flags, mkt, offset);
    if (sim) { soonestWorst = sim.days; worstDir = sim.dir; }
  }

  const sCum = cumPct(closes, closes.length - 1, offset);
  const mCum = marketMap[dates[dates.length - 1]];
  const diff = (sCum != null && mCum != null) ? round(sCum - mCum, 1) : null;

  return {
    on_notice: !!flags[flags.length - 1],
    consec, in10, to_disp: toDisp,
    soonest, soonest_worst: soonestWorst, worst_dir: worstDir,
    stock_cum: sCum != null ? round(sCum, 1) : null,
    market_cum: mCum != null ? round(mCum, 1) : null,
    diff,
    up: round(up, 2), up_reach: upReach,
    down: round(dn, 2), down_reach: dnReach,
    approx: true   // Worker 版一律用 TAIEX 近似全體市場，跟每日批次的「真.全體」精準版不同，永遠標近似
  };
}

async function buildQuote(code, token) {
  const start = isoDaysAgo(RECENT_DAYS), end = isoDaysAgo(0);
  const [priceRows, instRows, taiexRows] = await Promise.all([
    fm("TaiwanStockPrice", code, start, end, token),
    fm("TaiwanStockInstitutionalInvestorsBuySell", code, start, end, token),
    fm("TaiwanStockTotalReturnIndex", "TAIEX", start, end, token).catch(() => [])
  ]);
  if (!priceRows.length) return null;

  const byDate = {};
  for (const r of priceRows) byDate[r.date] = { close: r.close, volume: r.Trading_Volume };

  const instByDate = {};
  for (const r of instRows) {
    const net = (r.buy - r.sell) / 1000;   // 股 → 張
    const d = instByDate[r.date] || (instByDate[r.date] = { foreign: 0, trust: 0, dealer: 0, total: 0 });
    if (r.name === "Foreign_Investor" || r.name === "Foreign_Dealer_Self") d.foreign += net;
    if (r.name === "Investment_Trust") d.trust += net;
    if (r.name === "Dealer_self" || r.name === "Dealer_Hedging") d.dealer += net;
    d.total += net;
  }

  const dates = Object.keys(byDate).sort();
  const closes = dates.map(d => byDate[d].close);
  const last = dates[dates.length - 1];
  const priceNow = closes[closes.length - 1];
  if (!(priceNow > 0)) return null;

  const dayChange = closes.length >= 2
    ? round((closes[closes.length - 1] / closes[closes.length - 2] - 1) * 100, 2) : 0;
  const monthBase = closes.length > MONTH_DAYS ? closes[closes.length - 1 - MONTH_DAYS] : closes[0];
  const monthChange = monthBase ? round((priceNow / monthBase - 1) * 100, 1) : 0;

  // 只用「有公布法人資料」的日子算方向/取今日買賣超；還沒公布(常見於剛收盤當天)不當作真的0，
  // 不然會把「還不知道」誤顯示/誤算成「持平」。
  const last5 = dates.slice(-5).filter(d => instByDate[d]).map(d => instByDate[d].total);
  const gross = last5.reduce((a, b) => a + Math.abs(b), 0);
  const sum = last5.reduce((a, b) => a + b, 0);
  const bigPlayer = gross === 0 ? "flat" : (sum / gross >= DEADZONE ? "buy" : (sum / gross <= -DEADZONE ? "sell" : "flat"));

  const today = instByDate[last];
  const vol = byDate[last].volume;

  // 注意/處置風險：用 TAIEX 六日累積% 當全體市場近似值（見檔案開頭說明）
  let notice = null;
  if (taiexRows.length > OFFSET) {
    const txMap = {};
    for (const r of taiexRows) txMap[r.date] = r.price;
    const txDates = Object.keys(txMap).sort();
    const marketMap = {};
    for (let i = OFFSET; i < txDates.length; i++) {
      const base = txMap[txDates[i - OFFSET]];
      if (base) marketMap[txDates[i]] = (txMap[txDates[i]] / base - 1) * 100;
    }
    let marketTomorrow = null;
    if (txDates.length > OFFSET) {
      const base = txMap[txDates[txDates.length - OFFSET]];
      if (base) marketTomorrow = (txMap[txDates[txDates.length - 1]] / base - 1) * 100;
    }
    notice = computeNotice(dates, closes, marketMap, marketTomorrow, false, OFFSET);
  }

  return {
    price: priceNow,
    day_change_pct: dayChange,
    month_change_pct: monthChange,
    volume: vol != null ? Math.round(vol / 1000) : null,
    foreign_net: today ? Math.round(today.foreign) : null,
    trust_net: today ? Math.round(today.trust) : null,
    dealer_net: today ? Math.round(today.dealer) : null,
    total_net: today ? Math.round(today.total) : null,
    big_player: bigPlayer,
    spark: closes.slice(-SPARK_DAYS).map(v => round(v, 2)),
    updated: last,
    notice,
    live: true   // 標記：這是即時抓的，不是每日批次快照（前端用來顯示提示）
  };
}
