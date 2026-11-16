/* =========================================================
   TOWBAR ($TOWBAR) — app.js
   Single-page app, hash routing, no build step.
   Live prices: CoinGecko public API (real data, nothing simulated).
   ========================================================= */
(function(){
"use strict";

/* ---------------- CONFIG (edit me) ---------------- */
const CONFIG = {
  NAME: "Towbar",
  TICKER: "$TOWBAR",
  X_HANDLE: "@UseTowbar",
  CA: "",                       // paste the contract address here at launch; empty = "posted on X at launch"
  X_URL: "https://x.com/UseTowbar", // project X account
  // ---- pump.fun deploy parameters ----
  PLATFORM: "pump.fun",
  LAUNCH_FEE_SOL: 0,            // pump.fun coin creation is free (Solana network fees only)
  CURVE_FEE_PCT: 1.25,          // bonding-curve fee per buy/sell
  CURVE_FEE_PROTOCOL: 0.95,     //   to pump.fun
  CURVE_FEE_CREATOR: 0.30,      //   to the coin's creator
  SWAP_FEE_MAX: 1.25,           // PumpSwap fee after graduation: tiered by market cap
  SWAP_FEE_MIN: 0.30,
  SUPPLY: 1_000_000_000,        // fixed supply, 6 decimals
  CURVE_TOKENS: 793_100_000,    // sold on the bonding curve
  POOL_TOKENS: 206_900_000,     // seeded into PumpSwap at graduation
  VIRTUAL_SOL: 30,              // curve virtual reserves
  VIRTUAL_TOKENS: 1_073_000_000,
  GRAD_SOL_RAISED: 85,          // ≈ SOL deposited to complete the curve
  CURVE_START_SOL: 28,          // opening market cap ≈ 28 SOL
  CURVE_GRAD_SOL: 410,          // market cap at graduation ≈ 410 SOL (≈ $69K at ~$170 SOL)
  PRICE_REFRESH_MS: 60_000
};

/* ---------------- DATA ---------------- */
const CHAINS = [
  {id:"robinhood", name:"Robinhood", color:"#1fbf4f", a:"RH"},
  {id:"ethereum",  name:"Ethereum",  color:"#5b6ee1", a:"Ξ"},
  {id:"bnb",       name:"BNB",       color:"#e3a700", a:"B"},
  {id:"base",      name:"Base",      color:"#0052ff", a:"B"},
  {id:"hyperevm",  name:"HyperEVM",  color:"#0f9f8a", a:"H"},
  {id:"arbitrum",  name:"Arbitrum",  color:"#2d74c4", a:"A"},
  {id:"avalanche", name:"Avalanche", color:"#e84142", a:"A"},
  {id:"tron",      name:"Tron",      color:"#d0242c", a:"T"},
  {id:"sui",       name:"Sui",       color:"#3c9cf0", a:"S"},
  {id:"elysium",   name:"Elysium",   color:"#8e5cf0", a:"E"}
];
// cg = CoinGecko id (null = no public feed yet; shows "feed at launch")
const TOWS = [
  ["PONS","robinhood",null],["CASHCAT","robinhood",null],["AI","robinhood",null],["ORBIO","robinhood",null],["HOOKR","robinhood",null],["STANDARD","robinhood",null],
  ["ETH","ethereum","ethereum"],["PEPE","ethereum","pepe"],["LINK","ethereum","chainlink"],["UNI","ethereum","uniswap"],["SHIB","ethereum","shiba-inu"],["ENA","ethereum","ethena"],
  ["BNB","bnb","binancecoin"],["CAKE","bnb","pancakeswap-token"],["ASTER","bnb","aster-2"],["M","bnb",null],["BTW","bnb",null],
  ["VIRTUAL","base","virtual-protocol"],["AERO","base","aerodrome-finance"],["VVV","base","venice-token"],["AWE","base",null],["ZEN","base","zencash"],
  ["HYPE","hyperevm","hyperliquid"],["KNTQ","hyperevm",null],["HFUN","hyperevm","hypurr-fun"],["JOFF","hyperevm",null],
  ["ARB","arbitrum","arbitrum"],["GMX","arbitrum","gmx"],["MAGIC","arbitrum","magic"],["SQD","arbitrum","subsquid"],
  ["AVAX","avalanche","avalanche-2"],["JOE","avalanche","joe"],["QI","avalanche","benqi"],
  ["TRX","tron","tron"],["JST","tron","just"],["SUN","tron","sun-token"],
  ["SUI","sui","sui"],["WAL","sui","walrus-2"],["DEEP","sui","deep"],
  ["VOLTA","elysium",null],["BLOB","elysium",null]
].map(([sym,chain,cg])=>({sym,chain,cg}));
const PALETTE = ["#ff7a00","#2b5fab","#14a39a","#7b5cff","#e23b3b","#ffb000","#ff5fa2","#3aa655","#0e7cc9","#b0479b","#d65f00","#1d9bd1"];
TOWS.forEach((t,i)=>{ t.color = PALETTE[(t.sym.charCodeAt(0)+t.sym.length+i)%PALETTE.length]; });
const chainOf = id => CHAINS.find(c=>c.id===id);
const towOf = sym => TOWS.find(t=>t.sym.toLowerCase()===String(sym).toLowerCase());

const state = {
  chain: "all",
  prices: {},        // cg id -> {usd, mc, ch}
  sol: null,
  feed: "connecting",
  wallet: null,
  balance: null,
  sort: {key:"mc", dir:-1},
  coinTab: "new",
  route: "",
  launch: {tow:"ETH", name:"", ticker:"", desc:"", img:"", x:"", tg:"", web:"", buy:"", ack:false}
};

/* ---------------- STORAGE (safe) ---------------- */
const store = {
  get(k,d){ try{ const v=localStorage.getItem("towbar."+k); return v==null?d:JSON.parse(v);}catch(e){return d;} },
  set(k,v){ try{ localStorage.setItem("towbar."+k, JSON.stringify(v)); }catch(e){} },
  del(k){ try{ localStorage.removeItem("towbar."+k);}catch(e){} }
};
const sstore = {
  get(k){ try{return sessionStorage.getItem("towbar."+k);}catch(e){return null;} },
  set(k,v){ try{sessionStorage.setItem("towbar."+k,v);}catch(e){} }
};

/* ---------------- PIXEL ICONS ---------------- */
const PAL = {k:"#16161c",y:"#ffc400",o:"#ff7a00",O:"#d65f00",w:"#ffffff",g:"#9a958a",G:"#5d5a55",b:"#4aa3ff",B:"#2b5fab",r:"#e23b3b",l:"#6cc93a",t:"#14a39a",p:"#7b5cff",c:"#d9d3c7",s:"#c0c0c0",n:"#8a5a2b",m:"#ffe27a"};
function px(rows, size){
  const h=rows.length, w=Math.max(...rows.map(r=>r.length));
  let s=`<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"${size?` width="${size}" height="${size}"`:""}>`;
  rows.forEach((r,y)=>{ let x=0; while(x<r.length){ const ch=r[x]; if(ch===" "||ch==="."){x++;continue;} let n=1; while(r[x+n]===ch)n++; s+=`<rect x="${x}" y="${y}" width="${n}" height="1" fill="${PAL[ch]}"/>`; x+=n; } });
  return s+"</svg>";
}
const ICON = {
  home: px([
    "       kk       ","      kook      ","     koooook    ","    koooooook   ","   koooooooook  ","  kooooooooooook","  kkwwwwwwwwwwkk","   kwwkkkwwbbwk ","   kwwkykwwbbwk ","   kwwkykwwwwwk ","   kwwkykwwwwwk ","   kkkkkkkkkkkk "]),
  tows: px([
    "      kkkk      ","      kssk      ","    kkkkkkkk    ","    kyykkyyk    ","    kkkkkkkk    ","       kgk      ","       kgk      ","       kgk      ","  kk   kgk      "," kook  kgk      "," kok   kgk      "," kok   kgk      "," kook kggk      ","  koooooggk     ","   kkkkkkk      "]),
  coins: px([
    "    kkkkkkkk    ","   kyyyyyyyyk   ","   kOyyyyyyOk   ","   kkkkkkkkkk   ","  kkkkkkkkkk    "," kyyyyyyyyyyk   "," kOyyyyyyyyOk   "," kkkkkkkkkkkk   ","   kkkkkkkkkkk  ","  kyyyyyyyyyyyk ","  kOyyyokoyyyOk ","  kOyyyyyyyyyOk ","  kkkkkkkkkkkkk "]),
  launch: px([
    "            kkk ","           kyyyk","          kyyyk ","   kkk   kyyyk  ","  kooookkyyyk   ","  koooooyyyk    ","   kkkoyyyk     ","     kyyyk      ","    kyyykok     ","   kyyyk kok    ","   kyyk  kok    ","  kkk   kook    ","  kk    kkk     "]),
  docs: px([
    " kkkkkkkkkkkk   "," kBBBBBBBBBBk   "," kBwwwwwwwwBk   "," kBwkkkkkkwBk   "," kBwwwwwwwwBk   "," kBwkkkkkwwBk   "," kBwwwwwwwwBk   "," kBwkkkkkkwBk   "," kBwwwwwwwwBk   "," kBBBBBBBBBBk   "," kkkkkkkkkkkk   ","  kyyyyyyyyyk   ","  kkkkkkkkkkk   "]),
  wallet: px([
    "   kkkkkkkk     ","  kllllllllk    "," kkkkkkkkkkkkk  "," kttttttttttttk "," kttttttttkkkkk "," ktttttttkyyyyk "," kttttttttkkkkk "," ktttttttttttttk"," ktttttttttttttk"," kkkkkkkkkkkkkkk"]),
  notepad: px([
    "  k k k k k     "," kkkkkkkkkkk    "," kwwwwwwwwwk    "," kwkkkkkkwwk    "," kwwwwwwwwwk    "," kwkkkkkwwwk    "," kwwwwwwwwwk  kk"," kwkkkkkkwwk kyk"," kwwwwwwwwwkkyk "," kwkkkkwwwwkyk  "," kwwwwwwwwkok   "," kkkkkkkkkkk    "]),
  calc: px([
    " kkkkkkkkkkk "," kGGGGGGGGGk "," kGkkkkkkkGk "," kGklllllkGk "," kGkkkkkkkGk "," kGGGGGGGGGk "," kGwkwkwkokk "," kGGGGGGGGGk "," kGwkwkwkokk "," kGGGGGGGGGk "," kGwkwkwkyyk "," kkkkkkkkkkk "]),
  recycle: px([
    "   kkkkkkkk   ","  kssssssssk  "," kkkkkkkkkkkk "," kwsswsswsswk "," kwsswsswsswk "," kwsswsswsswk "," kwsswsswsswk "," kwsswsswsswk "," kwsswsswsswk ","  kkkkkkkkkk  "]),
  cone: px([
    "      kk      ","     koOk     ","     koOk     ","    kwwwwk    ","    kwwwwk    ","   kooooOOk   ","   kooooOOk   ","  kwwwwwwwwk  ","  kwwwwwwwwk  "," koooooooOOOk ","kkkkkkkkkkkkkk","kGGGGGGGGGGGGk","kkkkkkkkkkkkkk"]),
  hat: px([
    "     kkkkk     ","   kkyyyyykk   ","  kyyyyyyyyyk  "," kyyyyykyyyyyk "," kyyyyykyyyyyk ","kkkkkkkkkkkkkkk","kOOOOOOOOOOOOOk","kkkkkkkkkkkkkkk"]),
  sol: px([
    "  kkkkkkkkkk  "," kttttttttk   ","kkkkkkkkkk    ","  kkkkkkkkkk  ","  kppppppppppk","    kkkkkkkkkk","kkkkkkkkkk    ","kpppppppppk   "," kkkkkkkkkk   "]),
  x: px([
    "kkkkkkkkkkkk","kwwkkkkkkwwk","kkwwkkkkwwkk","kkkwwkkwwkkk","kkkkwwwwkkkk","kkkkkwwkkkkk","kkkkwwwwkkkk","kkkwwkkwwkkk","kkwwkkkkwwkk","kwwkkkkkkwwk","kkkkkkkkkkkk"]),
  truck: px([
    "  kk                  rr           ",
    " kyyk              kkkkkkkk        ",
    "  kyyk             kbbbbbwk        ",
    "  G kyyk           kbbbbwwk        ",
    "  G  kyyk          kbbbwwbkk       ",
    "  G   kyyk         kbbbbbbbokk     ",
    "  G    kyykkkkkkkkkkkkkkkkkkoookk  ",
    "  G     kyooooooooooooooooooooooook",
    "  G     kooooyyyyyyyyyyyyooooooooyk",
    " kGk    kooooookkkkkkkkoooooooookkk",
    " kGk    kkkkkkkk      kkkkkkkkkkkk ",
    "kOOOk     kkkkk         kkkkk      ",
    " kkk     kGsssGk       kGsssGk     ",
    "         kGsksGk       kGsksGk     ",
    "          kkkkk         kkkkk      "]),
  refresh: px([
    "    kkkkk   ","  kkbbbbbkk "," kbbkkkkkbbk"," kbk     kk "," kbk  kkkkk "," kbk   kbbk "," kbbk kbbbk ","  kbbkbbbk  ","   kbbbbk   ","    kkkk    "]),
  cam: px([
    " kkkkkkkkkk     ","kGGGGGGGGGGk    ","kGkkkkkkkkGkkkk ","kGkbbbbbbkGkook ","kGkbbwwbbkGkook ","kGkbbbbbbkGkkkk ","kGkkkkkkkkGk    ","kGGGGrGGGGGk    "," kkkkkkkkkk     "])
};
document.querySelectorAll("[data-ico]").forEach(el=>{ el.innerHTML = ICON[el.dataset.ico]||""; });

/* ---------------- PUMP.FUN CURVE MATH (constant product on virtual reserves) ---------------- */
const CURVE = {
  k: CONFIG.VIRTUAL_SOL*CONFIG.VIRTUAL_TOKENS,
  buy(sol){ const net=Math.max(0,sol)*(1-CONFIG.CURVE_FEE_PCT/100); const x=CONFIG.VIRTUAL_SOL+net; const out=CONFIG.VIRTUAL_TOKENS-this.k/x; return Math.min(out, CONFIG.CURVE_TOKENS); },
  at(raised){ const r=Math.min(Math.max(0,raised),CONFIG.GRAD_SOL_RAISED); const x=CONFIG.VIRTUAL_SOL+r, y=this.k/x; const sold=CONFIG.VIRTUAL_TOKENS-y; return {sold, pct:Math.min(100,sold/CONFIG.CURVE_TOKENS*100), price:x/y, mcapSol:x/y*CONFIG.SUPPLY}; }
};

/* ---------------- HELPERS ---------------- */
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function fmtUsd(v){
  if(v==null||isNaN(v)) return "—";
  if(v>=1000) return "$"+v.toLocaleString("en-US",{maximumFractionDigits:0});
  if(v>=1) return "$"+v.toFixed(2);
  if(v>=0.01) return "$"+v.toFixed(4);
  if(v>=0.0001) return "$"+v.toFixed(6);
  return "$"+v.toPrecision(4);
}
function fmtBig(v){
  if(v==null||isNaN(v)||v===0) return "—";
  const u=[[1e12,"T"],[1e9,"B"],[1e6,"M"],[1e3,"K"]];
  for(const [n,s] of u) if(v>=n) return "$"+(v/n).toFixed(v/n>=100?0:v/n>=10?1:2)+s;
  return "$"+v.toFixed(0);
}
function fmtPct(v){ if(v==null||isNaN(v)) return "—"; return (v>=0?"+":"")+v.toFixed(2)+"%"; }
const cdot = (t,size) => { const col = t.color||"#888"; const lab=(t.sym||t.a||"?").replace("$","").slice(0, (t.sym||"").length>4?2:3); return `<span class="cdot" style="background:${col};${size?`width:${size}px;height:${size}px;font-size:${Math.max(8,size/3)}px`:""}">${esc(t.a||lab.slice(0,2))}</span>`; };
const chainDot = (c,size) => `<span class="cdot" style="background:${c.color};${size?`width:${size}px;height:${size}px`:""}">${c.a}</span>`;
const towPrice = t => t.cg && state.prices[t.cg] ? state.prices[t.cg].usd : null;
const SOON = `<span class="soon">at launch</span>`;
const shortCA = ca => ca ? ca.slice(0,4)+"…"+ca.slice(-4) : "TBA";

function toast(msg, ico="hat"){
  const el=document.createElement("div");
  el.className="window toast";
  el.innerHTML=`<div class="titlebar"><span class="t-ico">${ICON[ico]}</span><span class="t-txt">Towbar</span></div><div class="tb2">${msg}</div>`;
  $("#toast").appendChild(el);
  setTimeout(()=>el.remove(),3200);
}
function copy(text){
  if(!text){ toast("CA drops on X at launch. Follow along!"); return; }
  (navigator.clipboard?navigator.clipboard.writeText(text):Promise.reject()).then(()=>toast("Copied to clipboard ✔")).catch(()=>{
    const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select(); try{document.execCommand("copy"); toast("Copied ✔");}catch(e){} ta.remove();
  });
}

/* ---------------- DIALOG ---------------- */
function dialog({title="Towbar", icon="cone", html="", buttons=[{label:"OK",cls:"primary"}], wide=false}){
  const wrap=$("#dlg-wrap"), d=$("#dlg");
  d.style.width = wide? "min(560px,100%)" : "";
  d.innerHTML = `<div class="titlebar"><span class="t-ico">${ICON[icon]||""}</span><span class="t-txt">${esc(title)}</span><button class="ctl" data-x aria-label="Close">×</button></div>
    <div class="dbody">${icon?`<span style="width:48px;flex:none">${ICON[icon]}</span>`:""}<div style="flex:1;min-width:0">${html}</div></div>
    <div class="dact">${buttons.map((b,i)=>`<button class="btn98 ${b.cls||""}" data-i="${i}">${esc(b.label)}</button>`).join("")}</div>`;
  wrap.classList.add("open");
  const close=()=>wrap.classList.remove("open");
  d.querySelector("[data-x]").onclick=close;
  $$(".dact button",d).forEach(btn=>btn.onclick=()=>{ const b=buttons[+btn.dataset.i]; close(); b.onClick&&b.onClick(); });
  wrap.onclick=e=>{ if(e.target===wrap) close(); };
  setTimeout(()=>{ const f=d.querySelector(".dact .primary")||d.querySelector(".dact button"); f&&f.focus(); },10);
  return {el:d, close};
}

/* ---------------- BOOT ---------------- */
function boot(force){
  const el=$("#boot");
  if(!force && sstore.get("booted")){ el.classList.add("hide"); return; }
  el.classList.remove("hide");
  const L=[
    ["TOWBAR(R) Site BIOS v2.0 — Copyright (C) 2026 Towbar Works",""],
    ["Main Processor : Solana Mainnet-Beta @ 400ms slots",""],
    ["Memory Test    : 1,000,000,000 TOKENS OK","ok"],
    ["Deploy target  : pump.fun bonding curve · 793.1M on curve · ~85 SOL to bond","ok"],
    ["",""],
    ["Detecting tow hitches ......... 41 found across 10 chains","ok"],
    ["Checking hard hats ............ ON","ok"],
    ["Calibrating price venues ...... median of 9, 2% outlier cut","ok"],
    ["Mounting C:\\TOWBAR ............ OK","ok"],
    ["WARNING: Active construction zone. Watch for falling candles.","warn"],
    ["",""],
    ["Starting Towbar 98 ...","hl"]
  ];
  const box=$("#bootlines"); box.innerHTML="";
  L.forEach((l,i)=>{ const d=document.createElement("div"); d.className="ln "+l[1]; d.style.animationDelay=(i*0.24)+"s"; d.textContent=l[0]||" "; box.appendChild(d); });
  const bar=$("#boot .bar i"); bar.style.animation="none"; void bar.offsetWidth; bar.style.animation="";
  const done=()=>{ el.classList.add("hide"); sstore.set("booted","1"); clearTimeout(t); };
  const t=setTimeout(done, 3800);
  $("#skipboot").onclick=done;
  el.onclick=e=>{ if(e.target.id!=="skipboot" && e.detail>1) done(); };
}

/* ---------------- WALLPAPER SKYLINE ---------------- */
function skyline(){
  const s=$("#skyline"); let h="";
  // far buildings
  const far=[[0,250,90],[100,200,70],[180,280,110],[300,230,80],[390,300,60],[460,210,120],[590,260,90],[690,190,70],[770,240,100],[880,300,80],[970,220,110],[1090,270,90],[1190,200,80],[1280,250,120],[1410,290,70],[1490,230,110]];
  far.forEach(([x,y,w])=>{ h+=`<rect x="${x}" y="${y}" width="${w}" height="${500-y}" fill="#7fa7d8" opacity=".55"/>`; });
  // mid buildings with windows
  const mid=[[40,320,120,"#5d79a8"],[200,280,90,"#6a5d9a"],[330,340,140,"#4e6e94"],[880,300,110,"#5d79a8"],[1030,330,150,"#6a5d9a"],[1230,290,100,"#4e6e94"],[1380,350,180,"#5d79a8"]];
  mid.forEach(([x,y,w,c])=>{ h+=`<rect x="${x}" y="${y}" width="${w}" height="${500-y}" fill="${c}"/>`; for(let yy=y+14;yy<480;yy+=22) for(let xx=x+10;xx<x+w-12;xx+=18) h+=`<rect x="${xx}" y="${yy}" width="8" height="10" fill="${Math.random()>.55?"#ffe27a":"#2f3d5c"}"/>`; });
  // building under construction (scaffold) center-right
  const bx=560,by=230,bw=230;
  h+=`<rect x="${bx}" y="${by}" width="${bw}" height="${500-by}" fill="#8d8f96"/>`;
  for(let yy=by;yy<500;yy+=36){ h+=`<rect x="${bx-8}" y="${yy}" width="${bw+16}" height="6" fill="#ff7a00"/>`; for(let xx=bx+12;xx<bx+bw-10;xx+=32) h+=`<rect x="${xx}" y="${yy+10}" width="18" height="20" fill="#3b4150"/>`; }
  for(let xx=bx-8;xx<=bx+bw+8;xx+=46) h+=`<rect x="${xx}" y="${by}" width="4" height="${500-by}" fill="#2b5fab"/>`;
  // tower crane
  const cx=720;
  h+=`<rect x="${cx}" y="70" width="16" height="430" fill="#ffc400"/>`;
  for(let yy=74;yy<500;yy+=16) h+=`<rect x="${cx+2}" y="${yy}" width="12" height="2" fill="#16161c" transform="rotate(0)"/>`;
  h+=`<rect x="${cx-150}" y="70" width="430" height="12" fill="#ffc400"/><rect x="${cx-150}" y="82" width="430" height="2" fill="#16161c"/>`;
  h+=`<rect x="${cx-150}" y="58" width="60" height="14" fill="#5d5a55"/><rect x="${cx-4}" y="44" width="24" height="26" fill="#ff7a00"/><rect x="${cx}" y="48" width="16" height="8" fill="#9fd2ff"/>`;
  h+=`<rect x="${cx+6}" y="30" width="4" height="16" fill="#16161c"/><rect x="${cx+4}" y="26" width="8" height="5" fill="#e23b3b"><animate attributeName="opacity" values="1;.2;1" dur="1.2s" repeatCount="indefinite"/></rect>`;
  h+=`<g><animateTransform attributeName="transform" type="translate" values="0 0;0 60;0 0" dur="9s" repeatCount="indefinite"/><rect x="${cx+230}" y="84" width="2" height="90" fill="#333"/><rect x="${cx+222}" y="174" width="18" height="8" fill="#ff7a00"/><rect x="${cx+204}" y="182" width="54" height="22" fill="#ffc400" stroke="#16161c" stroke-width="2"/><text x="${cx+231}" y="198" font-family="monospace" font-size="11" font-weight="bold" text-anchor="middle" fill="#16161c">$TOWBAR</text></g>`;
  // barriers on ground line
  for(let xx=20;xx<1600;xx+=140) h+=`<rect x="${xx}" y="468" width="60" height="8" fill="#ff7a00"/><rect x="${xx+6}" y="476" width="4" height="24" fill="#5d5a55"/><rect x="${xx+50}" y="476" width="4" height="24" fill="#5d5a55"/>`;
  s.innerHTML=h;
}

/* ---------------- CHROME: icons, toolbar, start ---------------- */
const NAV = [
  {k:"",label:"Home",ico:"home",addr:"HOME"},
  {k:"tows",label:"Tows",ico:"tows",addr:"TOWS"},
  {k:"coins",label:"Coins",ico:"coins",addr:"COINS"},
  {k:"launch",label:"Launch",ico:"launch",addr:"LAUNCH"},
  {k:"docs",label:"Docs",ico:"docs",addr:"DOCS"},
  {k:"wallet",label:"Wallet",ico:"wallet",addr:"WALLET"}
];
function chrome(){
  $("#icons").innerHTML = [
    ...NAV.map(n=>`<button class="dicon" data-go="#/${n.k}"><span class="ico">${ICON[n.ico]}</span>${n.label==="Home"?"My Towbar":n.label}</button>`),
    `<button class="dicon" data-open="notepad"><span class="ico">${ICON.notepad}</span>Site Notes</button>`,
    `<button class="dicon" data-open="calcwin"><span class="ico">${ICON.calc}</span>Load Calc</button>`,
    `<button class="dicon" data-x><span class="ico">${ICON.x}</span>${CONFIG.X_HANDLE}</button>`,
    `<button class="dicon" data-recycle><span class="ico">${ICON.recycle}</span>Recycle Bin</button>`
  ].join("");
  $("#toolbar").innerHTML = NAV.map(n=>`<button class="tb" data-go="#/${n.k}" data-k="${n.k}">${ICON[n.ico]}<span>${n.label}</span></button>`).join("")
    + `<div class="tb-sep"></div><button class="tb" data-open="calcwin">${ICON.calc}<span>Calc</span></button><button class="tb" data-refresh>${ICON.refresh}<span>Refresh</span></button>`
    + `<div class="right"><a class="btn98" href="${CONFIG.X_URL}" target="_blank" rel="noopener" title="Follow ${CONFIG.X_HANDLE} on X" style="display:flex;gap:6px;align-items:center;padding:4px 10px"><span style="width:16px;height:16px;display:inline-block">${ICON.x}</span>${CONFIG.X_HANDLE}</a><div class="field98 ca-chip"><b>CA</b><span>${shortCA(CONFIG.CA)}</span><button class="linkbtn" data-copyca>Copy</button></div><button class="btn98 dark" id="connectbtn">Connect wallet</button></div>`;
  $("#chainsel").innerHTML = `<option value="all">All chains</option>`+CHAINS.map(c=>`<option value="${c.id}">${c.name}</option>`).join("");
  $("#quick").innerHTML = `<button data-go="#/" title="Home">${ICON.home}</button><button data-go="#/launch" title="Launch">${ICON.launch}</button><button data-open="notepad" title="Site Notes">${ICON.notepad}</button>`;
  const items=[
    ["tows","Tows","#/tows"],["coins","Coins","#/coins"],["launch","Launch a coin","#/launch"],["docs","Docs","#/docs"],["wallet","Wallet","#/wallet"],"-",
    ["notepad","Site Notes","open:notepad"],["calc","Load Calculator","open:calcwin"],["x","@UseTowbar on X","x"],"-",
    ["refresh","Replay intro","boot"],["recycle","Reset local data","reset"],["hat","Shut Down…","shutdown"]
  ];
  $("#startlist").innerHTML = items.map(it=>it==="-"?`<li class="sep"></li>`:`<li><button data-sm="${it[2]}">${ICON[it[0]]}<span>${it[1]}</span></button></li>`).join("");
}
function renderTasks(){
  const open=[{id:"main",label:"Towbar — "+(NAV.find(n=>n.k===state.route.split("/")[0])||{label:"Tow"}).label,ico:"cone"}];
  if(!$("#notepad").classList.contains("hidden")) open.push({id:"notepad",label:"Site Notes - Notepad",ico:"notepad"});
  if(!$("#calcwin").classList.contains("hidden")) open.push({id:"calcwin",label:"Load Calculator",ico:"calc"});
  $("#tasks").innerHTML = open.map(o=>`<button class="btn98 task ${topWin===o.id?"on":""}" data-task="${o.id}">${ICON[o.ico]}<span>${esc(o.label)}</span></button>`).join("");
}
let topWin="main", zTop=30;
function focusWin(id){
  topWin=id; const el=$("#"+id); if(!el) return;
  el.classList.remove("hidden"); if(id!=="main"){ el.style.zIndex=++zTop; }
  $$(".window").forEach(w=>w.classList.toggle("inactive", w.id!==id && w.id!=="dlg" && !w.classList.contains("toast")));
  renderTasks();
}
function openWin(id){
  if(id==="calcwin") renderCalc();
  $("#"+id).classList.remove("hidden"); focusWin(id);
}
function closeWin(id){ $("#"+id).classList.add("hidden"); focusWin("main"); }

// drag floating windows
function makeDraggable(win){
  const bar=win.querySelector(".titlebar"); let sx,sy,ox,oy,drag=false;
  bar.addEventListener("pointerdown",e=>{ if(e.target.closest(".ctl")) return; drag=true; focusWin(win.id); sx=e.clientX; sy=e.clientY; const r=win.getBoundingClientRect(); ox=r.left; oy=r.top; bar.setPointerCapture(e.pointerId); });
  bar.addEventListener("pointermove",e=>{ if(!drag) return; const nx=Math.max(0,Math.min(innerWidth-120,ox+e.clientX-sx)); const ny=Math.max(0,Math.min(innerHeight-80,oy+e.clientY-sy)); win.style.left=nx+"px"; win.style.top=ny+"px"; });
  bar.addEventListener("pointerup",()=>drag=false);
  win.addEventListener("pointerdown",()=>focusWin(win.id));
}

/* ---------------- PRICE FEED (CoinGecko, real) ---------------- */
async function loadPrices(){
  const ids=[...new Set(TOWS.filter(t=>t.cg).map(t=>t.cg).concat("solana"))].join(",");
  try{
    const r=await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_market_cap=true&include_24hr_change=true`,{cache:"no-store"});
    if(!r.ok) throw new Error(r.status);
    const j=await r.json();
    Object.entries(j).forEach(([id,v])=>{ state.prices[id]={usd:v.usd, mc:v.usd_market_cap, ch:v.usd_24h_change}; });
    if(j.solana) state.sol=j.solana.usd;
    state.feed="live";
  }catch(e){ state.feed = Object.keys(state.prices).length? "stale":"offline"; }
  paintPrices();
}
function paintPrices(){
  const dot=$("#feeddot"), txt=$("#feedtxt");
  dot.className="dot live";
  const now=new Date();
  txt.textContent = state.feed==="live" ? `feed: online · ${now.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}` : "feed: online";
  $("#tray-sol").textContent = state.sol? "$"+state.sol.toFixed(2) : "—";
  $$("[data-p]").forEach(el=>{ const t=towOf(el.dataset.p); const v=t&&towPrice(t); if(v!=null) el.textContent=fmtUsd(v); else if(t&&!t.cg) el.innerHTML=SOON; else el.textContent="—"; });
  $$("[data-c]").forEach(el=>{ const t=towOf(el.dataset.c); const v=t&&t.cg&&state.prices[t.cg]?state.prices[t.cg].ch:null; el.textContent=fmtPct(v); el.className=(el.className.replace(/\b(up|dn)\b/g,"")+" "+(v==null?"":v>=0?"up":"dn")).trim(); });
  $$("[data-m]").forEach(el=>{ const t=towOf(el.dataset.m); el.textContent = fmtBig(t&&t.cg&&state.prices[t.cg]?state.prices[t.cg].mc:null); });
  $$("[data-sol]").forEach(el=>{ const t=towOf(el.dataset.sol); const v=t&&towPrice(t); el.textContent = v!=null&&state.sol ? (v/state.sol).toPrecision(4)+" SOL" : ""; });
  $$("[data-solusd]").forEach(el=>{ const n=+el.dataset.solusd; el.textContent = state.sol? "≈ "+fmtBig(n*state.sol) : "≈ "+n+" SOL"; });
  if(state.route==="tows") paintTowTable();
  if(state.route==="launch") paintLaunchPreview();
  if(state.route==="wallet") paintWallet();
}

/* ---------------- HERO SCENE SVG ---------------- */
function heroSVG(){
  let g="";
  for(let x=0;x<=560;x+=28) g+=`<line x1="${x}" y1="0" x2="${x}" y2="500" stroke="#2b5fab" stroke-opacity=".08"/>`;
  for(let y=0;y<=500;y+=28) g+=`<line x1="0" y1="${y}" x2="560" y2="${y}" stroke="#2b5fab" stroke-opacity=".08"/>`;
  const wheel=(x,y,r,c1,c2,lab,spin)=>`<g transform="translate(${x} ${y})"><circle r="${r+5}" fill="#16161c"/><circle r="${r}" fill="${c1}"/><g><animateTransform attributeName="transform" type="rotate" from="0" to="${spin}" dur="6s" repeatCount="indefinite"/><circle r="${r*0.62}" fill="none" stroke="#fff" stroke-width="${r*0.18}" stroke-dasharray="${r*0.5} ${r*0.25}"/></g><circle r="${r*0.38}" fill="${c2}" stroke="#16161c" stroke-width="3"/><text y="${r*0.13}" font-family="Archivo Black,Arial Black" font-size="${lab.length>4?r*0.26:r*0.36}" text-anchor="middle" fill="#fff" stroke="#16161c" stroke-width="${lab.length>4?4:0}" paint-order="stroke" font-weight="900">${lab}</text></g>`;
  const bar=(x1,y1,x2,y2)=>{ const ang=Math.atan2(y2-y1,x2-x1)*180/Math.PI, len=Math.hypot(x2-x1,y2-y1); return `<g transform="translate(${x1} ${y1}) rotate(${ang})"><rect x="0" y="-7" width="${len}" height="14" fill="#16161c"/><rect x="2" y="-4" width="${len-4}" height="8" fill="url(#hz)"/></g>`; };
  return `<svg viewBox="0 0 560 500" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><pattern id="hz" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="16" fill="#ffc400"/><rect x="8" width="8" height="16" fill="#16161c"/></pattern></defs>
  ${g}
  <path d="M-10 420 C 120 400, 170 330, 260 330 S 380 250, 470 150 S 540 90, 580 70" fill="none" stroke="#ff7a00" stroke-width="4" stroke-dasharray="14 10" stroke-linecap="round"><animate attributeName="stroke-dashoffset" from="0" to="-48" dur="1.2s" repeatCount="indefinite"/></path>
  <!-- crane -->
  <g shape-rendering="crispEdges" opacity=".95" transform="translate(0 40)"><rect x="40" y="40" width="12" height="320" fill="#ffc400"/>${Array.from({length:20},(_,i)=>`<rect x="40" y="${44+i*16}" width="12" height="2" fill="#16161c"/>`).join("")}<rect x="10" y="40" width="250" height="10" fill="#ffc400"/><rect x="10" y="50" width="250" height="2" fill="#16161c"/><rect x="34" y="22" width="24" height="18" fill="#ff7a00"/><rect x="10" y="30" width="22" height="10" fill="#5d5a55"/>
  <g><animateTransform attributeName="transform" type="translate" values="0 0;0 26;0 0" dur="5s" repeatCount="indefinite"/><rect x="200" y="52" width="2" height="78" fill="#333"/><rect x="193" y="130" width="16" height="6" fill="#ff7a00"/><rect x="170" y="136" width="62" height="26" fill="#2b5fab" stroke="#16161c" stroke-width="3"/><text x="201" y="154" font-family="VT323,monospace" font-size="17" text-anchor="middle" fill="#ffc400">$TOWBAR</text></g></g>
  ${bar(110,350,215,322)}${bar(215,322,320,290)}${bar(320,290,430,190)}
  ${wheel(110,350,30,"#7b5cff","#4a2fc0","",360)}
  ${wheel(215,322,32,"#14a39a","#0c6b65","",360)}
  ${wheel(320,290,34,"#ff5fa2","#b0306c","",360)}
  ${wheel(440,180,66,"#ffc400","#ff7a00","$TOWBAR",-360)}
  <!-- road + truck -->
  <rect x="0" y="440" width="560" height="60" fill="#2a2a30"/><rect x="0" y="436" width="560" height="6" fill="url(#hz)"/>
  ${Array.from({length:10},(_,i)=>`<rect x="${i*64}" y="468" width="34" height="5" fill="#ffc400"><animate attributeName="x" from="${i*64}" to="${i*64-64}" dur="1s" repeatCount="indefinite"/></rect>`).join("")}
  <g><animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur=".4s" repeatCount="indefinite"/><g transform="translate(262 383) scale(4)">${ICON.truck.replace(/<svg[^>]*>/,"").replace("</svg>","")}</g><circle cx="351" cy="385" r="5" fill="#e23b3b"><animate attributeName="opacity" values="1;.1;1" dur=".7s" repeatCount="indefinite"/></circle></g>
  <g transform="translate(140 412)"><rect x="0" y="0" width="96" height="10" fill="#5d5a55"/><rect x="96" y="2" width="36" height="5" fill="#16161c"/><circle cx="22" cy="14" r="8" fill="#16161c"/><circle cx="74" cy="14" r="8" fill="#16161c"/><circle cx="22" cy="14" r="3" fill="#c0c0c0"/><circle cx="74" cy="14" r="3" fill="#c0c0c0"/><g><animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur=".5s" repeatCount="indefinite"/><circle cx="48" cy="-22" r="22" fill="#16161c"/><circle cx="48" cy="-22" r="17" fill="#ff7a00"/><text x="48" y="-16" font-family="Archivo Black,Arial Black" font-size="16" text-anchor="middle" fill="#fff">$</text></g></g>
  </svg>`;
}

/* ---------------- PAGES ---------------- */
function caBar(){
  return `<div class="ca-bar"><b>CA</b><code>${CONFIG.CA?esc(CONFIG.CA):`Posted on X ${CONFIG.X_HANDLE} at launch`}</code><button class="btn98" data-copyca>${CONFIG.CA?"Copy":"Open X"}</button></div>`;
}
function filteredTows(){ return TOWS.filter(t=>state.chain==="all"||t.chain===state.chain); }

function pageHome(){
  const pick=["ETH","PEPE","HYPE","VIRTUAL","BNB","SUI","AVAX","ARB"];
  const showChains = CHAINS.filter(c=>state.chain==="all"||c.id===state.chain);
  const bubbles=[["PEPE",54,8,54],["HYPE",28,16,46],["ETH",86,58,42],["SUI",38,4,38],["VIRTUAL",70,64,44],["AVAX",-3,46,38]];
  return `<div class="page page-in">
  <section class="hero">
    <div>
      <div class="chain-strip">${CHAINS.map(c=>chainDot(c)).join("")}<span>→ towed to Solana</span></div>
      <span class="kicker">${ICON.cone.replace("<svg","<svg width='14' height='14'")} ${CONFIG.TICKER} · launching on pump.fun</span>
      <h1 style="margin-top:16px">Launch Solana coins <span class="tw">towed</span> by any chain.</h1>
      <p class="lede">Hook your coin to PEPE on Ethereum, HYPE on HyperEVM, VIRTUAL on Base or 38 more assets. Each tow follows its asset's live price, so your chart gets pulled along with it.</p>
      <div class="cta-row"><a class="btn98 primary lg" href="#/launch">${"Launch a coin"}</a><a class="btn98 lg" href="#/tows">Explore tows</a><button class="btn98 lg" data-open="calcwin">Load calculator</button></div>
      ${caBar()}
      <div class="trust-row"><span>${ICON.hat} No seed phrases, ever</span><span>${ICON.cone} Free to deploy · ${CONFIG.CURVE_FEE_PCT}% curve fee</span><span>${ICON.tows} Bonds to PumpSwap · LP burned</span></div>
    </div>
    <div style="position:relative">
      <div class="scene"><span class="tag">SITE CAM 01 · TOWBAR YARD</span><span class="rec"><i></i>LIVE</span>${heroSVG()}</div>
      ${bubbles.map(([s,l,t,z],i)=>{const tw=towOf(s);return `<a href="#/tows/${s}" class="bubble" title="${s}" style="left:${l}%;top:${t}%;width:${z}px;height:${z}px;background:${tw.color};animation-delay:${-i*.7}s;text-decoration:none">${s.slice(0,4)}</a>`;}).join("")}
    </div>
  </section>

  <section class="sec route-wrap">
    <div>
      <span class="kicker">How the route runs</span>
      <h2 style="font-size:clamp(28px,3.6vw,44px);margin-top:14px">Buyers pay SOL. Your coin is <span class="hl">priced in its tow.</span></h2>
      <p class="lede" style="margin-top:16px">A buyer pays SOL. The route goes through the tow's pool and into your coin's curve in one transaction. Your coin's price is set in its tow, so when PEPE runs on Ethereum, every coin towed by it runs in SOL too.</p>
      <a class="more" href="#/launch">Launch on a tow →</a>
    </div>
    <div class="card">
      <div class="card-h">${ICON.tows.replace("<svg","<svg width='16' height='16'")} route.exe <span class="x">1 tx</span></div>
      <div class="route">
        <div class="node"><span class="cdot" style="background:linear-gradient(135deg,#14f195,#9945ff)">◎</span><b>SOL</b><small>You pay</small></div>
        <div class="link"><span>pool</span></div>
        <div class="node mid" id="route-mid"></div>
        <div class="link"><span>curve</span></div>
        <div class="node"><span class="cdot" style="background:var(--orange)">Y</span><b>Your coin</b><small id="route-in">Priced in ETH</small></div>
      </div>
      <div class="route-picker">${pick.map((s,i)=>`<button class="chip ${i===0?"on":""}" data-route="${s}">${cdot(towOf(s))}${s}</button>`).join("")}</div>
    </div>
  </section>

  <section class="sec">
    <div class="sec-head"><h2>The top assets of <span class="hl-y">ten chains</span> on Solana</h2><a class="more" href="#/tows">All ${TOWS.length} tows →</a></div>
    <div class="chain-grid">${showChains.map(c=>{const list=TOWS.filter(t=>t.chain===c.id);return `<div class="chain-card"><div class="ch" style="background:${c.color}">${chainDot(c)}${c.name}<span class="n">${list.length}</span></div><ul>${list.map(t=>`<li data-goto="#/tows/${t.sym}">${cdot(t)}${t.sym}<span class="p" data-p="${t.sym}">—</span></li>`).join("")}</ul></div>`;}).join("")}</div>
  </section>

  <section class="sec">
    <div class="sec-head"><h2><span class="hl">${CONFIG.TICKER}</span> launches on pump.fun</h2><a class="more" data-x>CA drops on X →</a></div>
    <div class="token-grid">
      <div class="card"><div class="card-h dk">${ICON.coins.replace("<svg","<svg width='16' height='16'")} ${CONFIG.TICKER} · deploy sheet <span class="x">pump.fun</span></div><div class="card-b">
        <div class="kv"><span>Launchpad</span><b>pump.fun (Solana)</b></div>
        <div class="kv"><span>Total supply</span><b>${CONFIG.SUPPLY.toLocaleString()} ${CONFIG.TICKER}</b></div>
        <div class="kv"><span>Sold on bonding curve</span><b>${(CONFIG.CURVE_TOKENS/1e6).toFixed(1)}M (79.31%)</b></div>
        <div class="kv"><span>Seeded to PumpSwap at bond</span><b>${(CONFIG.POOL_TOKENS/1e6).toFixed(1)}M (20.69%)</b></div>
        <div class="kv"><span>Presale / private round</span><b>None — fair launch on the curve</b></div>
        <div class="kv"><span>Curve fee</span><b>${CONFIG.CURVE_FEE_PCT}% per trade</b></div>
        <div class="kv"><span>Liquidity at graduation</span><b>PumpSwap pool · LP burned</b></div>
      </div></div>
      <div class="card"><div class="card-h te">${ICON.tows.replace("<svg","<svg width='16' height='16'")} Bonding curve gauge <span class="x">x·y=k</span></div><div class="card-b" id="curve-gauge"></div></div>
    </div>
  </section>

  <section class="sec">
    <div class="sec-head"><h2>How a tow works</h2><a class="more" href="#/docs">Read the docs →</a></div>
    <div class="how">
      <div class="card"><div class="viz"><i style="height:30%"></i><i style="height:36%"></i><i style="height:34%"></i><i class="r" style="height:62%"></i><i class="k" style="height:36%"></i><i style="height:33%"></i><i style="height:35%"></i><i class="r" style="height:14%"></i><i style="height:34%"></i></div><div class="card-b"><h3>Priced from the market</h3><p>The median of up to 9 exchanges every 5 seconds. Quotes more than 2% off the rest are dropped before the median is taken.</p></div></div>
      <div class="card"><div class="viz"><i class="o" style="height:8%"></i><i class="o" style="height:12%"></i><i class="o" style="height:18%"></i><i class="o" style="height:78%"></i><i class="o" style="height:60%"></i><i class="o" style="height:42%"></i><i class="o" style="height:26%"></i><i class="o" style="height:16%"></i></div><div class="card-b"><h3>Deep from the first block</h3><p>The tow's whole supply sits in the price bins just above its price, so buyers fill at the asset's price the moment the pool opens.</p></div></div>
      <div class="card"><div class="viz"><i class="t" style="height:12%"></i><i class="t" style="height:20%"></i><i class="t" style="height:30%"></i><i class="t" style="height:42%"></i><i class="t" style="height:56%"></i><i class="k" style="height:72%"></i><i class="k" style="height:72%"></i><i class="k" style="height:72%"></i></div><div class="card-b"><h3>Bonds to PumpSwap</h3><p>Every coin deploys on the pump.fun bonding curve. Once ~${CONFIG.GRAD_SOL_RAISED} SOL fills it, the coin graduates to PumpSwap and the LP tokens are burned.</p></div></div>
    </div>
  </section>

  <section class="sec">
    <div class="sec-head"><h2>Site <span class="hl">toolbox</span></h2><span class="muted" style="font-size:13px">Interactive math. No made-up market data.</span></div>
    <div class="toolbox">
      <div class="card"><div class="card-h or">${ICON.calc.replace("<svg","<svg width='16' height='16'")} Load Calculator <span class="x">tow × curve</span></div><div class="card-b" id="calc-inline"></div></div>
      <div class="card"><div class="card-h te">${ICON.tows.replace("<svg","<svg width='16' height='16'")} Median Lab <span class="x">2% outlier cut</span></div><div class="card-b" id="median-lab"></div></div>
    </div>
  </section>

  <section class="sec">
    <div class="sec-head"><h2>Latest coins on Towbar</h2><a class="more" href="#/coins">All coins →</a></div>
    ${coinsBlock(6)}
  </section>

  <section class="sec">
    <div class="cta">
      <div>
        <span class="kicker">Job site open</span>
        <h2>Just <span class="hl">tow it.</span></h2>
        <p>Pick an asset from any chain, hook your coin to it, and let the market do the pulling.</p>
        <div class="cta-row" style="margin-top:18px"><a class="btn98 primary lg" href="#/launch">Launch a coin</a><button class="btn98 yellow lg" data-x>Follow ${CONFIG.TICKER} on X</button></div>
      </div>
      <div class="sitecam"><img src="construction.png" alt="Pixel construction site with a tower crane"><div class="ov"></div><span class="lab">CAM 02 · BUILD SITE</span><span class="rc"><i></i>REC</span><span class="ts" id="camts"></span></div>
    </div>
  </section>
  </div>${footer()}`;
}

function coinsBlock(limit){
  const drafts=store.get("drafts",[]);
  const parts=[];
  if(drafts.length){
    parts.push(`<div style="margin-bottom:12px;display:flex;gap:8px;align-items:center"><span class="badge">YOUR DRAFTS</span><span class="muted" style="font-size:12px">Saved on this device · go live when launches open</span></div><div class="coin-grid">${drafts.slice(0,limit||99).map(draftCard).join("")}</div>`);
  }
  parts.push(`<div class="empty" style="${drafts.length?"margin-top:16px":""}"><img src="barricade.png" alt=""><h3>The yard is empty — for now.</h3><p>No coins have been towed onto Towbar yet. The first launches land here the moment ${CONFIG.TICKER} goes live. Want to be first in line?</p><div class="cta-row" style="justify-content:center"><a class="btn98 primary" href="#/launch">Prep a launch</a><button class="btn98" data-x>Get notified on X</button></div></div>`);
  return parts.join("");
}
function draftCard(d,i){
  const t=towOf(d.tow)||{color:"#888",sym:d.tow};
  return `<div class="draft"><div class="av" style="background:${t.color}">${d.img?`<img src="${d.img}" alt="">`:esc((d.ticker||"?").slice(0,2))}</div><div style="min-width:0;flex:1"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.name)}</b><small>$${esc(d.ticker)} on ${esc(d.tow)}</small></div><span style="display:flex;flex-direction:column;gap:3px;align-items:flex-end"><span class="badge bl">DRAFT</span><span class="badge gr">pump.fun</span></span></div>`;
}

function pageTows(){
  return `<div class="page page-in">
    <div class="page-title"><div><span class="kicker">${TOWS.length} assets · ${CHAINS.length} chains</span><h1 style="margin-top:12px">Tows</h1><p>Every asset you can tow a coin with. Each one follows its asset's price on its home chain. Prices below are live from CoinGecko; assets marked "at launch" get their feed when Towbar goes live.</p></div></div>
    <div class="filters"><input class="field98" id="towsearch" placeholder="Search an asset or chain…" aria-label="Search"><span class="muted" style="font-size:12px">Chain filter lives in the address bar ↑</span><span style="margin-left:auto" class="muted mono" id="towcount"></span></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th data-sort="sym">Asset</th><th data-sort="chain">Home chain</th><th class="r" data-sort="price">Price</th><th class="r" data-sort="ch">24h</th><th class="r" data-sort="mc">Market cap</th><th class="r">Coins</th><th></th>
    </tr></thead><tbody id="towbody"></tbody></table></div>
  </div>${footer()}`;
}
function paintTowTable(){
  const body=$("#towbody"); if(!body) return;
  const q=($("#towsearch")||{value:""}).value.trim().toLowerCase();
  let list=filteredTows().filter(t=>!q||t.sym.toLowerCase().includes(q)||chainOf(t.chain).name.toLowerCase().includes(q));
  const val=(t,k)=>{ const p=t.cg&&state.prices[t.cg]; if(k==="price") return p?p.usd:-1; if(k==="ch") return p?p.ch:-999; if(k==="mc") return p?p.mc:-1; if(k==="chain") return chainOf(t.chain).name; return t.sym; };
  const {key,dir}=state.sort;
  list.sort((a,b)=>{ const A=val(a,key),B=val(b,key); return (A>B?1:A<B?-1:0)*dir; });
  body.innerHTML=list.map(t=>{const c=chainOf(t.chain);return `<tr data-goto="#/tows/${t.sym}"><td><span class="asset">${cdot(t)}${t.sym}</span></td><td><span class="asset" style="font-weight:600">${chainDot(c,18)}${c.name}</span></td><td class="r mono" data-p="${t.sym}"></td><td class="r mono" data-c="${t.sym}"></td><td class="r mono" data-m="${t.sym}"></td><td class="r mono">0</td><td class="r"><a class="btn98" href="#/launch?tow=${t.sym}" onclick="event.stopPropagation()">Tow it</a></td></tr>`;}).join("") || `<tr><td colspan="7" style="text-align:center;padding:30px" class="muted">No tows match “${esc(q)}”.</td></tr>`;
  $("#towcount").textContent=list.length+" shown";
  // inline paint (avoid recursion)
  $$("[data-p]",body).forEach(el=>{ const t=towOf(el.dataset.p); const v=towPrice(t); if(v!=null) el.textContent=fmtUsd(v); else if(!t.cg) el.innerHTML=SOON; else el.textContent="—"; });
  $$("[data-c]",body).forEach(el=>{ const t=towOf(el.dataset.c); const v=t.cg&&state.prices[t.cg]?state.prices[t.cg].ch:null; el.textContent=fmtPct(v); el.classList.add("r","mono"); el.classList.toggle("up",v!=null&&v>=0); el.classList.toggle("dn",v!=null&&v<0); });
  $$("[data-m]",body).forEach(el=>{ const t=towOf(el.dataset.m); el.textContent=fmtBig(t.cg&&state.prices[t.cg]?state.prices[t.cg].mc:null); });
  $$("th[data-sort]").forEach(th=>{ th.textContent=th.textContent.replace(/ [▲▼]$/,""); if(th.dataset.sort===key) th.textContent+= dir>0?" ▲":" ▼"; });
}

function pageTow(sym){
  const t=towOf(sym); if(!t) return pageNotFound();
  const c=chainOf(t.chain);
  return `<div class="page page-in">
    <a class="more" href="#/tows">← All tows</a>
    <div class="card" style="margin-top:12px"><div class="hazard-strip"></div><div class="d-head">${cdot(t,64)}<div><h1>${t.sym}</h1><div class="muted" style="display:flex;gap:6px;align-items:center;margin-top:6px">${chainDot(c,18)} ${t.sym} on ${c.name}</div></div><div class="px"><b data-p="${t.sym}">—</b><span class="mono muted" data-sol="${t.sym}"></span> <span class="mono" data-c="${t.sym}"></span></div></div></div>
    <div class="two">
      <div class="card"><div class="card-h">${ICON.tows.replace("<svg","<svg width='16' height='16'")} This tow</div><div class="card-b">
        <div class="kv"><span>Follows</span><b>${t.sym} on ${c.name}</b></div>
        <div class="kv"><span>Price from</span><b>Median of 9 venues, every 5 seconds</b></div>
        <div class="kv"><span>Outlier rule</span><b>Quotes &gt;2% from the rest are dropped</b></div>
        <div class="kv"><span>${t.sym} market cap</span><b data-m="${t.sym}">—</b></div>
        <div class="kv"><span>Launchpad</span><b>pump.fun · bonds to PumpSwap</b></div>
        <div class="kv"><span>Public price feed</span><b>${t.cg?"CoinGecko · live":"Connects at launch"}</b></div>
        <div class="kv"><span>Coins on ${t.sym}</span><b>0</b></div>
      </div></div>
      <div class="card"><div class="card-h or">${ICON.launch.replace("<svg","<svg width='16' height='16'")} Launch against ${t.sym}</div><div class="card-b">
        <p style="margin-top:0;line-height:1.6">Your coin's chart moves with ${t.sym} <b>and</b> with its own buyers. If ${t.sym} runs on ${c.name}, your coin runs in SOL too. If it dumps, you get dragged with it.</p>
        <div class="cta-row"><a class="btn98 primary lg" href="#/launch?tow=${t.sym}">Launch on ${t.sym}</a><button class="btn98 lg" data-open="calcwin" data-calc="${t.sym}">Run the numbers</button></div>
        <div class="callout" style="margin-top:16px">${ICON.cone.replace("<svg","<svg width='22' height='22' style='flex:none'")}<span>A tow follows a price. It is not ${t.sym} itself and can't be redeemed for it.</span></div>
      </div></div>
    </div>
    <div class="sec"><div class="sec-head"><h2 style="font-size:30px">Coins on ${t.sym}</h2></div>
      <div class="empty"><img src="barricade.png" alt=""><h3>Nothing hooked to ${t.sym} yet.</h3><p>Be the first coin towed by ${t.sym} when launches open.</p><a class="btn98 primary" href="#/launch?tow=${t.sym}">Prep a ${t.sym} launch</a></div>
    </div>
  </div>${footer()}`;
}

function pageCoins(){
  return `<div class="page page-in">
    <div class="page-title"><div><span class="kicker">Live board</span><h1 style="margin-top:12px">Coins</h1><p>Every coin launched on Towbar, newest on top.</p></div></div>
    <div class="tabs">${[["new","Newest"],["mc","Market cap"],["grad","Closest to bonding"],["bonded","Bonded to PumpSwap"]].map(([k,l])=>`<button class="btn98 ${state.coinTab===k?"pressed":""}" data-ctab="${k}">${l}</button>`).join("")}</div>
    ${coinsBlock()}
  </div>${footer()}`;
}

function pageLaunch(){
  const L=state.launch;
  return `<div class="page page-in">
    <div class="page-title"><div><span class="kicker">Work order #001</span><h1 style="margin-top:12px">Launch a coin</h1><p>Pick the asset your coin is towed by, then name it. Buyers pay in SOL, and the route goes through the tow in the same transaction.</p></div></div>
    <div class="launch">
      <div class="card"><div class="card-h or">${ICON.launch.replace("<svg","<svg width='16' height='16'")} New coin <span class="x">step 1 of 1</span></div><div class="card-b">
        <div class="fgrid">
          <div class="full"><label class="lb">Tow</label><button class="picker" id="towpick" type="button"></button></div>
          <div><label class="lb" for="f-name">Name</label><input class="field98" id="f-name" maxlength="32" placeholder="Coin name" value="${esc(L.name)}"></div>
          <div><label class="lb" for="f-ticker">Ticker</label><input class="field98 mono" id="f-ticker" maxlength="10" placeholder="TICKER" value="${esc(L.ticker)}" style="text-transform:uppercase"></div>
          <div class="full"><label class="lb" for="f-desc">Description <span class="muted" style="float:right;font-weight:400">optional</span></label><textarea class="field98" id="f-desc" maxlength="280" placeholder="What is this coin about?">${esc(L.desc)}</textarea></div>
          <div class="full"><label class="lb">Image</label><div class="drop-zone" id="dropzone" tabindex="0"><div class="thumb" id="thumb">${L.img?`<img src="${L.img}" alt="">`:ICON.cam.replace("<svg","<svg width='30' height='30'")}</div><div><b style="font-size:13px">Drop an image or click to upload</b><div class="muted" style="font-size:12px;margin-top:3px">PNG, JPG or GIF · square works best</div></div></div></div>
          <div><label class="lb" for="f-x">X / Twitter <span class="muted" style="font-weight:400">optional</span></label><input class="field98" id="f-x" placeholder="https://x.com/…" value="${esc(L.x)}"></div>
          <div><label class="lb" for="f-tg">Telegram <span class="muted" style="font-weight:400">optional</span></label><input class="field98" id="f-tg" placeholder="https://t.me/…" value="${esc(L.tg)}"></div>
          <div class="full"><label class="lb" for="f-web">Website <span class="muted" style="font-weight:400">optional</span></label><input class="field98" id="f-web" placeholder="https://…" value="${esc(L.web)}"></div>
          <div class="full"><label class="lb" for="f-buy">Creator first buy <span class="muted" style="font-weight:400">optional · SOL</span></label><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><input class="field98 mono" id="f-buy" type="number" min="0" max="85" step="0.1" placeholder="0" value="${esc(L.buy||"")}" style="width:140px"><span class="mono" id="buy-out" style="font-size:18px"></span></div><p class="small-note" style="margin-top:6px">On pump.fun the creator can buy in the same transaction as the deploy. Estimate uses the curve math (30 SOL / 1.073B virtual reserves, ${CONFIG.CURVE_FEE_PCT}% fee).</p></div>
          <div class="full"><label class="check98"><input type="checkbox" id="f-ack" ${L.ack?"checked":""}> I understand a towed coin carries two risks: its own buyers and the asset it follows.</label></div>
          <div class="full"><button class="btn98 primary lg" id="launchbtn" style="width:100%">Deploy on pump.fun — free</button>
          <p class="small-note">Deploying on pump.fun is free: you only pay Solana network fees, plus any creator first buy. The coin starts on the pump.fun bonding curve priced in its tow. When ~${CONFIG.GRAD_SOL_RAISED} SOL fills the curve it bonds to PumpSwap and the LP is burned.</p></div>
        </div>
      </div></div>
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="card"><div class="card-h">Preview</div>
          <div class="preview-art"><svg viewBox="0 0 300 170"><path d="M0 130 C 60 120, 90 100, 140 104 S 230 60, 300 40" fill="none" stroke="#ff7a00" stroke-width="3" stroke-dasharray="8 6"><animate attributeName="stroke-dashoffset" from="0" to="-28" dur="1s" repeatCount="indefinite"/></path><g transform="translate(110 110)"><circle r="18" fill="#16161c"/><circle r="14" id="pv-c1" fill="#ff7a00"/><text y="5" text-anchor="middle" font-family="Archivo Black" font-size="12" fill="#fff" id="pv-t1">?</text></g><rect x="126" y="86" width="74" height="9" fill="#16161c" transform="rotate(-24 126 90)"/><g transform="translate(210 62)"><circle r="34" fill="#16161c"/><circle r="29" id="pv-c2" fill="#5b6ee1"/><circle r="12" fill="#fff" stroke="#16161c" stroke-width="3"/><text y="50" text-anchor="middle" font-family="VT323" font-size="18" fill="#16161c" id="pv-t2">ETH</text></g></svg></div>
          <div class="yc"><div class="av" id="pv-av">?</div><div><b id="pv-name">Your coin</b><span class="mono muted" id="pv-tick">TICKER</span></div></div>
          <div class="card-b" style="padding-top:6px">
            <div class="kv"><span>Towed by</span><b id="pv-tow">ETH · Ethereum</b></div>
            <div class="kv"><span id="pv-plab">ETH price</span><b class="mono" id="pv-price">—</b></div>
            <div class="kv"><span>Launchpad</span><b>pump.fun</b></div>
            <div class="kv"><span>Supply</span><b>${CONFIG.SUPPLY.toLocaleString()}</b></div>
            <div class="kv"><span>On bonding curve</span><b>${(CONFIG.CURVE_TOKENS/1e6).toFixed(1)}M</b></div>
            <div class="kv"><span>Opens at</span><b>${CONFIG.CURVE_START_SOL} SOL mcap <span class="muted mono" data-solusd="${CONFIG.CURVE_START_SOL}"></span></b></div>
            <div class="kv"><span>Bonds at</span><b>~${CONFIG.GRAD_SOL_RAISED} SOL raised · ${CONFIG.CURVE_GRAD_SOL} SOL mcap <span class="muted mono" data-solusd="${CONFIG.CURVE_GRAD_SOL}"></span></b></div>
            <div class="kv"><span>Bonds to</span><b>PumpSwap · LP burned</b></div>
            <div class="kv"><span>Curve fee</span><b>${CONFIG.CURVE_FEE_PCT}% <span class="muted" style="font-weight:400">(${CONFIG.CURVE_FEE_CREATOR}% to you)</span></b></div>
            <div class="kv"><span>Deploy cost</span><b>Free + network fee</b></div>
          </div>
        </div>
        <div class="card"><div class="card-h ye">${ICON.hat.replace("<svg","<svg width='16' height='16'")} Site inspection</div><div class="card-b"><ul class="checklist" id="checklist"></ul></div></div>
      </div>
    </div>
  </div>${footer()}`;
}
function launchChecks(){
  const L=state.launch;
  return [
    ["Tow selected", !!towOf(L.tow)],
    ["Name (2–32 chars)", L.name.trim().length>=2],
    ["Ticker (2–10 letters/numbers)", /^[A-Z0-9]{2,10}$/.test(L.ticker)],
    ["Image added", !!L.img],
    ["Risk acknowledged", L.ack],
    ["Creator buy within curve", !(+L.buy>CONFIG.GRAD_SOL_RAISED)],
    ["Wallet connected", !!state.wallet]
  ];
}
function paintLaunchPreview(){
  const L=state.launch, t=towOf(L.tow)||towOf("ETH"), c=chainOf(t.chain);
  const pk=$("#towpick"); if(!pk) return;
  pk.innerHTML=`${cdot(t,34)}<span><b>${t.sym}</b><small>${c.name}</small></span><span class="p" data-p="${t.sym}">${towPrice(t)!=null?fmtUsd(towPrice(t)):(t.cg?"—":SOON)}</span><span style="font-size:11px;margin-left:8px">▼</span>`;
  $("#pv-tow").textContent=`${t.sym} · ${c.name}`; $("#pv-plab").textContent=`${t.sym} price`;
  const v=towPrice(t); $("#pv-price").innerHTML= v!=null?fmtUsd(v):(t.cg?"—":SOON);
  $("#pv-name").textContent=L.name||"Your coin"; $("#pv-tick").textContent=L.ticker?("$"+L.ticker):"TICKER";
  $("#pv-av").innerHTML = L.img?`<img src="${L.img}" alt="">`:(L.ticker?esc(L.ticker.slice(0,2)):"?");
  $("#pv-t1").textContent=(L.ticker||"?").slice(0,2); $("#pv-t2").textContent=t.sym; $("#pv-c2").setAttribute("fill",t.color);
  $$("[data-solusd]").forEach(el=>{ const n=+el.dataset.solusd; el.textContent= state.sol?"≈ "+fmtBig(n*state.sol):""; });
  const bo=$("#buy-out"); if(bo){ const s=+L.buy||0; if(s>0){ const t=CURVE.buy(Math.min(s,CONFIG.GRAD_SOL_RAISED)); bo.innerHTML = s>CONFIG.GRAD_SOL_RAISED? `<span class="dn">Max ~${CONFIG.GRAD_SOL_RAISED} SOL: the curve would bond</span>` : `≈ ${(t/1e6).toFixed(2)}M tokens · ${(t/CONFIG.SUPPLY*100).toFixed(2)}% of supply`; } else bo.textContent=""; }
  $("#checklist").innerHTML=launchChecks().map(([l,ok])=>`<li class="${ok?"ok":""}"><i>${ok?"✓":""}</i>${l}</li>`).join("");
}

function pageDocs(){
  const secs=[["overview","Overview"],["pumpfun","pump.fun launch"],["prices","Prices"],["fees","Fees"],["risks","Risks"],["glossary","Glossary"],["faq","FAQ"]];
  return `<div class="page page-in">
    <div class="page-title"><div><span class="kicker">Site manual</span><h1 style="margin-top:12px">Docs</h1><p>How Towbar works, in seven short parts.</p></div></div>
    <div class="docs">
      <nav>${secs.map(([id,l],i)=>`<a data-doc="${id}" class="${i===0?"on":""}"><span class="mono" style="color:var(--orange)">0${i+1}</span>${l}</a>`).join("")}</nav>
      <article>
        <section id="doc-overview"><h2><span class="num">01</span>Overview</h2>
          <p>Towbar is a launchpad on Solana where every coin is paired with an asset from another chain instead of with SOL. That paired asset is the coin's <b>tow</b>.</p>
          <p>A tow is a Solana token that follows the price of its asset on its home chain. Your coin's bonding curve is priced in the tow, so the coin's dollar price is its curve price times the asset's price.</p>
          <ul><li>Buyers still pay SOL. The route goes SOL, then the tow, then your coin, in one transaction.</li><li>When the asset moves, every coin towed by it moves with it.</li><li>When the curve completes, the coin bonds to PumpSwap and its LP tokens are burned.</li></ul>
        </section>
        <section id="doc-pumpfun"><h2><span class="num">02</span>pump.fun launch</h2>
          <p>Every Towbar coin, and ${CONFIG.TICKER} itself, deploys through <b>pump.fun</b> on Solana, using its standard parameters:</p>
          <div class="tbl-wrap" style="box-shadow:3px 3px 0 var(--ink)"><table class="tbl"><tbody style="cursor:default">
            <tr><td>Total supply</td><td class="r mono">1,000,000,000 (6 decimals)</td></tr>
            <tr><td>Tokens sold on the bonding curve</td><td class="r mono">~793,100,000</td></tr>
            <tr><td>Tokens seeded to PumpSwap at bond</td><td class="r mono">~206,900,000</td></tr>
            <tr><td>Virtual reserves at start</td><td class="r mono">30 SOL / ~1.073B tokens</td></tr>
            <tr><td>Opening market cap</td><td class="r mono">~${CONFIG.CURVE_START_SOL} SOL</td></tr>
            <tr><td>SOL to complete the curve</td><td class="r mono">~${CONFIG.GRAD_SOL_RAISED} SOL</td></tr>
            <tr><td>Market cap at bond</td><td class="r mono">~${CONFIG.CURVE_GRAD_SOL} SOL (≈ $69K, moves with SOL)</td></tr>
            <tr><td>Graduates to</td><td class="r mono">PumpSwap · LP burned</td></tr>
            <tr><td>Creation fee</td><td class="r mono">Free (network fees only)</td></tr>
          </tbody></table></div>
          <p>The curve is constant-product (x·y = k), so price rises as tokens are bought and falls as they are sold. There is no presale and no private round: everyone buys from the same curve.</p>
        </section>
        <section id="doc-prices"><h2><span class="num">03</span>Prices</h2>
          <p>Each tow price is the median of up to nine venues, refreshed every five seconds. A quote more than 2% from the rest is dropped before the median is taken.</p>
          <p>The tow's supply sits in the price bins just above its price, so a buy fills at the asset's price from the first trade.</p>
          <div class="callout">${ICON.calc.replace("<svg","<svg width='22' height='22' style='flex:none'")}<span>Try the outlier rule yourself in the <a href="#/" data-scroll="median-lab"><b>Median Lab</b></a> on the home page.</span></div>
        </section>
        <section id="doc-fees"><h2><span class="num">04</span>Fees</h2>
          <p>Fees follow pump.fun's schedule:</p>
          <ul><li><b>Deploying a coin:</b> free. You only pay Solana network fees (plus any creator first buy).</li><li><b>On the bonding curve:</b> ${CONFIG.CURVE_FEE_PCT}% of every buy and sell: ${CONFIG.CURVE_FEE_PROTOCOL}% to pump.fun and ${CONFIG.CURVE_FEE_CREATOR}% to the coin's creator.</li><li><b>After bonding (PumpSwap):</b> a tiered fee that starts at ${CONFIG.SWAP_FEE_MAX}% and steps down toward ${CONFIG.SWAP_FEE_MIN}% as market cap grows, with part going to the creator.</li><li><b>Graduation:</b> migration to PumpSwap is automatic and free.</li></ul>
          <p class="muted" style="font-size:13px">pump.fun sets and can change these fees; check pump.fun's own fee page for the latest schedule.</p>
        </section>
        <section id="doc-risks"><h2><span class="num">05</span>Risks</h2>
          <ul><li>A towed coin carries two risks at once: its own buyers and sellers, and the asset it follows. If the asset falls, the coin falls with it.</li><li>A tow follows a price. It is not the asset itself and cannot be redeemed for it.</li><li>Price feeds can lag or fail. Dropping outliers reduces that risk and does not remove it.</li><li>New coins are volatile, can lose all their value and may be hard to sell.</li></ul>
        </section>
        <section id="doc-glossary"><h2><span class="num">06</span>Glossary</h2>
          <p><b>Tow</b> — the asset your coin is priced in. <b>Route</b> — the SOL → tow → coin path a buy takes. <b>Curve</b> — the bonding curve your coin trades on before graduation. <b>Bonding / graduation</b> — when the curve completes (~${CONFIG.GRAD_SOL_RAISED} SOL) and liquidity moves to a PumpSwap pool with the LP burned. <b>PumpSwap</b> — pump.fun&#39;s own DEX, where bonded coins trade. <b>Creator first buy</b> — an optional buy the creator makes in the deploy transaction. <b>Venue</b> — an exchange quote used to price a tow.</p>
        </section>
        <section id="doc-faq" class="faq"><h2><span class="num">07</span>FAQ</h2>
          <details><summary>Do I need the tow asset to buy?</summary><p>No. Buyers pay SOL and the route handles the tow in the same transaction.</p></details>
          <details><summary>Can I change my coin's tow later?</summary><p>No. A coin's tow is set at launch and it graduates against the same tow.</p></details>
          <details><summary>Where does ${CONFIG.TICKER} launch?</summary><p>On pump.fun, as a standard 1,000,000,000-supply coin on the bonding curve. There's no presale. The contract address is posted on X at <a href="${CONFIG.X_URL}" target="_blank" rel="noopener">${CONFIG.X_HANDLE}</a> when it's live.</p></details>
          <details><summary>What happens when a coin bonds?</summary><p>When the curve sells its ~793.1M tokens (~${CONFIG.GRAD_SOL_RAISED} SOL in), the coin graduates to PumpSwap. The SOL and the remaining ~206.9M tokens seed the pool and the LP tokens are burned, so that liquidity can't be pulled.</p></details>
          <details><summary>Will Towbar ever ask for my seed phrase?</summary><p>Never. Towbar only asks your wallet to sign transactions you start. Anyone asking for a seed phrase is not us.</p></details>
          <details><summary>Where is the ${CONFIG.TICKER} contract address?</summary><p>${CONFIG.CA?`It's <code>${esc(CONFIG.CA)}</code>.`:`It's posted on our X account, <a href="${CONFIG.X_URL}" target="_blank" rel="noopener">${CONFIG.X_HANDLE}</a>, at launch. Don't trust addresses from DMs.`}</p></details>
          <details><summary>When can I launch?</summary><p>Launches open after ${CONFIG.TICKER} goes live on pump.fun. You can prep your coin now; drafts save on your device.</p></details>
        </section>
      </article>
    </div>
  </div>${footer()}`;
}

function pageWallet(){
  return `<div class="page page-in">
    <div class="page-title"><div><span class="kicker">Hard hat locker</span><h1 style="margin-top:12px">Wallet</h1><p>Your Towbar wallet balance and holdings.</p></div><div id="w-act"></div></div>
    <div class="stats">
      <div class="stat c1"><small>SOL balance</small><b id="w-sol">—</b></div>
      <div class="stat c2"><small>Coins held</small><b>$0.00</b></div>
      <div class="stat c3"><small>Total</small><b id="w-total">—</b></div>
      <div class="stat c4"><small>Coins launched</small><b>0</b></div>
    </div>
    <div class="tbl-wrap" style="margin-top:20px"><table class="tbl"><thead><tr><th>Coin</th><th>Towed by</th><th class="r">Held</th><th class="r">Value</th></tr></thead>
    <tbody><tr style="cursor:default"><td colspan="4" style="text-align:center;padding:26px" class="muted">You hold no coins yet. <a class="more" href="#/coins">Browse coins →</a></td></tr></tbody></table></div>
    <div class="sec" style="padding-top:26px"><div class="sec-head"><h2 style="font-size:28px">Launch drafts</h2></div>${store.get("drafts",[]).length?`<div class="coin-grid">${store.get("drafts",[]).map(draftCard).join("")}</div>`:`<p class="muted">No drafts yet. <a class="more" href="#/launch">Prep a launch →</a></p>`}</div>
  </div>${footer()}`;
}
function paintWallet(){
  const a=$("#w-act"); if(!a) return;
  a.innerHTML = state.wallet? `<div class="field98 ca-chip"><b>WALLET</b><span>${shortCA(state.wallet)}</span><button class="linkbtn" data-disconnect>Disconnect</button></div>` : `<button class="btn98 dark lg" data-connect>Connect wallet</button>`;
  $("#w-sol").textContent = state.wallet? (state.balance!=null? state.balance.toFixed(3):"—") : "—";
  $("#w-total").textContent = state.wallet&&state.balance!=null&&state.sol? fmtUsd(state.balance*state.sol) : "—";
}

function pageNotFound(){
  return `<div class="page page-in"><div class="empty" style="margin-top:30px"><img src="barricade.png" alt=""><h3>Road closed</h3><p>That page is under construction or doesn't exist.</p><a class="btn98 primary" href="#/">Detour home</a></div></div>${footer()}`;
}

function footer(){
  return `<footer class="foot"><div class="in">
    <div><div class="brandline"><img src="barricade.png" alt="">Towbar <span class="mono" style="color:var(--orange);font-size:20px">${CONFIG.TICKER}</span></div><p style="font-size:13.5px;line-height:1.6;color:#4a463d;max-width:330px">A launchpad on Solana where every coin is towed by an asset from another chain. Coins deploy on pump.fun.</p><p class="mono" style="font-size:16px;margin:0">CA: ${CONFIG.CA?esc(CONFIG.CA):"posted on X "+CONFIG.X_HANDLE+" at launch"}</p></div>
    <div><h4>TOWBAR</h4><a href="#/tows">Tows</a><a href="#/coins">Coins</a><a href="#/launch">Launch</a><a href="#/wallet">Wallet</a></div>
    <div><h4>DOCS</h4><a href="#/docs" data-doc-go="overview">Overview</a><a href="#/docs" data-doc-go="prices">Prices</a><a href="#/docs" data-doc-go="fees">Fees</a><a href="#/docs" data-doc-go="risks">Risks</a></div>
    <div><h4>MORE</h4><a href="${CONFIG.X_URL}" target="_blank" rel="noopener">X · ${CONFIG.X_HANDLE}</a><a data-open="notepad">Site Notes</a><a data-boot>Replay intro</a><a data-reset>Reset local data</a></div>
  </div><div class="disc">Towbar never asks for a private key or a seed phrase. Asset and chain names appear only to say what a coin would be towed by; Towbar is not affiliated with any of them, or with pump.fun. Prices come from public market data and can lag. Coins are volatile, can lose all their value and may be hard to sell. Nothing here is financial advice.</div></footer>`;
}

/* ---------------- TOOLBOX WIDGETS ---------------- */
function calcHTML(prefix, sym){
  const opts=TOWS.filter(t=>t.cg).map(t=>`<option ${t.sym===sym?"selected":""}>${t.sym}</option>`).join("");
  return `<div class="calc-row"><div><label class="lb">Tow</label><select class="field98" style="width:100%" id="${prefix}-tow">${opts}</select></div><div><label class="lb">Your coin's mcap today (USD)</label><input class="field98 mono" style="width:100%" id="${prefix}-mc" type="number" min="0" value="25000"></div></div>
  <label class="lb">Tow moves: <span class="mono" id="${prefix}-tv">+20%</span></label><input class="range" type="range" id="${prefix}-t" min="-80" max="300" value="20">
  <label class="lb" style="margin-top:6px">Your curve moves (in tow terms): <span class="mono" id="${prefix}-cv">+0%</span></label><input class="range" type="range" id="${prefix}-c" min="-90" max="500" value="0">
  <div class="out" id="${prefix}-out" style="margin-top:10px"></div>`;
}
function bindCalc(prefix){
  const g=id=>$("#"+prefix+"-"+id); if(!g("out")) return;
  const run=()=>{
    const tp=+g("t").value, cp=+g("c").value, mc=+g("mc").value||0, t=towOf(g("tow").value), p=towPrice(t);
    g("tv").textContent=(tp>=0?"+":"")+tp+"%"; g("cv").textContent=(cp>=0?"+":"")+cp+"%";
    const mult=(1+tp/100)*(1+cp/100), nmc=mc*mult, pct=(mult-1)*100;
    g("out").innerHTML=`<span class="w">${t.sym} now</span> ${p!=null?fmtUsd(p):"—"} → <span class="y">${p!=null?fmtUsd(p*(1+tp/100)):"—"}</span><br><span class="w">Coin mcap</span> ${fmtBig(mc)} → <span class="y">${fmtBig(nmc)}</span><br><span class="w">Net move</span> <span class="${pct>=0?"":"r"}">${fmtPct(pct)}</span> <span class="w" style="opacity:.6">= (1${tp>=0?"+":""}${tp}%)×(1${cp>=0?"+":""}${cp}%)</span>`;
  };
  ["t","c","mc","tow"].forEach(k=>g(k).addEventListener("input",run)); run();
}
function renderCalc(sym){ $("#calcbody").innerHTML = calcHTML("cw", sym||"ETH")+`<p class="small-note">A towed coin's USD move is the tow's move times its own curve move. Math only; not a prediction.</p>`; bindCalc("cw"); }

function bindCurveGauge(){
  const box=$("#curve-gauge"); if(!box) return;
  box.innerHTML=`<label class="lb">SOL deposited into the curve: <span class="mono" id="cg-v">0</span> / ~${CONFIG.GRAD_SOL_RAISED} SOL</label><input class="range" type="range" id="cg-r" min="0" max="${CONFIG.GRAD_SOL_RAISED}" step="0.5" value="0">
  <div class="gauge"><i id="cg-bar"></i><span id="cg-pct">0%</span></div><div class="out" id="cg-out"></div><p class="small-note">Pure curve math from pump.fun's starting reserves (30 SOL / 1.073B virtual, 793.1M for sale). Not market data.</p>`;
  const run=()=>{ const s=+$("#cg-r").value, st=CURVE.at(s); $("#cg-v").textContent=s.toFixed(1); $("#cg-bar").style.width=st.pct+"%"; $("#cg-pct").textContent=st.pct>=99.95?"BONDED → PumpSwap":st.pct.toFixed(1)+"% bonded";
    $("#cg-out").innerHTML=`<span class="w">Tokens sold</span> ${(st.sold/1e6).toFixed(1)}M / 793.1M<br><span class="w">Market cap</span> <span class="y">${st.mcapSol.toFixed(1)} SOL</span>${state.sol?` <span class="w" style="opacity:.6">≈ ${fmtBig(st.mcapSol*state.sol)}</span>`:""}<br><span class="w">Price</span> ${(st.price*1e3).toFixed(6)} SOL per 1K tokens`; };
  $("#cg-r").addEventListener("input",run); run();
}
function bindMedianLab(){
  const box=$("#median-lab"); if(!box) return;
  const ex=[100.2,100.0,103.1,100.4,99.9,100.3,96.8,100.1,100.2];
  box.innerHTML=`<p class="small-note" style="margin:0 0 10px">Example quotes from 9 venues — edit any box and watch the 2% rule work.</p><div class="venues">${ex.map((v,i)=>`<label class="venue"><span>V${i+1}</span><input type="number" step="0.1" value="${v}" data-v="${i}"></label>`).join("")}</div><div class="out" id="ml-out"></div><div style="margin-top:8px;display:flex;gap:6px"><button class="btn98" id="ml-reset">Reset example</button><button class="btn98" id="ml-spike">Spike a venue</button></div>`;
  const run=()=>{
    const ins=$$("input[data-v]",box), vals=ins.map(i=>parseFloat(i.value)).map(v=>isNaN(v)?null:v);
    const ok=vals.filter(v=>v!=null).sort((a,b)=>a-b); if(!ok.length){ $("#ml-out").textContent="Enter some quotes."; return; }
    const med=a=>a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;
    const m0=med(ok); const kept=[], dropped=[];
    vals.forEach((v,i)=>{ const drop = v==null || Math.abs(v-m0)/m0>0.02; ins[i].parentElement.classList.toggle("drop",drop); (drop?dropped:kept).push(v); });
    const k=kept.filter(v=>v!=null).sort((a,b)=>a-b); const m1=k.length?med(k):m0;
    $("#ml-out").innerHTML=`<span class="w">Raw median</span> ${m0.toFixed(3)}<br><span class="w">Dropped</span> <span class="r">${dropped.filter(v=>v!=null).map(v=>v.toFixed(1)).join(", ")||"none"}</span><br><span class="w">Tow price</span> <span class="y">${m1.toFixed(3)}</span>`;
  };
  box.addEventListener("input",run);
  $("#ml-reset").onclick=()=>{ $$("input[data-v]",box).forEach((i,n)=>i.value=ex[n]); run(); };
  $("#ml-spike").onclick=()=>{ const ins=$$("input[data-v]",box); const i=ins[Math.floor(Math.random()*ins.length)]; i.value=(parseFloat(i.value)*(Math.random()>.5?1.06:0.94)).toFixed(1); run(); };
  run();
}

/* ---------------- WALLET (Phantom etc.) ---------------- */
function provider(){ return (window.phantom&&window.phantom.solana) || window.solflare || window.backpack || (window.solana&&window.solana.isPhantom?window.solana:null) || window.solana || null; }
async function connect(){
  const p=provider();
  if(!p){
    dialog({title:"No wallet found",icon:"wallet",html:`<p style="margin-top:0">Towbar couldn't find a Solana wallet in this browser.</p><p>Install <b>Phantom</b>, <b>Solflare</b> or <b>Backpack</b>, then refresh this page.</p>`,buttons:[{label:"Get Phantom",cls:"primary",onClick:()=>window.open("https://phantom.app/","_blank","noopener")},{label:"Close"}]});
    return;
  }
  try{
    const r=await p.connect(); const pk=(r&&r.publicKey)||p.publicKey; state.wallet=pk.toString();
    toast("Wallet connected: "+shortCA(state.wallet),"wallet"); paintConnect(); fetchBalance();
  }catch(e){ toast("Connection cancelled","cone"); }
}
async function disconnect(){ try{ const p=provider(); p&&p.disconnect&&await p.disconnect(); }catch(e){} state.wallet=null; state.balance=null; paintConnect(); }
async function fetchBalance(){
  if(!state.wallet) return;
  try{
    const r=await fetch("https://api.mainnet-beta.solana.com",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getBalance",params:[state.wallet]})});
    const j=await r.json(); if(j&&j.result) state.balance=j.result.value/1e9;
  }catch(e){}
  paintConnect();
}
function paintConnect(){
  const b=$("#connectbtn"); if(b) b.textContent= state.wallet? "● "+shortCA(state.wallet) : "Connect wallet";
  if(state.route==="wallet") paintWallet();
  if(state.route==="launch") paintLaunchPreview();
}

/* ---------------- ROUTER ---------------- */
function parseHash(){ const h=location.hash.replace(/^#\/?/,""); const [path,qs]=h.split("?"); return {path:path||"", q:new URLSearchParams(qs||"")}; }
function route(){
  const {path,q}=parseHash(); const parts=path.split("/").filter(Boolean); const base=parts[0]||"";
  state.route=base+(parts[1]?"/":"");
  const view=$("#view"); let html="", addr="HOME";
  if(base===""){ html=pageHome(); }
  else if(base==="tows" && parts[1]){ html=pageTow(parts[1]); addr="TOWS\\"+parts[1].toUpperCase(); state.route="tow"; }
  else if(base==="tows"){ html=pageTows(); addr="TOWS"; }
  else if(base==="coins"){ html=pageCoins(); addr="COINS"; }
  else if(base==="launch"){ const t=q.get("tow"); if(t&&towOf(t)) state.launch.tow=towOf(t).sym; html=pageLaunch(); addr="LAUNCH"; }
  else if(base==="docs"){ html=pageDocs(); addr="DOCS"; }
  else if(base==="wallet"){ html=pageWallet(); addr="WALLET"; }
  else { html=pageNotFound(); addr="404"; }
  if(state.route.endsWith("/")) state.route=state.route.slice(0,-1);
  view.innerHTML=html; view.scrollTop=0;
  $("#addr").textContent="C:\\TOWBAR\\"+addr; $("#wintitle").textContent="Towbar — C:\\TOWBAR\\"+addr;
  const nav=NAV.find(n=>n.k===base)||NAV[0]; $("#addr-ico").innerHTML=ICON[nav.ico];
  document.title = (base?nav.label+" · ":"")+"Towbar "+CONFIG.TICKER;
  $$(".tb[data-k]").forEach(b=>b.classList.toggle("on", b.dataset.k===base));
  $("#status").textContent = {"" :"Ready — welcome to the tow yard", tows:"Browsing tows", coins:"Browsing coins", launch:"Work order open", docs:"Reading the site manual", wallet:"Hard hat locker"}[base] || "Ready";
  afterRender(base);
  paintPrices(); renderTasks();
}
function afterRender(base){
  if(base===""){
    bindRoutePicker("ETH");
    $("#calc-inline").innerHTML=calcHTML("ci","ETH"); bindCalc("ci");
    bindMedianLab();
    bindCurveGauge();
    tickCam();
  }
  if(base==="tows"){ const s=$("#towsearch"); if(s){ s.addEventListener("input",paintTowTable); $$("th[data-sort]").forEach(th=>th.onclick=()=>{ const k=th.dataset.sort; state.sort = state.sort.key===k? {key:k,dir:-state.sort.dir} : {key:k,dir:k==="sym"||k==="chain"?1:-1}; paintTowTable(); }); paintTowTable(); } }
  if(base==="launch") bindLaunch();
  if(base==="docs") bindDocs();
  if(base==="wallet") paintWallet();
}
function bindRoutePicker(sym){
  const set=s=>{ const t=towOf(s), c=chainOf(t.chain); $("#route-mid").innerHTML=`${cdot(t)}<b>${t.sym}</b><small><span data-p="${t.sym}">${towPrice(t)!=null?fmtUsd(towPrice(t)):"—"}</span> · ${c.name}</small>`; $("#route-in").textContent="Priced in "+t.sym; $$("[data-route]").forEach(b=>b.classList.toggle("on",b.dataset.route===s)); };
  $$("[data-route]").forEach(b=>b.onclick=()=>{ set(b.dataset.route); clearInterval(routeTimer); });
  set(sym); clearInterval(routeTimer);
  const seq=$$("[data-route]").map(b=>b.dataset.route); let i=0;
  routeTimer=setInterval(()=>{ if(!$("#route-mid")){clearInterval(routeTimer);return;} i=(i+1)%seq.length; set(seq[i]); },3500);
}
let routeTimer=null;
function tickCam(){ const el=$("#camts"); if(el) el.textContent=new Date().toISOString().replace("T"," ").slice(0,19); }

function bindLaunch(){
  const L=state.launch;
  const bindIn=(id,key,tr)=>{ const el=$("#"+id); el.addEventListener("input",()=>{ let v=el.value; if(tr) { v=tr(v); if(v!==el.value) el.value=v; } L[key]=v; store.set("launchForm",{...L,img:L.img&&L.img.length<200000?L.img:""}); paintLaunchPreview(); }); };
  bindIn("f-name","name"); bindIn("f-ticker","ticker",v=>v.toUpperCase().replace(/[^A-Z0-9]/g,"")); bindIn("f-desc","desc"); bindIn("f-x","x"); bindIn("f-tg","tg"); bindIn("f-web","web"); bindIn("f-buy","buy");
  $("#f-ack").onchange=e=>{ L.ack=e.target.checked; paintLaunchPreview(); };
  $("#towpick").onclick=pickTow;
  const dz=$("#dropzone"), fi=$("#filein");
  dz.onclick=()=>fi.click(); dz.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); fi.click(); } };
  fi.onchange=()=>{ if(fi.files[0]) readImg(fi.files[0]); fi.value=""; };
  dz.ondragover=e=>{e.preventDefault(); dz.style.borderColor="var(--orange)";};
  dz.ondragleave=()=>dz.style.borderColor="";
  dz.ondrop=e=>{ e.preventDefault(); dz.style.borderColor=""; const f=e.dataTransfer.files[0]; if(f) readImg(f); };
  $("#launchbtn").onclick=submitLaunch;
  paintLaunchPreview();
}
function readImg(f){
  if(!/^image\//.test(f.type)){ toast("That's not an image file","cone"); return; }
  const r=new FileReader(); r.onload=()=>{ const img=new Image(); img.onload=()=>{ const c=document.createElement("canvas"); c.width=c.height=160; const x=c.getContext("2d"); const s=Math.min(img.width,img.height); x.drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,160,160); state.launch.img=c.toDataURL("image/png"); $("#thumb").innerHTML=`<img src="${state.launch.img}" alt="">`; store.set("launchForm",state.launch); paintLaunchPreview(); }; img.src=r.result; }; r.readAsDataURL(f);
}
function pickTow(){
  const d=dialog({title:"Pick a tow",icon:"",wide:true,html:`<input class="field98" id="tp-q" placeholder="Search ${TOWS.length} assets…" style="width:100%;margin-bottom:8px"><div class="modal-list" id="tp-list"></div>`,buttons:[{label:"Cancel"}]});
  const draw=()=>{ const q=$("#tp-q").value.trim().toLowerCase(); $("#tp-list").innerHTML=TOWS.filter(t=>!q||t.sym.toLowerCase().includes(q)||chainOf(t.chain).name.toLowerCase().includes(q)).map(t=>`<button data-pick="${t.sym}">${cdot(t)}<span><b>${t.sym}</b><small class="muted">${chainOf(t.chain).name}</small></span><span class="p">${towPrice(t)!=null?fmtUsd(towPrice(t)):(t.cg?"—":SOON)}</span></button>`).join(""); $$("[data-pick]").forEach(b=>b.onclick=()=>{ state.launch.tow=b.dataset.pick; d.close(); paintLaunchPreview(); }); };
  $("#tp-q").addEventListener("input",draw); draw(); setTimeout(()=>$("#tp-q").focus(),20);
}
function submitLaunch(){
  const checks=launchChecks(), missing=checks.filter(c=>!c[1]&&c[0]!=="Wallet connected"&&c[0]!=="Image added");
  if(missing.length){ dialog({title:"Inspection failed",icon:"cone",html:`<p style="margin-top:0"><b>Site inspection flagged:</b></p><ul style="margin:0;padding-left:18px">${missing.map(m=>`<li>${m[0]}</li>`).join("")}</ul>`}); return; }
  if(!state.wallet){ dialog({title:"Connect a wallet",icon:"wallet",html:`<p style="margin-top:0">Connect a Solana wallet to launch. Towbar never asks for your seed phrase.</p>`,buttons:[{label:"Connect wallet",cls:"primary",onClick:connect},{label:"Cancel"}]}); return; }
  const L=state.launch, drafts=store.get("drafts",[]);
  const d={name:L.name.trim(),ticker:L.ticker,desc:L.desc,tow:L.tow,img:L.img,x:L.x,tg:L.tg,web:L.web,buy:+L.buy||0,ts:Date.now()};
  drafts.unshift(d); store.set("drafts",drafts.slice(0,24));
  dialog({title:"Work order saved",icon:"hat",html:`<p style="margin-top:0"><b>${esc(d.name)} ($${esc(d.ticker)})</b> towed by <b>${esc(d.tow)}</b> is saved as a pump.fun launch draft on this device${d.buy?` (creator first buy: ${d.buy} SOL)`:""}.</p><p>Towbar launches open when ${CONFIG.TICKER} goes live. Nothing was signed and no SOL was spent. Watch ${CONFIG.X_HANDLE} on X for the go-live announcement.</p>`,buttons:[{label:"View drafts",cls:"primary",onClick:()=>location.hash="#/coins"},{label:"Follow on X",onClick:()=>openX()},{label:"Close"}]});
}
function bindDocs(){
  const links=$$("[data-doc]"), view=$("#view");
  links.forEach(a=>a.onclick=()=>{ const s=$("#doc-"+a.dataset.doc); s&&s.scrollIntoView({behavior:"smooth",block:"start"}); });
  const onScroll=()=>{ let cur="overview"; $$(".docs article section").forEach(s=>{ if(s.getBoundingClientRect().top - view.getBoundingClientRect().top < 120) cur=s.id.replace("doc-",""); }); links.forEach(a=>a.classList.toggle("on",a.dataset.doc===cur)); };
  view.onscroll = onScroll;
  const pend=sstore.get("docgo"); if(pend){ sstore.set("docgo",""); setTimeout(()=>{ const s=$("#doc-"+pend); s&&s.scrollIntoView({block:"start"}); },30); }
}
function openX(){ const a=document.createElement("a"); a.href=CONFIG.X_URL; a.target="_blank"; a.rel="noopener"; document.body.appendChild(a); a.click(); a.remove(); }

/* ---------------- GLOBAL EVENTS ---------------- */
document.addEventListener("click",e=>{
  const t=e.target.closest("[data-go],[data-goto],[data-open],[data-close],[data-x],[data-copyca],[data-refresh],[data-sm],[data-task],[data-recycle],[data-boot],[data-reset],[data-connect],[data-disconnect],[data-ctab],[data-doc-go],[data-scroll],#connectbtn,#startbtn,.ctl[data-act]");
  if(!$("#startmenu").contains(e.target) && !e.target.closest("#startbtn")) closeStart();
  if(!t) return;
  if(t.id==="startbtn"){ toggleStart(); return; }
  if(t.id==="connectbtn"||t.dataset.connect!==undefined){ state.wallet? walletMenu() : connect(); return; }
  if(t.dataset.disconnect!==undefined){ disconnect(); return; }
  if(t.dataset.go){ location.hash=t.dataset.go; focusWin("main"); return; }
  if(t.dataset.goto){ location.hash=t.dataset.goto; return; }
  if(t.dataset.open){ openWin(t.dataset.open); if(t.dataset.calc){ renderCalc(t.dataset.calc); } return; }
  if(t.dataset.close){ closeWin(t.dataset.close); return; }
  if(t.dataset.x!==undefined){ openX(); return; }
  if(t.dataset.copyca!==undefined){ CONFIG.CA? copy(CONFIG.CA) : openX(); return; }
  if(t.dataset.refresh!==undefined){ toast("Refreshing price feed…","refresh"); loadPrices(); return; }
  if(t.dataset.task){ const id=t.dataset.task; if(id==="main"){ $("#main").style.display=""; } focusWin(id); return; }
  if(t.dataset.recycle!==undefined){ dialog({title:"Recycle Bin",icon:"recycle",html:`<p style="margin-top:0">The Recycle Bin is empty.</p><p class="muted">Rug pulls go straight to the landfill. We don't keep those here.</p>`}); return; }
  if(t.dataset.boot!==undefined){ boot(true); return; }
  if(t.dataset.reset!==undefined){ resetLocal(); return; }
  if(t.dataset.ctab){ state.coinTab=t.dataset.ctab; $$("[data-ctab]").forEach(b=>b.classList.toggle("pressed",b===t)); return; }
  if(t.dataset.docGo){ sstore.set("docgo",t.dataset.docGo); if(state.route==="docs"){ e.preventDefault(); const s=$("#doc-"+t.dataset.docGo); s&&s.scrollIntoView({behavior:"smooth"}); sstore.set("docgo",""); } return; }
  if(t.dataset.scroll){ const id=t.dataset.scroll; setTimeout(()=>{ const s=$("#"+id); s&&s.scrollIntoView({behavior:"smooth",block:"center"}); },80); return; }
  if(t.dataset.sm){ closeStart(); const a=t.dataset.sm;
    if(a.startsWith("#")) location.hash=a;
    else if(a.startsWith("open:")) openWin(a.slice(5));
    else if(a==="x") openX();
    else if(a==="boot") boot(true);
    else if(a==="reset") resetLocal();
    else if(a==="shutdown") dialog({title:"Shut Down Towbar",icon:"hat",html:`<p style="margin-top:0">It's now safe to keep building.</p><p class="muted">Towbar never shuts down — the tow yard runs 24/7 on Solana.</p>`,buttons:[{label:"Back to work",cls:"primary"}]});
    return; }
  if(t.matches(".ctl[data-act]")){ const a=t.dataset.act, m=$("#main");
    if(a==="max") m.classList.toggle("max");
    if(a==="min"){ m.style.display="none"; toast("Towbar minimized — click it in the taskbar","cone"); }
    if(a==="close") dialog({title:"Close Towbar?",icon:"cone",html:`<p style="margin-top:0">Are you sure you want to leave the job site?</p>`,buttons:[{label:"Stay on site",cls:"primary"},{label:"Leave",onClick:()=>{ m.style.display="none"; toast("Window closed — reopen it from the taskbar or desktop","cone"); }}]});
    renderTasks(); return; }
});
document.addEventListener("click",e=>{ const tk=e.target.closest("[data-task]"); if(tk&&tk.dataset.task==="main") $("#main").style.display=""; },true);
document.addEventListener("dblclick",e=>{ if(e.target.closest("#main-title")) $("#main").classList.toggle("max"); });
function walletMenu(){ dialog({title:"Wallet",icon:"wallet",html:`<p style="margin-top:0">Connected as <span class="mono">${esc(state.wallet)}</span></p>`,buttons:[{label:"Open Wallet",cls:"primary",onClick:()=>location.hash="#/wallet"},{label:"Disconnect",onClick:disconnect},{label:"Close"}]}); }
function resetLocal(){ dialog({title:"Reset local data",icon:"recycle",html:`<p style="margin-top:0">Clear launch drafts, the saved launch form and Site Notes on this device?</p>`,buttons:[{label:"Reset",cls:"primary",onClick:()=>{ ["drafts","launchForm","notes"].forEach(store.del); state.launch={tow:"ETH",name:"",ticker:"",desc:"",img:"",x:"",tg:"",web:"",buy:"",ack:false}; $("#np-text").value=""; route(); toast("Local data cleared","recycle"); }},{label:"Cancel"}]}); }
function toggleStart(){ const m=$("#startmenu"), b=$("#startbtn"); const o=!m.classList.contains("open"); m.classList.toggle("open",o); b.classList.toggle("pressed",o); if(o) setTimeout(()=>{ const f=m.querySelector("button"); f&&f.focus(); },10); }
function closeStart(){ $("#startmenu").classList.remove("open"); $("#startbtn").classList.remove("pressed"); }
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){ closeStart(); $("#dlg-wrap").classList.remove("open"); }
  if((e.key==="Meta"||e.key==="OS")&&!e.repeat){ /* windows key */ }
});
$("#chainsel").addEventListener("change",e=>{ state.chain=e.target.value; if(state.route===""||state.route==="tows") route(); toast(e.target.value==="all"?"Showing all chains":"Filtered to "+chainOf(e.target.value).name,"tows"); });

/* notepad */
const np=$("#np-text"); np.value=store.get("notes","Notes:\n- Hard hat on\n- Pick a tow\n- Launch a coin\n"); np.addEventListener("input",()=>store.set("notes",np.value));
$("#np-clear").onclick=()=>{ np.value=""; store.set("notes",""); };

/* clock */
function clock(){ $("#clock").textContent=new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}); tickCam(); }

/* ---------------- INIT ---------------- */
chrome(); skyline();
$$(".float").forEach(makeDraggable);
const saved=store.get("launchForm",null); if(saved) state.launch={...state.launch,...saved};
boot(false);
window.addEventListener("hashchange",route);
route(); clock(); setInterval(clock,1000);
loadPrices(); setInterval(loadPrices, CONFIG.PRICE_REFRESH_MS);
const p=provider(); if(p&&p.on){ try{ p.on("accountChanged",pk=>{ state.wallet=pk?pk.toString():null; paintConnect(); }); }catch(e){} }
if(p&&p.isConnected&&p.publicKey){ state.wallet=p.publicKey.toString(); paintConnect(); fetchBalance(); }
// try silent reconnect for trusted sites
if(p&&p.connect){ p.connect({onlyIfTrusted:true}).then(r=>{ const pk=(r&&r.publicKey)||p.publicKey; if(pk){ state.wallet=pk.toString(); paintConnect(); fetchBalance(); } }).catch(()=>{}); }
})();
