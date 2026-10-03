import crypto from 'node:crypto';

const json=(res,status,body)=>res.status(status).setHeader('Content-Type','application/json; charset=utf-8').json(body);

async function db(path,opts={}){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r=await fetch(process.env.SUPABASE_URL+'/rest/v1/'+path,{...opts,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation',...(opts.headers||{})}});
  const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}
  return {ok:r.ok,status:r.status,data};
}
async function rpc(name,body){
  return db('rpc/'+name,{method:'POST',body:JSON.stringify(body)});
}
async function rawBody(req){
  if(req.rawBody)return Buffer.isBuffer(req.rawBody)?req.rawBody:Buffer.from(String(req.rawBody));
  if(typeof req.body==='string')return Buffer.from(req.body);
  return await new Promise((resolve,reject)=>{const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject)});
}
const pick=(o,...keys)=>{for(const key of keys){let v=o;for(const p of key.split('.'))v=v?.[p];if(v!==undefined&&v!==null&&v!=='')return v}return null};
const isRefund=(event,payload)=>/refund|refunded|chargeback|reversed/i.test(event)||/refund|refunded|chargeback|reversed/i.test(String(pick(payload,'sale.status','data.sale.status','status','data.status')||''));
const productIdOf=(payload)=>String(pick(payload,'sale.product.id','data.sale.product.id','sale.product_id','data.sale.product_id','sale.product.id.value','data.sale.product.id.value')||'');

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  let raw;
  try{raw=await rawBody(req)}catch{return json(res,400,{error:'Unable to read webhook body'})}

  const secret=String(process.env.CHARIOW_WEBHOOK_SECRET||'');
  const signature=String(req.headers['x-chariow-signature']||'');
  const expected=secret?'sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex'):'';
  const valid=Boolean(secret&&signature&&expected.length===signature.length&&crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature)));

  let payload={};
  try{payload=JSON.parse(raw.toString('utf8'))}catch{payload={}};
  const eventId=String(req.headers['x-pulse-delivery-id']||pick(payload,'id','event_id','data.id')||crypto.createHash('sha256').update(raw).digest('hex'));
  const eventType=String(req.headers['x-pulse-event']||pick(payload,'event','type','data.event')||'unknown');
  const metadata=pick(payload,'sale.custom_metadata','data.sale.custom_metadata','custom_metadata','data.custom_metadata')||{};
  const transactionId=pick(metadata,'transaction_id');

  if(!valid){
    await db('payment_events',{method:'POST',body:JSON.stringify({provider:'chariow',event_id:eventId,event_type:eventType,transaction_id:transactionId||null,signature_valid:false,payload})});
    return json(res,401,{error:'Invalid signature'});
  }

  const eventInsert=await db('payment_events',{method:'POST',body:JSON.stringify({provider:'chariow',event_id:eventId,event_type:eventType,transaction_id:transactionId||null,signature_valid:true,payload,processed_at:null})});
  if(eventInsert.status===409)return json(res,200,{received:true,duplicate:true,eventId});

  if(!transactionId)return json(res,200,{received:true,processed:false,reason:'transaction_id missing',eventId});

  let q=await db('transactions?select=id,status,amount_paid,currency,pricing_tier_id,chariow_transaction_id&id=eq.'+encodeURIComponent(transactionId)+'&limit=1');
  if(!q.ok||!q.data?.[0])return json(res,200,{received:true,processed:false,reason:'transaction unknown',eventId});
  const tx=q.data[0];

  if(isRefund(eventType,payload)){
    const rr=await rpc('mark_transaction_status',{p_transaction_id:tx.id,p_status:'REFUNDED',p_payload:payload});
    await db('payment_events?id=eq.'+encodeURIComponent(eventInsert.data?.[0]?.id||'') ,{method:'PATCH',body:JSON.stringify({processed_at:new Date().toISOString()})});
    if(!rr.ok)return json(res,500,{error:'Refund status update failed',eventId});
    return json(res,200,{received:true,processed:true,refunded:true,transactionId:tx.id,eventId});
  }

  if(eventType && !/successful\.sale|sale\.successful|success|paid|payment/i.test(eventType))
    return json(res,200,{received:true,processed:false,ignored:true,eventId});

  const amount=Number(pick(payload,'sale.amount.value','data.sale.amount.value','sale.amount','data.sale.amount','amount.value','amount')||NaN);
  const currency=String(pick(payload,'sale.amount.currency','data.sale.amount.currency','sale.currency','data.sale.currency','currency')||'').toUpperCase();
  const productId=productIdOf(payload);
  const tierQ=await db('pricing_tiers?select=id,code,unlock_price,currency,chariow_product_id&id=eq.'+encodeURIComponent(tx.pricing_tier_id)+'&limit=1');
  const tier=tierQ.data?.[0];
  const expectedProduct=String(tier?.chariow_product_id||process.env['CHARIOW_PRODUCT_ID_'+String(tier?.code||'') ]||'');
  const expectedAmount=Number(tx.amount_paid);
  const expectedCurrency=String(tx.currency||tier?.currency||'').toUpperCase();

  if(!Number.isFinite(amount)||Math.abs(amount-expectedAmount)>0.001||currency!==expectedCurrency||(expectedProduct&&productId&&productId!==expectedProduct)){
    await db('payment_events?id=eq.'+encodeURIComponent(eventInsert.data?.[0]?.id||''),{method:'PATCH',body:JSON.stringify({processed_at:new Date().toISOString()})});
    return json(res,400,{error:'Product, amount or currency mismatch',eventId});
  }

  if(tx.status==='SUCCESS'){
    await db('payment_events?id=eq.'+encodeURIComponent(eventInsert.data?.[0]?.id||''),{method:'PATCH',body:JSON.stringify({processed_at:new Date().toISOString()})});
    return json(res,200,{received:true,duplicate:true,transactionId:tx.id,eventId});
  }

  const saleId=String(pick(payload,'sale.id','data.sale.id','id','data.id')||'');
  const success=await rpc('mark_transaction_success',{p_transaction_id:tx.id,p_chariow_transaction_id:saleId,p_amount_paid:expectedAmount,p_payload:payload});
  await db('payment_events?id=eq.'+encodeURIComponent(eventInsert.data?.[0]?.id||''),{method:'PATCH',body:JSON.stringify({processed_at:new Date().toISOString()})});

  if(!success.ok)return json(res,500,{error:'Payment finalization failed',transactionId:tx.id,eventId});
  const unlockedId=success.data;
  if(!unlockedId){
    await db('admin_audit_log',{method:'POST',body:JSON.stringify({admin_id:null,action:'DOUBLE_PAYMENT_ALERT',target:tx.id,details:{event_id:eventId,chariow_transaction_id:saleId,amount:expectedAmount,currency:expectedCurrency}})});
    console.error('DOUBLE_PAYMENT_ALERT',tx.id,eventId,saleId);
    return json(res,200,{received:true,processed:false,manual_review_required:true,transactionId:tx.id,eventId});
  }
  return json(res,200,{received:true,processed:true,transactionId:tx.id,eventId});
}

export const config={api:{bodyParser:false}};
