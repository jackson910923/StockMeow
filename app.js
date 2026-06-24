/* 我的持股 — 純前端，不含 token、不跑 Python。
 * 市場資料來自同層 data.json；個人持股存在瀏覽器本機(localStorage)，不會進 repo。 */

// ── 離線備援：雙擊開啟、瀏覽器擋掉 file:// 的 fetch 時，畫面照樣有東西看。
//    放到 GitHub Pages（有伺服器）時會讀真正的 data.json，這份不會被用到。
const FALLBACK_DATA = {
  updated: "2026-06-18", is_sample: true,
  hot: ["2330","2317"],
  stocks: {
    "3481": { name:"群創",   price:64.40,  big_player:"sell", month_change_pct:28, buzz:"high",  spark:[48,50,52,49,53,56,55,58,60,59,62,64.4] },
    "6116": { name:"彩晶",   price:18.80,  big_player:"buy",  month_change_pct:-5, buzz:"quiet", spark:[20,19.5,19,18.6,18.8,18.2,18.5,18.9,18.3,18.6,18.7,18.8] },
    "2330": { name:"台積電", price:1085.0, big_player:"buy",  month_change_pct:6,  buzz:"high",  spark:[1020,1035,1010,1050,1060,1045,1070,1065,1080,1075,1082,1085] },
    "2317": { name:"鴻海",   price:203.5,  big_player:"flat", month_change_pct:-2, buzz:"quiet", spark:[208,206,209,205,207,204,206,203,205,202,204,203.5] }
  }
};

// ── 隱私：公開頁面預設「不放」任何持股（空陣列）。
//    你自己在「⚙️ 設定」新增的持股只會存在你這台瀏覽器(localStorage)，
//    不會進 repo、也不會出現在別人打開的公開頁面上。
const DEFAULT_HOLDINGS = [];
const DEFAULT_SETTINGS = { colorMode:"tw", unit:"wan" }; // tw=漲紅跌綠, wan=金額用萬

const LS_HOLD = "myholdings_v1", LS_SET = "mysettings_v1";

let DATA = FALLBACK_DATA;
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
function num(n,d=2){ return n.toLocaleString("zh-TW",{maximumFractionDigits:d}); }
function gainClass(v){ // 依漲跌顏色設定回傳 class
  const up = v>=0;
  if(settings.colorMode==="intl") return up?"loss":"gain"; // 歐美：漲綠跌紅
  return up?"gain":"loss";                                  // 台股：漲紅跌綠
}
function accentClass(v){ return "accent-"+(gainClass(v)==="gain"?"gain":"loss"); }

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
function buzzText(v){
  if(v==="high")  return "🔥 最近網路上討論很熱";
  if(v==="quiet") return "😴 最近網路上很安靜";
  return null; // 沒資料就不放
}

function sparkline(vals){
  // 用最近收盤畫一條小走勢線；顏色在外層用漲跌方向決定（currentColor）。
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

// ── 計算 ─────────────────────────────────────────────
function compute(h){
  const s = DATA.stocks?.[h.stock_id];
  const shares = Number(h.shares)||0, cost = Number(h.cost_per_share)||0;
  if(!s || s.price==null){ return { id:h.stock_id, name:(s&&s.name)||h.stock_id, shares, cost, missing:true }; }
  const mv = shares*1000*s.price, costTotal = shares*1000*cost;
  const profit = mv-costTotal, pct = costTotal>0 ? profit/costTotal*100 : 0;
  return { id:h.stock_id, name:s.name||h.stock_id, shares, cost, price:s.price,
           mv, profit, pct, big_player:s.big_player, month:s.month_change_pct, buzz:s.buzz, spark:s.spark };
}

// ── 畫面 ─────────────────────────────────────────────
function render(){
  document.getElementById("updated").textContent = "最近收盤日：" + (DATA.updated||"—");
  document.getElementById("sample").hidden = !DATA.is_sample;

  const rows = holdings.map(compute);
  renderSummary(rows);
  renderCards(rows);
  renderHot();
}

function miniMonth(p){
  if(p==null) return null;
  const s = p>=0 ? "+" : "−";
  return "月 " + s + Math.abs(Math.round(p)) + "%";
}

function hotCard(code){
  const s = DATA.stocks && DATA.stocks[code];
  if(!s) return "";
  const held = holdings.some(h=>h.stock_id===code);
  const spark = sparkline(s.spark);
  const dir = (Array.isArray(s.spark)&&s.spark.length>1) ? s.spark[s.spark.length-1]-s.spark[0] : 0;
  const chips = [bigPlayerText(s.big_player), miniMonth(s.month_change_pct)]
                .filter(Boolean).map(t=>`<span class="mini-chip">${t}</span>`).join("");
  const action = held
    ? `<span class="held-tag">✓ 已持有</span>`
    : `<button class="addhot" onclick="addFromHot('${code}')">➕ 加入持股</button>`;
  return `<section class="hot-card">
    <div class="hot-top">
      <div><span class="hot-name">${s.name}</span> <span class="code">${code}</span></div>
      <div class="hot-price">${num(s.price)} 元</div>
    </div>
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

// 從熱門卡點「加入持股」：打開設定、把新增下拉預選成這檔、聚焦張數欄
function addFromHot(code){
  openSettings();
  const sel = document.getElementById("addStock");
  if(sel && [...sel.options].some(o=>o.value===code)) sel.value = code;
  const sh = document.getElementById("addShares");
  if(sh) sh.focus();
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
    return `<section class="card">
      <div class="name-row"><div class="name">${r.name}</div><div class="code">${r.id}</div></div>
      <div class="missing">這檔目前沒有市價資料（data.json 裡查不到 ${r.id}），先顯示不了損益。</div>
      <div class="grid"><div class="cell"><div class="label">我有幾張</div><div class="value">${r.shares} 張</div></div>
      <div class="cell"><div class="label">當初一股買</div><div class="value">${num(r.cost)} 元</div></div></div>
    </section>`;
  }
  const cls = gainClass(r.profit), word = r.profit>=0?"賺":"賠", sign = r.profit>=0?"+":"−";
  const chips = [bigPlayerText(r.big_player), monthText(r.month), buzzText(r.buzz)]
                .filter(Boolean).map(t=>`<div class="chip">${t}</div>`).join("");
  // 走勢線顏色：用「最後一筆 - 第一筆」的漲跌方向（依紅綠設定對應）
  const sparkSvg = sparkline(r.spark);
  const trendDir = (Array.isArray(r.spark)&&r.spark.length>1) ? r.spark[r.spark.length-1]-r.spark[0] : 0;
  const sparkBlock = sparkSvg
    ? `<div class="spark ${gainClass(trendDir)}"><div class="spark-cap">最近 ${r.spark.length} 天走勢</div>${sparkSvg}</div>`
    : "";
  return `<section class="card ${accentClass(r.profit)}">
    <div class="name-row"><div class="name">${r.name}</div><div class="code">${r.id}</div></div>
    <div class="hero">
      <div class="pl ${cls}">${word} ${money(Math.abs(r.profit))}</div>
      <div class="pl-pct ${cls}">(${sign}${Math.abs(Math.round(r.pct))}%)</div>
    </div>
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

// ── 設定面板 ─────────────────────────────────────────
function openSettings(){ buildSettings(); document.getElementById("settings").hidden=false; }
function closeSettings(){ document.getElementById("settings").hidden=true; render(); }

function buildSettings(){
  // 持股清單（可改張數/成本、可刪）
  const list = document.getElementById("holdingList");
  list.innerHTML = holdings.map((h,i)=>{
    const name = DATA.stocks?.[h.stock_id]?.name || h.stock_id;
    return `<div class="hrow">
      <div class="hname">${name}<br><span class="code">${h.stock_id}</span></div>
      <input type="number" min="0" step="1" value="${h.shares}" data-i="${i}" data-f="shares" aria-label="張數">
      <input type="number" min="0" step="0.01" value="${h.cost_per_share}" data-i="${i}" data-f="cost_per_share" aria-label="成本">
      <button class="del" data-del="${i}" title="刪除">✕</button>
    </div>`;
  }).join("") || `<div class="hint">目前沒有持股，用下面新增。</div>`;

  // 可新增的股票下拉（data.json 裡有的、且還沒加入的）
  const sel = document.getElementById("addStock");
  const held = new Set(holdings.map(h=>h.stock_id));
  const opts = Object.entries(DATA.stocks||{})
    .filter(([id])=>!held.has(id))
    .map(([id,s])=>`<option value="${id}">${s.name}（${id}）</option>`).join("");
  sel.innerHTML = opts || `<option value="">（清單上的股票都加過了）</option>`;

  document.getElementById("colorMode").value = settings.colorMode;
  document.getElementById("unit").value = settings.unit;
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
    const id=document.getElementById("addStock").value;
    const sh=parseInt(document.getElementById("addShares").value||0,10);
    const co=parseFloat(document.getElementById("addCost").value||0);
    if(!id){ return; }
    holdings.push({ stock_id:id, shares:sh||0, cost_per_share:co||0 });
    saveHoldings(); buildSettings();
    document.getElementById("addShares").value=""; document.getElementById("addCost").value="";
  };
  document.getElementById("colorMode").onchange = e=>{ settings.colorMode=e.target.value; saveSettings(); };
  document.getElementById("unit").onchange = e=>{ settings.unit=e.target.value; saveSettings(); };
  document.getElementById("resetBtn").onclick = ()=>{
    if(confirm("清除所有設定與持股？")){ localStorage.removeItem(LS_HOLD); localStorage.removeItem(LS_SET);
      holdings=DEFAULT_HOLDINGS.slice(); settings=Object.assign({},DEFAULT_SETTINGS); buildSettings(); }
  };
}

// ── 啟動 ─────────────────────────────────────────────
fetch("data.json",{cache:"no-store"})
  .then(r=>{ if(!r.ok) throw 0; return r.json(); })
  .then(d=>{ DATA=d; })
  .catch(()=>{ DATA=FALLBACK_DATA; })
  .finally(()=>{ wireUp(); render(); });
