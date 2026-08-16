const SUPABASE_URL='https://fqojtgmhjklwvgsaqulf.supabase.co';
const SUPABASE_KEY='sb_publishable_BdvjCbFkU_9sliZvRDR0mQ_fs3pbfuj';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let state={}; const $=id=>document.getElementById(id); const money=n=>Number(n).toLocaleString();
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2800)}
function player(id){return state.users.find(u=>u.id===id)?.name||'Bank'}
async function load(){
 const {data:{user}}=await db.auth.getUser(); if(!user)throw Error('Please log in.');
 const [profiles,requests,transactions]=await Promise.all([db.from('profiles').select('*').order('name'),db.from('payment_requests').select('*').eq('status','pending').order('created_at',{ascending:false}),db.from('transactions').select('*').order('created_at',{ascending:false}).limit(20)]);
 for(const result of [profiles,requests,transactions])if(result.error)throw result.error;
 state={users:profiles.data,requests:requests.data,transactions:transactions.data,me:profiles.data.find(p=>p.id===user.id)}; if(!state.me)throw Error('Player profile is not ready.'); render();
}
function options(select,includeMe=false){select.innerHTML=state.users.filter(u=>includeMe||u.id!==state.me.id).map(u=>`<option value="${u.id}">${u.name}</option>`).join('')}
function render(){
 $('me').textContent=state.me.name;$('balance').textContent=money(state.me.balance);options($('sendTo'));options($('requestFrom'));options($('adminTo'),true);
 const adminTab=document.querySelector('[data-tab="admin"]');
 adminTab.hidden=!state.me.is_admin;
 if(!state.me.is_admin&&adminTab.classList.contains('active'))document.querySelector('[data-tab="send"]').click();
 $('everyone').innerHTML=state.users.map(u=>`<div class="player-balance"><span class="player-avatar">${u.name[0]}</span><div><small>${u.name}${u.id===state.me.id?' · You':''}</small><strong>M$ ${money(u.balance)}</strong></div></div>`).join('');
 $('requests').innerHTML=state.requests.length?state.requests.map(r=>`<div class="item"><p><b>${r.payer_id===state.me.id?'You owe '+player(r.requester_id):player(r.payer_id)+' owes you'}</b> · M$ ${money(r.amount)}</p><small>${r.note||'No note'}</small>${r.payer_id===state.me.id?`<div class="item-actions"><button data-pay="${r.id}">Pay</button><button class="danger" data-decline="${r.id}">Decline</button></div>`:''}</div>`).join(''):'<p class="muted">No pending requests.</p>';
 $('activity').innerHTML=state.transactions.length?state.transactions.map(t=>`<div class="item"><p><b>${t.from_id===state.me.id?'−':'+'}M$ ${money(t.amount)}</b> · ${t.from_id===state.me.id?'To '+player(t.to_id):'From '+player(t.from_id)}</p><small>${t.note||new Date(t.created_at).toLocaleDateString()}</small></div>`).join(''):'<p class="muted">No transactions yet.</p>';
}
async function rpc(name,args){const {error}=await db.rpc(name,args);if(error)throw error;await load();toast('Done.')}
$('loginForm').onsubmit=async e=>{e.preventDefault();try{const name=$('loginName').value.toLowerCase();const {error}=await db.auth.signInWithPassword({email:`${name}@aetheris.money`,password:$('loginPassword').value});if(error)throw error;await load();$('login').hidden=true;$('app').hidden=false}catch(e){toast(e.message)}};
$('sendForm').onsubmit=async e=>{e.preventDefault();try{await rpc('send_money',{recipient:$('sendTo').value,coins:Number($('sendAmount').value),memo:$('sendNote').value});e.target.reset()}catch(e){toast(e.message)}};
$('requestForm').onsubmit=async e=>{e.preventDefault();try{await rpc('request_money',{payer:$('requestFrom').value,coins:Number($('requestAmount').value),memo:$('requestNote').value});e.target.reset()}catch(e){toast(e.message)}};
$('adminForm').onsubmit=async e=>{e.preventDefault();try{const amount=Number($('adminAmount').value);const coins=$('adminAction').value==='remove'?-amount:amount;await rpc('admin_adjust',{recipient:$('adminTo').value,coins});e.target.reset()}catch(e){toast(e.message)}};
$('requests').onclick=async e=>{const id=e.target.dataset.pay||e.target.dataset.decline;if(id)try{await rpc('respond_request',{request_id:Number(id),accept_request:Boolean(e.target.dataset.pay)})}catch(err){toast(err.message)}};
document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b===btn));['send','request','admin'].forEach(id=>$(id).hidden=id!==btn.dataset.tab)});
$('logout').onclick=async()=>{await db.auth.signOut();location.reload()};
db.auth.getSession().then(({data})=>{if(data.session)load().then(()=>{$('login').hidden=true;$('app').hidden=false}).catch(e=>toast(e.message))});
