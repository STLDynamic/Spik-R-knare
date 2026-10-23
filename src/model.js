export const DAY = 86400000;
export const SCHEMA_VERSION = 2;
export function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function dayNumber(date) { return Date.parse(`${date}T00:00:00Z`) / DAY; }
export function dateAfter(date, days) { return new Date((dayNumber(date) + days) * DAY).toISOString().slice(0,10); }
export function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '1900-01-01' && date <= '9999-12-31' && Number.isFinite(dayNumber(date)) && dateAfter(date,0) === date;
}
const amount = (n, positive=false) => typeof n === 'number' && Number.isFinite(n) && n >= (positive ? Number.MIN_VALUE : 0) && n <= 1e12;
function uniqueIds(list) { return list.every(x=>typeof x.id==='string' && x.id) && new Set(list.map(x=>x.id)).size === list.length; }
function validateBase(a) {
  if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !a.id || typeof a.name !== 'string' || !a.name.trim()) throw new Error('Artikeln måste ha ett ID och ett namn.');
  for (const key of ['weight','pack','stock','usage','lead','buffer','coverage']) if (!amount(a[key])) throw new Error(`Ogiltigt värde: ${key}.`);
  if (a.weight <= 0 || a.pack <= 0 || a.coverage <= 0) throw new Error('Spikvikt, förpackningsvikt och extra täckning måste vara större än noll.');
  for (const key of ['lead','buffer','coverage']) if (!Number.isInteger(a[key]) || a[key] > 3650) throw new Error('Antalet dagar måste vara ett heltal mellan 0 och 3650.');
  if (!['week','month'].includes(a.period) || !['kg','pieces'].includes(a.unit)) throw new Error('Ogiltig förbrukningsenhet.');
  for (const key of ['supplier','group','notes']) if (typeof a[key] !== 'string') throw new Error('Ogiltiga artikeluppgifter.');
  if (!Array.isArray(a.deliveries) || !uniqueIds(a.deliveries)) throw new Error('Ogiltig leveranslista.');
  for (const d of a.deliveries) if (!validDate(d.date) || !amount(d.kg,true)) throw new Error('Ogiltigt leveransdatum eller mängd.');
}
export function validateArticle(a) {
  validateBase(a);
  if (a.stockDate !== null && !validDate(a.stockDate)) throw new Error('Ange ett giltigt datum för startsaldot.');
  if (!Array.isArray(a.movements) || !uniqueIds(a.movements)) throw new Error('Ogiltig lagerhistorik.');
  if (a.stockDate === null && a.movements.length) throw new Error('Bekräfta startsaldot innan du registrerar lagerrörelser.');
  for (const m of a.movements) {
    if (!['usage','receipt','count'].includes(m.type) || !validDate(m.date) || m.date < a.stockDate || !amount(m.kg,m.type==='receipt') || typeof m.note !== 'string' || typeof m.voided !== 'boolean') throw new Error('Ogiltig lagerrörelse.');
    if (m.type === 'usage' && (!validDate(m.from) || m.from < a.stockDate || m.from > m.date)) throw new Error('Ogiltig förbrukningsperiod.');
    if (m.delivery && (m.type !== 'receipt' || typeof m.delivery.id !== 'string' || !validDate(m.delivery.date) || !amount(m.delivery.kg,true) || m.delivery.kg !== m.kg)) throw new Error('Ogiltig leveransreferens.');
  }
  const periods=a.movements.filter(m=>m.type==='usage'&&!m.voided).sort((a,b)=>a.from.localeCompare(b.from));
  for(let i=1;i<periods.length;i++) if(periods[i].from<=periods[i-1].date) throw new Error('Förbrukningsperioder får inte överlappa. Ångra den felaktiga posten först.');
  return a;
}
export function dailyUsage(a) { return (a.unit === 'kg' ? a.usage : a.usage * a.weight / 1000) / (a.period === 'week' ? 7 : 365.25/12); }
export function inventory(a, asOf=today()) {
  if (!a.stockDate || a.stockDate > asOf) return { confirmed:false, ledger:a.stock, estimated:null, estimatedDays:0, countDate:null, countKg:null, deficit:0 };
  const active=a.movements.filter(m=>!m.voided && m.date<=asOf);
  // Inventeringar gäller dagens början; dagens uttag och leveranser kommer därefter.
  const counts=active.filter(m=>m.type==='count').sort((x,y)=>x.date.localeCompare(y.date));
  const last=counts.at(-1);
  const countDate=last?.date || a.stockDate;
  const countKg=last?.kg ?? a.stock;
  const start=dayNumber(countDate), end=dayNumber(asOf);
  let ledger=countKg, coveredDays=0;
  for(const m of active) {
    if(m.type==='receipt' && m.date>=countDate) ledger+=m.kg;
    if(m.type==='usage') {
      const from=dayNumber(m.from), to=dayNumber(m.date);
      const actualDays=Math.max(0,Math.min(to,end)-Math.max(from,start)+1);
      ledger-=m.kg*actualDays/(to-from+1);
      coveredDays+=Math.max(0,Math.min(to,end-1)-Math.max(from,start)+1);
    }
  }
  const estimatedDays=Math.max(0,end-start-coveredDays);
  const raw=ledger-estimatedDays*dailyUsage(a);
  return {confirmed:true,ledger,estimated:Math.max(0,raw),estimatedDays,countDate,countKg,deficit:Math.max(0,-raw)};
}
export function usageHistory(a, asOf=today(), days=30) {
  const end=dayNumber(asOf), start=end-days+1;
  let kg=0, recordedDays=0;
  for(const m of a.movements.filter(m=>m.type==='usage'&&!m.voided)) {
    const from=dayNumber(m.from), to=dayNumber(m.date);
    const overlap=Math.max(0,Math.min(end,to)-Math.max(start,from)+1);
    recordedDays+=overlap; kg+=m.kg*overlap/(to-from+1);
  }
  return {kg,days:recordedDays,weekly:recordedDays ? kg/recordedDays*7 : null};
}
export function addMovement(a, movement, asOf=today()) {
  if(!a.stockDate) throw new Error('Bekräfta startsaldot först.');
  if(movement.date>asOf || (movement.from && movement.from>asOf)) throw new Error('Lagerrörelser kan inte dateras i framtiden. Registrera framtida leveranser som planerade.');
  const next=structuredClone(a);
  if(movement.delivery) {
    const d=next.deliveries.find(d=>d.id===movement.delivery.id);
    if(!d || d.kg!==movement.kg || d.date!==movement.delivery.date) throw new Error('Leveransen har ändrats eller redan tagits emot.');
    next.deliveries=a.deliveries.filter(d=>d.id!==movement.delivery.id).map(d=>({...d}));
  }
  next.movements.push({...movement,voided:false});
  return validateArticle(next);
}
export function voidMovement(a,id) {
  const next=structuredClone(a), m=next.movements.find(m=>m.id===id);
  if(!m || m.voided) throw new Error('Posten är redan ångrad eller saknas.');
  m.voided=true;
  if(m.delivery) {
    if(next.deliveries.some(d=>d.id===m.delivery.id)) throw new Error('Leveransen finns redan i leveransplanen.');
    next.deliveries.push({...m.delivery});
  }
  return validateArticle(next);
}
export function forecast(a, asOf = today()) {
  const stock=inventory(a,asOf);
  const daily=dailyUsage(a);
  const overdue=a.deliveries.filter(d=>d.date<asOf);
  if(!stock.confirmed) return {...stock,daily,overdue,status:'unconfirmed',shortage:null,orderIn:Infinity,orderKg:null,cartons:null,piecesPerPack:a.pack*1000/a.weight};
  const future=a.deliveries.filter(d=>d.date>=asOf).sort((x,y)=>x.date.localeCompare(y.date));
  const daysLeft=daily>0 ? stock.estimated/daily : Infinity;
  let balance=stock.estimated,cursor=0,shortage=null;
  if(daily>0) {
    for(const d of future) {
      const at=dayNumber(d.date)-dayNumber(asOf);
      if(balance/daily<at-cursor) {shortage=cursor+balance/daily;break;}
      balance=balance-(at-cursor)*daily+d.kg; cursor=at;
    }
    if(shortage===null) shortage=cursor+balance/daily;
  }
  const orderIn=shortage===null ? Infinity : Math.floor(shortage-a.lead-a.buffer);
  const horizon=a.lead+a.buffer+a.coverage;
  const inbound=future.filter(d=>dayNumber(d.date)-dayNumber(asOf)<=horizon).reduce((s,d)=>s+d.kg,0);
  const needed=Math.max(0,daily*horizon-stock.estimated-inbound);
  const cartons=Math.max(0,Math.ceil(needed/a.pack-1e-10));
  const urgent=daily>0 && shortage<a.lead;
  return {...stock,daily,daysLeft,shortage,orderIn,overdue,cartons,orderKg:cartons*a.pack,piecesPerPack:a.pack*1000/a.weight,status:daily===0?'idle':urgent?'critical':orderIn<=0?'order':'ok'};
}
export function parseBackup(raw) {
  const data=JSON.parse(raw);
  if(!data || ![1,2].includes(data.version) || !Array.isArray(data.articles) || data.articles.length>10000) throw new Error('Säkerhetskopians format stöds inte.');
  const articles=data.articles.map(a=>{
    if(data.version===1) {validateBase(a);return validateArticle({...a,stockDate:null,movements:[]});}
    return validateArticle(a);
  });
  if(!uniqueIds(articles)) throw new Error('Dubbla artikel-ID:n.');
  return articles;
}
