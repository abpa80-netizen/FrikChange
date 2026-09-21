module.exports=(req,res)=>{
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const raw=String(process.env.SUPABASE_URL||'').trim();
  let supabaseUrl='';
  try{
    const u=new URL(raw);
    // Supabase JS needs the project origin, not /rest/v1, /auth/v1, etc.
    supabaseUrl=u.origin;
  }catch{}
  if(!supabaseUrl)return res.status(500).json({error:'SUPABASE_URL manquante ou invalide.'});
  if(!process.env.SUPABASE_ANON_KEY)return res.status(500).json({error:'SUPABASE_ANON_KEY manquante.'});
  res.setHeader('Cache-Control','no-store');
  res.status(200).json({supabaseUrl,supabaseAnonKey:process.env.SUPABASE_ANON_KEY});
};