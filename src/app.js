import { forecast, inventory, usageHistory, addMovement, voidMovement, today, dateAfter, validateArticle, parseBackup, validDate, SCHEMA_VERSION, monthlyPlan, monthAfter, validMonth } from './model.js?v=3';
const $ = s => document.querySelector(s);
const key = 'spik.inventory.v3';
const previousKey = 'spik.inventory.v2';
const legacyKey = 'spik.inventory.v1';
const number = (n, digits=0) => new Intl.NumberFormat('sv-SE', {maximumFractionDigits:digits}).format(n);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pretty = d => new Intl.DateTimeFormat('sv-SE', {day:'numeric',month:'short',year:'numeric'}).format(new Date(`${d}T12:00:00`));
const labels = {critical:'Risk för brist',order:'Dags att beställa',ok:'Lagret räcker',idle:'Ingen förbrukning i prognosen',unconfirmed:'Bekräfta lagersaldo'};
const movementNames = {usage:'Förbrukning',receipt:'Inleverans',count:'Inventering'};
let articles = [], demo = false, draftDeliveries = [], storageBlocked = false, savedRaw = null;
let stockId = null, receiptId = null, renderedDate = today();
let view='stock',planStart=today().slice(0,7);
const planDrafts=new Map();
try {
  savedRaw = localStorage.getItem(key);
  const raw = savedRaw ?? localStorage.getItem(previousKey) ?? localStorage.getItem(legacyKey);
  if (raw) { articles = parseBackup(raw); demo = JSON.parse(raw).demo === true; }
} catch {
  storageBlocked = true;
  $('#storage-warning').hidden=false;
  $('#storage-warning').textContent='Sparade uppgifter kunde inte läsas. Kontrollera webbläsarens lagringsinställningar. Sparandet har blockerats för att skydda tidigare uppgifter.';
}
function persist(next, nextDemo=demo) {
  if (storageBlocked) { alert('Sparandet är blockerat efter ett läsfel. Säkra tidigare uppgifter innan du rensar webbplatsens lagring.'); return false; }
  try {
    if(localStorage.getItem(key)!==savedRaw) { alert('Uppgifterna har ändrats i en annan flik. Ladda om sidan innan du sparar. Dina ändringar har inte skrivits över.'); return false; }
    next.forEach(validateArticle);
    const raw=JSON.stringify({version:SCHEMA_VERSION,articles:next,demo:nextDemo});
    localStorage.setItem(key,raw);
    savedRaw=raw; articles=next; demo=nextDemo; render(); return true;
  } catch(err) { alert(`Uppgifterna kunde inte sparas. Ändringarna har inte sparats. ${err.message}`); return false; }
}
function replaceArticle(next) { return persist(articles.map(a=>a.id===next.id?next:a)); }
let toastTimer;
function notify(message) { $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,3500); }
function render() {
  renderedDate=today();
  const forecasts=articles.map(a=>({a,f:forecast(a)}));
  $('#date').textContent=pretty(today()); $('#demo-notice').hidden=!demo;
  const unknown=forecasts.filter(({f})=>!f.confirmed).length;
  $('#date-warning').hidden=!unknown;
  $('#date-warning').textContent=`${unknown} ${unknown===1?'artikel saknar':'artiklar saknar'} ett bekräftat datum för lagersaldot. Öppna ”Lager & historik” för att ange rätt saldo och datum. Inga inköpsförslag beräknas för dessa artiklar ännu.`;
  const critical=forecasts.filter(({f})=>f.status==='critical').length;
  const due=forecasts.filter(({f})=>f.orderIn<=0).length;
  const total=forecasts.reduce((s,{f})=>s+(f.estimated??0),0);
  $('#stats').innerHTML=[['AKTIVA ARTIKLAR',articles.length,'Spiksorter i ditt lager',''],['BERÄKNAT SALDO IDAG',`${number(total,1)} <small>kg</small>`,unknown?`${unknown} obekräftade artiklar ingår inte`:'Uppskattning utifrån inventering och rörelser',''],['ATT BESTÄLLA',due,'Beställningsdatum har nåtts','amber'],['RISK FÖR BRIST',critical,'Lagret räcker inte under leveranstiden','red']].map(([title,value,sub,cls])=>`<div class="stat ${cls}"><div class="eyebrow">${title}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>`).join('');
  const selected=$('#group-filter').value;
  $('#group-filter').innerHTML='<option value="">Alla grupper</option>'+[...new Set(articles.map(a=>a.group).filter(Boolean))].sort().map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');
  $('#group-filter').value=selected;
  const query=$('#search').value.trim().toLocaleLowerCase('sv');
  const rows=forecasts.filter(({a,f})=>(!query || `${a.name} ${a.supplier} ${a.group}`.toLocaleLowerCase('sv').includes(query)) && (!$('#group-filter').value || a.group===$('#group-filter').value) && (!$('#status-filter').value || f.status===$('#status-filter').value));
  rows.sort((x,y)=>$('#sort').value==='name'?x.a.name.localeCompare(y.a.name,'sv'):$('#sort').value==='stock'?(x.f.estimated??Infinity)-(y.f.estimated??Infinity):x.f.orderIn-y.f.orderIn || x.a.name.localeCompare(y.a.name,'sv'));
  $('#count').textContent=articles.length;
  $('#rows').innerHTML=rows.map(({a,f})=>{
    const end=f.shortage===null?'Ingen planerad brist':f.shortage>36500?'> 100 år':pretty(dateAfter(today(),Math.floor(f.shortage)));
    const order=!Number.isFinite(f.orderIn)?'—':f.orderIn<=0?'Beställ nu':f.orderIn>36500?'> 100 år':pretty(dateAfter(today(),f.orderIn));
    const stock=f.confirmed?`<strong>${number(f.estimated,1)} <small>kg</small></strong><span class="muted">Bokfört: ${number(f.ledger,1)} kg</span><span class="muted">Inventerat ${pretty(f.countDate)}</span>${f.deficit>0?'<span class="warning-text">Beräknat underskott — kontrollera lagret</span>':''}`:`<strong>—</strong><span class="muted">Tidigare saldo: ${number(a.stock,1)} kg</span><span class="warning-text">Bekräfta datum först</span>`;
    return `<tr><td><button class="article-name" data-edit="${esc(a.id)}">${esc(a.name)}</button><span class="muted">${esc(a.group || 'Ingen grupp')} · ${esc(a.supplier || 'Ingen leverantör')}</span><span class="badge ${f.status}">${labels[f.status]}</span><button class="stock-shortcut" data-stock="${esc(a.id)}">Lager & historik</button></td><td>${stock}</td><td>${f.currentMonth.source==='plan'?`<strong>${number(f.currentMonth.plannedKg,1)} <small>kg / mån</small></strong><span class="muted">Månadsplan · ${number(f.currentMonth.pieces)} st</span>`:`<strong>${number(f.daily*7,1)} <small>kg / vecka</small></strong><span class="muted">${f.currentMonth.exceeded?'Plan överskriden · snitt används':'Snitt · ingen månadsplan'}</span>`}</td><td><strong>${end}</strong><span class="muted">${!f.confirmed?'Bekräfta lagersaldo':f.shortage===null?'Med sparad plan och snitt':`om ${number(Math.floor(f.shortage))} dagar`}</span>${a.deliveries.length?`<span class="muted">${a.deliveries.length} planerade leveranser</span>`:''}${f.overdue.length?'<span class="warning-text">Kontrollera försenade leveranser</span>':''}</td><td><strong class="${f.orderIn<=0?'warning-text':''}">${order}</strong><span class="muted">Leveranstid ${a.lead} d + buffert ${a.buffer} d</span></td><td><strong>${f.orderKg===null?'—':`${number(f.orderKg)} <small>kg</small>`}</strong><span class="muted">${f.cartons===null?'Ange startsaldo':`${f.cartons} hela förpackningar`}</span>${f.status==='critical'?'<span class="warning-text">Tidigarelägg leveransen</span>':''}</td><td><div class="row-actions"><button data-edit="${esc(a.id)}" aria-label="Redigera ${esc(a.name)}">Redigera</button></div></td></tr>`;
  }).join('');
  $('#empty').hidden=articles.length>0;
  if(articles.length && !rows.length) $('#rows').innerHTML='<tr><td colspan="7" class="no-results">Inga artiklar matchar dina filter.</td></tr>';
  if(view==='plan')renderPlan();
}
const form=$('#article-form');
const field=name=>form.elements.namedItem(name);
function packCalc() { const n=Number(field('pack').value)*1000/Number(field('weight').value); $('#pack-calc').textContent=Number.isFinite(n)&&n>0?`≈ ${number(n)} spikar per förpackning`:'Ange spikvikt och förpackningsvikt.'; }
function deliveryRows() {
  $('#deliveries').innerHTML=draftDeliveries.map((d,i)=>`<div class="delivery"><label>Leveransdatum<input type="date" data-date="${i}" value="${esc(d.date)}" required></label><label>Mängd (kg)<input type="number" min="0.000001" step="any" data-kg="${i}" value="${d.kg}" required></label><button type="button" data-remove="${i}" aria-label="Ta bort leverans">×</button></div>`).join('');
}
function edit(id) {
  const a=articles.find(a=>a.id===id) || {id:'',name:'',group:'',supplier:'',weight:1.8,pack:800,stock:0,stockDate:today(),usage:0,unit:'kg',period:'week',lead:42,buffer:14,coverage:30,notes:'',deliveries:[],movements:[],plans:{}};
  form.reset();
  for(const name of ['id','name','group','supplier','weight','pack','stock','stockDate','usage','unit','period','lead','buffer','coverage','notes']) field(name).value=a[name]??'';
  const locked=Boolean(id && a.stockDate);
  field('stock').readOnly=locked; field('stockDate').readOnly=locked; field('stockDate').max=today(); field('stockDate').min='1900-01-01';
  $('#opening-hint').textContent=locked?'Startsaldo är låst för att bevara historiken. Registrera nya saldon, uttag och inleveranser via ”Lager & historik”.':'Ange saldot vid början av vald dag, före den dagens uttag och leveranser. Äldre saldon måste bekräftas. Spara inte ett gammalt saldo som om det vore dagens.';
  draftDeliveries=structuredClone(a.deliveries); deliveryRows(); packCalc();
  $('#editor-title').textContent=id?'Redigera artikel':'Ny artikel'; $('#delete').hidden=!id; $('#editor').showModal();
}
$('#add').onclick=()=>edit(); $('#close').onclick=()=>$('#editor').close();
$('#rows').onclick=e=>{ const stock=e.target.closest('[data-stock]'),editButton=e.target.closest('[data-edit]'); if(stock)openStock(stock.dataset.stock);else if(editButton)edit(editButton.dataset.edit); };
for(const id of ['search','group-filter','status-filter','sort']) $(`#${id}`).addEventListener('input',render);
for(const name of ['weight','pack']) field(name).addEventListener('input',packCalc);
$('#add-delivery').onclick=()=>{draftDeliveries.push({id:crypto.randomUUID(),date:dateAfter(today(),Number(field('lead').value)||0),kg:Number(field('pack').value)||800});deliveryRows();};
$('#deliveries').oninput=e=>{if(e.target.dataset.date!==undefined)draftDeliveries[Number(e.target.dataset.date)].date=e.target.value;if(e.target.dataset.kg!==undefined)draftDeliveries[Number(e.target.dataset.kg)].kg=Number(e.target.value);};
$('#deliveries').onclick=e=>{if(e.target.dataset.remove!==undefined){draftDeliveries.splice(Number(e.target.dataset.remove),1);deliveryRows();}};
form.onsubmit=e=>{
  e.preventDefault();const a=Object.fromEntries(new FormData(form));
  const previous=articles.find(x=>x.id===a.id);
  for(const name of ['weight','pack','stock','usage','lead','buffer','coverage'])a[name]=Number(a[name]);
  a.id ||= crypto.randomUUID(); a.plans=structuredClone(previous?.plans||{}); a.movements=structuredClone(previous?.movements||[]); a.deliveries=structuredClone(draftDeliveries);
  if(previous?.stockDate){a.stock=previous.stock;a.stockDate=previous.stockDate;}
  try {validateArticle(a);if(a.stockDate>today())throw new Error('Startsaldot får inte ligga i framtiden.');}catch(err){alert(err.message);return;}
  const next=previous?articles.map(x=>x.id===a.id?a:x):[...articles,a];
  if(persist(next)){ $('#editor').close();notify('Artikeln har sparats'); }
};
$('#delete').onclick=()=>{const id=field('id').value;if(confirm(`Ta bort artikeln ”${field('name').value}”, hela lagerhistoriken, månadsplanen och leveransplanen? Exportera en säkerhetskopia först.`)&&persist(articles.filter(a=>a.id!==id))){planDrafts.delete(id);if(view==='plan')renderPlan();$('#editor').close();notify('Artikeln har tagits bort');}};

const movementForm=$('#movement-form');
const mf=name=>movementForm.elements.namedItem(name);
const currentArticle=()=>articles.find(a=>a.id===stockId);
function resetMovement(type='usage') {
  const a=currentArticle(); receiptId=null; movementForm.reset(); mf('type').value=type;
  const last=a.movements.filter(m=>m.type==='usage'&&!m.voided).sort((x,y)=>x.date.localeCompare(y.date)).at(-1);
  mf('from').value=last && last.date<today()?dateAfter(last.date,1):today();mf('date').value=today();
  for(const name of ['date','from']){mf(name).min=a.stockDate||'1900-01-01';mf(name).max=today();}
  $('#movement-error').hidden=true; movementType();
}
function movementType() {
  const type=mf('type').value;
  $('#movement-from-label').hidden=type!=='usage';mf('from').required=type==='usage';
  $('#movement-date-label span').textContent=type==='usage'?'Till och med':type==='count'?'Inventeringsdag (dagens början)':'Faktiskt leveransdatum';
  $('#movement-amount-label').textContent=type==='count'?'Uppmätt saldo':type==='usage'?'Förbrukad mängd':'Mottagen mängd';
  mf('kg').min=type==='receipt'?'0.000001':'0';
  mf('unit').disabled=type!=='usage';if(type!=='usage')mf('unit').value='kg';
  mf('type').disabled=Boolean(receiptId);mf('kg').readOnly=Boolean(receiptId);
  $('#cancel-receipt').hidden=!receiptId;
  $('#movement-hint').textContent=type==='usage'?'Ange faktisk förbrukning för hela perioden, inklusive båda datumen. Den ersätter uppskattad förbrukning för samma dagar. Perioder får inte överlappa. Förbrukningen fördelas jämnt över perioden. Ange 0 för en period utan produktion.':type==='count'?'Ange det uppmätta saldot vid dagens början, före dagens uttag och leveranser. Detta blir en ny utgångspunkt. Äldre rörelser behålls i historiken.':'Ange vad som faktiskt har kommit och mottagningsdatumet. En vald planerad leverans tas bort ur planen först när du registrerar mottagandet.';
}
function openStock(id) {stockId=id;resetMovement();renderStock();$('#stock-dialog').showModal();}
function renderStock() {
  const a=currentArticle();if(!a)return;
  const s=inventory(a),actual=usageHistory(a);
  $('#stock-title').textContent=a.name;
  $('#confirm-stock').hidden=s.confirmed;$('#movement-section').hidden=!s.confirmed;
  if(!s.confirmed) {
    $('#stock-summary').innerHTML=`<div class="summary-cell"><span>Tidigare odaterat saldo</span><strong>${number(a.stock,1)} kg</strong><small>Prognosen väntar på ditt bekräftade startsaldo.</small></div>`;
    const cf=$('#confirm-stock').elements;cf.namedItem('kg').value=a.stock;cf.namedItem('date').value=today();cf.namedItem('date').max=today();cf.namedItem('date').min='1900-01-01';
  } else {
    $('#stock-summary').innerHTML=`<div class="summary-cell"><span>Senast inventerat</span><strong>${number(s.countKg,1)} kg</strong><small>${pretty(s.countDate)} · dagens början</small></div><div class="summary-cell"><span>Bokfört saldo</span><strong>${number(s.ledger,1)} kg</strong><small>Inventering + inleveranser − registrerad förbrukning</small></div><div class="summary-cell estimate"><span>Beräknat saldo idag</span><strong>${number(s.estimated,1)} kg</strong><small>${s.estimatedDays} ${s.estimatedDays===1?'dag':'dagar'} med uppskattad förbrukning${s.deficit>0?` · underskott ${number(s.deficit,1)} kg`:''}</small></div>`;
  }
  $('#actual-average').innerHTML=actual.days?`<div><strong>Verkligt snitt: ${number(actual.weekly,1)} kg / vecka</strong><p>Baserat på ${actual.days} registrerade dagar (${number(actual.kg,1)} kg) under de senaste 30 dagarna. Saknade dagar räknas inte som noll.</p></div><button type="button" id="use-average">Använd som planeringssnitt</button>`:'<p>Registrera faktisk förbrukning för att se ett historiskt snitt. Ditt planeringssnitt ändras inte automatiskt.</p>';
  $('#stock-deliveries').innerHTML=a.deliveries.length?a.deliveries.map(d=>`<div class="planned-row"><div><strong>${number(d.kg,1)} kg</strong><span class="muted">${pretty(d.date)}${d.date<today()?' · Försenad':''}</span></div><button type="button" data-receive-id="${esc(d.id)}">Ta emot</button></div>`).join(''):'<p class="hint">Inga planerade leveranser. Lägg till dem via ”Redigera”.</p>';
  const entries=a.movements.map((m,index)=>({...m,index})).sort((x,y)=>y.date.localeCompare(x.date)||y.index-x.index);
  $('#history').innerHTML=entries.map(m=>`<div class="history-row ${m.voided?'voided':''}"><div class="history-icon ${m.type}">${m.type==='usage'?'−':m.type==='receipt'?'+':'='}</div><div class="history-body"><strong>${movementNames[m.type]}${m.voided?' · Ångrad':''}</strong><span class="muted">${m.type==='usage'?`${pretty(m.from)} – ${pretty(m.date)}`:`${pretty(m.date)}${m.type==='count'?' · dagens början':''}`}</span>${m.note?`<p>${esc(m.note)}</p>`:''}${m.delivery?'<span class="muted">Mottagen från leveransplanen</span>':''}</div><div class="history-amount">${m.type==='usage'?'−':m.type==='receipt'?'+':'='} ${number(m.kg,2)} kg${!m.voided?`<button type="button" data-void="${esc(m.id)}">Ångra</button>`:''}</div></div>`).join('')+`<div class="history-row"><div class="history-icon count">=</div><div class="history-body"><strong>Startsaldo</strong><span class="muted">${a.stockDate?`${pretty(a.stockDate)} · dagens början`:'Datum ej bekräftat'}</span></div><div class="history-amount">${number(a.stock,1)} kg</div></div>`;
}
$('#stock-close').onclick=()=>$('#stock-dialog').close();
mf('type').onchange=()=>{receiptId=null;movementType();$('#movement-error').hidden=true;};
$('#cancel-receipt').onclick=()=>resetMovement('receipt');
$('#confirm-stock').onsubmit=e=>{
  e.preventDefault();const f=e.target.elements,a=currentArticle(),date=f.namedItem('date').value;
  if(!validDate(date)||date>today())return;
  const next={...a,stock:Number(f.namedItem('kg').value),stockDate:date};
  if(replaceArticle(next)){resetMovement();renderStock();notify('Startsaldot har bekräftats');}
};
movementForm.onsubmit=e=>{
  e.preventDefault(); const a=currentArticle(),type=mf('type').value;
  const kg=Number(mf('kg').value)*(type==='usage'&&mf('unit').value==='pieces'?a.weight/1000:1);
  const m={id:crypto.randomUUID(),type,date:mf('date').value,kg,note:mf('note').value.trim(),voided:false};
  if(type==='usage')m.from=mf('from').value;
  if(receiptId)m.delivery=structuredClone(a.deliveries.find(d=>d.id===receiptId));
  try {
    const next=addMovement(a,m);
    if(replaceArticle(next)){resetMovement();renderStock();notify('Lagerrörelsen har registrerats');}
  } catch(err) {$('#movement-error').textContent=err.message;$('#movement-error').hidden=false;}
};
$('#stock-deliveries').onclick=e=>{
  const b=e.target.closest('[data-receive-id]');if(!b)return;
  const d=currentArticle().deliveries.find(d=>d.id===b.dataset.receiveId);if(!d)return;
  resetMovement('receipt');receiptId=d.id;mf('kg').value=d.kg;mf('note').value=`Planerad leverans ${d.date}`;movementType();movementForm.scrollIntoView({behavior:'smooth',block:'center'});
};
$('#history').onclick=e=>{
  const b=e.target.closest('[data-void]');if(!b)return;
  if(!confirm('Ångra den här posten? Saldot och prognosen räknas om. Posten behålls som ångrad. En mottagen planerad leverans återställs till leveransplanen.'))return;
  try{if(replaceArticle(voidMovement(currentArticle(),b.dataset.void))){resetMovement();renderStock();notify('Posten har ångrats');}}catch(err){alert(err.message);}
};
$('#actual-average').onclick=e=>{
  if(!e.target.closest('#use-average'))return;
  const a=currentArticle(),actual=usageHistory(a);if(!actual.days)return;
  if(confirm(`Använd ${number(actual.weekly,2)} kg per vecka som planeringssnitt? Uppskattad förbrukning för dagar utan registrerade uttag och inköpsprognosen räknas om.`) && replaceArticle({...a,usage:actual.weekly,unit:'kg',period:'week'})){renderStock();notify('Planeringssnittet har uppdaterats');}
};
$('#export').onclick=()=>{
  if(planDrafts.size){alert('Spara eller återställ dina planändringar innan du exporterar en säkerhetskopia.');return;}
  const blob=new Blob([JSON.stringify({version:SCHEMA_VERSION,exportedAt:new Date().toISOString(),articles,demo},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`spik-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('#import').onclick=()=>$('#file').click();
$('#file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try {
    if(file.size>10_000_000)throw new Error('Filen är för stor (max 10 MB).');
    const raw=await file.text(),next=parseBackup(raw);
    if(confirm(`Importen ersätter alla nuvarande artiklar (${articles.length}) och deras historik och månadsplaner med kopians (${next.length}). Har du en säkerhetskopia och vill fortsätta? Äldre kopior utan saldodatum kräver bekräftelse.`))if(persist(next,JSON.parse(raw).demo===true)){planDrafts.clear();if(view==='plan')renderPlan();notify('Säkerhetskopian har importerats');}
  }catch(err){alert(`Importen misslyckades: ${err.message}`);}finally{e.target.value='';}
};
$('#demo').onclick=()=>{
  const base={weight:1.8,pack:800,stockDate:today(),movements:[],plans:{},unit:'kg',period:'week',lead:42,buffer:14,coverage:30,notes:'Exempelartikel — ersätt med verkliga uppgifter.',deliveries:[]};
  persist([{...base,id:crypto.randomUUID(),name:'2,5 × 45 Slätt',group:'Slät spik',supplier:'Leverantör A',stock:900,usage:210},{...base,id:crypto.randomUUID(),name:'2,8 × 75 Ring',group:'Ringspik',supplier:'Leverantör B',weight:3.2,stock:2400,usage:280},{...base,id:crypto.randomUUID(),name:'3,1 × 90 Ring',group:'Ringspik',supplier:'Leverantör B',weight:4.5,stock:4000,usage:180}],true);
};
$('#clear-demo').onclick=()=>{if(confirm('Ta bort alla demouppgifter, inklusive dina ändringar? Exportera först de uppgifter du vill behålla.')&&persist([],false)){planDrafts.clear();if(view==='plan')renderPlan();}};
window.addEventListener('storage',e=>{if(e.key===key || e.key===null){if(planDrafts.size){$('#storage-warning').hidden=false;$('#storage-warning').textContent='Uppgifterna har ändrats i en annan flik. Dina planändringar är kvar på skärmen men kan inte sparas över den andra versionen. Säkra dina anteckningar och ladda om sidan.';}else location.reload();}});
function refreshDate(){if(renderedDate!==today()){render();if($('#stock-dialog').open)renderStock();}}
window.addEventListener('focus',refreshDate);document.addEventListener('visibilitychange',refreshDate);setInterval(refreshDate,60000);
function setView(next) {
  view=next;$('#inventory-view').hidden=next!=='stock';$('#plan-view').hidden=next!=='plan';
  for(const [id,active] of [['nav-stock',next==='stock'],['nav-plan',next==='plan']]) {const button=$(`#${id}`);button.classList.toggle('nav-active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
  $('#page-title').innerHTML=next==='plan'?'Planera månad för månad<span>.</span>':'Full koll på lagret<span>.</span>';
  $('#page-subtitle').textContent=next==='plan'?'Från produktionsbehov i stycken till rätt mängd spik i lager.':'Vet vad du behöver beställa. Innan produktionen stannar.';
  if(next==='plan')renderPlan();
}
$('#nav-stock').onclick=()=>setView('stock');$('#nav-plan').onclick=()=>setView('plan');
function planMonths(){return Array.from({length:6},(_,i)=>monthAfter(planStart,i));}
function visiblePlanArticles(){const query=$('#plan-search').value.trim().toLocaleLowerCase('sv'),group=$('#plan-group').value;return articles.filter(a=>(!query||`${a.name} ${a.supplier} ${a.group}`.toLocaleLowerCase('sv').includes(query))&&(!group||a.group===group)).sort((a,b)=>a.name.localeCompare(b.name,'sv'));}
function draftValue(a,month){return planDrafts.get(a.id)?.get(month)??(Object.hasOwn(a.plans,month)?String(a.plans[month]):'');}
function validPlanValue(value){return value===''||(value.trim()!==''&&Number.isSafeInteger(Number(value))&&Number(value)>=0&&Number(value)<=1e12);}
function previewArticle(a){const plans={...a.plans};for(const [month,value] of planDrafts.get(a.id)||[]){if(value==='')delete plans[month];else if(validPlanValue(value))plans[month]=Number(value);}return {...a,plans};}
function planCellInfo(a,month,value){
  if(!validPlanValue(value))return '<span class="warning-text">Ange hela stycken, minst 0.</span>';
  const p=monthlyPlan(previewArticle(a),month);
  const converted=p.pieces===null?`${number(p.totalKg,1)} kg · snitt`:`${number(p.plannedKg,1)} kg · plan`;
  return `<span class="cell-conversion">${converted}</span>${p.recordedDays?`<span class="muted">Utfall: ${number(p.actualKg,1)} kg · ${p.recordedDays} d</span>`:''}${month>=today().slice(0,7)?`<span class="muted">${month===today().slice(0,7)?'Från idag':'Prognos'}: ${number(p.forecastKg,1)} kg</span>`:''}${p.exceeded?`<span class="warning-text">Plan överskriden · snitt används${p.rate===0?' (0 kg — kontrollera planen eller snittet)':''}</span>`:''}`;
}
function updatePlanStatus(){
  const count=[...planDrafts.values()].reduce((sum,map)=>sum+map.size,0);
  $('#plan-save-status').textContent=count?`${count} osparade ${count===1?'ändring':'ändringar'}`:'Alla ändringar sparade';
  $('#plan-save-status').classList.toggle('unsaved',count>0);$('#plan-save').disabled=!count;$('#plan-discard').disabled=!count;
}
function renderPlanTotals(){
  const rows=visiblePlanArticles();
  $('#plan-totals').innerHTML=`<tr><th>Prognos totalt · kg<span class="muted">Visade artiklar · plan / snitt</span></th>${planMonths().map(month=>{let total=0;for(const a of rows){if(!validPlanValue(draftValue(a,month)))return '<td>—</td>';const p=monthlyPlan(previewArticle(a),month);total+=p.totalKg;}return `<td>${number(total,1)} <small>kg</small></td>`;}).join('')}</tr>`;
}
function renderPlan(){
  $('#plan-start').value=planStart;
  $('#plan-prev').disabled=monthAfter(planStart,-6)<'1900-01';$('#plan-next').disabled=monthAfter(planStart,6)>'9998-07';
  const selected=$('#plan-group').value;
  $('#plan-group').innerHTML='<option value="">Alla grupper</option>'+[...new Set(articles.map(a=>a.group).filter(Boolean))].sort().map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');$('#plan-group').value=selected;
  const months=planMonths(),rows=visiblePlanArticles();
  const label=month=>new Intl.DateTimeFormat('sv-SE',{month:'long',year:'numeric'}).format(new Date(`${month}-01T12:00:00`));
  $('#plan-head').innerHTML=`<tr><th>ARTIKEL<span class="muted">Vikt per spik · förpackning</span></th>${months.map(month=>`<th class="${month===today().slice(0,7)?'current-month':''}">${esc(label(month))}<span class="muted">Planerad förbrukning · st</span></th>`).join('')}</tr>`;
  $('#plan-rows').innerHTML=rows.map(a=>`<tr><td><strong>${esc(a.name)}</strong><span class="muted">${number(a.weight,3)} g / st · ${number(a.pack)} kg / förp.</span><span class="muted">${esc(a.group||'Ingen grupp')} · ${esc(a.supplier||'Ingen leverantör')}</span></td>${months.map(month=>{const value=draftValue(a,month);return `<td class="plan-cell ${value===''?'from-average':'from-plan'}" data-article="${esc(a.id)}" data-month="${month}"><div class="plan-input"><input type="number" min="0" max="1000000000000" step="1" inputmode="numeric" value="${validPlanValue(value)?esc(value):''}" placeholder="Snitt" aria-label="${esc(a.name)} · ${esc(label(month))} · stycken"><span>st</span></div><div class="plan-cell-info">${planCellInfo(a,month,value)}</div></td>`;}).join('')}</tr>`).join('');
  if(articles.length&&!rows.length)$('#plan-rows').innerHTML='<tr><td colspan="7" class="no-results">Inga artiklar matchar dina filter.</td></tr>';
  $('#plan-empty').hidden=articles.length>0;renderPlanTotals();updatePlanStatus();
}
$('#plan-rows').oninput=e=>{
  const cell=e.target.closest('.plan-cell');if(!cell)return;
  const a=articles.find(a=>a.id===cell.dataset.article),month=cell.dataset.month;
  const value=e.target.validity.badInput?'!':e.target.value;
  const original=Object.hasOwn(a.plans,month)?String(a.plans[month]):'';
  if(value===original || (value!==''&&validPlanValue(value)&&Number(value)===Number(original)&&original!=='')){planDrafts.get(a.id)?.delete(month);if(planDrafts.get(a.id)?.size===0)planDrafts.delete(a.id);}else{if(!planDrafts.has(a.id))planDrafts.set(a.id,new Map());planDrafts.get(a.id).set(month,value);}
  cell.classList.toggle('from-average',value==='');cell.classList.toggle('from-plan',value!=='');e.target.setAttribute('aria-invalid',String(!validPlanValue(value)));
  cell.querySelector('.plan-cell-info').innerHTML=planCellInfo(a,month,value);renderPlanTotals();updatePlanStatus();
};
$('#plan-form').onsubmit=e=>{e.preventDefault();savePlans();};
function savePlans(){
  for(const [id,months] of planDrafts)for(const [month,value] of months)if(!validPlanValue(value)){alert(`Kontrollera planen för ${articles.find(a=>a.id===id)?.name||'artikeln'}, ${month}. Ange hela stycken mellan 0 och 1 000 000 000 000.`);return false;}
  if(!planDrafts.size)return true;
  const next=articles.map(previewArticle);
  if(persist(next)){planDrafts.clear();renderPlan();notify('Månadsplanen har sparats. Lagerprognosen är uppdaterad.');return true;}return false;
}
$('#plan-save').onclick=savePlans;
$('#plan-discard').onclick=()=>{if(confirm('Återställ alla osparade planändringar, även i andra månader och filter?')){planDrafts.clear();renderPlan();}};
$('#plan-prev').onclick=()=>{planStart=monthAfter(planStart,-6);renderPlan();};$('#plan-next').onclick=()=>{planStart=monthAfter(planStart,6);renderPlan();};$('#plan-today').onclick=()=>{planStart=today().slice(0,7);renderPlan();};
$('#plan-start').onchange=e=>{if(validMonth(e.target.value)&&e.target.value<='9998-07'){planStart=e.target.value;renderPlan();}else e.target.value=planStart;};
$('#plan-search').oninput=renderPlan;$('#plan-group').onchange=renderPlan;
window.addEventListener('beforeunload',e=>{if(planDrafts.size){e.preventDefault();e.returnValue='';}});

render();
