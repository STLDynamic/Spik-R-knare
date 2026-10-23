import test from 'node:test';
import assert from 'node:assert/strict';
import { forecast, parseBackup, validateArticle, dateAfter, inventory, usageHistory, addMovement, voidMovement, monthlyPlan, monthAfter } from '../src/model.js';
const base = {id:'1',name:'2,5 × 45 Slätt',weight:1.8,pack:800,stock:800,stockDate:'2026-10-19',movements:[],plans:{},usage:140,unit:'kg',period:'week',lead:42,buffer:14,coverage:30,group:'Gładkie',supplier:'',notes:'',deliveries:[]};
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
test('backup validation',()=>{assert.deepEqual(parseBackup(JSON.stringify({version:2,articles:[base]})),[base]);assert.throws(()=>parseBackup(JSON.stringify({version:2,articles:[base,base]})));assert.throws(()=>validateArticle({...base,weight:0}));assert.throws(()=>validateArticle({...base,stock:-1}));assert.throws(()=>validateArticle({...base,deliveries:[{id:'d',date:'2026-02-30',kg:10}]}));assert.throws(()=>parseBackup('{"version":4,"articles":[]}'));});

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

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
test('monthly pieces convert to kg; actual month length and leap years are used',()=>{
  const a={...base,plans:{'2026-11':500000,'2028-02':500000}};
  const november=monthlyPlan(a,'2026-11','2026-10-23');
  assert.equal(november.plannedKg,900);assert.equal(november.rate,30);assert.equal(november.forecastKg,900);
  close(monthlyPlan(a,'2028-02','2026-10-23').rate,900/29);
  assert.equal(monthAfter('2026-12'),'2027-01');assert.equal(monthAfter('2027-01',-1),'2026-12');
});
test('blank month falls back to average; explicit zero overrides it',()=>{
  assert.equal(monthlyPlan(base,'2026-11',date).source,'average');
  assert.equal(monthlyPlan(base,'2026-11',date).rate,20);
  const a={...base,plans:{'2026-10':0}};
  assert.equal(monthlyPlan(a,'2026-10',date).source,'plan');assert.equal(monthlyPlan(a,'2026-10',date).rate,0);
  assert.equal(inventory(a,'2026-10-23').estimated,800);
  close(forecast(a,date).shortage,13+40); // No consumption Oct 19-31; average resumes Nov 1.
});
test('actual consumption is deducted from monthly total, not added to it',()=>{
  const a={...base,stock:5000,weight:2,stockDate:'2026-11-01',plans:{'2026-11':1000000},movements:[usage('u','2026-11-01','2026-11-10',700)]};
  const p=monthlyPlan(a,'2026-11','2026-11-11');
  close(p.plannedKg,2000);close(p.actualKg,700);close(p.remainingKg,1300);close(p.forecastKg,1300);close(p.rate,65);
  close(inventory(a,'2026-11-11').estimated,4300);
});
test('estimated past gaps plus actual and future demand sum to monthly plan',()=>{
  const a={...base,weight:2,stock:5000,stockDate:'2026-11-01',plans:{'2026-11':1000000},movements:[usage('u','2026-11-01','2026-11-05',350)]};
  const s=inventory(a,'2026-11-11'),p=monthlyPlan(a,'2026-11','2026-11-11');
  close(s.estimated,4320);assert.equal(s.estimatedDays,5);close(p.forecastKg,1320);
  close(350+(s.ledger-s.estimated)+p.forecastKg,2000);
});
test('inventory reset excludes monthly estimates before the new snapshot',()=>{
  const a={...base,weight:2,stockDate:'2026-11-01',plans:{'2026-11':1000000},movements:[count('c','2026-11-11',500)]};
  close(inventory(a,'2026-11-12').estimated,500-2000/30);
});
test('overrun warns and uses average on unrecorded days',()=>{
  const a={...base,plans:{'2026-10':10000},movements:[usage('u','2026-10-19','2026-10-21',90)]};
  const p=monthlyPlan(a,'2026-10','2026-10-23');
  assert.equal(p.exceeded,true);assert.equal(p.source,'exceeded');assert.equal(p.rate,20);
  assert.equal(inventory(a,'2026-10-23').estimated,690);
});
test('future peak triggers ordering even if current month and average are zero',()=>{
  const a={...base,stock:300,usage:0,lead:15,buffer:2,coverage:30,plans:{'2026-10':0,'2026-11':500000}};
  const f=forecast(a,'2026-10-23');
  close(f.shortage,9+10);assert.equal(f.orderIn,2);assert.equal(f.status,'ok');assert.equal(f.orderKg,800);
  const urgent=forecast({...a,lead:21},'2026-10-23');assert.equal(urgent.status,'critical');
});
test('depletion integrates different monthly rates and intervening deliveries',()=>{
  const a={...base,stock:50,weight:1,usage:0,stockDate:'2026-10-31',plans:{'2026-10':310000,'2026-11':600000},deliveries:[{id:'d',date:'2026-11-02',kg:100}]};
  // Oct 31 burns 10 kg. Nov 1 burns 20; Nov 2 receipt brings balance to 120.
  close(forecast(a,'2026-10-31').shortage,8);
  close(forecast({...a,deliveries:[{id:'late',date:'2026-11-04',kg:100}]},'2026-10-31').shortage,3);
});
test('order quantity integrates the horizon across months and rounds to packs',()=>{
  const a={...base,stock:100,usage:0,lead:10,buffer:0,coverage:30,plans:{'2026-10':0,'2026-11':500000,'2026-12':0}};
  const f=forecast(a,'2026-10-23');close(f.requiredKg,900);assert.equal(f.cartons,1);assert.equal(f.orderKg,800);
});
test('exact depletion followed by an on-time delivery avoids a false gap',()=>{
  const a={...base,stockDate:'2026-11-01',stock:30,usage:0,plans:{'2026-11':500000},deliveries:[{id:'d',date:'2026-11-02',kg:60}]};
  close(forecast(a,'2026-11-01').shortage,3);
});
test('no shortage is invented after a finite plan with no later consumption',()=>{
  const a={...base,stock:1000,usage:0,plans:{'2026-11':500000}};
  const f=forecast(a,'2026-10-23');assert.equal(f.shortage,null);assert.equal(f.status,'ok');assert.equal(f.orderKg,0);
});
test('today actual usage is not counted again in future demand',()=>{
  const a={...base,stockDate:'2026-11-01',stock:1000,usage:0,plans:{'2026-11':500000},movements:[usage('u','2026-11-01','2026-11-01',100)]};
  const f=forecast(a,'2026-11-01');close(f.estimated,900);close(f.requiredKg,800);
});
test('undo usage restores planned demand and removes actual from monthly profile',()=>{
  const a={...base,plans:{'2026-10':500000},movements:[usage('u','2026-10-19','2026-10-21',90)]};
  const undone=voidMovement(a,'u');assert.equal(monthlyPlan(undone,'2026-10','2026-10-23').actualKg,0);
  close(inventory(undone,'2026-10-23').estimated,800-4*900/31);
});
test('monthly actual spanning a year boundary is split proportionally',()=>{
  const a={...base,stockDate:'2026-12-01',plans:{'2026-12':100000,'2027-01':100000},movements:[usage('u','2026-12-30','2027-01-02',80)]};
  assert.equal(monthlyPlan(a,'2026-12','2027-01-03').actualKg,40);assert.equal(monthlyPlan(a,'2027-01','2027-01-03').actualKg,40);
});
test('v2 migration adds empty plans without modifying stock dates or history',()=>{
  const a={...base,movements:[usage('u',date,date,10)]};delete a.plans;
  const [result]=parseBackup(JSON.stringify({version:2,articles:[a]}));
  assert.deepEqual(result,{...a,plans:{}});assert.equal(a.plans,undefined);
});
test('v3 backup retains zero, planned pieces, missing months and history',()=>{
  const a={...base,plans:{'2026-10':0,'2026-11':500000},movements:[usage('u',date,date,10)]};
  const [result]=parseBackup(JSON.stringify({version:3,articles:[a]}));assert.deepEqual(result,a);assert.equal(Object.hasOwn(result.plans,'2026-12'),false);
  for(const plans of [{'2026-13':1},{'2026-11':-1},{'2026-11':0.5},{'2026-11':'500000'},[],null])assert.throws(()=>validateArticle({...base,plans}));
});
test('completed actual month overrides unconsumed planned amounts in totals',()=>{
  const a={...base,stockDate:'2026-11-01',plans:{'2026-11':500000},movements:[usage('u','2026-11-01','2026-11-30',100)]};
  const p=monthlyPlan(a,'2026-11','2026-12-01');
  assert.equal(p.plannedKg,900);assert.equal(p.actualKg,100);assert.equal(p.totalKg,100);assert.equal(p.forecastKg,0);
});
