import {requireAdmin,json,db} from './_auth.js';
export default async function handler(req,res){
  const a=await requireAdmin(req,res);if(!a.ok)return json(res,a.status,{error:a.error});
  if(req.method==='GET'){const r=await db('official_announcements?select=*&order=priority.desc,created_at.desc');if(!r.ok)return json(res,500,{error:'Unable to load announcements'});return json(res,200,{items:r.data||[]});}
  if(req.method==='POST'){
    const b=req.body||{};if(!String(b.title||'').trim()||!String(b.textFr||'').trim())return json(res,400,{error:'title and textFr are required'});
    const r=await db('official_announcements',{method:'POST',body:JSON.stringify({title:String(b.title).slice(0,180),text_fr:String(b.textFr).slice(0,5000),text_ar:String(b.textAr||'').slice(0,5000),full_text:String(b.fullText||'').slice(0,8000),image_url:String(b.imageUrl||'').slice(0,1000),badge:String(b.badge||'Annonce Officielle').slice(0,80),category:String(b.category||'officiel').slice(0,80),priority:Number.isFinite(Number(b.priority))?Number(b.priority):0,author:'Direction FrikChange',status:'active'})});
    if(!r.ok)return json(res,500,{error:'Unable to create announcement'});await db('admin_audit_log',{method:'POST',body:JSON.stringify({admin_id:a.user.id,action:'CREATE_ANNOUNCEMENT',target:r.data?.[0]?.id||null,details:{title:String(b.title).slice(0,180)}})});return json(res,201,{item:r.data?.[0]});
  }
  if(req.method==='PATCH'){
    const id=String(req.body?.id||'');if(!id)return json(res,400,{error:'id required'});const allowed=['title','text_fr','text_ar','full_text','image_url','badge','category','priority','status'],patch={};for(const k of allowed)if(k in req.body)patch[k]=req.body[k];
    const r=await db('official_announcements?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(patch)});if(!r.ok)return json(res,500,{error:'Unable to update announcement'});await db('admin_audit_log',{method:'POST',body:JSON.stringify({admin_id:a.user.id,action:'UPDATE_ANNOUNCEMENT',target:id,details:patch})});return json(res,200,{item:r.data?.[0]});
  }
  return json(res,405,{error:'Method not allowed'});
}