const test = require('node:test');
const assert = require('node:assert/strict');
const { initialDb, amount } = require('./server');
const fs = require('node:fs');
test('seeds the current accounts',()=>assert.deepEqual(initialDb().users.map(u=>u.name),['Lucca','Conor','Rhys','Aleesha','Tiernan','Michael']));
test('fully replaces Daniel with a fresh Michael account',()=>{
  const html=fs.readFileSync('./public/index.html','utf8');
  const schema=fs.readFileSync('./supabase/schema.sql','utf8');
  assert.match(html,/<option>Michael<\/option>/);
  assert.doesNotMatch(html,/Daniel/i);
  assert.match(schema,/delete from public\.transactions where from_id=daniel_id or to_id=daniel_id/);
  assert.match(schema,/delete from auth\.users where id=daniel_id/);
  assert.match(schema,/check \(name in \('Lucca','Conor','Rhys','Aleesha','Tiernan','Michael'\)\)/);
  assert.match(schema,/lower\(split_part\(email,'@',1\)\) in \('lucca','conor','rhys','aleesha','tiernan','michael'\)/);
});
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
  assert.match(app,/event\.kind==='grant'[\s\S]*'From Bank':'To Bank'/);
  assert.match(app,/event\.kind==='trade'\?'Player trade'/);
  assert.match(schema,/where auth\.uid\(\) is not null order by t\.created_at desc, t\.id desc/);
});

test('all activity is not capped and uses deterministic newest-first ordering',()=>{
  const schema=fs.readFileSync('supabase/schema.sql','utf8');
  assert.doesNotMatch(schema,/get_all_activity[\s\S]*?limit\s+100/i);
  assert.match(schema,/order by t\.created_at desc, t\.id desc/);
});
test('schema can replace an existing decimal all-activity function',()=>{
  const schema=fs.readFileSync('supabase/schema.sql','utf8');
  const firstDefinition=schema.indexOf('create or replace function public.get_all_activity()');
  const precedingDrop=schema.indexOf('drop function if exists public.get_all_activity()');
  assert.ok(precedingDrop>=0 && precedingDrop<firstDefinition);
});
test('supports decimal currency and owner-managed customizable shops',()=>{
  const html=fs.readFileSync('./public/index.html','utf8');
  const app=fs.readFileSync('./public/app.js','utf8');
  const schema=fs.readFileSync('./supabase/schema.sql','utf8');
  for(const id of ['shopDescription','shopColor','shopDimension','shopX','shopY','shopZ'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/id="sendAmount"[^>]*step="0\.01"/);
  assert.match(html,/id="requestAmount"[^>]*step="0\.01"/);
  assert.match(html,/id="adminAmount"[^>]*step="0\.01"/);
  for(const rpc of ['update_shop','update_shop_product','adjust_shop_stock','delete_shop_product'])assert.match(app,new RegExp(rpc));
  assert.match(schema,/alter column balance type numeric\(18,2\)/);
  assert.match(schema,/create or replace function public\.valid_money/);
  assert.match(schema,/coord_x integer/);
});
test('Minecraft picker contains the complete 1.21.5 block dataset',()=>{
  const source = fs.readFileSync('./public/minecraft-blocks.js','utf8');
  assert.ok((source.match(/","/g)||[]).length > 1200);
  assert.match(source,/Oak Log/);
  assert.match(source,/Cherry Log/);
  assert.match(source,/Iron Ingot/);
  assert.match(source,/Cooked Cod/);
  assert.doesNotMatch(source,/"Air"/);
  assert.doesNotMatch(source,/"Command Block"/);
  assert.doesNotMatch(source,/"Debug Stick"/);
  assert.doesNotMatch(source,/Spawn Egg/);
  assert.doesNotMatch(source,/"Test Block"/);
});
test('includes secure player trading, money offers, values, and trade history',()=>{
  const html = fs.readFileSync('./public/index.html','utf8');
  const app = fs.readFileSync('./public/app.js','utf8');
  const schema = fs.readFileSync('./supabase/schema.sql','utf8');
  for(const text of ['data-tab="trade"','id="tradeForm"','id="tradeGiveMoney"','id="tradeGetMoney"','id="openTrades"','id="recentTrades"'])assert.match(html,new RegExp(text));
  for(const text of ['create_trade','respond_trade','cancel_trade','Rough value'])assert.match(app,new RegExp(text));
  assert.match(schema,/create table if not exists public\.trades/);
  assert.match(schema,/create or replace function public\.respond_trade/);
  assert.match(schema,/for update/);
  assert.match(app,/tradeGiveItem'\)\.value\.trim\(\).*addTradeItem\('give'\)/);
  assert.match(app,/tradeGetItem'\)\.value\.trim\(\).*addTradeItem\('get'\)/);
  assert.match(fs.readFileSync('./public/minecraft-blocks.js','utf8'),/"Enchanted Book"/);
});
test('previews totals and resulting balances for money actions',()=>{
  const html=fs.readFileSync('./public/index.html','utf8');
  const app=fs.readFileSync('./public/app.js','utf8');
  for(const id of ['sendPreviewAmount','sendBalanceAfter','requestPreviewAmount','requestBalanceAfter'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(app,/Balance after: M\$/);
  assert.match(app,/Total: M\$/);
});
test('shops support Minecraft and custom listings',()=>{
  const html=fs.readFileSync('./public/index.html','utf8');
  const app=fs.readFileSync('./public/app.js','utf8');
  assert.match(html,/id="listingType"/);
  for(const option of ['Minecraft block','Minecraft item','Custom item or service'])assert.match(html,new RegExp(option));
  assert.match(app,/product=>product\.shop_id===shop\.id\)/);
  assert.match(app,/custom item or service|special offer/i);
});
test('both preorder parties can finish or cancel pending orders',()=>{
  const app=fs.readFileSync('./public/app.js','utf8');
  const schema=fs.readFileSync('./supabase/schema.sql','utf8');
  assert.match(app,/data-preorder-finish/);
  assert.match(app,/data-preorder-cancel/);
  assert.match(app,/respond_preorder/);
  assert.match(schema,/auth\.uid\(\) in \(buyer_id,seller_id\)/);
  assert.match(schema,/finish_preorder then 'completed' else 'cancelled'/);
});
test('shop owners can securely delete their shops',()=>{
  const app=fs.readFileSync('./public/app.js','utf8');
  const schema=fs.readFileSync('./supabase/schema.sql','utf8');
  assert.match(app,/data-delete-shop/);
  assert.match(app,/delete_shop/);
  assert.match(schema,/delete from shops where id=target_shop and owner_id=auth\.uid\(\)/);
  assert.match(schema,/grant execute on function[\s\S]*public\.delete_shop\(bigint\)/);
});
test('players can hide only their own balance from everyone else',()=>{
  const html=fs.readFileSync('./public/index.html','utf8');
  const app=fs.readFileSync('./public/app.js','utf8');
  assert.match(html,/id="moneyVisibility"/);
  assert.match(app,/u\.balance_hidden&&u\.id!==state\.me\.id\?'Hidden'/);
  assert.match(app,/set_balance_visibility/);
  assert.match(app,/get_player_profiles/);
  const schema=fs.readFileSync('./supabase/schema.sql','utf8');
  assert.match(schema,/add column if not exists balance_hidden/);
  assert.match(schema,/case when not p\.balance_hidden or p\.id=auth\.uid\(\) then p\.balance else null end/);
  assert.match(schema,/revoke select on public\.profiles from authenticated/);
  assert.match(schema,/grant usage on schema public to authenticated/);
  const hotfix=fs.readFileSync('./supabase/balance-privacy-hotfix.sql','utf8');
  assert.match(hotfix,/grant execute on function public\.get_player_profiles\(\) to authenticated/);
  assert.match(hotfix,/grant execute on function public\.set_balance_visibility\(boolean\) to authenticated/);
  assert.match(hotfix,/revoke select on public\.profiles from authenticated/);
  assert.doesNotMatch(app,/aetheris-hide-money/);
});
test('hidden players have their Bank activity amounts masked from everyone else',()=>{
  const app=fs.readFileSync('./public/app.js','utf8');
  assert.match(app,/event\.from_name==='Bank'\?event\.to_name:event\.from_name/);
  assert.match(app,/user\.id!==state\.me\.id&&user\.balance_hidden/);
  assert.match(app,/hiddenPlayer\?'\?\?\?\?\?\?':money\(event\.amount\)/);
});
test('shop purchases support an optional seller description',()=>{
  const app=fs.readFileSync('./public/app.js','utf8');
  const schema=fs.readFileSync('./supabase/schema.sql','utf8');
  assert.match(app,/Optional description for the seller/);
  assert.match(app,/quantity,description/);
  assert.match(app,/event\.description/);
  assert.match(schema,/shop_notifications add column if not exists description text/);
  assert.match(schema,/buy_shop_product\(target_product bigint, quantity bigint default 1, description text default ''\)/);
  assert.match(schema,/btrim\(coalesce\(description,''\)\)/);
});
