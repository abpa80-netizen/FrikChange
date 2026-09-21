const json=(res,status,body)=>res.status(status).setHeader('Content-Type','application/json; charset=utf-8').json(body);

async function db(path,opts={}) {
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r=await fetch(process.env.SUPABASE_URL+'/rest/v1/'+path,{
    ...opts,
    headers:{
      apikey:key,
      Authorization:'Bearer '+key,
      'Content-Type':'application/json',
      Prefer:'return=representation',
      ...(opts.headers||{})
    }
  });
  const text=await r.text();
  let data;
  try{data=JSON.parse(text)}catch{data=text}
  return {ok:r.ok,status:r.status,data};
}

async function authUser(token){
  const r=await fetch(process.env.SUPABASE_URL+'/auth/v1/user',{
    headers:{
      apikey:process.env.SUPABASE_ANON_KEY,
      Authorization:'Bearer '+token
    }
  });
  if(!r.ok)return null;
  return r.json();
}

module.exports=async function(req,res){
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});

  const token=(req.headers.authorization||'').replace(/^Bearer\\s+/,'');
  if(!token)return json(res,401,{error:'Authentication required'});

  const user=await authUser(token);
  if(!user?.id)return json(res,401,{error:'Invalid session'});

  const transactionId=String(req.query?.transactionId||'').trim();
  if(!transactionId)return json(res,400,{error:'transactionId is required'});

  let q=await db(
    'unlock_transactions?select=id,listing_id,buyer_id,status&id=eq.'+
    encodeURIComponent(transactionId)+'&limit=1'
  );
  if(!q.ok||!q.data?.[0])return json(res,404,{error:'Transaction not found'});

  const tx=q.data[0];
  if(tx.buyer_id!==user.id)return json(res,403,{error:'Forbidden'});
  if(tx.status!=='SUCCESS')return json(res,409,{error:'Payment not confirmed yet'});

  q=await db(
    'listings?select=id,whatsapp_number,status&id=eq.'+
    encodeURIComponent(tx.listing_id)+'&limit=1'
  );
  if(!q.ok||!q.data?.[0])return json(res,404,{error:'Listing not found'});

  const listing=q.data[0];
  if(listing.status!=='APPROVED')return json(res,409,{error:'Listing is no longer available'});
  if(!listing.whatsapp_number)return json(res,404,{error:'WhatsApp contact unavailable'});

  return json(res,200,{
    unlocked:true,
    transactionId:tx.id,
    listingId:tx.listing_id,
    whatsapp_number:listing.whatsapp_number
  });
};
