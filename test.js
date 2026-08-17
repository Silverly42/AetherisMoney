const test = require('node:test');
const assert = require('node:assert/strict');
const { initialDb, amount } = require('./server');
const fs = require('node:fs');
test('seeds the requested accounts',()=>assert.deepEqual(initialDb().users.map(u=>u.name),['Lucca','Conor','Rhys','Aleesha']));
test('accepts whole positive amounts',()=>assert.equal(amount('25'),25));
test('rejects invalid amounts',()=>{assert.throws(()=>amount(0));assert.throws(()=>amount(1.5));assert.throws(()=>amount('no'))});
test('shows the current sell prices',()=>{
  const html = fs.readFileSync('./public/index.html','utf8');
  for (const entry of ['All block types are worth 9×','Nuggets are worth one-ninth','Diamond</span><strong>2,250 M$','Lapis Lazuli</span><strong>125 M$','Netherite Ingot</span><strong>25,000 M$','Wheat</span><strong>7.5 M$ each','Sugar Cane</span><strong>12.5 M$ each','Raw Fish (all types)</span><strong>15 M$ each','Cooked Fish (all types)</span><strong>20 M$ each','Cobblestone / Other stone types</span><strong>2.5 M$','Netherrack</span><strong>2.5 M$','Any mob drop music disc</span><strong>10,000 M$']) assert.match(html,new RegExp(entry.replace('$','\\$').replaceAll('(','\\(').replaceAll(')','\\)')));
});
test('includes marketplace, shops, preorders, notifications, and all activity',()=>{
  const html = fs.readFileSync('./public/index.html','utf8');
  const app = fs.readFileSync('./public/app.js','utf8');
  const schema = fs.readFileSync('./supabase/schema.sql','utf8');
  for (const text of ['data-tab="buy"','data-tab="allActivity"','id="shopForm"','id="preorders"','id="notifications"']) assert.match(html,new RegExp(text));
  for (const rpc of ['create_shop','add_shop_product','buy_shop_product','create_preorder','get_all_activity']) assert.match(app,new RegExp(rpc));
  assert.match(schema,/three shops in the last 7 days/);
  assert.match(html,/<details class="card shop-creator">/);
  assert.match(html,/placeholder="Shop name"/);
  assert.match(fs.readFileSync('./public/style.css','utf8'),/\[hidden\]\)\{display:none!important\}/);
  assert.match(app,/data-shop-tab/);
  assert.match(app,/money-out/);
  assert.match(app,/money-in/);
  assert.match(app,/event\.kind==='grant'[\s\S]*Bank adjustment/);
});
test('Minecraft picker contains the complete 1.21.5 block dataset',()=>{
  const source = fs.readFileSync('./public/minecraft-blocks.js','utf8');
  assert.ok((source.match(/","/g)||[]).length > 1000);
  assert.match(source,/Oak Log/);
  assert.match(source,/Cherry Log/);
});
