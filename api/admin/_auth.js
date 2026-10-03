export async function requireAdmin(req,res){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  if(!token)return {ok:false,status:401,error:'Authentication required'};
  const r=await fetch(process.env.SUPABASE_URL+'/auth/v1/user',{headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:'Bearer '+token}});
  if(!r.ok)return {ok:false,status:401,error:'Invalid session'};
  const user=await r.json();
  const p=await fetch(process.env.SUPABASE_URL+'/rest/v1/profiles?select=id,role&id=eq.'+encodeURIComponent(user.id)+'&limit=1',{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY}});
  if(!p.ok)return {ok:false,status:500,error:'Unable to validate admin'};
  const rows=await p.json();
  if(rows?.[0]?.role!=='admin')return {ok:false,status:403,error:'Forbidden'};
  return {ok:true,user};
}
export const json=(res,status,body)=>res.status(status).setHeader('Content-Type','application/json; charset=utf-8').json(body);
export async function db(path,opts={}){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r=await fetch(process.env.SUPABASE_URL+'/rest/v1/'+path,{...opts,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation',...(opts.headers||{})}});
  const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}
  return {ok:r.ok,status:r.status,data};
}