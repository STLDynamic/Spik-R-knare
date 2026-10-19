import { forecast, today, dateAfter, validateArticle, parseBackup } from './model.js';
const $ = s => document.querySelector(s);
const key = 'spik.inventory.v1';
const number = (n, digits=0) => new Intl.NumberFormat('sv-SE', {maximumFractionDigits:digits}).format(n);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pretty = d => new Intl.DateTimeFormat('sv-SE', {day:'numeric',month:'short',year:'numeric'}).format(new Date(`${d}T12:00:00`));
const labels = {critical:'Risk för brist',order:'Dags att beställa',ok:'Lagret räcker',idle:'Ingen förbrukning'};
let articles = [], demo = false, draftDeliveries = [], storageBlocked = false;
try { const raw = localStorage.getItem(key); if (raw) { articles = parseBackup(raw); demo = JSON.parse(raw).demo === true; } } catch { storageBlocked = true; $('#storage-warning').hidden=false; $('#storage-warning').textContent='Sparade uppgifter kunde inte läsas. Kontrollera webbläsarens lagringsinställningar. Sparandet har blockerats för att skydda tidigare uppgifter.'; }
function persist(next, nextDemo=demo) {
  if (storageBlocked) { alert('Sparandet är blockerat efter ett läsfel. Säkra tidigare uppgifter innan du rensar webbplatsens lagring.'); return false; }
  try { localStorage.setItem(key, JSON.stringify({version:1, articles:next, demo:nextDemo})); articles=next; demo=nextDemo; render(); return true; } catch { alert('Uppgifterna kunde inte sparas. Ändringarna har inte sparats. Kontrollera webbläsarens lagringsutrymme.'); return false; }
}
function notify(message) { $('#toast').textContent=message; $('#toast').hidden=false; setTimeout(()=>$('#toast').hidden=true,3500); }
function render() {
  const forecasts = articles.map(a=>({a,f:forecast(a)}));
  $('#date').textContent=pretty(today());
  $('#demo-notice').hidden=!demo;
  const critical = forecasts.filter(({f})=>f.status==='critical').length;
  const due = forecasts.filter(({f})=>f.orderIn<=0).length;
  const total = articles.reduce((s,a)=>s+a.stock,0);
  $('#stats').innerHTML=[['AKTIVA ARTIKLAR',articles.length,'Spiksorter i ditt lager',''],['LAGERSALDO',`${number(total,1)} <small>kg</small>`,'Totalt för alla artiklar',''],['ATT BESTÄLLA',due,'Beställningsdatum har nåtts','amber'],['RISK FÖR BRIST',critical,'Lagret räcker inte under leveranstiden','red']].map(([title,value,sub,cls])=>`<div class="stat ${cls}"><div class="eyebrow">${title}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>`).join('');
  const selected = $('#group-filter').value;
  $('#group-filter').innerHTML='<option value="">Alla grupper</option>'+[...new Set(articles.map(a=>a.group).filter(Boolean))].sort().map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');
  $('#group-filter').value=selected;
  const query = $('#search').value.trim().toLocaleLowerCase('sv');
  const rows = forecasts.filter(({a,f})=>(!query || `${a.name} ${a.supplier} ${a.group}`.toLocaleLowerCase('sv').includes(query)) && (!$('#group-filter').value || a.group===$('#group-filter').value) && (!$('#status-filter').value || f.status===$('#status-filter').value));
  rows.sort((x,y)=>$('#sort').value==='name' ? x.a.name.localeCompare(y.a.name,'sv') : $('#sort').value==='stock' ? x.a.stock-y.a.stock : x.f.orderIn-y.f.orderIn || x.a.name.localeCompare(y.a.name));
  $('#count').textContent=articles.length;
  $('#rows').innerHTML=rows.map(({a,f})=>{
    const end = f.shortage===null ? '—' : f.shortage > 36500 ? '> 100 år' : pretty(dateAfter(today(),Math.floor(f.shortage)));
    const order = !Number.isFinite(f.orderIn) ? '—' : f.orderIn<=0 ? 'Beställ nu' : f.orderIn > 36500 ? '> 100 år' : pretty(dateAfter(today(),f.orderIn));
    return `<tr><td><button class="article-name" data-edit="${esc(a.id)}">${esc(a.name)}</button><span class="muted">${esc(a.group || 'Ingen grupp')} · ${esc(a.supplier || 'Ingen leverantör')}</span><span class="badge ${f.status}">${labels[f.status]}</span></td><td><strong>${number(a.stock,1)} <small>kg</small></strong><span class="muted">${number(a.stock/a.pack,2)} förp. × ${number(a.pack)} kg</span></td><td><strong>${number(f.daily*7,1)} <small>kg</small></strong><span class="muted">≈ ${number(f.daily*7*1000/a.weight)} st</span></td><td><strong>${end}</strong><span class="muted">${f.shortage===null?'Ange förbrukning':`om ${number(Math.floor(f.shortage))} dagar`}</span>${a.deliveries.length?`<span class="muted">${a.deliveries.length} planerade leveranser</span>`:''}${f.overdue.length?'<span class="warning-text">Kontrollera försenade leveranser</span>':''}</td><td><strong class="${f.orderIn<=0?'warning-text':''}">${order}</strong><span class="muted">Leveranstid ${a.lead} d + buffert ${a.buffer} d</span></td><td><strong>${number(f.orderKg)} <small>kg</small></strong><span class="muted">${f.cartons} hela förpackningar</span>${f.status==='critical'?'<span class="warning-text">Tidigarelägg leveransen</span>':''}</td><td><button data-edit="${esc(a.id)}" aria-label="Redigera ${esc(a.name)}">Redigera</button></td></tr>`;
  }).join('');
  $('#empty').hidden=articles.length>0;
  if (articles.length && !rows.length) $('#rows').innerHTML='<tr><td colspan="7" class="no-results">Inga artiklar matchar dina filter.</td></tr>';
}
const form=$('#article-form');
const field=name=>form.elements.namedItem(name);
function packCalc() { const n=Number(field('pack').value)*1000/Number(field('weight').value); $('#pack-calc').textContent=Number.isFinite(n)&&n>0?`≈ ${number(n)} spikar per förpackning`:'Ange spikvikt och förpackningsvikt.'; }
function deliveryRows() {
  $('#deliveries').innerHTML=draftDeliveries.map((d,i)=>`<div class="delivery"><label>Leveransdatum<input type="date" data-date="${i}" value="${esc(d.date)}" required></label><label>Mängd (kg)<input type="number" min="0.000001" step="any" data-kg="${i}" value="${d.kg}" required></label><button type="button" data-receive="${i}">Ta emot</button><button type="button" data-remove="${i}" aria-label="Ta bort leverans">×</button></div>`).join('');
}
function edit(id) {
  const a=articles.find(a=>a.id===id) || {id:'',name:'',group:'',supplier:'',weight:1.8,pack:800,stock:0,usage:0,unit:'kg',period:'week',lead:42,buffer:14,coverage:30,notes:'',deliveries:[]};
  form.reset(); for (const [name,value] of Object.entries(a)) if(name!=='deliveries') field(name).value=value;
  draftDeliveries=structuredClone(a.deliveries); deliveryRows(); packCalc();
  $('#editor-title').textContent=id?'Redigera artikel':'Ny artikel'; $('#delete').hidden=!id; $('#editor').showModal();
}
$('#add').onclick=()=>edit(); $('#close').onclick=()=>$('#editor').close();
$('#rows').onclick=e=>{const b=e.target.closest('[data-edit]');if(b)edit(b.dataset.edit);};
for (const id of ['search','group-filter','status-filter','sort']) $(`#${id}`).addEventListener('input',render);
for (const name of ['weight','pack']) field(name).addEventListener('input',packCalc);
$('#add-delivery').onclick=()=>{draftDeliveries.push({id:crypto.randomUUID(),date:dateAfter(today(),Number(field('lead').value)||0),kg:Number(field('pack').value)||800});deliveryRows();};
$('#deliveries').oninput=e=>{if(e.target.dataset.date!==undefined)draftDeliveries[Number(e.target.dataset.date)].date=e.target.value;if(e.target.dataset.kg!==undefined)draftDeliveries[Number(e.target.dataset.kg)].kg=Number(e.target.value);};
$('#deliveries').onclick=e=>{
  if(e.target.dataset.remove!==undefined) {draftDeliveries.splice(Number(e.target.dataset.remove),1);deliveryRows();}
  if(e.target.dataset.receive!==undefined) {const i=Number(e.target.dataset.receive),d=draftDeliveries[i]; if(!Number.isFinite(d.kg)||d.kg<=0)return; if(!confirm(`Lägg till ${number(d.kg)} kg i lagret? Bekräfta sedan genom att spara artikeln.`))return; field('stock').value=Number(field('stock').value)+d.kg;draftDeliveries.splice(i,1);deliveryRows();}
};
form.onsubmit=e=>{e.preventDefault();const a=Object.fromEntries(new FormData(form));for(const name of ['weight','pack','stock','usage','lead','buffer','coverage'])a[name]=Number(a[name]);a.id ||= crypto.randomUUID();a.deliveries=structuredClone(draftDeliveries);try {validateArticle(a);}catch(err){alert(err.message);return;}const next=articles.some(x=>x.id===a.id)?articles.map(x=>x.id===a.id?a:x):[...articles,a];if(persist(next)){ $('#editor').close();notify('Artikeln har sparats'); }};
$('#delete').onclick=()=>{if(confirm(`Ta bort artikeln ”${field('name').value}” och dess leveransplan?`)&&persist(articles.filter(a=>a.id!==field('id').value))){$('#editor').close();notify('Artikeln har tagits bort');}};
$('#export').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),articles,demo},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`spik-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#import').onclick=()=>$('#file').click();
$('#file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10_000_000)throw new Error('Filen är för stor (max 10 MB).');const raw=await file.text(),next=parseBackup(raw);if(confirm(`Importen ersätter alla nuvarande artiklar (${articles.length}) med kopians (${next.length}). Har du en säkerhetskopia och vill fortsätta?`)){if(persist(next,JSON.parse(raw).demo===true))notify('Säkerhetskopian har importerats');}}catch(err){alert(`Importen misslyckades: ${err.message}`);}finally{e.target.value='';}};
$('#demo').onclick=()=>{const base={weight:1.8,pack:800,unit:'kg',period:'week',lead:42,buffer:14,coverage:30,notes:'Exempelartikel — ersätt med verkliga uppgifter.',deliveries:[]};persist([{...base,id:crypto.randomUUID(),name:'2,5 × 45 Slätt',group:'Slät spik',supplier:'Leverantör A',stock:900,usage:210},{...base,id:crypto.randomUUID(),name:'2,8 × 75 Ring',group:'Ringspik',supplier:'Leverantör B',weight:3.2,stock:2400,usage:280},{...base,id:crypto.randomUUID(),name:'3,1 × 90 Ring',group:'Ringspik',supplier:'Leverantör B',weight:4.5,stock:4000,usage:180}],true);};
$('#clear-demo').onclick=()=>{if(confirm('Ta bort alla demouppgifter, inklusive dina ändringar? Exportera först de uppgifter du vill behålla.'))persist([],false);};
window.addEventListener('storage',e=>{if(e.key===key){location.reload();}});
render();
