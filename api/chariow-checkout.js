import crypto from 'node:crypto';

const json=(res,status,body)=>res.status(status).setHeader('Content-Type','application/json; charset=utf-8').json(body);

async function db(path,opts={}){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r=await fetch(process.env.SUPABASE_URL+'/rest/v1/'+path,{
    ...opts,
    headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation',...(opts.headers||{})}
  });
  const text=await r.text(); let data; try{data=JSON.parse(text)}catch{data=text}
  return {ok:r.ok,status:r.status,data};
}

async function authUser(token){
  const r=await fetch(process.env.SUPABASE_URL+'/auth/v1/user',{headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:'Bearer '+token}});
  return r.ok?r.json():null;
}

function firstNumber(value){
  const m=String(value??'').replace(',','.').match(/\d+(?:\.\d+)?/);
  return m?Number(m[0]):0;
}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  try{
    const token=String(req.headers.authorization||'').replace(/^Bearer\s+/,'');
    const user=await authUser(token);
    if(!user?.id)return json(res,401,{error:'Session invalide.'});

    const listingId=String(req.body?.listingId||'').trim();
    if(!listingId)return json(res,400,{error:'listingId requis.'});
    if(!process.env.CHARIOW_API_KEY||!process.env.CHARIOW_CHECKOUT_ENDPOINT)return json(res,503,{error:'Chariow checkout non configuré.'});

    let q=await db('listings?select=id,user_id,amount,amount_range,status,currency&id=eq.'+encodeURIComponent(listingId)+'&limit=1');
    if(!q.ok||!q.data?.[0])return json(res,404,{error:'Annonce introuvable.'});
    const listing=q.data[0];
    if(listing.status!=='APPROVED')return json(res,409,{error:'Cette annonce n’est plus disponible.'});
    if(listing.user_id===user.id)return json(res,403,{error:'Vous ne pouvez pas débloquer votre propre annonce.'});

    q=await db('transactions?select=id,status,chariow_checkout_url,amount_paid,currency&listing_id=eq.'+encodeURIComponent(listingId)+'&buyer_id=eq.'+encodeURIComponent(user.id)+'&status=eq.SUCCESS&limit=1');
    if(q.data?.[0])return json(res,200,{alreadyUnlocked:true,transactionId:q.data[0].id,amount:Number(q.data[0].amount_paid),currency:q.data[0].currency});

    q=await db('transactions?select=id,status,chariow_checkout_url,amount_paid,currency&listing_id=eq.'+encodeURIComponent(listingId)+'&buyer_id=eq.'+encodeURIComponent(user.id)+'&status=eq.PENDING&order=created_at.desc&limit=1');
    if(q.data?.[0]?.chariow_checkout_url)return json(res,200,{checkout_url:q.data[0].chariow_checkout_url,transactionId:q.data[0].id,amount:Number(q.data[0].amount_paid),currency:q.data[0].currency});

    const listingAmount=Number(listing.amount)||firstNumber(listing.amount_range);
    q=await db('pricing_tiers?select=id,code,min_amount,max_amount,unlock_price,currency,chariow_product_id&active=eq.true&order=sort_order.asc');
    if(!q.ok)return json(res,500,{error:'Tarification indisponible.'});
    const tier=(q.data||[]).find(t=>listingAmount>=Number(t.min_amount)&&(t.max_amount==null||listingAmount<=Number(t.max_amount)));
    if(!tier)return json(res,409,{error:'Aucune tranche tarifaire ne correspond à cette annonce.'});
    if(Number(tier.unlock_price)<=0)return json(res,500,{error:'Prix de déblocage invalide.'});

    q=await db('transactions',{
      method:'POST',
      body:JSON.stringify({
        listing_id:listingId,buyer_id:user.id,amount_paid:Number(tier.unlock_price),
        currency:String(tier.currency).toUpperCase(),pricing_tier_id:tier.id,status:'PENDING'
      })
    });
    if(!q.ok||!q.data?.[0])return json(res,500,{error:'Impossible de créer la transaction.'});
    const tx=q.data[0];

    const productId=tier.chariow_product_id||process.env['CHARIOW_PRODUCT_ID_'+tier.code];
    if(!productId){
      await db('transactions?id=eq.'+encodeURIComponent(tx.id),{method:'PATCH',body:JSON.stringify({status:'FAILED'})});
      return json(res,503,{error:'Produit Chariow de cette tranche non configuré.',transactionId:tx.id});
    }

    const payload={
      product_id:productId,
      email:user.email,
      payment_currency:String(tier.currency).toUpperCase(),
      custom_metadata:{
        transaction_id:tx.id,listing_id:listingId,buyer_id:user.id,
        pricing_tier_id:tier.id,tier:tier.code,
        amount_paid:Number(tier.unlock_price),currency:String(tier.currency).toUpperCase()
      },
      redirect_url:process.env.APP_URL||'https://frik-change.vercel.app/'
    };

    const cr=await fetch(process.env.CHARIOW_CHECKOUT_ENDPOINT,{
      method:'POST',
      headers:{Authorization:'Bearer '+process.env.CHARIOW_API_KEY,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(payload)
    });
    const raw=await cr.text(); let data; try{data=JSON.parse(raw)}catch{data={}};
    const checkoutUrl=data?.data?.payment?.checkout_url||data?.data?.checkout_url||data?.payment?.checkout_url||data?.checkout_url||data?.url;
    if(!cr.ok||!checkoutUrl){
      await db('transactions?id=eq.'+encodeURIComponent(tx.id),{method:'PATCH',body:JSON.stringify({status:'FAILED',chariow_payload:data})});
      return json(res,502,{error:'Chariow a refusé la création du paiement.',transactionId:tx.id});
    }
    await db('transactions?id=eq.'+encodeURIComponent(tx.id),{method:'PATCH',body:JSON.stringify({chariow_checkout_url:checkoutUrl,chariow_payload:data})});
    return json(res,200,{checkout_url:checkoutUrl,transactionId:tx.id,amount:Number(tier.unlock_price),currency:tier.currency,tier:tier.code});
  }catch(e){
    console.error('chariow-checkout',e);
    return json(res,500,{error:'Erreur serveur de paiement.'});
  }
}
