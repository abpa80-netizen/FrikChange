const json=(res,status,body)=>res.status(status).setHeader('Content-Type','application/json').json(body);
async function db(path,opts={}){const key=process.env.SUPABASE_SERVICE_ROLE_KEY;const r=await fetch(process.env.SUPABASE_URL+'/rest/v1/'+path,{...opts,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation',...(opts.headers||{})}});const t=await r.text();let d;try{d=JSON.parse(t)}catch{d=t}return{ok:r.ok,data:d}}
const pick=(o,...ps)=>{for(const p of ps){let v=o;for(const k of p.split('.'))v=v?.[k];if(v!==undefined&&v!==null&&v!=='')return v}return null};
const successful=p=>{const e=String(pick(p,'event','type','name','data.event','data.type')||'').toLowerCase();const s=String(pick(p,'status','data.status','transaction.status','data.transaction.status')||'').toLowerCase();return /success|successful|succeeded|completed|paid|vente[ ._-]*(réussie|reussie)/i.test(e)||/success|successful|succeeded|completed|paid/i.test(s)};
module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
 const expected=process.env.CHARIOW_WEBHOOK_SECRET;const received=req.headers['x-chariow-webhook-secret']||req.query?.token;
 if(!expected)return json(res,503,{error:'Webhook security is not configured'});
 if(received!==expected)return json(res,401,{error:'Invalid webhook secret'});
 const p=typeof req.body==='string'?JSON.parse(req.body):req.body||{};if(!successful(p))return json(res,200,{received:true,processed:false});
 const id=pick(p,'metadata.transaction_id','data.metadata.transaction_id','transaction_id','data.transaction_id','transaction.metadata.transaction_id');if(!id)return json(res,400,{error:'transaction_id missing'});
 let q=await db('unlock_transactions?select=id,status&id=eq.'+encodeURIComponent(id)+'&limit=1');if(!q.ok||!q.data?.[0])return json(res,404,{error:'Unknown transaction'});if(q.data[0].status==='SUCCESS')return json(res,200,{received:true,duplicate:true});
 const update={status:'SUCCESS',chariow_transaction_id:String(pick(p,'transaction.id','data.transaction.id','id','data.id')||''),chariow_payload:p,unlocked_at:new Date().toISOString()};
 const amount=pick(p,'amount','data.amount','transaction.amount');const currency=pick(p,'currency','data.currency','transaction.currency');if(amount!=null&&!Number.isNaN(Number(amount)))update.amount_paid=Number(amount);if(currency)update.currency=String(currency);
 q=await db('unlock_transactions?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(update)});if(!q.ok)return json(res,500,{error:'Database update failed'});return json(res,200,{received:true,processed:true,transactionId:id});
};