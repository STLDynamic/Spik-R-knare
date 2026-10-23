export const DAY = 86400000;
export const SCHEMA_VERSION = 3;
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
  if (!a.plans || typeof a.plans !== 'object' || Array.isArray(a.plans)) throw new Error('Ogiltig månadsplan.');
  for (const [month,pieces] of Object.entries(a.plans)) {
    if (!validMonth(month) || !Number.isSafeInteger(pieces) || !amount(pieces)) throw new Error('Månadsplanen måste innehålla giltiga månader och hela antal stycken, minst 0.');
  }
  return a;
}
export function dailyUsage(a) { return (a.unit === 'kg' ? a.usage : a.usage * a.weight / 1000) / (a.period === 'week' ? 7 : 365.25/12); }
export function validMonth(month) { return typeof month==='string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month>='1900-01' && month<='9998-12'; }
export function monthAfter(month,offset=1) {
  const [year,m]=month.split('-').map(Number);
  return new Date(Date.UTC(year,m-1+offset,1)).toISOString().slice(0,7);
}
function overlap(from,to,start,end) { return Math.max(0,Math.min(to,end)-Math.max(from,start)); }
// Actual periods include both dates. Internal ranges are [start, end).
function consumptionCalendar(a,asOf) {
  const actual=a.movements.filter(m=>m.type==='usage'&&!m.voided&&m.date<=asOf).map(m=>({start:dayNumber(m.from),end:dayNumber(m.date)+1,kg:m.kg}));
  const profiles=new Map();
  function profile(month) {
    if(profiles.has(month)) return profiles.get(month);
    const start=dayNumber(`${month}-01`),end=dayNumber(`${monthAfter(month)}-01`);
    let actualKg=0,recordedDays=0;
    for(const m of actual) {const days=overlap(m.start,m.end,start,end);recordedDays+=days;actualKg+=m.kg*days/(m.end-m.start);}
    const pieces=Object.hasOwn(a.plans,month)?a.plans[month]:null;
    const plannedKg=pieces===null?null:pieces*a.weight/1000;
    const exceeded=plannedKg!==null&&actualKg>plannedKg+1e-8;
    const remainingKg=plannedKg===null?null:Math.max(0,plannedKg-actualKg);
    const unrecordedDays=end-start-recordedDays;
    const rate=pieces===null||exceeded?dailyUsage(a):unrecordedDays>0?remainingKg/unrecordedDays:0;
    const pendingStart=Math.max(start,dayNumber(asOf));
    const pendingDays=Math.max(0,end-pendingStart)-actual.reduce((sum,m)=>sum+overlap(m.start,m.end,pendingStart,end),0);
    const value={month,pieces,plannedKg,actualKg,recordedDays,remainingKg,rate,exceeded,totalKg:actualKg+rate*unrecordedDays,source:pieces===null?'average':exceeded?'exceeded':'plan',forecastKg:Math.max(0,pendingDays)*rate};
    profiles.set(month,value);return value;
  }
  function missingDays(start,end) { return end-start-actual.reduce((sum,m)=>sum+overlap(m.start,m.end,start,end),0); }
  function demand(start,end) {
    let result=0,cursor=start;
    while(cursor<end) {
      const month=new Date(cursor*DAY).toISOString().slice(0,7);
      const stop=Math.min(end,dayNumber(`${monthAfter(month)}-01`));
      result+=Math.max(0,missingDays(cursor,stop))*profile(month).rate;
      cursor=stop;
    }
    return result;
  }
  function rateAt(day) {
    if(actual.some(m=>m.start<=day&&day<m.end)) return 0;
    return profile(new Date(day*DAY).toISOString().slice(0,7)).rate;
  }
  return {profile,demand,rateAt,missingDays};
}
export function monthlyPlan(a,month,asOf=today()) { return consumptionCalendar(a,asOf).profile(month); }
export function inventory(a, asOf=today(), calendar=consumptionCalendar(a,asOf)) {
  if (!a.stockDate || a.stockDate > asOf) return { confirmed:false, ledger:a.stock, estimated:null, estimatedDays:0, countDate:null, countKg:null, deficit:0 };
  const active=a.movements.filter(m=>!m.voided && m.date<=asOf);
  // Inventeringar gäller dagens början; dagens uttag och leveranser kommer därefter.
  const counts=active.filter(m=>m.type==='count').sort((x,y)=>x.date.localeCompare(y.date));
  const last=counts.at(-1);
  const countDate=last?.date || a.stockDate;
  const countKg=last?.kg ?? a.stock;
  const start=dayNumber(countDate), end=dayNumber(asOf);
  let ledger=countKg;
  for(const m of active) {
    if(m.type==='receipt' && m.date>=countDate) ledger+=m.kg;
    if(m.type==='usage') {
      const from=dayNumber(m.from), to=dayNumber(m.date)+1;
      ledger-=m.kg*overlap(from,to,start,end+1)/(to-from);
    }
  }
  const estimatedDays=Math.max(0,calendar.missingDays(start,end));
  const raw=ledger-calendar.demand(start,end);
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
  const calendar=consumptionCalendar(a,asOf),currentMonth=calendar.profile(asOf.slice(0,7));
  const stock=inventory(a,asOf,calendar),daily=currentMonth.rate;
  const overdue=a.deliveries.filter(d=>d.date<asOf);
  if(!stock.confirmed) return {...stock,daily,currentMonth,overdue,status:'unconfirmed',shortage:null,orderIn:Infinity,orderKg:null,cartons:null,piecesPerPack:a.pack*1000/a.weight};
  const start=dayNumber(asOf);
  const future=a.deliveries.filter(d=>d.date>=asOf);
  // Demand changes at month boundaries, delivery dates and the end of today's actual usage.
  const events=new Set([start,start+1]);
  for(const month of Object.keys(a.plans)) {
    const from=dayNumber(`${month}-01`),to=dayNumber(`${monthAfter(month)}-01`);
    if(from>=start)events.add(from);
    if(to>start)events.add(to);
  }
  const deliveries=new Map();
  for(const d of future) {const at=dayNumber(d.date);events.add(at);deliveries.set(at,(deliveries.get(at)||0)+d.kg);}
  let balance=stock.estimated,cursor=start,shortage=null,hasDemand=false;
  for(const at of [...events].sort((x,y)=>x-y)) {
    const rate=calendar.rateAt(cursor),required=(at-cursor)*rate;
    if(required>0)hasDemand=true;
    if(rate>0 && balance+1e-8<required) {shortage=cursor-start+Math.max(0,balance)/rate;break;}
    balance=Math.max(0,balance-required)+(deliveries.get(at)||0);cursor=at;
  }
  if(shortage===null) {
    const rate=calendar.rateAt(cursor);
    if(rate>0) {hasDemand=true;shortage=cursor-start+balance/rate;}
  }
  const daysLeft=daily>0?stock.estimated/daily:Infinity;
  const orderIn=shortage===null?Infinity:Math.floor(shortage-a.lead-a.buffer);
  const horizon=a.lead+a.buffer+a.coverage;
  const inbound=future.filter(d=>dayNumber(d.date)-start<=horizon).reduce((s,d)=>s+d.kg,0);
  const requiredKg=calendar.demand(start,start+horizon);
  const needed=Math.max(0,requiredKg-stock.estimated-inbound);
  const cartons=Math.max(0,Math.ceil(needed/a.pack-1e-10));
  const urgent=shortage!==null&&shortage<a.lead;
  return {...stock,daily,currentMonth,daysLeft,shortage,orderIn,overdue,cartons,requiredKg,orderKg:cartons*a.pack,piecesPerPack:a.pack*1000/a.weight,status:!hasDemand?'idle':urgent?'critical':orderIn<=0?'order':'ok'};
}
export function parseBackup(raw) {
  const data=JSON.parse(raw);
  if(!data || ![1,2,3].includes(data.version) || !Array.isArray(data.articles) || data.articles.length>10000) throw new Error('Säkerhetskopians format stöds inte.');
  const articles=data.articles.map(a=>{
    if(data.version===1) {validateBase(a);return validateArticle({...a,stockDate:null,movements:[],plans:{}});}
    return validateArticle(data.version===2?{...a,plans:{}}:a);
  });
  if(!uniqueIds(articles)) throw new Error('Dubbla artikel-ID:n.');
  return articles;
}
