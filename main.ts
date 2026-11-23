// SPDX-License-Identifier: MIT
// Token Horizon — original local data transformer for make.fun token-radar-01.
// Node 22.18+ required by the contest; uses Node standard library only.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const home = fileURLToPath(new URL('.', import.meta.url));
const flag = (name, fallback) => { const i=process.argv.indexOf('--'+name); return i>=0?process.argv[i+1]:(process.argv.find(x=>x.startsWith('--'+name+'='))?.split('=').slice(1).join('=')??fallback); };
const input = flag('input', '/input/snapshot.json');
const source = input.endsWith('.json') ? input : join(input, 'snapshot.json');
const outdir = flag('output', process.env.MAKEFUN_OUTPUT_DIR || '/output');
const safeNum = x => Number.isFinite(x) ? x : 0;
const median = nums => { if(!nums.length) return null; const s=[...nums].sort((a,b)=>a-b); const i=s.length>>1; return s.length%2?s[i]:(s[i-1]+s[i])/2; };
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const round = (x,d=3)=>Math.round(x*(10**d))/(10**d);
const tokenless=p=>p.mcap_usd==null && p.gecko_id==null && p.symbol==null;
const poolProduct=p=> /(?:\b(?:wrapped|liquid staking|staked|restaked|receipt token|synthetic token)\b)/i.test(p.category||'') || /\s(?:v\d+(?:\.\d+)?|\d+\.\d+)$/i.test(p.name);
const dayAge=(asof,listed)=>{const a=Date.parse(asof), b=Date.parse(listed);return Number.isFinite(a)&&Number.isFinite(b)?Math.max(0,Math.round((a-b)/86400000)):null;};
const guessGas=chain=>({Ethereum:8,Solana:0.1,Base:0.2,Arbitrum:0.3,Optimism:0.2,Polygon:0.1,BSC:0.2,Avalanche:0.3})[chain]||1.5;
function actionFor(p){
 const c=(p.category||'').toLowerCase(),chain=p.chains[0]||'supported network';
 if(/lend|borrow|collateral|cdp/.test(c)) return `Confirm the official lending app supports ${chain}; consider a small collateral deposit only after reviewing liquidation and smart-contract risks.`;
 if(/dex|exchange|swap/.test(c)) return `Check the official exchange's supported ${chain} pair; test a small swap only if transaction fees and slippage are acceptable.`;
 if(/bridge|cross.chain/.test(c)) return `Check the official bridge's route on ${chain}; verify the destination and assess bridge and finality risk before transferring.`;
 if(/staking|restak/.test(c)) return `Inspect the official staking terms on ${chain}; verify lockups and withdrawal delays before considering a small stake.`;
 if(/perp|derivative|options/.test(c)) return `Review the official trading interface on ${chain} without opening leverage; avoid positions merely to chase a speculative token.`;
 if(/yield|vault|aggregator|farm/.test(c)) return `Inspect the official vault documentation on ${chain}; check asset exposure and withdrawal terms before depositing anything.`;
 if(/prediction/.test(c)) return `Review the protocol documentation and regional eligibility; do not place a position just to pursue an unconfirmed reward.`;
 if(/payments|card/.test(c)) return `Check whether the official app supports a no-fee sandbox or test transaction on ${chain} before committing real funds.`;
 return `Explore ${p.name}'s official application on ${chain} and look for documented, low-cost participation paths before any on-chain transaction.`;
}
function farmPlan(p, value, conf, age){
 const chain=p.chains[0]||'supported network', gas=guessGas(chain);
 const capital=conf<0.40?0:Math.min(100,Math.max(10,round(Math.sqrt(Math.max(0,p.tvl_usd))/100)));
 return [
  `VERIFY · Find ${p.name}'s official website through independent channels and confirm that the app is active on ${chain}. Cost: $0. Time: 5–10 min.`,
  `ELIGIBILITY · Read official token, rewards, terms and geofencing notices. No token or airdrop is promised by this radar. Cost: $0. Time: 10 min.`,
  `SAFETY · Use a dedicated wallet with a small spending limit; verify contract addresses and never disclose a recovery phrase. Cost: $0 plus optional network fee. Time: 10 min.`,
  `PARTICIPATION · ${actionFor(p)} Cost: optional up to $${capital} at risk, or $0 if researching only. Time: 15–30 min.`,
  `FEE CHECK · Budget approximately $${round(gas*2,2)} for two transactions on ${chain} as a rough planning placeholder; verify live gas before acting. Time: 2 min.`,
  `TRACK · Record dates, transaction IDs and any points in your own log. Check official updates weekly; avoid artificial wash activity. Cost: $0. Time: 5 min/week.`,
  `EXIT · Recheck smart-contract, market and withdrawal risks after 30 days${age!==null?` (protocol age ~${age} days)`:''}; withdraw unused funds if risk exceeds the expected benefit. Cost: network fees. Time: 10 min.`,
  `CLAIM · Only follow official announcements and claim pages; do not connect a wallet to unsolicited airdrop links. Estimated scenario value $${Math.round(value).toLocaleString('en-US')} is NOT an expected payout. Cost: unknown. Time: variable.`
 ];
}
function makeBoard(snapshot){
 if(!Array.isArray(snapshot.protocols)||!Array.isArray(snapshot.watchlist)) throw Error('Malformed snapshot: protocols/watchlist missing');
 const asOf=snapshot.as_of||'2026-11-23', floor=safeNum(snapshot.floor_usd)||1e7;
 const protocols=snapshot.protocols.filter(p=>p && typeof p.slug==='string' && p.slug && typeof p.name==='string');
 const live=protocols.filter(p=>!tokenless(p) && safeNum(p.tvl_usd)>0 && safeNum(p.mcap_usd)>0);
 const allComp=[],catComp=new Map();
 for(const p of live){const ratio=safeNum(p.mcap_usd)/safeNum(p.tvl_usd); if(!Number.isFinite(ratio)||ratio<=0||ratio>50) continue; allComp.push(ratio);const c=p.category||'Other';if(!catComp.has(c))catComp.set(c,[]);catComp.get(c).push(ratio);}
 const global=clamp(median(allComp)??0.38,0.06,4.5);
 const bySlug=new Map(protocols.map(p=>[p.slug,p]));
 const watch=new Set(snapshot.watchlist), chosen=new Map();
 for(const s of snapshot.watchlist){const p=bySlug.get(s);if(p)chosen.set(p.slug,p);}
 for(const p of protocols){if(chosen.has(p.slug)||!tokenless(p)||poolProduct(p)||p.category==='CEX'||safeNum(p.tvl_usd)<=0)continue;
   // Explore smaller early-stage projects as well, not only the fixed watchlist.
   if(p.tvl_usd<floor)chosen.set(p.slug,p);
 }
 const rows=[...chosen.values()].map(p=>{
  const peers=catComp.get(p.category||'Other')||[];
  const category=clamp(median(peers)??global,0.06,4.5);
  // Bayesian shrinkage reduces the effect of noisy small cohorts.
  const w=peers.length/(peers.length+6), multiple=w*category+(1-w)*global;
  const growth=clamp(safeNum(p.change_7d),-75,150);
  const trend=clamp(1+0.32*Math.tanh(growth/45),0.76,1.32);
  const age=dayAge(asOf,p.listed_at);
  const maturity=clamp(0.79+0.21*(Math.min(age??365,1460)/1460),0.79,1);
  const implied=Math.max(1,Math.round(safeNum(p.tvl_usd)*multiple*trend*maturity));
  const confidence=round(clamp(0.25+Math.min(peers.length/20,0.28)+Math.min(Math.log10(Math.max(1,p.tvl_usd))/30,0.28)+(age!==null?0.12:0)-(p.chains.length?0:0.08),0.12,0.88));
  const low=Math.round(implied*(0.35+0.38*confidence)), high=Math.round(implied*(2.2-0.7*confidence));
  return {slug:p.slug,name:p.name,category:p.category||'Other',chains:p.chains||[],tvl_usd:safeNum(p.tvl_usd),change_7d:p.change_7d??null,age_days:age,listed_at:p.listed_at??null,mcap_usd:null,gecko_id:null,symbol:null,token_status:'pre-token',origin:watch.has(p.slug)?'watchlist':'early',implied_value_usd:implied,value_low_usd:low,value_high_usd:high,confidence,model:{category_multiple:round(category),global_multiple:round(global),shrinkage_weight:round(w),peer_count:peers.length,growth_factor:round(trend),age_factor:round(maturity)},farm_steps:farmPlan(p,implied,confidence,age)};
 });
 rows.sort((a,b)=>b.implied_value_usd-a.implied_value_usd || a.slug.localeCompare(b.slug,'en'));rows.forEach((x,i)=>x.rank=i+1);
 const stats={total:rows.length,watchlist:snapshot.watchlist.length,watchlist_covered:rows.filter(x=>x.origin==='watchlist').length,early:rows.filter(x=>x.origin==='early').length,median_multiple:round(global),live_comp_count:live.length,as_of:asOf,source:snapshot.source||'sealed snapshot'};
 return {rows,stats,live:live.sort((a,b)=>safeNum(b.mcap_usd)-safeNum(a.mcap_usd)).slice(0,18).map(p=>({name:p.name,category:p.category,tvl_usd:p.tvl_usd,mcap_usd:p.mcap_usd}))};
}
function copyDirFlat(from,to){mkdirSync(to,{recursive:true});for(const f of readdirSync(from)){const s=join(from,f);if(statSync(s).isFile())copyFileSync(s,join(to,f));}}
if(!existsSync(source)){console.error(`Snapshot not found: ${source}. Supply --input path/to/snapshot.json`);process.exit(2)}
const snapshot=JSON.parse(readFileSync(source,'utf8'));
const result=makeBoard(snapshot);
if(result.rows.length<100)console.warn(`Warning: board has ${result.rows.length} rows (contest needs at least 100).`);
if(result.stats.watchlist_covered!==snapshot.watchlist.length)console.warn('Warning: some watchlist slugs missing from the input protocols.');
mkdirSync(outdir,{recursive:true});copyDirFlat(join(home,'dashboard'),join(outdir,'dashboard'));copyDirFlat(join(home,'screenshots'),join(outdir,'screenshots'));
writeFileSync(join(outdir,'board.json'),JSON.stringify({rows:result.rows},null,2)+'\n');
writeFileSync(join(outdir,'dashboard','data.js'),'window.TOKEN_HORIZON_DATA='+JSON.stringify(result)+';\n');
// The official vendor/makefun-board.ts MUST be installed from the competition kit.
// Do not substitute an invented dossier for the official verified dossier.
const vendorPath=join(home,'vendor','makefun-board.ts');
if(existsSync(vendorPath)){
 try {const {buildDossier}=await import('./vendor/makefun-board.ts');
  writeFileSync(join(outdir,'dossier.json'),buildDossier(outdir,{text_max_bytes:65536,screenshots:{max:4,max_bytes:524288},dashboard:{max_files:400,max_bytes:4194304}}));
  console.log('Official dossier written.');
 }catch(e){console.warn('Dossier not written:',e.message);}
}else console.warn('MISSING official vendor/makefun-board.ts: download the contest kit before submitting.');
console.log(JSON.stringify({outdir,stats:result.stats},null,2));
