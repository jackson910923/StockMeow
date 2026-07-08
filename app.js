/* 我的持股 — 純前端，不含 token、不跑 Python。
 * 市場資料來自同層 data.json；全市場股名來自 names.json；
 * 個人持股存在瀏覽器本機(localStorage)，不會進 repo。 */

// ── 離線備援：雙擊開啟、瀏覽器擋掉 file:// 的 fetch 時，畫面照樣有東西看。
const FALLBACK_DATA = {
  updated: "2026-06-26", is_sample: true,
  hot: ["2330","2317"],
  stocks: {
    "3481": { name:"群創",   price:64.40,  big_player:"sell", day_change_pct:-2.1, month_change_pct:28, buzz:"high",  spark:[48,50,52,49,53,56,55,58,60,59,62,64.4], sentiment:{posts:125,bull:24,bear:7}, volume:522735, foreign_net:14821, trust_net:244, dealer_net:-120, total_net:14945, notice:{on_notice:false,consec:0,in10:5,to_disp:1,soonest:null,stock_cum:4.1,market_cum:-1.9,diff:6.0,up:85.0,up_reach:false,down:43.8,down_reach:false,approx:false} },
    "6116": { name:"彩晶",   price:18.80,  big_player:"buy",  day_change_pct:1.3,  month_change_pct:-5, buzz:"quiet", spark:[20,19.5,19,18.6,18.8,18.2,18.5,18.9,18.3,18.6,18.7,18.8], sentiment:{posts:19,bull:38,bear:2}, notice:{on_notice:false,consec:0,in10:1,to_disp:3,up:24.8,up_reach:false,down:12.8,down_reach:false} },
    "2330": { name:"台積電", price:1085.0, big_player:"buy",  day_change_pct:0.8,  month_change_pct:6,  buzz:"high",  spark:[1020,1035,1010,1050,1060,1045,1070,1065,1080,1075,1082,1085] },
    "2317": { name:"鴻海",   price:203.5,  big_player:"flat", day_change_pct:-0.5, month_change_pct:-2, buzz:"quiet", spark:[208,206,209,205,207,204,206,203,205,202,204,203.5] }
  }
};

const DEFAULT_HOLDINGS = [];
const DEFAULT_SETTINGS = { colorMode:"tw", unit:"wan" };
const LS_HOLD = "myholdings_v1", LS_SET = "mysettings_v1";
const PALETTE = ["#3a6ea5","#e23744","#18a058","#f0a020","#8a5cf6","#1aa3a3","#d6336c","#f76707","#0ca678","#7048e8"];

let DATA = FALLBACK_DATA;
let NAMES_ALL = null;
let holdings = loadJSON(LS_HOLD, DEFAULT_HOLDINGS);
let settings = Object.assign({}, DEFAULT_SETTINGS, loadJSON(LS_SET, {}));

// ── 工具 ─────────────────────────────────────────────
function loadJSON(k, dflt){ try{ const v=JSON.parse(localStorage.getItem(k)); return v ?? dflt; }catch{ return dflt; } }
function saveHoldings(){ localStorage.setItem(LS_HOLD, JSON.stringify(holdings)); }
function saveSettings(){ localStorage.setItem(LS_SET, JSON.stringify(settings)); }

function money(n){
  if(settings.unit==="wan") return (n/10000).toLocaleString("zh-TW",{maximumFractionDigits:1})+" 萬";
  return Math.round(n).toLocaleString("zh-TW")+" 元";
}
function num(n,d=2){ return Number(n).toLocaleString("zh-TW",{maximumFractionDigits:d}); }

// 改寫金融色彩系統：配合台股/國際切換，輸出 Tailwind 專用文字與背景色彩 Class
function gainColorConfig(v){
  const isUp = v >= 0;
  const mode = settings.colorMode;
  if ((mode === "tw" && isUp) || (mode === "intl" && !isUp)) {
    return { text: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20", badge: "bg-rose-500/10 text-rose-400" };
  }
  return { text: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", badge: "bg-emerald-500/10 text-emerald-400" };
}

function gainClass(v){ return v >= 0 ? "gain" : "loss"; }
function arrow(v){ return v>0?"▲":(v<0?"▼":"—"); }

const WORKER_URL = "https://stockmeow-quote.jackson2002923.workers.dev";
const liveQuotes = {};
const liveAttempted = new Set();
function fetchLiveQuote(code){
  if(!WORKER_URL || liveAttempted.has(code)) return;
  liveAttempted.add(code);
  fetch(`${WORKER_URL}/quote?code=${encodeURIComponent(code)}`)
    .then(r=>r.ok ? r.json() : null)
    .then(q=>{ if(q && !q.error){ liveQuotes[code]=q; render(); } })
    .catch(()=>{});
}

const REPO = "jackson910923/StockMeow";
function requestListingUrl(code){
  const title = `追蹤請求: ${code}`, body = `自動請求加入追蹤清單：${code}`;
  return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
function wasRequested(code){ return loadJSON("requested_codes_v1", []).includes(code); }
function markRequested(code){
  const s = new Set(loadJSON("requested_codes_v1", []));
  s.add(code);
  localStorage.setItem("requested_codes_v1", JSON.stringify([...s]));
}
function requestListing(code){
  window.open(requestListingUrl(code), "_blank");
  markRequested(code); render();
}
function resolveName(code){
  return (DATA.stocks && DATA.stocks[code] && DATA.stocks[code].name)
      || (NAMES_ALL && NAMES_ALL[code]) || code;
}
function loadNames(){
  if(NAMES_ALL) return Promise.resolve(NAMES_ALL);
  return fetch("names.json",{cache:"force-cache"})
    .then(r=>r.ok?r.json():{}).then(j=>{NAMES_ALL=j; return j;})
    .catch(()=>{NAMES_ALL={}; return {};});
}

function bigPlayerText(v){
  if(v==="buy")  return "🟢 大戶買進";
  if(v==="sell") return "🔴 大戶賣出";
  if(v==="flat") return "⚪ 大戶平淡";
  return null;
}
function monthText(p){
  if(p==null) return null;
  if(p>=1)  return "月漲 "+Math.round(p)+"%";
  if(p<=-1) return "月跌 "+Math.round(Math.abs(p))+"%";
  return "月平盤";
}
function miniMonth(p){
  if(p==null) return null;
  return "月 " + (p>=0?"+":"−") + Math.abs(Math.round(p)) + "%";
}
function miniSentiment(s){
  if(!s || s.posts==null) return null;
  const hot = s.posts>=40 ? "🔥" : (s.posts>=8 ? "💬" : "😴");
  const b = s.bull||0, r = s.bear||0;
  const dir = (b+r>=3) ? (b>r ? " 多" : r>b ? " 空" : "") : "";
  return `${hot} ${s.posts}篇${dir}`;
}
function buzzText(v){
  if(v==="high")  return "🔥 網路上熱烈";
  if(v==="quiet") return "😴 網路安靜";
  return null;
}
function sentimentText(s){
  if(!s || s.posts==null) return null;
  const hot = s.posts>=40 ? "🔥" : (s.posts>=8 ? "💬" : "😴");
  let t = `${hot} 同學會今日 ${s.posts} 篇討論`;
  const b = s.bull||0, r = s.bear||0;
  if(b + r >= 3){
    const w = b>r ? "看多偏強" : r>b ? "看空偏多" : "多空拉鋸";
    t += ` (${b}:${r})`;
  }
  return t;
}
function marketTilt(s){
  if(!s) return 0;
  const b = s.bull||0, r = s.bear||0;
  if(b + r < 3) return 0;
  return b>r ? 1 : r>b ? -1 : 0;
}
function signalSummary(r){
  const bp = r.big_player==="buy" ? 1 : r.big_player==="sell" ? -1 : 0;
  const st = marketTilt(r.sentiment);
  if(bp === 0 || st === 0) return null;
  if(bp > 0 && st > 0) return "📈 大戶與網路社群情緒同步偏多";
  if(bp < 0 && st < 0) return "📉 大戶出貨與社群情緒共識偏空";
  return `⚖️ 大戶與散戶情緒方向分歧`;
}
function pctTo(from, to){ const p=(to/from-1)*100; return (p>=0?"+":"")+p.toFixed(1)+"%"; }
function fmtVol(v){ if(v==null) return null; return v>=10000 ? (v/10000).toFixed(1)+" 萬張" : v.toLocaleString("zh-TW")+" 張"; }
function fmtNet(v){
  if(v==null) return "—";
  if(v===0) return "持平";
  const a=Math.abs(v), s = a>=10000 ? (a/10000).toFixed(1)+"萬張" : a.toLocaleString("zh-TW")+"張";
  return (v>0?"買超 ":"賣超 ")+s;
}
function miniInst(lbl, v){
  if(v==null||v===0) return null;
  const a=Math.abs(v), s = a>=10000 ? (a/10000).toFixed(1)+"萬" : a.toLocaleString("zh-TW");
  return (v>0?`${lbl}+` : `${lbl}-`) + s;
}

// 法人買賣超區塊 (優化為高密度表格)
function instnetRow(r){
  if(r.foreign_net==null && r.trust_net==null && r.dealer_net==null && r.total_net==null) return "";
  const item = (lbl, v) => {
    if(v==null) return "";
    const cfg = gainColorConfig(v);
    return `<div class="flex justify-between items-center text-xs py-0.5">
              <span class="text-slate-400 font-medium">${lbl}</span>
              <span class="${cfg.text} font-bold font-mono">${fmtNet(v)}</span>
            </div>`;
  };
  const totalCfg = gainColorConfig(r.total_net || 0);
  return `
    <div class="mt-3 pt-2 border-t border-slate-800/80 space-y-1">
      ${item("外資買賣超", r.foreign_net)}
      ${item("投信買賣超", r.trust_net)}
      ${item("自營買賣超", r.dealer_net)}
      <div class="flex justify-between items-center text-xs pt-1.5 border-t border-dashed border-slate-800/60 font-semibold">
        <span class="text-slate-300">三大法人合計</span>
        <span class="${totalCfg.text} font-mono">${fmtNet(r.total_net)}</span>
      </div>
    </div>`;
}
  const totalCfg = gainColorConfig(r.total_net || 0);
  return `
    <div class="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1">
      ${item("外資買賣超", r.foreign_net)}
      ${item("投信買賣超", r.trust_net)}
      ${item("自營買賣超", r.dealer_net)}
      <div class="flex justify-between items-center text-[11px] pt-1 border-t border-dashed border-slate-800/60 font-semibold">
        <span class="text-slate-300">三大法人合計</span>
        <span class="${totalCfg.text} font-mono">${fmtNet(r.total_net)}</span>
      </div>
    </div>`;
}

function addTradingDays(dateStr, n){
  if(!dateStr || n==null) return null;
  const d = new Date(dateStr+"T00:00:00");
  if(isNaN(d)) return null;
  for(let added=0; added<n; ){
    d.setDate(d.getDate()+1);
    const wd = d.getDay();
    if(wd!==0 && wd!==6) added++;
  }
  return d;
}
function fmtDateOnly(n){
  const d = addTradingDays(DATA.updated, n);
  return d ? `${d.getMonth()+1}/${d.getDate()}` : "";
}
function fmtSoonDate(n){
  const s = fmtDateOnly(n);
  return s ? `（約 ${s}）` : "";
}
function noticeHead(n){
  if(n.soonest===0)     return "已達處置標準";
  if(n.soonest!=null)   return `最快 ${n.soonest} 交易日後可能處置`;
  if(n.in10>0)          return `近10日 ${n.in10} 次注意`;
  return "處置風險低";
}

// 處置風險折疊面板 (優化視覺層級與警示標籤)
function noticeBox(n, price, live){
  if(!n) return "";
  const danger = n.soonest===0 || n.on_notice;
  const warn = !danger && (n.soonest!=null || n.to_disp<=1);
  const bgCls = danger ? "bg-rose-500/5 border-rose-500/20 text-rose-300" : warn ? "bg-amber-500/5 border-amber-500/20 text-amber-300" : "bg-slate-900/40 border-slate-800 text-slate-400";
  const badgeCls = danger ? "bg-rose-500/20 text-rose-400" : warn ? "bg-amber-500/20 text-amber-400" : "bg-slate-800 text-slate-400";
  const filled = Math.max(0, Math.min(100, Math.round((n.in10/6)*100)));
  
  let thr;
  if(n.up!=null || n.down!=null) {
    const p=[];
    if(n.up!=null)   p.push(`漲過 ${num(n.up)}` + (n.up_reach ? "" : "(明日極限外)"));
    if(n.down!=null) p.push(`跌破 ${num(n.down)}` + (n.down_reach ? "" : "(明日極限外)"));
    thr = `<div class="text-[10px] leading-tight text-slate-400 mt-1"><b>注意條件：</b>收盤 ${p.join(" 或 ")}</div>`;
  } else {
    thr = "";
  }

  return `
    <div class="border rounded-xl p-2.5 my-2.5 ${bgCls}">
      <div class="flex justify-between items-center">
        <span class="text-[11px] font-bold flex items-center gap-1">📋 ${noticeHead(n)}</span>
        <span class="text-[9px] font-mono px-1.5 py-0.5 rounded ${badgeCls}">觸及量 ${n.in10}/6</span>
      </div>
      <div class="w-full bg-slate-950 h-1 rounded-full overflow-hidden mt-1.5">
        <div class="${danger ? 'bg-rose-500' : warn ? 'bg-amber-500' : 'bg-slate-700'} h-full" style="width:${filled}%"></div>
      </div>
      ${thr}
    </div>`;
}

function miniNotice(n){
  if(!n) return null;
  if(n.to_disp===0) return "🚨 處置臨界";
  if(n.to_disp<=1)  return `⚠️ 距處置 ${n.to_disp}`;
  return null;
}

function todayBadge(day){
  if(day==null) return "";
  const cfg = gainColorConfig(day);
  return `<span class="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${cfg.bg} ${cfg.text}">${arrow(day)} ${Math.abs(day).toFixed(1)}%</span>`;
}

// 繪製 TradingView 精美漸層走勢圖
function sparkline(vals){
  if(!Array.isArray(vals) || vals.length<2) return "";
  const w=300, h=40, p=2;
  const min=Math.min(...vals), max=Math.max(...vals), rng=(max-min)||1;
  const step=(w-2*p)/(vals.length-1);
  const xy=vals.map((v,i)=>[p+i*step, h-p-((v-min)/rng)*(h-2*p)]);
  const line=xy.map((c,i)=>(i?"L":"M")+c[0].toFixed(1)+" "+c[1].toFixed(1)).join(" ");
  const area=line+` L ${(w-p).toFixed(1)} ${h-p} L ${p} ${h-p} Z`;
  const trendDir = vals[vals.length-1] - vals[0];
  const isUp = trendDir >= 0;
  const strokeColor = isUp ? "#ef4444" : "#10b981";
  const fillId = isUp ? "gradUp" : "gradDown";

  return `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="w-full h-10 overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id="gradUp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ef4444" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#ef4444" stop-opacity="0.0"/>
        </linearGradient>
        <linearGradient id="gradDown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#10b981" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#${fillId})"/>
      <path d="${line}" fill="none" stroke="${strokeColor}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
    </svg>`;
}

function donut(items){
  const size=140, r=64, ir=44, cx=size/2, cy=size/2;
  const total=items.reduce((a,b)=>a+b.value,0)||1;
  if(items.length===1){
    return `<svg viewBox="0 0 ${size} ${size}" class="w-28 h-28 mx-auto" aria-hidden="true">
      <circle cx="${cx}" cy="${cy}" r="${(r+ir)/2}" fill="none" stroke="${items[0].color}" stroke-width="${r-ir}"/></svg>`;
  }
  let ang=-Math.PI/2, paths="";
  for(const it of items){
    const frac=it.value/total, a2=ang+frac*2*Math.PI, big=frac>0.5?1:0;
    const x1=cx+r*Math.cos(ang),  y1=cy+r*Math.sin(ang);
    const x2=cx+r*Math.cos(a2),   y2=cy+r*Math.sin(a2);
    const xi2=cx+ir*Math.cos(a2), yi2=cy+ir*Math.sin(a2);
    const xi1=cx+ir*Math.cos(ang),yi1=cy+ir*Math.sin(ang);
    paths+=`<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${big} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L ${xi2.toFixed(1)} ${yi2.toFixed(1)} A ${ir} ${ir} 0 ${big} 0 ${xi1.toFixed(1)} ${yi1.toFixed(1)} Z" fill="${it.color}"/>`;
    ang=a2;
  }
  return `<svg viewBox="0 0 ${size} ${size}" class="w-28 h-28 mx-auto" aria-hidden="true">${paths}</svg>`;
}

// ── 計算核心 ───────────────────────────────────────────
function compute(h){
  const s = (DATA.stocks && DATA.stocks[h.stock_id]) || liveQuotes[h.stock_id];
  const shares = Number(h.shares)||0, cost = Number(h.cost_per_share)||0;
  const name = resolveName(h.stock_id);
  if(!s || s.price==null){
    fetchLiveQuote(h.stock_id);
    return { id:h.stock_id, name, shares, cost, missing:true };
  }
  const mv = shares*1000*s.price, costTotal = shares*1000*cost;
  const profit = mv-costTotal, pct = costTotal>0 ? profit/costTotal*100 : 0;
  const alerts = [];
  if(cost>0 && s.price<cost) alerts.push("股價已跌破本機設定成本");
  if(s.big_player==="sell")  alerts.push("籌碼面：大戶近期偏向賣方");
  return { id:h.stock_id, name, shares, cost, price:s.price, mv, profit, pct,
           big_player:s.big_player, month:s.month_change_pct, buzz:s.buzz,
           spark:s.spark, day:s.day_change_pct, alerts, sentiment:s.sentiment, notice:s.notice, volume:s.volume,
           foreign_net:s.foreign_net, trust_net:s.trust_net, dealer_net:s.dealer_net, total_net:s.total_net,
           live:s.live };
}

// ── 畫面渲染引擎 ────────────────────────────────────────
function render(){
  document.getElementById("updated").textContent = "最近收盤日：" + (DATA.updated||"—");
  document.getElementById("sample").hidden = !DATA.is_sample;
  const rows = holdings.map(compute);
  renderSummary(rows);
  renderCards(rows);
  renderAllocation(rows);
  renderHot();
  renderInstRank();
  renderRiskBoard();
}

// 資產概要美化 (黑金高對比面板)
function renderSummary(rows){
  const el = document.getElementById("summary");
  const valid = rows.filter(r=>!r.missing);
  if(!valid.length){ el.hidden = true; return; }
  el.hidden = false;
  const mv = valid.reduce((a,r)=>a+r.mv,0);
  const profit = valid.reduce((a,r)=>a+r.profit,0);
  const costTotal = valid.reduce((a,r)=>a+r.shares*1000*r.cost,0);
  const pct = costTotal>0 ? profit/costTotal*100 : 0;
  const cfg = gainColorConfig(profit);
  const sign = profit >= 0 ? "+" : "−";

  el.innerHTML = `
    <div class="grid grid-cols-2 gap-4 items-center">
      <div>
        <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">投資組合總現值</div>
        <div class="text-2xl font-black font-mono text-slate-100 tracking-tight mt-0.5">${money(mv)}</div>
      </div>
      <div class="border-l border-slate-800 pl-4">
        <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">預估累計損益</div>
        <div class="text-2xl font-black font-mono ${cfg.text} tracking-tight mt-0.5 flex items-baseline gap-2">
          ${money(Math.abs(profit))}
          <span class="text-xs font-bold px-1.5 py-0.5 rounded ${cfg.bg}">${sign}${Math.abs(Math.round(pct))}%</span>
        </div>
      </div>
    </div>`;
}

// 核心功能：重構股票主卡片 (TradingView 高密度黑金版)
function card(r){
  if(r.missing){
    const reqBlock = wasRequested(r.id)
      ? `<div class="text-[11px] bg-slate-900/80 border border-slate-800 text-slate-400 rounded-lg p-3 my-2">「${r.name}」尚無市價資料，已發出追蹤，等待後端批次計算併入。</div>`
      : `<div class="text-[11px] bg-slate-900/80 border border-slate-800 text-slate-400 rounded-lg p-3 my-2">「${r.name}」尚無收錄。</div>
         <button class="w-full text-center bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold py-1.5 rounded-lg transition-colors" onclick="requestListing('${r.id}')">📌 一鍵送出追蹤請求</button>`;
    return `
    <div class="bg-[#151D30] border border-slate-800/90 rounded-2xl p-5 shadow-xl flex flex-col justify-between transition-all duration-300 hover:border-slate-700 hover:scale-[1.005]">
      <div class="flex justify-between items-start mb-1">
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-base font-bold text-slate-100 tracking-tight">${r.name}</span>
            <span class="text-xs font-mono text-slate-500 font-medium">${r.id}</span>
          </div>
          <p class="text-xs text-slate-400 mt-1 font-mono">持倉: ${r.shares}張 · 成本: ${num(r.cost)}</p>
        </div>
        <div class="text-right">
          <p class="text-lg font-mono font-black text-slate-100 tracking-tight leading-none mb-1">${num(r.price)}</p>
          ${todayBadge(r.day)}
        </div>
      </div>

      ${liveBlock}

      <div class="bg-slate-950/30 border border-slate-800/40 rounded-xl p-3.5 my-3 flex justify-between items-center">
        <div>
          <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">持有損益金額</span>
          <span class="text-xl font-black font-mono ${cfg.text}">${word} ${money(Math.abs(r.profit))}</span>
        </div>
        <div class="text-right">
          <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">報酬率</span>
          <span class="text-base font-black font-mono ${cfg.text}">${sign}${Math.abs(Math.round(r.pct))}%</span>
        </div>
      </div>

      ${signalBlock}
      ${alertBlock}
      ${noticeBlk}
      
      <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-xs font-mono mt-1 pt-2 border-t border-slate-800/40">
        <div class="flex justify-between border-b border-slate-800/30 pb-1"><span class="text-slate-500">資產現值</span><span class="text-slate-300 font-semibold">${money(r.mv)}</span></div>
        <div class="flex justify-between border-b border-slate-800/30 pb-1"><span class="text-slate-500">今日成交</span><span class="text-slate-300 font-semibold">${r.volume!=null?fmtVol(r.volume):"—"}</span></div>
      </div>

      ${instnetRow(r)}

      ${r.sentiment?.posts ? `
        <div class="mt-3 bg-slate-950/20 border border-slate-800/40 p-2.5 rounded-lg text-[11px] text-slate-400 leading-relaxed font-sans">
          ${sentimentText(r.sentiment)}
        </div>
      ` : ""}

      <div class="flex flex-wrap gap-1.5 mt-3">${chips}</div>
    </div>`;
  }

  const cfg = gainColorConfig(r.profit);
  const word = r.profit >= 0 ? "賺" : "賠";
  const sign = r.profit >= 0 ? "+" : "−";
  
  const chips = [bigPlayerText(r.big_player), monthText(r.month), buzzText(r.buzz)]
                .filter(Boolean).map(t=>`<span class="bg-slate-950/60 border border-slate-800/80 text-slate-400 font-mono px-1.5 py-0.5 rounded text-[10px]">${t}</span>`).join("");
  
  const sparkSvg = sparkline(r.spark);
  const trendDir = (Array.isArray(r.spark) && r.spark.length > 1) ? r.spark[r.spark.length-1] - r.spark[0] : 0;
  const sparkBlock = sparkSvg ? `<div class="mt-2.5 pt-2 border-t border-slate-800/60"><div class="text-[9px] text-slate-500 font-medium mb-1 tracking-wider uppercase">近季走勢線</div>${sparkSvg}</div>` : "";
  
  const alertBlock = (r.alerts && r.alerts.length) ? `<div class="mt-2 space-y-1">${r.alerts.map(a=>`<div class="text-[10px] bg-amber-500/5 border border-amber-500/10 text-amber-400/90 p-1.5 rounded-md font-medium">⚠️ ${a}</div>`).join("")}</div>` : "";
  const sig = signalSummary(r);
  const signalBlock = sig ? `<div class="text-[10px] bg-indigo-500/5 border border-indigo-500/10 text-indigo-400 p-2 rounded-lg font-medium flex justify-between items-center mt-2"><span>${sig}</span><span class="text-[9px] bg-indigo-500/20 px-1 rounded text-indigo-300">策略</span></div>` : "";
  const noticeBlk = noticeBox(r.notice, r.price, r.live);
  
  const liveBlock = r.live
    ? `<div class="text-[10px] text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded-md p-1.5 mb-2 font-mono">⚡ 即時報價連線中` + 
       (wasRequested(r.id) ? ` (已加入永久追蹤)` : ` <button class="text-rose-400 underline ml-1" onclick="requestListing('${r.id}')">[永續收錄]</button>`) + `</div>`
    : "";

  return `
    <div class="bg-[#151D30] border border-slate-800/90 rounded-2xl p-4 shadow-xl flex flex-col justify-between transition-all duration-300 hover:border-slate-700 hover:scale-[1.005]">
      <div class="flex justify-between items-start">
        <div>
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-sm font-bold text-slate-100 tracking-tight">${r.name}</span>
            <span class="text-xs font-mono text-slate-500">${r.id}</span>
          </div>
          <p class="text-[11px] text-slate-400 mt-0.5 font-mono">持倉: ${r.shares}張 · 成本: ${num(r.cost)}</p>
        </div>
        <div class="text-right">
          <p class="text-base font-mono font-black text-slate-100 tracking-tight">${num(r.price)}</p>
          ${todayBadge(r.day)}
        </div>
      </div>

      ${liveBlock}

      <div class="bg-slate-950/30 border border-slate-800/40 rounded-xl p-3 my-2.5 flex justify-between items-center">
        <div>
          <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">持有損益金額</span>
          <span class="text-lg font-black font-mono ${cfg.text}">${word} ${money(Math.abs(r.profit))}</span>
        </div>
        <div class="text-right">
          <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">報酬率</span>
          <span class="text-sm font-black font-mono ${cfg.text}">${sign}${Math.abs(Math.round(r.pct))}%</span>
        </div>
      </div>

      ${signalBlock}
      ${alertBlock}
      ${noticeBlk}
      
      <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] font-mono mt-1 pt-1 border-t border-slate-800/40">
        <div class="flex justify-between border-b border-slate-800/30 pb-0.5"><span class="text-slate-500">資產現值</span><span class="text-slate-300 font-semibold">${money(r.mv)}</span></div>
        <div class="flex justify-between border-b border-slate-800/30 pb-0.5"><span class="text-slate-500">今日成交</span><span class="text-slate-300 font-semibold">${r.volume!=null?fmtVol(r.volume):"—"}</span></div>
      </div>

      ${instnetRow(r)}

      ${r.sentiment?.posts ? `
        <div class="mt-2.5 bg-slate-950/20 border border-slate-800/40 p-2 rounded-lg text-[10px] text-slate-400 leading-relaxed font-sans">
          ${sentimentText(r.sentiment)}
        </div>
      ` : ""}

      <div class="flex flex-wrap gap-1 mt-2.5">${chips}</div>
    </div>`;
}

function renderCards(rows){
  const el = document.getElementById("cards");
  if(!rows.length){
    el.innerHTML = `
      <div class="col-span-1 md:col-span-2 text-center py-12 border-2 border-dashed border-slate-800 rounded-2xl bg-[#151D30]/30">
        <p class="text-slate-400 text-sm">您的投資組合目前無持股資料。</p>
        <button class="mt-4 px-4 py-2 bg-gradient-to-r from-rose-500 to-orange-500 text-white font-bold text-xs rounded-xl hover:opacity-90 transition-opacity" onclick="openSettings()">➕ 點此設定/新增您的持股</button>
      </div>`;
    return;
  }
  el.innerHTML = rows.map(card).join("");
}

// 圓環分配圖優化 (更精巧對稱)
function renderAllocation(rows){
  const el = document.getElementById("allocation");
  const valid = rows.filter(r=>!r.missing && r.mv>0);
  if(valid.length < 2){ el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  const items = valid.map((r,i)=>({label:r.name, value:r.mv, color:PALETTE[i%PALETTE.length]}));
  const total = items.reduce((a,b)=>a+b.value,0);
  const legend = items.map(it=>`
    <div class="flex items-center justify-between text-xs font-mono border-b border-slate-800/50 pb-1">
      <div class="flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full block" style="background:${it.color}"></span>
        <span class="text-slate-300 font-medium">${it.label}</span>
      </div>
      <span class="text-slate-400 font-bold">${Math.round(it.value/total*100)}%</span>
    </div>`).join("");
    
  el.innerHTML = `
    <h2 class="text-sm font-bold text-slate-400 tracking-wider uppercase mb-3">💼 持股資產權重配置</h2>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
      <div>${donut(items)}</div>
      <div class="space-y-1.5">${legend}</div>
    </div>`;
}

// 熱門股卡片美化 (仿雅虎財經/TradingView 行情清單)
function hotCard(code){
  const s = DATA.stocks && DATA.stocks[code];
  if(!s) return "";
  const held = holdings.some(h=>h.stock_id===code);
  const spark = sparkline(s.spark);
  const dir = (Array.isArray(s.spark)&&s.spark.length>1) ? s.spark[s.spark.length-1]-s.spark[0] : 0;
  const chips = [bigPlayerText(s.big_player), miniInst("外",s.foreign_net), miniInst("投",s.trust_net), miniMonth(s.month_change_pct), miniSentiment(s.sentiment), miniNotice(s.notice)]
                .filter(Boolean).map(t=>`<span class="bg-slate-950 text-slate-400 border border-slate-800 rounded px-1 py-0.5 text-[9px] font-mono">${t}</span>`).join("");
  const action = held
    ? `<span class="text-[11px] font-bold text-slate-500 border border-slate-800 px-2 py-1 rounded-md bg-slate-950/40">✓ 已持有</span>`
    : `<button class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold px-2.5 py-1 rounded-md transition-colors" onclick="addFromHot('${code}')">＋ 自訂持股</button>`;
    
  return `
    <div class="bg-[#0B0F19]/40 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between transition-all hover:bg-[#0B0F19]/80">
      <div class="flex justify-between items-start">
        <div>
          <span class="text-xs font-bold text-slate-200 block">${s.name}</span>
          <span class="text-[10px] font-mono text-slate-500">${code}</span>
        </div>
        <div class="text-right">
          <span class="text-xs font-mono font-bold text-slate-200 block">${num(s.price)}</span>
          ${todayBadge(s.day_change_pct)}
        </div>
      </div>
      <div class="my-2">${spark}</div>
      <div class="flex flex-wrap gap-1 mb-2 h-8 overflow-hidden items-center">${chips}</div>
      <div class="text-right pt-1.5 border-t border-slate-800/40">${action}</div>
    </div>`;
}

let hotSortKey = "volume";
function hotSortValue(code, key){
  const s = DATA.stocks[code];
  if(key==="change") return s.day_change_pct ?? -Infinity;
  if(key==="buzz")   return (s.sentiment && s.sentiment.posts) || 0;
  return 0;
}
function renderHot(){
  const title = document.getElementById("hotTitle");
  const sortSel = document.getElementById("hotSort");
  const wrap = document.getElementById("hotCards");
  let hot = (DATA.hot||[]).filter(c=>DATA.stocks && DATA.stocks[c]);
  if(!hot.length){ title.hidden=true; sortSel.hidden=true; wrap.innerHTML=""; return; }
  title.hidden = false; sortSel.hidden = false;
  if(hotSortKey!=="volume") hot = [...hot].sort((a,b)=>hotSortValue(b,hotSortKey)-hotSortValue(a,hotSortKey));
  wrap.innerHTML = hot.map(hotCard).join("");
}

// 籌碼排行美化 (高資訊密度精細表格)
function instRankList(items){
  return items.map((it,i)=>{
    const cfg = gainColorConfig(it.net);
    return `
      <div class="flex items-center justify-between py-2 border-b border-slate-800/40 font-mono text-xs">
        <div class="flex items-center gap-2">
          <span class="w-6 text-[11px] text-slate-500 font-bold">#${String(i+1).padStart(2,'0')}</span>
          <span class="text-slate-300 font-medium">${it.name}</span>
          <span class="text-[11px] text-slate-600">${it.code}</span>
        </div>
        <span class="${cfg.text} font-bold">${num(Math.abs(it.net),0)} 張</span>
      </div>`;
  }).join("");
}
function renderInstRank(){
  const wrap = document.getElementById("instRankWrap");
  const buy = DATA.inst_buy_rank || [], sell = DATA.inst_sell_rank || [];
  if(!buy.length && !sell.length){ wrap.hidden = true; return; }
  wrap.hidden = false;
  document.getElementById("instBuyRank").innerHTML = instRankList(buy);
  document.getElementById("instSellRank").innerHTML = instRankList(sell);
}

// 風險看板排版美化 (Bloomberg Terminal 風格)
function riskLevel(n){
  if(!n) return { rank:3, cls: "border-slate-800 text-slate-400 bg-slate-900/10", label:"無資料", bCls:"bg-slate-800 text-slate-400" };
  const danger = n.soonest===0 || n.on_notice;
  const warn = !danger && (n.soonest!=null || n.to_disp<=1);
  if(danger) return { rank:0, cls: "border-rose-500/20 bg-rose-500/5 text-rose-300", label:"🚨 處置臨界", bCls:"bg-rose-500/20 text-rose-400" };
  if(warn)   return { rank:1, cls: "border-amber-500/20 bg-amber-500/5 text-amber-300", label:"⚠️ 注意警戒", bCls:"bg-amber-500/20 text-amber-400" };
  return       { rank:2, cls: "border-slate-800 bg-slate-900/20 text-slate-400", label:"常態安全", bCls:"bg-slate-800 text-slate-400" };
}
function riskRow(code){
  const s = DATA.stocks[code], n = s.notice;
  const lv = riskLevel(n);
  const held = holdings.some(h=>h.stock_id===code);
  const detail = n ? noticeHead(n) : "無異常注意紀錄";
  return `
    <div class="border rounded-xl p-2.5 flex items-center justify-between gap-3 ${lv.cls}">
      <div class="min-w-0 flex-1">
        <div class="text-xs font-bold text-slate-200 flex items-center gap-1.5">
          <span>${s.name}</span>
          <span class="text-[10px] font-mono text-slate-500">${code}</span>
          ${held ? '<span class="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" title="核心持股"></span>' : ''}
        </div>
        <div class="text-[10px] text-slate-400 font-medium truncate mt-0.5">${detail}</div>
      </div>
      <span class="text-[9px] font-bold px-2 py-0.5 rounded-md shrink-0 ${lv.bCls}">${lv.label}</span>
    </div>`;
}
function renderRiskBoard(){
  const panel = document.getElementById("riskPanel");
  if(!panel) return;
  const codes = Array.from(new Set([...holdings.map(h=>h.stock_id), ...(DATA.hot||[])]))
                .filter(c=>DATA.stocks && DATA.stocks[c] && DATA.stocks[c].notice);
  if(!codes.length){ panel.hidden = true; return; }
  panel.hidden = false;
  const rows = codes
    .map(c=>({ code:c, n:DATA.stocks[c].notice, lv:riskLevel(DATA.stocks[c].notice) }))
    .sort((a,b)=> a.lv.rank-b.lv.rank || (b.n.in10||0)-(a.n.in10||0));
  document.getElementById("riskBoard").innerHTML = rows.map(r=>riskRow(r.code)).join("");
}

// ── 設定面板元件 ───────────────────────────────────────
function openSettings(){
  return loadNames().then(()=>{ buildSettings(); document.getElementById("settings").hidden=false; });
}
function closeSettings(){ document.getElementById("settings").hidden=true; render(); }

function addFromHot(code){
  openSettings().then(()=>{
    const i=document.getElementById("addCode"); if(i) i.value = code+" "+resolveName(code);
    const sh=document.getElementById("addShares"); if(sh) sh.focus();
  });
}

function buildSettings(){
  const list = document.getElementById("holdingList");
  list.innerHTML = holdings.map((h,i)=>{
    const name = resolveName(h.stock_id);
    return `
      <div class="flex items-center gap-2 bg-[#151D30] border border-slate-800 p-2.5 rounded-xl text-xs font-mono">
        <div class="flex-1 min-w-0">
          <div class="font-bold text-slate-200 truncate">${name}</div>
          <div class="text-[10px] text-slate-500">${h.stock_id}</div>
        </div>
        <div class="flex items-center gap-1">
          <input type="number" min="0" step="1" value="${h.shares}" data-i="${i}" data-f="shares" class="w-16 bg-slate-950 text-slate-100 border border-slate-700 rounded p-1 text-center" aria-label="張數">
          <span class="text-slate-500 text-[10px]">張</span>
        </div>
        <div class="flex items-center gap-1">
          <input type="number" min="0" step="0.01" value="${h.cost_per_share}" data-i="${i}" data-f="cost_per_share" class="w-20 bg-slate-950 text-slate-100 border border-slate-700 rounded p-1 text-center" aria-label="成本">
          <span class="text-slate-500 text-[10px]">元</span>
        </div>
        <button class="text-slate-500 hover:text-rose-400 px-1 text-sm cursor-pointer" data-del="${i}" title="刪除">✕</button>
      </div>`;
  }).join("") || `<div class="text-xs text-slate-500 bg-slate-950/50 p-4 rounded-xl text-center border border-slate-800 border-dashed">目前尚未設定任何自訂持股，請使用下方表單新增。</div>`;

  const dl = document.getElementById("stockList");
  if(dl && NAMES_ALL && !dl.dataset.filled){
    dl.innerHTML = Object.keys(NAMES_ALL).map(c=>`<option value="${c} ${NAMES_ALL[c]}"></option>`).join("");
    dl.dataset.filled = "1";
  }
  document.getElementById("colorMode").value = settings.colorMode;
  document.getElementById("unit").value = settings.unit;
}

function parseCode(raw){
  const m = String(raw).trim().match(/\d{4,6}[A-Za-z]?/);
  return m ? m[0] : "";
}

// 全局事件委派監聽
document.addEventListener("input", e=>{
  const t=e.target;
  if(t.dataset.i!=null && t.dataset.f){
    const i=+t.dataset.i, f=t.dataset.f;
    holdings[i][f] = f==="shares" ? parseInt(t.value||0,10) : parseFloat(t.value||0);
    saveHoldings();
  }
});
document.addEventListener("click", e=>{
  const del=e.target.dataset.del;
  if(del!=null){ holdings.splice(+del,1); saveHoldings(); buildSettings(); }
});

function wireUp(){
  document.getElementById("openSettings").onclick = openSettings;
  document.getElementById("closeSettings").onclick = closeSettings;
  document.getElementById("settings").addEventListener("click", e=>{ if(e.target.id==="settings") closeSettings(); });

  document.getElementById("addBtn").onclick = () => {
    const code = parseCode(document.getElementById("addCode").value);
    if(!code){ alert("請輸入有效的股票代號，例如 2330"); return; }
    if(holdings.some(h=>h.stock_id===code)){ alert("此檔股票已存在於您的持股清單中"); return; }
    const sh=parseInt(document.getElementById("addShares").value||0,10);
    const co=parseFloat(document.getElementById("addCost").value||0);
    holdings.push({ stock_id:code, shares:sh||0, cost_per_share:co||0 });
    saveHoldings(); buildSettings(); render();
    document.getElementById("addCode").value="";
    document.getElementById("addShares").value="";
    document.getElementById("addCost").value="";
  };
  document.getElementById("hotSort").onchange = e=>{ hotSortKey = e.target.value; renderHot(); };
  document.getElementById("colorMode").onchange = e=>{ settings.colorMode=e.target.value; saveSettings(); };
  document.getElementById("unit").onchange = e=>{ settings.unit=e.target.value; saveSettings(); };
  document.getElementById("resetBtn").onclick = ()=>{
    if(confirm("確定要清除所有裝置上的設定與自訂持股資料嗎？（此動作無法復原）")){ localStorage.removeItem(LS_HOLD); localStorage.removeItem(LS_SET);
      holdings=DEFAULT_HOLDINGS.slice(); settings=Object.assign({},DEFAULT_SETTINGS); buildSettings(); render(); }
  };
}

// ── 系統初始化啟動 ───────────────────────────────────────
fetch("data.json",{cache:"no-store"})
  .then(r=>{ if(!r.ok) throw 0; return r.json(); })
  .then(d=>{ DATA=d; })
  .catch(()=>{ DATA=FALLBACK_DATA; })
  .finally(()=>{
    wireUp(); render();
    if(holdings.some(h=>!(DATA.stocks && DATA.stocks[h.stock_id]))) loadNames().then(render);
  });

if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
}