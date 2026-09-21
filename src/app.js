import {supabase} from './supabaseClient.js';
import {signUp,signIn,signOut,resetPassword} from './auth.js';
import {createUnlock,getUnlockedContact} from './payments.js';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const state={session:null,profile:null,view:'market'};
const incomingRef=(new URLSearchParams(location.search).get('ref')||'').trim().toUpperCase();
if(incomingRef){try{localStorage.setItem('frik_ref',incomingRef)}catch{}}
const getReferralCode=()=>{try{return (localStorage.getItem('frik_ref')||'').trim().toUpperCase()}catch{return ''}};
const ref=getReferralCode();
const CURRENCIES=['MAD','XOF','XAF','CDF','GNF','GHS','EUR','USD'];
const COUNTRIES={Maroc:['Casablanca','Rabat','Marrakech','Agadir','Tanger','Fès'],"Côte d'Ivoire":['Abidjan','Yamoussoukro','Bouaké'],Sénégal:['Dakar','Thiès','Saint-Louis'],France:['Paris','Marseille','Lyon','Lille'],Canada:['Montréal','Toronto','Ottawa','Québec'],Ghana:['Accra','Kumasi'],Mali:['Bamako'],'Burkina Faso':['Ouagadougou','Bobo-Dioulasso']};
const DISTRICTS={Casablanca:['Ain Chock','Maarif','Bourgogne','Sidi Maarouf','Ain Sebaa','Hay Hassani','Centre-ville'],Rabat:['Agdal','Hay Riad','Hassan','Souissi','Océan'],Marrakech:['Guéliz','Médina','Sidi Youssef Ben Ali'],Abidjan:['Cocody','Marcory','Yopougon','Plateau','Treichville'],Dakar:['Almadies','Plateau','Parcelles Assainies','Mermoz'],Paris:['10e','11e','12e','18e','19e','20e'],Montréal:['Ville-Marie','Côte-des-Neiges','Rosemont','Plateau-Mont-Royal']};
const msg=(x,e=false)=>{const t=$('#toast');t.textContent=x;t.className='toast '+(e?'error':'');clearTimeout(msg.t);msg.t=setTimeout(()=>t.textContent='',4500)};
async function profile(){if(!state.session)return state.profile=null;const r=await supabase.from('profiles').select('id,full_name,phone_whatsapp,referral_code,is_ambassador,created_at').eq('id',state.session.user.id).maybeSingle();state.profile=r.data||null}
const COL='id,type,currency,amount_currency,desired_currency,amount,amount_desired,country,city,district,is_traveler,flight_date,destination_city,notes,created_at';
async function market(){let q=supabase.from('listings').select(COL).eq('status','APPROVED').order('created_at',{ascending:false}).limit(60);const t=$('#ft')?.value,c=$('#fc')?.value,city=$('#fci')?.value?.trim();if(t)q=q.eq('type',t);if(c)q=q.eq('amount_currency',c);if(city)q=q.ilike('city','%'+city+'%');const {data,error}=await q;if(error){console.error(error);$('#market').innerHTML='<div class="empty">Impossible de charger les annonces.</div>';return}$('#market').innerHTML=(data||[]).map(x=>`<article class="card"><span class="tag">${esc(x.type)}</span><h3>${esc(x.amount_currency||x.currency||'')} · ${x.amount!=null?Number(x.amount).toLocaleString('fr-FR'):'—'}${x.amount_desired!=null?' ↔ '+Number(x.amount_desired).toLocaleString('fr-FR')+' '+esc(x.desired_currency||''):''}</h3><p>${esc(x.country)} · ${esc(x.city)}${x.district?' · '+esc(x.district):''}</p>${x.is_traveler?'<p class="traveler">✈️ Voyageur / GP'+(x.destination_city?' · '+esc(x.destination_city):'')+'</p>':''}${x.notes?'<p class="muted">'+esc(x.notes)+'</p>':''}<button class="primary unlock" data-id="${x.id}">Débloquer WhatsApp</button></article>`).join('')||'<div class="empty">Aucune annonce approuvée.</div>';document.querySelectorAll('.unlock').forEach(b=>b.onclick=()=>unlock(b.dataset.id))}
async function unlock(id){try{if(!state.session){state.view='auth';render();return msg('Connectez-vous pour débloquer.',true)}const d=await createUnlock(id,supabase);if(d.alreadyUnlocked){const c=await getUnlockedContact(d.transactionId,supabase);return msg('WhatsApp : '+c.whatsapp_number)}if(d.checkoutUrl)location.href=d.checkoutUrl}catch(e){msg(e.message,true)}}
async function listings(){const {data,error}=await supabase.from('listings').select(COL).eq('user_id',state.session.user.id).order('created_at',{ascending:false});if(error){console.error(error);$('#mine').innerHTML='<div class="empty">Impossible de charger vos annonces.</div>';return}$('#mine').innerHTML=(data||[]).map(x=>`<div class="row"><div><b>${esc(x.type)} · ${esc(x.amount_currency||x.currency||'')} ${x.amount!=null?Number(x.amount).toLocaleString('fr-FR'):''}${x.amount_desired!=null?' ↔ '+Number(x.amount_desired).toLocaleString('fr-FR')+' '+esc(x.desired_currency||''):''}</b><small>${esc(x.country)} · ${esc(x.city)}${x.district?' · '+esc(x.district):''}</small></div><div><button class="ghost edit" data-id="${x.id}">Modifier</button><button class="danger del" data-id="${x.id}">Supprimer</button></div></div>`).join('')||'<div class="empty">Aucune annonce.</div>';document.querySelectorAll('.del').forEach(b=>b.onclick=async()=>{if(!confirm('Supprimer ?'))return;const q=await supabase.from('listings').delete().eq('id',b.dataset.id);q.error?msg(q.error.message,true):(msg('Annonce supprimée.'),listings())});document.querySelectorAll('.edit').forEach(b=>b.onclick=()=>form(b.dataset.id))}
function opts(arr,sel=''){return arr.map(x=>`<option value="${esc(x)}" ${x===sel?'selected':''}>${esc(x)}</option>`).join('')}
async function form(id){
  let ex=null;
  if(id){
    const r=await supabase.from('listings').select(COL).eq('id',id).eq('user_id',state.session.user.id).maybeSingle();
    if(r.error)return msg(r.error.message,true);
    ex=r.data;
  }
  const country=ex?.country||'Maroc';
  const cities=COUNTRIES[country]||[];
  const cityIsManual=cities.length===0||!cities.includes(ex?.city||'');
  const districts=DISTRICTS[ex?.city||'']||[];
  const districtIsManual=districts.length===0||(!districts.includes(ex?.district||'')&&!!ex?.district);
  const amountCurrency=ex?.amount_currency||ex?.currency||'MAD';
  const desiredCurrency=ex?.desired_currency||ex?.currency||'XOF';
  $('#modal').innerHTML=`<div class="modal modal-wide"><button class="close" onclick="closeModal()">×</button><span class="tag">ANNONCE</span><h2>${id?'Modifier':'Publier'} une annonce</h2><form id="lf" class="form">
    <div class="two">
      <label>Type<select name="type">${opts(['OFFRE','BESOIN','VOYAGEUR_GP'],ex?.type||'OFFRE')}</select></label>
    </div>
    <div class="two">
      <label>Montant proposé
        <div class="two"><input name="amount" type="number" min="0" step=".01" required value="${ex?.amount??''}"><select name="amount_currency" required>${opts(CURRENCIES,amountCurrency)}</select></div>
      </label>
      <label>Montant souhaité en contrepartie
        <div class="two"><input name="amount_desired" type="number" min="0" step=".01" value="${ex?.amount_desired??''}"><select name="desired_currency" required>${opts(CURRENCIES,desiredCurrency)}</select></div>
      </label>
    </div>
    <div class="two">
      <label>Pays<select name="country" id="listing-country">${opts(Object.keys(COUNTRIES),country)}</select></label>
      <label>Ville<select name="city" id="listing-city">${opts(cities,'') }<option value="__manual__" ${cityIsManual?'selected':''}>Autre / Saisie manuelle</option></select></label>
    </div>
    <label id="city-manual-wrap" ${cityIsManual?'':'hidden'}>Ville — saisie manuelle<input name="city_manual" id="city-manual" value="${esc(cityIsManual?(ex?.city||''):'')}" placeholder="Saisissez la ville"></label>
    <label>Quartier<select name="district" id="listing-district"><option value="">Choisir un quartier</option>${opts(districts,districtIsManual?'':ex?.district||'')}<option value="__manual__" ${districtIsManual?'selected':''}>Autre / Saisie manuelle</option></select></label>
    <label id="district-manual-wrap" ${districtIsManual?'':'hidden'}>Quartier — saisie manuelle<input name="district_manual" id="district-manual" value="${esc(districtIsManual?(ex?.district||''):'')}" placeholder="Saisissez le quartier"></label>
    <label class="checkline"><input type="checkbox" name="is_traveler" id="traveler-toggle" ${ex?.is_traveler?'checked':''}> Je propose aussi un service Voyageur / GP</label>
    <div id="traveler-fields" class="traveler-box" hidden>
      <div class="two"><label>Date du vol / départ<input name="flight_date" type="date" value="${ex?.flight_date||''}"></label><label>Ville de destination<input name="destination_city" value="${esc(ex?.destination_city||'')}" placeholder="Abidjan"></label></div>
      <label>Capacité / message<input name="traveler_message" placeholder="23 kg disponibles Abidjan - Casablanca"></label>
    </div>
    <label>Message / détails complémentaires<textarea name="notes" rows="3" maxlength="1000" placeholder="Ajoutez les informations utiles…">${esc(ex?.notes||'')}</textarea></label>
    <label>WhatsApp<input name="whatsapp_number" value="${id?'':esc(state.profile?.phone_whatsapp||'')}" placeholder="+212..." ${id?'':'required'}></label>
    <small class="muted">🔒 Numéro privé. Lors d'une modification, laissez vide pour conserver le numéro existant.</small>
    <button class="primary" type="submit">${id?'Enregistrer les modifications':'Publier l’annonce'}</button>
  </form></div>`;
  $('#modal').classList.add('show');

  const ce=$('#listing-country'),ci=$('#listing-city'),di=$('#listing-district');
  const cmw=$('#city-manual-wrap'),dmw=$('#district-manual-wrap'),cm=$('#city-manual'),dm=$('#district-manual');
  const tr=$('#traveler-toggle'),tf=$('#traveler-fields');

  const syncCityManual=()=>{
    const manual=ci.value==='__manual__';
    cmw.hidden=!manual;
    if(manual)cm.required=true;else cm.required=false;
  };
  const syncDistrictManual=()=>{
    const manual=di.value==='__manual__';
    dmw.hidden=!manual;
    if(manual)dm.required=true;else dm.required=false;
  };
  const buildCity=()=>{
    const arr=COUNTRIES[ce.value]||[];
    ci.innerHTML=opts(arr,'')+'<option value="__manual__">Autre / Saisie manuelle</option>';
    if(!arr.length)ci.value='__manual__';
    di.innerHTML='<option value="">Choisir un quartier</option><option value="__manual__">Autre / Saisie manuelle</option>';
    syncCityManual();syncDistrictManual();
  };
  const buildDistrict=()=>{
    const city=ci.value==='__manual__'?(cm.value||''):ci.value;
    const arr=DISTRICTS[city]||[];
    di.innerHTML='<option value="">Choisir un quartier</option>'+opts(arr,'')+'<option value="__manual__">Autre / Saisie manuelle</option>';
    if(!arr.length)di.value='__manual__';
    syncDistrictManual();
  };
  ce.onchange=()=>buildCity();
  ci.onchange=()=>{syncCityManual();buildDistrict()};
  di.onchange=syncDistrictManual;
  cm.oninput=buildDistrict;
  tr.onchange=()=>tf.hidden=!tr.checked;

  // Restore the edit state after the dynamic controls are bound.
  if(ex?.is_traveler)tf.hidden=false;
  if(cityIsManual){ci.value='__manual__';cm.value=ex?.city||'';syncCityManual();}
  else{ci.value=ex?.city||'';syncCityManual();}
  buildDistrict();
  if(districtIsManual){di.value='__manual__';dm.value=ex?.district||'';syncDistrictManual();}
  else{di.value=ex?.district||'';syncDistrictManual();}

  $('#lf').onsubmit=async e=>{
    e.preventDefault();
    const v=Object.fromEntries(new FormData(e.target)),it=tr.checked;
    const finalCity=ci.value==='__manual__'?(v.city_manual||'').trim():ci.value;
    const finalDistrict=di.value==='__manual__'?(v.district_manual||'').trim():(v.district||'').trim();
    if(!finalCity)return msg('Veuillez saisir ou choisir une ville.',true);
    if(!finalDistrict)return msg('Veuillez saisir ou choisir un quartier.',true);
    if(it&&(!v.flight_date||!v.destination_city?.trim()))return msg('Complétez la date et la ville de destination du service Voyageur / GP.',true);
    const p={
      type:v.type,currency:v.amount_currency,amount_currency:v.amount_currency,desired_currency:v.desired_currency,
      amount:Number(v.amount),amount_desired:v.amount_desired?Number(v.amount_desired):null,
      amount_range:v.amount_desired?String(v.amount)+' - '+String(v.amount_desired):String(v.amount),
      country:v.country,city:finalCity,district:finalDistrict,neighborhood:finalDistrict,
      city_manual:ci.value==='__manual__'?finalCity:null,
      neighborhood_manual:di.value==='__manual__'?finalDistrict:null,
      is_traveler:it,flight_date:it&&v.flight_date?v.flight_date:null,
      destination_city:it?(v.destination_city||null):null,
      notes:[it&&v.traveler_message?v.traveler_message:'',v.notes||''].filter(Boolean).join(' — ')||null
    };
    if(!id){p.user_id=state.session.user.id;p.status='PENDING';p.whatsapp_number=v.whatsapp_number||state.profile?.phone_whatsapp||''}
    else if(v.whatsapp_number?.trim())p.whatsapp_number=v.whatsapp_number.trim();
    const q=id?await supabase.from('listings').update(p).eq('id',id).eq('user_id',state.session.user.id):await supabase.from('listings').insert(p);
    if(q.error)return msg(q.error.message,true);
    closeModal();msg(id?'Annonce mise à jour.':'Annonce envoyée pour validation.');listings();
  };
}
function closeModal(){$('#modal').classList.remove('show');$('#modal').innerHTML=''}window.closeModal=closeModal;window.newListing=()=>{if(!state.session){state.view='auth';render();msg('Connectez-vous ou créez votre compte pour publier une annonce.',true);return}form()};window.searchMarket=market;
async function payments(){const {data,error}=await supabase.from('unlock_transactions').select('amount_paid,currency,status,created_at').order('created_at',{ascending:false}).limit(50);$('#payments').innerHTML=error?'<div class="empty">Impossible de charger les paiements.</div>':(data||[]).map(x=>`<div class="row"><div><b>${Number(x.amount_paid).toFixed(2)} ${esc(x.currency)}</b><small>${new Date(x.created_at).toLocaleString('fr-FR')}</small></div><span class="status ${String(x.status).toLowerCase()}">${esc(x.status)}</span></div>`).join('')||'<div class="empty">Aucun paiement.</div>'}
function referralLink(){return location.origin+'/?ref='+(state.profile?.referral_code||'')}
async function ambassador(){const {data,error}=await supabase.from('commissions').select('*').order('created_at',{ascending:false});if(error)return msg(error.message,true);const total=(data||[]).reduce((s,x)=>s+Number(x.commission_amount||0),0),link=referralLink();
  const {data:referrals,error:refErr}=await supabase.from('profiles').select('id,created_at',{count:'exact'}).eq('referred_by',state.session.user.id).order('created_at',{ascending:false});
  if(refErr)console.error(refErr);
  const referralCount=referrals?.length||0;
  $('#astats').innerHTML=`<div class="stat"><b>${referralCount}</b><span>Filleuls inscrits</span></div><div class="stat"><b>${data?.length||0}</b><span>Commissions</span></div><div class="stat"><b>${total.toFixed(2)} MAD</b><span>Gains</span></div><div class="stat"><b>${esc(state.profile?.referral_code||'—')}</b><span>Code ambassadeur</span></div>`;$('#referral-link').value=link;$('#ref-preview').textContent=state.profile?.referral_code||'CODE';const qr=$('#qr-code');qr.innerHTML='';if(window.QRCode)new QRCode(qr,{text:link,width:190,height:190});$('#commissions').innerHTML=(data||[]).map(x=>`<div class="row"><b>+${Number(x.commission_amount).toFixed(2)} MAD</b><span class="status available">${esc(x.status)}</span></div>`).join('')||'<div class="empty">Aucune commission pour le moment.</div>';
  $('#referrals').innerHTML=(referrals||[]).map(x=>`<div class="row"><div><b>Filleul inscrit</b><small>${new Date(x.created_at).toLocaleString('fr-FR')}</small></div></div>`).join('')||'<div class="empty">Aucun filleul inscrit pour le moment.</div>';
}
window.copyReferral=async()=>{const l=referralLink();try{await navigator.clipboard.writeText(l)}catch{const i=$('#referral-link');i.select();document.execCommand('copy')}msg('Lien de parrainage copié.')};window.whatsappShare=()=>location.href='https://wa.me/?text='+encodeURIComponent('Rejoins FrikChange : '+referralLink());
function auth(){if($('#ref'))$('#ref').value=getReferralCode();const eye=$('#toggle-password');if(eye&&!eye.dataset.bound){eye.dataset.bound='1';eye.onclick=()=>{const p=$('#password');p.type=p.type==='password'?'text':'password';eye.textContent=p.type==='password'?'👁':'🙈'}}const f=$('#af'),toggle=$('#toggle');if(f.dataset.bound)return;f.dataset.bound='1';toggle.onclick=()=>{const s=toggle.dataset.signup!=='1';toggle.dataset.signup=s?'1':'0';$('#extra').hidden=!s;$('#asubmit').textContent=s?'Créer mon compte':'Se connecter';toggle.textContent=s?'J’ai déjà un compte':'Créer un compte'};$('#forgot').onclick=async()=>{try{await resetPassword($('#email').value.trim());msg('Email de réinitialisation envoyé.')}catch(e){msg(e.message,true)}};f.onsubmit=async e=>{e.preventDefault();try{if(toggle.dataset.signup==='1'){await signUp({email:$('#email').value.trim(),password:$('#password').value,fullName:$('#name').value.trim(),phone:$('#phone').value.trim(),referralCode:$('#ref').value.trim()});msg('Compte créé. Vérifiez votre email si nécessaire.')}else{await signIn($('#email').value.trim(),$('#password').value);state.session=(await supabase.auth.getSession()).data.session;await profile();state.view='dash';render()}}catch(x){const t=String(x?.message||'').toLowerCase();if(x?.code==='EMAIL_RATE_LIMIT'||x?.status===429||t.includes('email rate limit')||t.includes('rate limit')||t.includes('too many requests'))msg('Trop de tentatives d'inscription rapprochées. Veuillez patienter 5 minutes ou vérifier vos mails.',true);else msg(x?.message||'Une erreur est survenue.',true)}}}
async function render(){document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));($('#p-'+state.view)||$('#p-market')).classList.add('active');$('#account').innerHTML=state.session?`<button class="ghost" onclick="go('dash')">Mon espace</button><button class="ghost" id="out">Déconnexion</button>`:'<button class="primary" onclick="go(\'auth\')">Connexion</button>';if($('#out'))$('#out').onclick=async()=>{await signOut();state.session=null;state.profile=null;state.view='market';render()};if(state.view==='market')market();if(state.view==='auth')auth();if(state.view==='dash'&&state.session){$('#hello').textContent=state.profile?.full_name||state.session.user.email;listings();payments()}if(state.view==='amb'&&state.session)ambassador()}
window.go=v=>{if(!state.session&&['dash','amb'].includes(v))v='auth';state.view=v;render()};
(async()=>{state.session=(await supabase.auth.getSession()).data.session;await profile();supabase.auth.onAuthStateChange(async(_,s)=>{state.session=s;await profile();if(state.view==='dash'||state.view==='amb')render()});render()})();