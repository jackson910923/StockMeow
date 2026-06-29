/* 我的持股 — 純前端，不含 token、不跑 Python。
 * 市場資料來自同層 data.json；全市場股名來自 names.json；
 * 個人持股存在瀏覽器本機(localStorage)，不會進 repo。 */

// ── 離線備援：雙擊開啟、瀏覽器擋掉 file:// 的 fetch 時，畫面照樣有東西看。
const FALLBACK_DATA = {
  updated: "2026-06-26", is_sample: true,
  hot: ["2330","2317"],
  stocks: {
    "3481": { name:"群創",   price:64.40,  big_player:"sell", day_change_pct:-2.1, month_change_pct:28, buzz:"high",  spark:[48,50,52,49,53,56,55,58,60,59,62,64.4], sentiment:{posts:125,bull:24,bear:7}, notice:{on_notice:false,consec:0,in10:5,to_disp:1,up:85.0,up_reach:false,down:43.8,down_reach:false} },
    "6116": { name:"彩晶",   price:18.80,  big_player:"buy",  day_change_pct:1.3,  month_change_pct:-5, buzz:"quiet", spark:[20,19.5,19,18.6,18.8,18.2,18.5,18.9,18.3,18.6,18.7,18.8], sentiment:{posts:19,bull:38,bear:2}, notice:{on_notice:false,consec:0,in10:1,to_disp:3,up:24.8,up_reach:false,down:12.8,down_reach:false} },
    "2330": { name:"台積電", price:1085.0, big_player:"buy",  day_change_pct:0.8,  month_change_pct:6,  buzz:"high",  spark:[1020,1035,1010,1050,1060,1045,1070,1065,1080,1075,1082,1085] },
    "2317": { name:"鴻海",   price:203.5,  big_player:"flat", day_change_pct:-0.5, month_change_pct:-2, buzz:"quiet", spark:[208,206,209,205,207,204,206,203,205,202,204,203.5] }
  }
};

// ── 隱私：公開頁面預設「不放」任何持股（空陣列）。
//    你自己在「⚙️ 設定」新增的持股只會存在你這台瀏覽器(localStorage)，不會進 repo。
const DEFAULT_HOLDINGS = [];
const DEFAULT_SETTINGS = { colorMode:"tw", unit:"wan" }; // tw=漲紅跌綠, wan=金額用萬
const LS_HOLD = "myholdings_v1", LS_SET = "mysettings_v1";
const PALETTE = ["#3a6ea5","#e23744","#18a058","#f0a020","#8a5cf6","#1aa3a3","#d6336c","#f76707","#0ca678","#7048e8"];

let DATA = FALLBACK_DATA;
let NAMES_ALL = null;                 // names.json（全市場股名），開設定時才載入
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
function gainClass(v){
  const up = v>=0;
  if(settings.colorMode==="intl") return up?"loss":"gain"; // 歐美：漲綠跌紅
  return up?"gain":"loss";                                  // 台股：漲紅跌綠
}
function accentClass(v){ return "accent-"+(gainClass(v)==="gain"?"gain":"loss"); }
function arrow(v){ return v>0?"▲":(v<0?"▼":"—"); }

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
  if(v==="buy")  return "🟢 最近大戶在買進";
  if(v==="sell") return "🔴 最近大戶在賣出，留意一下";
  if(v==="flat") return "⚪ 大戶這陣子沒什麼動作";
  return null;
}
function monthText(p){
  if(p==null) return null;
  if(p>=1)  return "這個月漲了 "+Math.round(p)+"%";
  if(p<=-1) return "這個月跌了 "+Math.round(Math.abs(p))+"%";
  return "這個月差不多平盤";
}
function miniMonth(p){
  if(p==null) return null;
  return "月 " + (p>=0?"+":"−") + Math.abs(Math.round(p)) + "%";
}
function miniSentiment(s){            // 熱門卡用的精簡情緒：「🔥 50篇 多」
  if(!s || s.posts==null) return null;
  const hot = s.posts>=40 ? "🔥" : (s.posts>=8 ? "💬" : "😴");
  const b = s.bull||0, r = s.bear||0;
  const dir = (b+r>=3) ? (b>r ? " 多" : r>b ? " 空" : "") : "";
  return `${hot} ${s.posts}篇${dir}`;
}
function buzzText(v){
  if(v==="high")  return "🔥 最近網路上討論很熱";
  if(v==="quiet") return "😴 最近網路上很安靜";
  return null;
}
function sentimentText(s){
  // 股市同學會：熱度=今日發文數（量）；方向=數發文者自標的看多/看空 tag（與量無關）
  if(!s || s.posts==null) return null;
  const hot = s.posts>=40 ? "🔥" : (s.posts>=8 ? "💬" : "😴");
  let t = `${hot} 同學會今天 ${s.posts} 篇討論`;
  const b = s.bull||0, r = s.bear||0;
  if(b + r >= 3){                       // 方向＝數近期熱門貼文的多空 tag（與今日發文量是兩件事，分開講）
    const w = b>r ? "看多較多" : r>b ? "看空較多" : "多空各半";
    t += `，近期留言${w}（${b}:${r}）`;
  }
  return t;
}
function marketTilt(s){               // 情緒方向：1=偏多 -1=偏空 0=不明顯
  if(!s) return 0;
  const b = s.bull||0, r = s.bear||0;
  if(b + r < 3) return 0;
  return b>r ? 1 : r>b ? -1 : 0;
}
function signalSummary(r){            // 綜合參考：大戶(外資/法人) + 情緒，兩個都明確才下判斷
  const bp = r.big_player==="buy" ? 1 : r.big_player==="sell" ? -1 : 0;
  const st = marketTilt(r.sentiment);
  if(bp === 0 || st === 0) return null;            // 任一不明確就不下綜合判斷
  if(bp > 0 && st > 0) return "📈 大戶在買、討論偏多，兩個訊號一致偏多，可留意";
  if(bp < 0 && st < 0) return "📉 大戶在賣、討論偏空，兩個訊號一致偏空，宜觀望";
  return `⚖️ 大戶在${bp>0?"買":"賣"}、討論偏${st>0?"多":"空"}，方向分歧，再觀察`;
}
function noticeBox(n){              // 注意/處置風險（持股卡用，完整）
  if(!n) return "";
  const danger = n.to_disp===0 || n.on_notice;
  const warn = !danger && (n.to_disp<=1 || n.up_reach || n.down_reach);
  const cls = danger ? "nrisk-hi" : warn ? "nrisk-mid" : "nrisk-lo";
  let s1;
  if(n.to_disp===0)      s1 = "🚨 已達處置累積標準（連3次或10日6次）";
  else if(n.in10>0)      s1 = `近10日 ${n.in10} 次注意${n.consec>1?`（連續${n.consec}天）`:""}，再 ${n.to_disp} 次到處置`;
  else                   s1 = "目前無注意累積";
  const reach = (n.up_reach||n.down_reach) ? "（明天可能觸發）" : "（明天漲跌停都碰不到）";
  const s2 = `明天 漲過 ${num(n.up)} 或 跌破 ${num(n.down)} 會被列注意 ${reach}`;
  return `<div class="notice ${cls}"><div class="nrow">📋 ${s1}</div><div class="nrow nsub">${s2}</div></div>`;
}
function miniNotice(n){             // 熱門卡用，精簡：只在接近處置時出現
  if(!n) return null;
  if(n.to_disp===0) return "🚨 處置標準";
  if(n.to_disp<=1)  return `⚠️ 距處置${n.to_disp}`;
  return null;
}
function todayBadge(day){
  if(day==null) return "";
  const cls = gainClass(day);
  return `<span class="today ${cls}">今天 ${arrow(day)} ${Math.abs(day).toFixed(1)}%</span>`;
}

function sparkline(vals){
  if(!Array.isArray(vals) || vals.length<2) return "";
  const w=300, h=56, p=5;
  const min=Math.min(...vals), max=Math.max(...vals), rng=(max-min)||1;
  const step=(w-2*p)/(vals.length-1);
  const xy=vals.map((v,i)=>[p+i*step, h-p-((v-min)/rng)*(h-2*p)]);
  const line=xy.map((c,i)=>(i?"L":"M")+c[0].toFixed(1)+" "+c[1].toFixed(1)).join(" ");
  const area=line+` L ${(w-p).toFixed(1)} ${h-p} L ${p} ${h-p} Z`;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path class="ar" d="${area}"/>
    <path class="ln" d="${line}" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

// 甜甜圈圖：items=[{label,value,color}]
function donut(items){
  const size=176, r=80, ir=50, cx=size/2, cy=size/2;
  const total=items.reduce((a,b)=>a+b.value,0)||1;
  if(items.length===1){
    return `<svg viewBox="0 0 ${size} ${size}" class="donut" aria-hidden="true">
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
  return `<svg viewBox="0 0 ${size} ${size}" class="donut" aria-hidden="true">${paths}</svg>`;
}

// ── 計算 ─────────────────────────────────────────────
function compute(h){
  const s = DATA.stocks && DATA.stocks[h.stock_id];
  const shares = Number(h.shares)||0, cost = Number(h.cost_per_share)||0;
  const name = resolveName(h.stock_id);
  if(!s || s.price==null){ return { id:h.stock_id, name, shares, cost, missing:true }; }
  const mv = shares*1000*s.price, costTotal = shares*1000*cost;
  const profit = mv-costTotal, pct = costTotal>0 ? profit/costTotal*100 : 0;
  const alerts = [];
  if(cost>0 && s.price<cost) alerts.push("已跌破你的成本（現價比買進時低）");
  if(s.big_player==="sell")  alerts.push("大戶最近在賣，可留意");
  return { id:h.stock_id, name, shares, cost, price:s.price, mv, profit, pct,
           big_player:s.big_player, month:s.month_change_pct, buzz:s.buzz,
           spark:s.spark, day:s.day_change_pct, alerts, sentiment:s.sentiment, notice:s.notice };
}

// ── 畫面 ─────────────────────────────────────────────
function render(){
  document.getElementById("updated").textContent = "最近收盤日：" + (DATA.updated||"—");
  document.getElementById("sample").hidden = !DATA.is_sample;
  const rows = holdings.map(compute);
  renderSummary(rows);
  renderCards(rows);
  renderAllocation(rows);
  renderHot();
}

function renderSummary(rows){
  const el = document.getElementById("summary");
  const valid = rows.filter(r=>!r.missing);
  if(!valid.length){ el.hidden = true; return; }
  el.hidden = false;
  const mv = valid.reduce((a,r)=>a+r.mv,0);
  const profit = valid.reduce((a,r)=>a+r.profit,0);
  const costTotal = valid.reduce((a,r)=>a+r.shares*1000*r.cost,0);
  const pct = costTotal>0 ? profit/costTotal*100 : 0;
  const cls = gainClass(profit), word = profit>=0?"賺":"賠", sign = profit>=0?"+":"−";
  el.innerHTML = `
    <div class="blk"><div class="label">總共值多少</div><div class="big">${money(mv)}</div></div>
    <div class="divider"></div>
    <div class="blk"><div class="label">整體${word}多少</div>
      <div class="big ${cls}">${money(Math.abs(profit))}<span class="pct ${cls}">${sign}${Math.abs(Math.round(pct))}%</span></div>
    </div>`;
}

function card(r){
  if(r.missing){
    return `<section class="card missing-card">
      <div class="name-row"><div class="nm"><span class="name">${r.name}</span> <span class="code">${r.id}</span></div></div>
      <div class="missing">「${r.name}」目前還沒有市價資料。<br>請管理者把代號 <b>${r.id}</b> 加進追蹤清單後更新，這張卡就會出現損益與走勢。</div>
      <div class="grid">
        <div class="cell"><div class="label">我有幾張</div><div class="value">${r.shares} 張</div></div>
        <div class="cell"><div class="label">當初一股買</div><div class="value">${num(r.cost)} 元</div></div>
      </div>
    </section>`;
  }
  const cls = gainClass(r.profit), word = r.profit>=0?"賺":"賠", sign = r.profit>=0?"+":"−";
  const chips = [bigPlayerText(r.big_player), monthText(r.month), sentimentText(r.sentiment)]
                .filter(Boolean).map(t=>`<div class="chip">${t}</div>`).join("");
  const sparkSvg = sparkline(r.spark);
  const trendDir = (Array.isArray(r.spark)&&r.spark.length>1) ? r.spark[r.spark.length-1]-r.spark[0] : 0;
  const sparkBlock = sparkSvg
    ? `<div class="spark ${gainClass(trendDir)}"><div class="spark-cap">最近 ${r.spark.length} 天走勢</div>${sparkSvg}</div>` : "";
  const alertBlock = (r.alerts&&r.alerts.length)
    ? `<div class="alerts">${r.alerts.map(a=>`<div class="alert">⚠️ ${a}</div>`).join("")}</div>` : "";
  const sig = signalSummary(r);
  const signalBlock = sig ? `<div class="signal">${sig}<span class="sig-note">參考</span></div>` : "";
  const noticeBlk = noticeBox(r.notice);
  return `<section class="card ${accentClass(r.profit)}">
    <div class="name-row">
      <div class="nm"><span class="name">${r.name}</span> <span class="code">${r.id}</span></div>
      ${todayBadge(r.day)}
    </div>
    <div class="hero">
      <div class="pl ${cls}">${word} ${money(Math.abs(r.profit))}</div>
      <div class="pl-pct ${cls}">(${sign}${Math.abs(Math.round(r.pct))}%)</div>
    </div>
    ${signalBlock}
    ${alertBlock}
    ${noticeBlk}
    ${sparkBlock}
    <div class="grid">
      <div class="cell"><div class="label">我有幾張</div><div class="value">${r.shares} 張</div></div>
      <div class="cell"><div class="label">最近收盤</div><div class="value">${num(r.price)} 元</div></div>
      <div class="cell"><div class="label">總共值多少</div><div class="value">${money(r.mv)}</div></div>
      <div class="cell"><div class="label">當初一股買</div><div class="value">${num(r.cost)} 元</div></div>
    </div>
    <div class="status">${chips}</div>
  </section>`;
}

function renderCards(rows){
  const el = document.getElementById("cards");
  if(!rows.length){
    el.innerHTML = `<div class="empty">還沒有設定持股<br>點右上角 ⚙️ 設定，把你有的股票加進來
      <div class="add"><button class="primary" onclick="openSettings()">➕ 新增持股</button></div></div>`;
    return;
  }
  el.innerHTML = rows.map(card).join("");
}

function renderAllocation(rows){
  const el = document.getElementById("allocation");
  const valid = rows.filter(r=>!r.missing && r.mv>0);
  if(valid.length < 2){ el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  const items = valid.map((r,i)=>({label:r.name, value:r.mv, color:PALETTE[i%PALETTE.length]}));
  const total = items.reduce((a,b)=>a+b.value,0);
  const legend = items.map(it=>`<div class="leg">
      <span class="dot" style="background:${it.color}"></span>
      <span class="leg-name">${it.label}</span>
      <b>${Math.round(it.value/total*100)}%</b></div>`).join("");
  el.innerHTML = `<h2 class="sec-title">資產配置</h2>
    <div class="alloc-card"><div class="donut-wrap">${donut(items)}</div><div class="legend">${legend}</div></div>`;
}

function hotCard(code){
  const s = DATA.stocks && DATA.stocks[code];
  if(!s) return "";
  const held = holdings.some(h=>h.stock_id===code);
  const spark = sparkline(s.spark);
  const dir = (Array.isArray(s.spark)&&s.spark.length>1) ? s.spark[s.spark.length-1]-s.spark[0] : 0;
  const chips = [bigPlayerText(s.big_player), miniMonth(s.month_change_pct), miniSentiment(s.sentiment), miniNotice(s.notice)]
                .filter(Boolean).map(t=>`<span class="mini-chip">${t}</span>`).join("");
  const action = held
    ? `<span class="held-tag">✓ 已持有</span>`
    : `<button class="addhot" onclick="addFromHot('${code}')">➕ 加入持股</button>`;
  return `<section class="hot-card">
    <div class="hot-top">
      <div><span class="hot-name">${s.name}</span> <span class="code">${code}</span></div>
      <div class="hot-price">${num(s.price)} 元</div>
    </div>
    <div class="hot-today">${todayBadge(s.day_change_pct)}</div>
    <div class="hot-spark ${gainClass(dir)}">${spark}</div>
    <div class="mini-chips">${chips}</div>
    <div class="hot-action">${action}</div>
  </section>`;
}

function renderHot(){
  const title = document.getElementById("hotTitle");
  const wrap = document.getElementById("hotCards");
  const hot = (DATA.hot||[]).filter(c=>DATA.stocks && DATA.stocks[c]);
  if(!hot.length){ title.hidden=true; wrap.innerHTML=""; return; }
  title.hidden = false;
  wrap.innerHTML = hot.map(hotCard).join("");
}

// ── 設定面板 ─────────────────────────────────────────
function openSettings(){
  return loadNames().then(()=>{ buildSettings(); document.getElementById("settings").hidden=false; });
}
function closeSettings(){ document.getElementById("settings").hidden=true; render(); }

// 從熱門卡點「加入持股」：打開設定、把代號填進輸入框、聚焦張數欄
function addFromHot(code){
  openSettings().then(()=>{
    const i=document.getElementById("addCode"); if(i) i.value = code+" "+resolveName(code);
    const sh=document.getElementById("addShares"); if(sh) sh.focus();
  });
}

function buildSettings(){
  // 持股清單（可改張數/成本、可刪）
  const list = document.getElementById("holdingList");
  list.innerHTML = holdings.map((h,i)=>{
    const name = resolveName(h.stock_id);
    return `<div class="hrow">
      <div class="hname">${name}<br><span class="code">${h.stock_id}</span></div>
      <input type="number" min="0" step="1" value="${h.shares}" data-i="${i}" data-f="shares" aria-label="張數">
      <input type="number" min="0" step="0.01" value="${h.cost_per_share}" data-i="${i}" data-f="cost_per_share" aria-label="成本">
      <button class="del" data-del="${i}" title="刪除">✕</button>
    </div>`;
  }).join("") || `<div class="hint">目前沒有持股，用下面新增（打代號或名字都行）。</div>`;

  // 任意股票：用 names.json 餵 datalist，打代號或名字都能搜
  const dl = document.getElementById("stockList");
  if(dl && NAMES_ALL && !dl.dataset.filled){
    dl.innerHTML = Object.keys(NAMES_ALL).map(c=>`<option value="${c} ${NAMES_ALL[c]}"></option>`).join("");
    dl.dataset.filled = "1";
  }
  document.getElementById("colorMode").value = settings.colorMode;
  document.getElementById("unit").value = settings.unit;
}

function parseCode(raw){
  const m = String(raw).trim().match(/\d{4,6}[A-Za-z]?/);  // 抓第一段代號（4~6 碼，可帶一個英文）
  return m ? m[0] : "";
}

// 事件
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

  document.getElementById("addBtn").onclick = ()=>{
    const code = parseCode(document.getElementById("addCode").value);
    if(!code){ alert("請輸入股票代號，例如 2330"); return; }
    if(holdings.some(h=>h.stock_id===code)){ alert("這檔已經在你的清單裡了"); return; }
    const sh=parseInt(document.getElementById("addShares").value||0,10);
    const co=parseFloat(document.getElementById("addCost").value||0);
    holdings.push({ stock_id:code, shares:sh||0, cost_per_share:co||0 });
    saveHoldings(); buildSettings(); render();
    document.getElementById("addCode").value="";
    document.getElementById("addShares").value="";
    document.getElementById("addCost").value="";
  };
  document.getElementById("colorMode").onchange = e=>{ settings.colorMode=e.target.value; saveSettings(); };
  document.getElementById("unit").onchange = e=>{ settings.unit=e.target.value; saveSettings(); };
  document.getElementById("resetBtn").onclick = ()=>{
    if(confirm("清除所有設定與持股？")){ localStorage.removeItem(LS_HOLD); localStorage.removeItem(LS_SET);
      holdings=DEFAULT_HOLDINGS.slice(); settings=Object.assign({},DEFAULT_SETTINGS); buildSettings(); render(); }
  };
}

// ── 啟動 ─────────────────────────────────────────────
fetch("data.json",{cache:"no-store"})
  .then(r=>{ if(!r.ok) throw 0; return r.json(); })
  .then(d=>{ DATA=d; })
  .catch(()=>{ DATA=FALLBACK_DATA; })
  .finally(()=>{
    wireUp(); render();
    // 若有「還沒收錄市價」的冷門持股，載入全市場股名讓卡片馬上顯示正確名字
    if(holdings.some(h=>!(DATA.stocks && DATA.stocks[h.stock_id]))) loadNames().then(render);
  });

// PWA：註冊 service worker（加到主畫面、離線可開）
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
}
