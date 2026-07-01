/**
 * StockMeow 即時報價 Worker：讓冷門股「一加就有資料」，不用等每日 CI 更新。
 * 前端直接 fetch 這支 Worker（伺服器端呼叫 FinMind，不受瀏覽器 CORS 限制），
 * 回傳的欄位形狀對齊 data.json 的 stocks[code]（但不含 sentiment/notice，那些要靠
 * 每日批次計算，這裡只做「今日收盤+近期法人+30天走勢」的輕量即時版）。
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

async function buildQuote(code, token) {
  const start = isoDaysAgo(RECENT_DAYS), end = isoDaysAgo(0);
  const [priceRows, instRows] = await Promise.all([
    fm("TaiwanStockPrice", code, start, end, token),
    fm("TaiwanStockInstitutionalInvestorsBuySell", code, start, end, token)
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

  const last5 = dates.slice(-5).map(d => (instByDate[d] && instByDate[d].total) || 0);
  const gross = last5.reduce((a, b) => a + Math.abs(b), 0);
  const sum = last5.reduce((a, b) => a + b, 0);
  const bigPlayer = gross === 0 ? "flat" : (sum / gross >= DEADZONE ? "buy" : (sum / gross <= -DEADZONE ? "sell" : "flat"));

  const today = instByDate[last] || { foreign: 0, trust: 0, dealer: 0, total: 0 };
  const vol = byDate[last].volume;

  return {
    price: priceNow,
    day_change_pct: dayChange,
    month_change_pct: monthChange,
    volume: vol != null ? Math.round(vol / 1000) : null,
    foreign_net: Math.round(today.foreign),
    trust_net: Math.round(today.trust),
    dealer_net: Math.round(today.dealer),
    total_net: Math.round(today.total),
    big_player: bigPlayer,
    spark: closes.slice(-SPARK_DAYS).map(v => round(v, 2)),
    updated: last,
    live: true   // 標記：這是即時抓的，不是每日批次快照（前端用來顯示提示）
  };
}
