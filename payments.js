export async function createUnlock(listingId,supabase){
 const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw new Error('Connectez-vous pour débloquer ce contact.');
 const r=await fetch('/api/chariow-checkout',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({listingId})});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error||'Paiement indisponible.');return d;
}
export async function getUnlockedContact(transactionId,supabase){
 const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw new Error('Connectez-vous.');
 const r=await fetch('/api/unlock-contact?transactionId='+encodeURIComponent(transactionId),{headers:{Authorization:'Bearer '+session.access_token}});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Contact indisponible.');return d;
}