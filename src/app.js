import {supabase} from './supabaseClient.js';
import {signUp,signIn,signOut,resetPassword} from './auth.js';
import {bindUI} from './ui.js';

const CURRENCIES=['MAD','XOF','XAF','CDF','GNF','GHS','EUR','USD'];
const COUNTRIES={Maroc:['Casablanca','Rabat','Marrakech','Agadir','Tanger','Fès','Meknès'],Côte_d_Ivoire:['Abidjan','Bouaké','Yamoussoukro'],Sénégal:['Dakar','Thiès','Saint-Louis'],Mali:['Bamako','Sikasso','Ségou'],Guinée:['Conakry','Kankan'],Ghana:['Accra','Kumasi'],Cameroun:['Douala','Yaoundé'],RDC:['Kinshasa','Lubumbashi']};
const state={view:'market',session:null,profile:null,signup:false,listings:[],deferredInstall:null};
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function toast(t,error=false){const e=$('#toast');e.textContent=t;e.className='toast show'+(error?' error':'');clearTimeout(toast.t);toast.t=setTimeout(()=>e.className='toast',4200)}
function refCode(){return localStorage.getItem('frik_ref')||new URLSearchParams(location.search).get('ref')||''}
if(new URLSearchParams(location.search).get('ref'))localStorage.setItem('frik_ref',new URLSearchParams(location.search).get('ref').toUpperCase());

function go(view,push=true){if(['dash','ambassador'].includes(view)&&!state.session)view='auth';state.view=view;render();if(push)history.pushState({view},'',view==='market'?location.pathname:location.pathname+'#'+view)}
function openModal(html){$('#modal').innerHTML=html;$('#modal').classList.add('show');history.pushState({modal:true},'',location.pathname+'#modal')}
function closeModal(back=true){$('#modal').classList.remove('show');$('#modal').innerHTML='';if(back&&history.state?.modal)history.back()}
window.addEventListener('popstate',()=>{if($('#modal').classList.contains('show')){closeModal(false);return}state.view='market';render()});
const opts=(a,c='')=>a.map(x=>'<option value="'+esc(x)+'" '+(x===c?'selected':'')+'>'+esc(x)+'</option>').join('');

async function loadProfile(){if(!state.session){state.profile=null;return}const {data,error}=await supabase.from('profiles').select('id,full_name,referral_code,is_ambassador,created_at,referred_by').eq('id',state.session.user.id).maybeSingle();if(error)toast(error.message,true);state.profile=data||null}

async function market(){
 let q=supabase.from('public_listings').select('*').order('created_at',{ascending:false}).limit(80);
 const t=$('#filter-type')?.value||'',c=$('#filter-currency')?.value||'',city=($('#filter-city')?.value||'').trim();
 if(t)q=q.eq('type',t);if(c)q=q.eq('currency',c);if(city)q=q.ilike('city','%'+city+'%');
 const {data,error}=await q;
 if(error){$('#market').innerHTML='<div class="empty">Impossible de charger les annonces.</div>';return}
 state.listings=data||[];
 $('#market').innerHTML=state.listings.map(x=>'<article class="card"><span class="tag">'+esc(x.type)+'</span><h3>'+esc(x.amount??'')+' '+esc(x.currency)+'</h3><p>'+esc(x.country)+' • '+esc(x.city)+(x.district?' • '+esc(x.district):'')+'</p><p class="muted">'+(x.is_traveler?'✈️ Voyageur / GP • ':'')+(x.amount_desired?'Contrepartie: '+esc(x.amount_desired)+' '+esc(x.desired_currency||''):'')+'</p><div class="actions"><button class="primary" data-action="unlock" data-id="'+x.id+'">Débloquer le WhatsApp</button></div></article>').join('')||'<div class="empty">Aucune annonce approuvée pour ces critères.</div>';
}

function authView(){const s=state.signup;$('#auth-title').textContent=s?'Créer mon compte':'Connexion';$('#signup-fields').classList.toggle('hidden',!s);$('#auth-submit').textContent=s?'Créer mon compte':'Se connecter';$('#auth-ref').value=refCode();const b=document.querySelector('[data-action="toggle-auth"]');if(b)b.textContent=s?'J’ai déjà un compte':'Créer un compte'}

function authForm(){
 const f=$('#auth-form');f.onsubmit=async e=>{e.preventDefault();try{
  if(state.signup){const r=await signUp({email:$('#auth-email').value.trim(),password:$('#auth-password').value,fullName:$('#auth-name').value.trim(),phone:$('#auth-phone').value.trim(),referralCode:$('#auth-ref').value.trim()});if(r.error)throw r.error;toast(r.data.session?'Compte créé.':'Compte créé. Vérifiez votre email si nécessaire.');if(r.data.session){state.session=r.data.session;await loadProfile();go('dash')}}
  else{const r=await signIn($('#auth-email').value.trim(),$('#auth-password').value);if(r.error)throw r.error;state.session=r.data.session;await loadProfile();toast('Connexion réussie.');go('dash')}
 }catch(e){toast(e.message||'Erreur d’authentification.',true)}};
}

function listingForm(x=null){
 if(!state.session)return go('auth');
 x=x||{};
 openModal('<div class="modal"><button class="close" data-action="close-modal">×</button><span class="tag">ANNONCE</span><h2>'+ (x.id?'Modifier':'Publier') +' une annonce</h2><form id="listing-form" class="form" data-form><div class="two"><label class="field">Type<select name="type"><option '+(x.type==='OFFRE'?'selected':'')+'>OFFRE</option><option '+(x.type==='BESOIN'?'selected':'')+'>BESOIN</option><option '+(x.type==='VOYAGEUR_GP'?'selected':'')+'>VOYAGEUR_GP</option></select></label><label class="field">Devise<select name="amount_currency">'+opts(CURRENCIES,x.amount_currency||x.currency)+'</select></label></div><div class="two"><label class="field">Montant<input name="amount" type="number" min="0" step=".01" required value="'+esc(x.amount??'')+'"></label><label class="field">Montant souhaité<input name="amount_desired" type="number" min="0" step=".01" value="'+esc(x.amount_desired??'')+'"></label></div><div class="two"><label class="field">Devise souhaitée<select name="desired_currency">'+opts(CURRENCIES,x.desired_currency||x.currency)+'</select></label><label class="field">Pays<select name="country">'+opts(Object.keys(COUNTRIES),x.country||'Maroc')+'</select></label></div><div class="two"><label class="field">Ville<select id="city" name="city">'+opts(COUNTRIES[x.country||'Maroc']||[],x.city||'')+'</select></label><label class="field">Quartier<input name="district" value="'+esc(x.district||'')+'"></label></div><label class="field">WhatsApp<input name="whatsapp_number" required value="'+esc(x.whatsapp_number||state.profile?.phone_whatsapp||'')+'" placeholder="+212…"></label><label class="field"><input type="checkbox" name="is_traveler" '+(x.is_traveler?'checked':'')+'> Je propose aussi un service Voyageur / GP</label><div class="traveler" id="traveler-box" '+(x.is_traveler?'':'hidden')+'><div class="two"><label class="field">Date du vol<input name="flight_date" type="date" value="'+esc(x.flight_date||'')+'"></label><label class="field">Destination<input name="destination_city" value="'+esc(x.destination_city||'')+'"></label></div></div><label class="field">Détails<textarea name="notes" rows="3">'+esc(x.notes||'')+'</textarea></label><button class="primary">'+(x.id?'Enregistrer':'Publier l’annonce')+'</button></form></div>');
 const country=$('select[name="country"]'),city=$('#city'),trav=$('input[name="is_traveler']);
 country.onchange=()=>city.innerHTML=opts(COUNTRIES[country.value]||'','');
 trav.onchange=()=>$('#traveler-box').hidden=!trav.checked;
 $('#listing-form').onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));const p={type:v.type,currency:v.amount_currency,amount_currency:v.amount_currency,desired_currency:v.desired_currency,amount:Number(v.amount),amount_desired:v.amount_desired?Number(v.amount_desired):null,amount_range:v.amount_desired?v.amount+' - '+v.amount_desired:String(v.amount),country:v.country,city:v.city,district:v.district||null,neighborhood:v.district||null,whatsapp_number:v.whatsapp_number,is_traveler:v.is_traveler==='on',flight_date:v.flight_date||null,destination_city:v.destination_city||null,notes:v.notes||null};let q;if(x.id){delete p.whatsapp_number;q=await supabase.from('listings').update(p).eq('id',x.id).eq('user_id',state.session.user.id)}else{p.user_id=state.session.user.id;p.status='PENDING';q=await supabase.from('listings').insert(p)}if(q.error)return toast(q.error.message,true);closeModal();toast(x.id?'Annonce modifiée.':'Annonce envoyée pour validation.');loadMine()};
}

async function loadMine(){const {data,error}=await supabase.from('listings').select('id,type,currency,amount,amount_desired,country,city,district,status,created_at').eq('user_id',state.session.user.id).order('created_at',{ascending:false});$('#mine').innerHTML=error?'<div class="empty">Impossible de charger vos annonces.</div>':(data||[]).map(x=>'<div class="row"><div><b>'+esc(x.type)+' — '+esc(x.amount)+' '+esc(x.currency)+'</b><small>'+esc(x.country)+' • '+esc(x.city)+' • '+new Date(x.created_at).toLocaleDateString('fr-FR')+'</small></div><div><span class="status '+String(x.status).toLowerCase()+'">'+esc(x.status)+'</span> <button class="ghost" data-action="edit" data-id="'+x.id+'">Modifier</button></div></div>').join('')||'<div class="empty">Aucune annonce.</div>'}
async function payments(){const {data,error}=await supabase.from('transactions').select('id,listing_id,amount_paid,currency,status,created_at').order('created_at',{ascending:false}).limit(50);$('#payments').innerHTML=error?'<div class="empty">Impossible de charger les paiements.</div>':(data||[]).map(x=>'<div class="row"><div><b>'+Number(x.amount_paid).toFixed(2)+' '+esc(x.currency)+'</b><small>'+new Date(x.created_at).toLocaleString('fr-FR')+'</small></div><span class="status '+String(x.status).toLowerCase()+'">'+esc(x.status)+'</span></div>').join('')||'<div class="empty">Aucun paiement.</div>'}
async function dashboard(){if(!state.session)return go('auth');$('#hello').textContent=state.profile?.full_name||state.session.user.email;loadMine();payments()}

async function ambassador(){if(!state.session)return go('auth');const {data:c,error}=await supabase.from('commissions').select('*').order('created_at',{ascending:false});if(error)return toast(error.message,true);const {data:r}=await supabase.from('my_referrals').select('id,created_at');const total=(c||[]).reduce((a,x)=>a+Number(x.commission_amount||0),0),link=location.origin+'/?ref='+(state.profile?.referral_code||'');$('#amb-stats').innerHTML='<div class="stat"><b>'+(r?.length||0)+'</b><small>Filleuls</small></div><div class="stat"><b>'+(c?.length||0)+'</b><small>Transactions commissionnées</small></div><div class="stat"><b>'+total.toFixed(2)+' MAD</b><small>Commissions</small></div>';$('#ref-link').value=link;$('#referrals').innerHTML=(r||[]).map(x=>'<div class="row"><span>Filleul inscrit</span><small>'+new Date(x.created_at).toLocaleDateString('fr-FR')+'</small></div>').join('')||'<div class="empty">Aucun filleul.</div>';$('#commissions').innerHTML=(c||[]).map(x=>'<div class="row"><b>+'+Number(x.commission_amount).toFixed(2)+' MAD</b><span class="status success">'+esc(x.status)+'</span></div>').join('')||'<div class="empty">Aucune commission.</div>'}

async function unlock(id){
 if(!state.session)return go('auth');
 const x=state.listings.find(a=>a.id===id);if(!x)return;
 openModal('<div class="modal"><button class="close" data-action="close-modal">×</button><span class="tag">DÉBLOCAGE SÉCURISÉ</span><h2>Débloquer le WhatsApp</h2><p class="muted">Le prix est déterminé automatiquement selon la tranche du montant de l’annonce.</p><div id="pay-box" class="trust">Préparation du paiement…</div></div>');
 try{const r=await fetch('/api/checkout',{method:'POST',headers:{Authorization:'Bearer '+state.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({listingId:id})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Paiement indisponible');if(d.unlocked&&d.whatsapp_number)return showContact(d.whatsapp_number);$('#pay-box').innerHTML=d.checkout_url?'<p>Paiement à confirmer par Chariow.</p><a class="primary" style="display:inline-block;text-decoration:none" href="'+esc(d.checkout_url)+'">Payer '+Number(d.amount).toFixed(2)+' MAD</a>':'Paiement déjà en cours.';if(d.transactionId)pollPayment(d.transactionId)}catch(e){$('#pay-box').textContent=e.message;$('#pay-box').className='toast show error'}
}
async function pollPayment(id){for(let i=0;i<24;i++){await new Promise(r=>setTimeout(r,5000));const {data}=await supabase.from('transactions').select('status').eq('id',id).maybeSingle();if(data?.status==='SUCCESS'){const r=await fetch('/api/unlock-contact?transactionId='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+state.session.access_token}});const d=await r.json();if(r.ok)return showContact(d.whatsapp_number)}if(['FAILED','CANCELLED','REFUNDED'].includes(data?.status))return}toast('Le paiement n’est pas encore confirmé. Vous pouvez revenir dans votre espace.',true)}
function showContact(n){$('#pay-box').innerHTML='<div class="trust"><b>WhatsApp débloqué</b><p>'+esc(n)+'</p><a class="primary" style="display:inline-block;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/'+String(n).replace(/[^0-9]/g,'')+'">Ouvrir WhatsApp</a></div>'}

function render(){document.querySelectorAll('.page').forEach(e=>e.classList.remove('active'));($('#view-'+state.view)||$('#view-market')).classList.add('active');$('#account').innerHTML=state.session?'<button class="ghost" data-action="dashboard">Mon espace</button><button class="ghost" data-action="logout">Déconnexion</button>':'<button class="primary" data-action="login">Connexion</button>';if(state.view==='market')market();if(state.view==='auth')authView();if(state.view==='dash')dashboard();if(state.view==='ambassador')ambassador()}
async function action(a,el){
 switch(a){
 case'home':go('market');break;case'signup':state.signup=true;go('auth');break;case'login':state.signup=false;go('auth');break;case'toggle-auth':state.signup=!state.signup;authView();break;
 case'forgot':try{await resetPassword($('#auth-email').value.trim());toast('Email de réinitialisation envoyé.')}catch(e){toast(e.message,true)}break;
 case'toggle-password':{const p=$('#auth-password');p.type=p.type==='password'?'text':'password';break}
 case'publish':case'new-listing':listingForm();break;case'search':market();break;case'dashboard':go('dash');break;case'ambassador':go('ambassador');break;case'help':go('help');break;case'map':go('map');break;case'close-modal':closeModal();break;case'unlock':unlock(el.dataset.id);break;
 case'edit':{const {data}=await supabase.from('listings').select('*').eq('id',el.dataset.id).eq('user_id',state.session.user.id).maybeSingle();if(data)listingForm(data);break}
 case'logout':await signOut();state.session=null;state.profile=null;go('market');break;
 case'copy-ref':try{await navigator.clipboard.writeText($('#ref-link').value);toast('Lien copié.')}catch{toast('Copie automatique indisponible.',true)}break;
 case'share-ref':location.href='https://wa.me/?text='+encodeURIComponent('Rejoins FrikChange : '+$('#ref-link').value);break;
 case'install':if(state.deferredInstall){state.deferredInstall.prompt();state.deferredInstall=null;$('#install-app').classList.add('hidden')}break;
 }}
bindUI({onAction:action});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredInstall=e;$('#install-app').classList.remove('hidden')});
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
supabase.auth.onAuthStateChange(async(_,session)=>{state.session=session;await loadProfile();if(!session&&['dash','ambassador'].includes(state.view))state.view='market';render()});
(async()=>{const {data}=await supabase.auth.getSession();state.session=data.session;await loadProfile();render();authForm()})();