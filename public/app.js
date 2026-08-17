const SUPABASE_URL='https://fqojtgmhjklwvgsaqulf.supabase.co';
const SUPABASE_KEY='sb_publishable_BdvjCbFkU_9sliZvRDR0mQ_fs3pbfuj';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let state={}; const $=id=>document.getElementById(id); const money=n=>Number(n).toLocaleString();
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2800)}
function player(id){return state.users.find(u=>u.id===id)?.name||'Bank'}
function note(text){return String(text||'').replace(/Aetheris Treasury|Treasury/gi,'Bank')}
async function load(){
 const {data:{user}}=await db.auth.getUser(); if(!user)throw Error('Please log in.');
 const [profiles,requests,transactions,shops,products,preorders,notifications,activity]=await Promise.all([db.from('profiles').select('*').order('name'),db.from('payment_requests').select('*').eq('status','pending').order('created_at',{ascending:false}),db.from('transactions').select('*').order('created_at',{ascending:false}).limit(20),db.from('shops').select('*').order('created_at',{ascending:false}),db.from('shop_products').select('*').order('created_at'),db.from('preorders').select('*').order('created_at',{ascending:false}),db.from('shop_notifications').select('*').order('created_at',{ascending:false}).limit(50),db.rpc('get_all_activity')]);
 for(const result of [profiles,requests,transactions])if(result.error)throw result.error;
 const marketReady=![shops,products,preorders,notifications,activity].some(result=>result.error);
 state={users:profiles.data,requests:requests.data,transactions:transactions.data,shops:shops.data||[],products:products.data||[],preorders:preorders.data||[],notifications:notifications.data||[],activity:activity.data||[],marketReady,me:profiles.data.find(p=>p.id===user.id)}; if(!state.me)throw Error('Player profile is not ready.'); render();
}
function options(select,includeMe=false){select.innerHTML=state.users.filter(u=>includeMe||u.id!==state.me.id).map(u=>`<option value="${u.id}">${u.name}</option>`).join('')}
function render(){
 $('me').textContent=state.me.name;$('balance').textContent=money(state.me.balance);options($('sendTo'));options($('requestFrom'));options($('adminTo'),true);
 const adminTab=document.querySelector('[data-tab="admin"]');
 adminTab.hidden=!state.me.is_admin;
 if(!state.me.is_admin&&adminTab.classList.contains('active'))document.querySelector('[data-tab="send"]').click();
 $('everyone').innerHTML=state.users.map(u=>`<div class="player-balance"><span class="player-avatar">${u.name[0]}</span><div><small>${u.name}${u.id===state.me.id?' · You':''}</small><strong>M$ ${money(u.balance)}</strong></div></div>`).join('');
 $('requests').innerHTML=state.requests.length?state.requests.map(r=>`<div class="item"><p><b>${r.payer_id===state.me.id?'You owe '+player(r.requester_id):player(r.payer_id)+' owes you'}</b> · M$ ${money(r.amount)}</p><small>${r.note||'No note'}</small>${r.payer_id===state.me.id?`<div class="item-actions"><button data-pay="${r.id}">Pay</button><button class="danger" data-decline="${r.id}">Decline</button></div>`:''}</div>`).join(''):'<p class="muted">No pending requests.</p>';
 $('activity').innerHTML=state.transactions.length?state.transactions.map(t=>`<div class="item"><p><b>${t.from_id===state.me.id?'−':'+'}M$ ${money(t.amount)}</b> · ${t.from_id===state.me.id?'To '+player(t.to_id):'From '+player(t.from_id)}</p><small>${note(t.note)||new Date(t.created_at).toLocaleDateString()}</small></div>`).join(''):'<p class="muted">No transactions yet.</p>';
 renderMarket();
}
function renderMarket(){
 if(!state.marketReady){$('shops').innerHTML='<section class="card"><p class="muted">Marketplace setup is waiting for the latest Supabase schema.</p></section>';$('shopAllowance').textContent='Setup required';return}
 const mine=state.shops.filter(shop=>shop.owner_id===state.me.id);
 const used=mine.filter(shop=>new Date(shop.created_at)>new Date(Date.now()-7*86400000)).length;
 $('shopAllowance').textContent=`${Math.max(0,3-used)} of 3 shops available this week`;
 $('listingShop').innerHTML=mine.length?mine.map(shop=>`<option value="${shop.id}">${esc(shop.name)}</option>`).join(''):'<option value="">Create a shop first</option>';
 $('shops').innerHTML=state.shops.length?state.shops.map(shop=>{
   const items=state.products.filter(product=>product.shop_id===shop.id);
   return `<section class="card shop-card"><header><div><h3>${esc(shop.name)}</h3><small>Run by ${esc(player(shop.owner_id))}</small></div></header><div>${items.length?items.map(product=>`<div class="product"><div><p><b>${esc(product.item_name)}</b></p><small>M$ ${money(product.price)} each · ${money(product.stock)} in stock</small></div><div class="product-actions">${shop.owner_id===state.me.id?'<small>Your listing</small>':`<button data-buy="${product.id}" ${product.stock<1?'disabled':''}>Buy</button><button class="ghost" data-preorder="${product.id}">Preorder</button>`}</div></div>`).join(''):'<p class="muted">No products yet.</p>'}</div></section>`
 }).join(''):'<section class="card"><p class="muted">No shops yet. Create the first one.</p></section>';
 $('preorders').innerHTML=state.preorders.length?state.preorders.map(order=>{const product=state.products.find(item=>item.id===order.product_id);return `<div class="item"><p><b>${money(order.quantity)} × ${esc(product?.item_name||'Item')}</b> · ${esc(order.status)}</p><small>${order.buyer_id===state.me.id?'From '+esc(player(order.seller_id)):'For '+esc(player(order.buyer_id))}</small></div>`}).join(''):'<p class="muted">No preorders yet.</p>';
 $('notifications').innerHTML=state.notifications.length?state.notifications.map(event=>`<div class="item"><p><b>${event.event_kind==='purchase'?'Purchase':'Preorder'}</b> · ${money(event.quantity)} × ${esc(event.item_name)}</p><small>${event.buyer_id===state.me.id?'From '+esc(player(event.seller_id)):'By '+esc(player(event.buyer_id))} · M$ ${money(event.total)} · ${new Date(event.created_at).toLocaleString()}</small></div>`).join(''):'<p class="muted">Nothing new from your shops.</p>';
 $('activityFeed').innerHTML=state.activity.length?state.activity.map(event=>`<div class="item"><p><b>M$ ${money(event.amount)}</b> · ${esc(event.from_name)} → ${esc(event.to_name)}</p><small>${event.kind==='marketplace'?'Shop purchase':event.kind==='grant'?'Bank adjustment':'Transfer'} · ${new Date(event.created_at).toLocaleString()}</small></div>`).join(''):'<p class="muted">No server activity yet.</p>';
}
async function rpc(name,args){const {error}=await db.rpc(name,args);if(error)throw error;await load();toast('Done.')}
$('loginForm').onsubmit=async e=>{e.preventDefault();try{const name=$('loginName').value.toLowerCase();const {error}=await db.auth.signInWithPassword({email:`${name}@aetheris.money`,password:$('loginPassword').value});if(error)throw error;await load();$('login').hidden=true;$('app').hidden=false}catch(e){toast(e.message)}};
$('sendForm').onsubmit=async e=>{e.preventDefault();try{await rpc('send_money',{recipient:$('sendTo').value,coins:Number($('sendAmount').value),memo:$('sendNote').value});e.target.reset()}catch(e){toast(e.message)}};
$('requestForm').onsubmit=async e=>{e.preventDefault();try{await rpc('request_money',{payer:$('requestFrom').value,coins:Number($('requestAmount').value),memo:$('requestNote').value});e.target.reset()}catch(e){toast(e.message)}};
$('adminForm').onsubmit=async e=>{e.preventDefault();try{const amount=Number($('adminAmount').value);const coins=$('adminAction').value==='remove'?-amount:amount;await rpc('admin_adjust',{recipient:$('adminTo').value,coins,memo:$('adminReason').value});e.target.reset()}catch(e){toast(e.message)}};
$('shopForm').onsubmit=async e=>{e.preventDefault();try{await rpc('create_shop',{shop_name:$('shopName').value});e.target.reset()}catch(e){toast(e.message)}};
$('listingForm').onsubmit=async e=>{e.preventDefault();try{await rpc('add_shop_product',{target_shop:Number($('listingShop').value),product_name:$('listingItem').value,unit_price:Number($('listingPrice').value),quantity:Number($('listingStock').value)});e.target.reset()}catch(e){toast(e.message)}};
$('shops').onclick=async e=>{const productId=e.target.dataset.buy||e.target.dataset.preorder;if(!productId)return;const quantity=Number(prompt(`How many would you like to ${e.target.dataset.buy?'buy':'preorder'}?`,'1'));if(!Number.isInteger(quantity)||quantity<1)return;try{await rpc(e.target.dataset.buy?'buy_shop_product':'create_preorder',{target_product:Number(productId),quantity})}catch(err){toast(err.message)}};
$('requests').onclick=async e=>{const id=e.target.dataset.pay||e.target.dataset.decline;if(id)try{await rpc('respond_request',{request_id:Number(id),accept_request:Boolean(e.target.dataset.pay)})}catch(err){toast(err.message)}};
document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b===btn));['send','request','buy','allActivity','sell','admin'].forEach(id=>{const page=$(id);const active=id===btn.dataset.tab;page.hidden=!active;page.style.display=active?'':'none'})});
$('logout').onclick=async()=>{await db.auth.signOut();location.reload()};
db.auth.getSession().then(({data})=>{if(data.session)load().then(()=>{$('login').hidden=true;$('app').hidden=false}).catch(e=>toast(e.message))});
$('minecraftBlocks').innerHTML=(window.MINECRAFT_BLOCKS||[]).map(name=>`<option value="${esc(name)}"></option>`).join('');
