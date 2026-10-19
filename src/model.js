export const DAY = 86400000;
export function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function dayNumber(date) { return Date.parse(`${date}T00:00:00Z`) / DAY; }
export function dateAfter(date, days) { return new Date((dayNumber(date) + days) * DAY).toISOString().slice(0,10); }
export function validateArticle(a) {
  if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !a.id || typeof a.name !== 'string' || !a.name.trim()) throw new Error('Artikeln måste ha ett ID och ett namn.');
  for (const key of ['weight','pack','stock','usage','lead','buffer','coverage']) {
    if (typeof a[key] !== 'number' || !Number.isFinite(a[key]) || a[key] < 0 || a[key] > 1e12) throw new Error(`Ogiltigt värde: ${key}.`);
  }
  if (a.weight <= 0 || a.pack <= 0 || a.coverage <= 0) throw new Error('Spikvikt, förpackningsvikt och extra täckning måste vara större än noll.');
  for (const key of ['lead','buffer','coverage']) if (!Number.isInteger(a[key]) || a[key] > 3650) throw new Error('Antalet dagar måste vara ett heltal mellan 0 och 3650.');
  if (!['week','month'].includes(a.period) || !['kg','pieces'].includes(a.unit)) throw new Error('Ogiltig förbrukningsenhet.');
  for (const key of ['supplier','group','notes']) if (typeof a[key] !== 'string') throw new Error('Ogiltiga artikeluppgifter.');
  if (!Array.isArray(a.deliveries)) throw new Error('Ogiltig leveranslista.');
  for (const d of a.deliveries) {
    if (!d || typeof d.id !== 'string' || typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !Number.isFinite(dayNumber(d.date)) || dateAfter(d.date,0) !== d.date || typeof d.kg !== 'number' || !Number.isFinite(d.kg) || d.kg <= 0 || d.kg > 1e12) throw new Error('Ogiltigt leveransdatum eller mängd.');
  }
  return a;
}
export function forecast(a, asOf = today()) {
  const daily = (a.unit === 'kg' ? a.usage : a.usage * a.weight / 1000) / (a.period === 'week' ? 7 : 365.25/12);
  const overdue = a.deliveries.filter(d => d.date < asOf);
  const future = a.deliveries.filter(d => d.date >= asOf).sort((x,y) => x.date.localeCompare(y.date));
  const daysLeft = daily > 0 ? a.stock / daily : Infinity;
  let balance = a.stock;
  let cursor = 0;
  let shortage = null;
  if (daily > 0) {
    for (const d of future) {
      const at = dayNumber(d.date) - dayNumber(asOf);
      if (balance / daily < at - cursor) { shortage = cursor + balance / daily; break; }
      balance = balance - (at - cursor) * daily + d.kg;
      cursor = at;
    }
    if (shortage === null) shortage = cursor + balance / daily;
  }
  const orderIn = shortage === null ? Infinity : Math.floor(shortage - a.lead - a.buffer);
  const horizon = a.lead + a.buffer + a.coverage;
  const inbound = future.filter(d => dayNumber(d.date) - dayNumber(asOf) <= horizon).reduce((s,d) => s+d.kg,0);
  const needed = Math.max(0, daily * horizon - a.stock - inbound);
  const cartons = Math.ceil(needed / a.pack - 1e-10);
  const urgent = daily > 0 && shortage < a.lead;
  return { daily, daysLeft, shortage, orderIn, overdue, cartons: Math.max(0,cartons), orderKg: Math.max(0,cartons)*a.pack, piecesPerPack: a.pack*1000/a.weight, status: daily === 0 ? 'idle' : urgent ? 'critical' : orderIn <= 0 ? 'order' : 'ok' };
}
export function parseBackup(raw) {
  const data = JSON.parse(raw);
  if (data.version !== 1 || !Array.isArray(data.articles) || data.articles.length > 10000) throw new Error('Säkerhetskopians format stöds inte.');
  data.articles.forEach(validateArticle);
  if (new Set(data.articles.map(a=>a.id)).size !== data.articles.length) throw new Error('Dubbla artikel-ID:n.');
  return data.articles;
}
