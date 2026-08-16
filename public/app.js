let token = sessionStorage.getItem('aetherisToken');
let state;
const $ = id => document.getElementById(id);
const money = n => Number(n).toLocaleString();
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2500)}
async function api(path, options={}){const r=await fetch(path,{...options,headers:{'content-type':'application/json',authorization:`Bearer ${token}`,...options.headers}});const data=await r.json();if(!r.ok)throw new Error(data.error);return data}
function options(select, includeMe=false){select.innerHTML=state.users.filter(u=>includeMe||u.name!==state.me.name).map(u=>`<option>${u.name}</option>`).join('')}
function render(next){state=next;$('me').textContent=state.me.name;$('balance').textContent=money(state.me.balance);options($('sendTo'));options($('requestFrom'));options($('adminTo'),true);
  $('requests').innerHTML=state.requests.length?state.requests.map(r=>`<div class="item"><p><b>${r.from===state.me.name?'You owe '+r.to:r.from+' owes you'}</b> · ${money(r.amount)} Æ</p><small>${r.note||'No note'}</small>${r.from===state.me.name?`<div class="item-actions"><button data-pay="${r.id}">Pay</button><button class="danger" data-decline="${r.id}">Decline</button></div>`:''}</div>`).join(''):'<p class="muted">No pending requests.</p>';
  $('activity').innerHTML=state.transactions.length?state.transactions.map(t=>`<div class="item"><p><b>${t.from===state.me.name?'−':'+'}${money(t.amount)} Æ</b> · ${t.from===state.me.name?'To '+t.to:'From '+t.from}</p><small>${t.note||new Date(t.at).toLocaleDateString()}</small></div>`).join(''):'<p class="muted">No transactions yet.</p>';
}
async function submit(path, data){try{render(await api(path,{method:'POST',body:JSON.stringify(data)}));toast('Done.')}catch(e){toast(e.message)}}
$('loginForm').onsubmit=async e=>{e.preventDefault();try{const d=await api('/api/login',{method:'POST',body:JSON.stringify({name:$('loginName').value,password:$('loginPassword').value})});token=d.token;sessionStorage.setItem('aetherisToken',token);render(d.state);$('login').hidden=true;$('app').hidden=false}catch(e){toast(e.message)}};
$('sendForm').onsubmit=e=>{e.preventDefault();submit('/api/send',{to:$('sendTo').value,amount:$('sendAmount').value,note:$('sendNote').value});e.target.reset()};
$('requestForm').onsubmit=e=>{e.preventDefault();submit('/api/request',{from:$('requestFrom').value,amount:$('requestAmount').value,note:$('requestNote').value});e.target.reset()};
$('adminForm').onsubmit=e=>{e.preventDefault();submit('/api/admin/give',{to:$('adminTo').value,amount:$('adminAmount').value,adminPassword:$('adminPassword').value});e.target.reset()};
$('requests').onclick=e=>{const id=e.target.dataset.pay||e.target.dataset.decline;if(id)submit('/api/request/respond',{id,accept:Boolean(e.target.dataset.pay)})};
document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b===btn));['send','request','admin'].forEach(id=>$(id).hidden=id!==btn.dataset.tab)});
$('logout').onclick=()=>{sessionStorage.clear();location.reload()};
if(token)api('/api/state').then(s=>{render(s);$('login').hidden=true;$('app').hidden=false}).catch(()=>sessionStorage.clear());
