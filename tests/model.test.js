import test from 'node:test';
import assert from 'node:assert/strict';
import { forecast, parseBackup, validateArticle, dateAfter, inventory, usageHistory, addMovement, voidMovement } from '../src/model.js';
const base = {id:'1',name:'2,5 × 45 Slätt',weight:1.8,pack:800,stock:800,stockDate:'2026-10-19',movements:[],usage:140,unit:'kg',period:'week',lead:42,buffer:14,coverage:30,group:'Gładkie',supplier:'',notes:'',deliveries:[]};
const date='2026-10-19';
test('800 kg / 1.8 g and ordering whole cartons',()=>{const f=forecast(base,date);assert.ok(Math.abs(f.piecesPerPack-444444.444444)<0.001);assert.equal(f.daysLeft,40);assert.equal(f.orderIn,-16);assert.equal(f.status,'critical');assert.equal(f.orderKg,1600);assert.equal(f.cartons,2);});
test('piece usage and monthly units',()=>{assert.equal(forecast({...base,usage:70000,unit:'pieces'},date).daily,18);assert.equal(forecast({...base,usage:365.25,period:'month'},date).daily,12);});
test('on-time supply extends coverage',()=>{const f=forecast({...base,deliveries:[{id:'d',date:dateAfter(date,20),kg:800}]},date);assert.equal(f.shortage,80);assert.equal(f.orderIn,24);assert.equal(f.orderKg,800);assert.equal(f.status,'ok');});
test('late supply does not hide earlier shortage',()=>{const f=forecast({...base,deliveries:[{id:'d',date:dateAfter(date,45),kg:2000}]},date);assert.equal(f.shortage,40);assert.equal(f.status,'critical');assert.equal(f.orderKg,0);});
test('overdue deliveries excluded',()=>{const f=forecast({...base,deliveries:[{id:'d',date:'2026-10-18',kg:800}]},date);assert.equal(f.shortage,40);assert.equal(f.overdue.length,1);assert.equal(f.orderKg,1600);});
test('delivery on depletion day prevents gap',()=>{assert.equal(forecast({...base,deliveries:[{id:'d',date:dateAfter(date,40),kg:800}]},date).shortage,80);});
test('zero consumption',()=>{const f=forecast({...base,usage:0},date);assert.equal(f.shortage,null);assert.equal(f.orderKg,0);assert.equal(f.status,'idle');});
test('zero stock',()=>{assert.equal(forecast({...base,stock:0},date).shortage,0);assert.equal(forecast({...base,stock:0},date).status,'critical');});
test('reorder boundary and exact cartons',()=>{const f=forecast({...base,stock:1120,coverage:40},date);assert.equal(f.orderIn,0);assert.equal(f.status,'order');assert.equal(f.orderKg,800);});
test('backup validation',()=>{assert.deepEqual(parseBackup(JSON.stringify({version:2,articles:[base]})),[base]);assert.throws(()=>parseBackup(JSON.stringify({version:2,articles:[base,base]})));assert.throws(()=>validateArticle({...base,weight:0}));assert.throws(()=>validateArticle({...base,stock:-1}));assert.throws(()=>validateArticle({...base,deliveries:[{id:'d',date:'2026-02-30',kg:10}]}));assert.throws(()=>parseBackup('{"version":3,"articles":[]}'));});

const usage=(id,from,date,kg)=>({id,type:'usage',from,date,kg,note:'Produktion',voided:false});
const receipt=(id,date,kg)=>({id,type:'receipt',date,kg,note:'Leverans',voided:false});
const count=(id,date,kg)=>({id,type:'count',date,kg,note:'Inventerat',voided:false});
test('dated stock ages: depletion date remains fixed without updates',()=>{
  const first=forecast(base,date),later=forecast(base,'2026-10-26');
  assert.equal(later.estimated,660);assert.equal(later.ledger,800);assert.equal(later.estimatedDays,7);
  assert.equal(dateAfter(date,first.shortage),dateAfter('2026-10-26',later.shortage));
  assert.equal(later.orderIn,first.orderIn-7);
});
test('actual usage replaces estimates for the full inclusive period',()=>{
  const a={...base,movements:[usage('u','2026-10-19','2026-10-21',90)]};
  const s=inventory(a,'2026-10-23');
  assert.equal(s.ledger,710);assert.equal(s.estimatedDays,1);assert.equal(s.estimated,690);
});
test('actual usage today is deducted but no additional estimate for today',()=>{
  const s=inventory({...base,movements:[usage('u',date,date,30)]},date);
  assert.equal(s.ledger,770);assert.equal(s.estimated,770);assert.equal(s.estimatedDays,0);
});
test('receipt does not restart the consumption clock',()=>{
  const s=inventory({...base,movements:[receipt('r','2026-10-22',800)]},'2026-10-26');
  assert.equal(s.ledger,1600);assert.equal(s.estimated,1460);assert.equal(s.estimatedDays,7);
});
test('new counted opening balance supersedes previous days, preserves later receipts',()=>{
  const a={...base,movements:[receipt('old','2026-10-20',800),usage('u','2026-10-19','2026-10-21',90),count('c','2026-10-22',1000),receipt('r','2026-10-22',200)]};
  const s=inventory(a,'2026-10-23');
  assert.equal(s.ledger,1200);assert.equal(s.countKg,1000);assert.equal(s.countDate,'2026-10-22');assert.equal(s.estimated,1180);
});
test('backdated corrections split aggregate usage evenly at the snapshot date',()=>{
  const a={...base,movements:[usage('u','2026-10-19','2026-10-22',80),count('c','2026-10-21',700)]};
  const s=inventory(a,'2026-10-23');
  assert.equal(s.ledger,660);assert.equal(s.estimated,660);assert.equal(s.estimatedDays,0);
});
test('receipt from a planned delivery is atomic and undo restores the delivery',()=>{
  const d={id:'d',date:'2026-10-21',kg:800},a={...base,deliveries:[d]};
  const next=addMovement(a,{...receipt('r','2026-10-22',800),delivery:d},'2026-10-23');
  assert.equal(next.deliveries.length,0);assert.equal(next.movements.length,1);assert.equal(a.deliveries.length,1);
  assert.equal(inventory(next,'2026-10-23').ledger,1600);
  assert.throws(()=>addMovement(next,{...receipt('r2','2026-10-22',800),delivery:d},'2026-10-23'));
  const undone=voidMovement(next,'r');
  assert.deepEqual(undone.deliveries,[d]);assert.equal(undone.movements[0].voided,true);assert.equal(inventory(undone,'2026-10-23').ledger,800);
});
test('undo keeps history and releases the actual usage period for reentry',()=>{
  const a={...base,movements:[usage('u','2026-10-19','2026-10-21',90)]};
  const undone=voidMovement(a,'u');
  assert.equal(undone.movements.length,1);assert.equal(inventory(undone,'2026-10-23').estimated,720);
  const fixed=addMovement(undone,usage('u2','2026-10-19','2026-10-21',60),'2026-10-23');
  assert.equal(fixed.movements.length,2);assert.equal(inventory(fixed,'2026-10-23').estimated,720);
});
test('undo latest inventory returns to earlier snapshot',()=>{
  const a={...base,movements:[count('c','2026-10-22',1000)]};
  assert.equal(inventory(voidMovement(a,'c'),'2026-10-23').estimated,720);
});
test('reject overlapping actual usage periods, allow adjacent periods',()=>{
  const a={...base,movements:[usage('u','2026-10-19','2026-10-21',90)]};
  assert.throws(()=>addMovement(a,usage('overlap','2026-10-21','2026-10-22',30),'2026-10-23'),/överlappa/);
  assert.equal(addMovement(a,usage('adjacent','2026-10-22','2026-10-23',40),'2026-10-23').movements.length,2);
});
test('historical average uses only recorded days and ignores voided entries',()=>{
  const a={...base,movements:[usage('u','2026-10-19','2026-10-21',90),{...usage('v','2026-10-22','2026-10-23',900),voided:true}]};
  assert.deepEqual(usageHistory(a,'2026-10-23'),{days:3,kg:90,weekly:210});
  assert.deepEqual(usageHistory(base,'2026-10-23'),{days:0,kg:0,weekly:null});
});
test('historical average weights an interval crossing the last-30-day boundary',()=>{
  const a={...base,stockDate:'2026-09-01',movements:[usage('u','2026-09-20','2026-09-29',100)]};
  assert.deepEqual(usageHistory(a,'2026-10-23'),{days:6,kg:60,weekly:70});
});
test('estimated stock clamps to zero while retaining shortage warning',()=>{
  const s=inventory({...base,stock:10},'2026-10-23');
  assert.equal(s.estimated,0);assert.equal(s.deficit,70);assert.equal(forecast({...base,stock:10},'2026-10-23').status,'critical');
});
test('legacy imports preserve values and require explicit dating',()=>{
  const legacy={...base};delete legacy.stockDate;delete legacy.movements;
  const [migrated]=parseBackup(JSON.stringify({version:1,articles:[legacy]}));
  assert.equal(migrated.stock,800);assert.equal(migrated.id,base.id);assert.equal(migrated.stockDate,null);assert.deepEqual(migrated.movements,[]);
  const f=forecast(migrated,'2026-10-23');assert.equal(f.status,'unconfirmed');assert.equal(f.orderKg,null);assert.equal(f.estimated,null);
  assert.throws(()=>addMovement(migrated,receipt('r','2026-10-23',800),'2026-10-23'));
});
test('v2 backup round trip preserves all movements including undo and delivery link',()=>{
  const a={...base,movements:[usage('u','2026-10-19','2026-10-21',90),{...receipt('r','2026-10-22',800),delivery:{id:'d',date:'2026-10-22',kg:800},voided:true}]};
  assert.deepEqual(parseBackup(JSON.stringify({version:2,articles:[a]})),[a]);
});
test('invalid dates, negative amounts, duplicate ids and future operations are rejected',()=>{
  assert.throws(()=>validateArticle({...base,stockDate:'2026-02-30'}));
  assert.throws(()=>addMovement(base,receipt('r','2026-10-24',800),'2026-10-23'),/framtiden/);
  assert.throws(()=>addMovement(base,receipt('r','2026-10-18',800),'2026-10-23'));
  assert.throws(()=>validateArticle({...base,movements:[receipt('r',date,-1)]}));
  assert.throws(()=>validateArticle({...base,movements:[receipt('r',date,1),receipt('r',date,1)]}));
  assert.throws(()=>voidMovement({...base,movements:[{...receipt('r',date,1),voided:true}]},'r'));
});
test('recorded zero consumption suppresses estimates during shutdown days',()=>{
  const a=addMovement(base,usage('shutdown','2026-10-19','2026-10-22',0),'2026-10-23');
  assert.equal(inventory(a,'2026-10-23').estimated,800);
  assert.deepEqual(usageHistory(a,'2026-10-23'),{kg:0,days:4,weekly:0});
});
