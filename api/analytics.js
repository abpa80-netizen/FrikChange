import {requireAdmin,json,db} from './admin/_auth.js';
const allowed=new Set(['page_view','publish_click','publish_submit','unlock_click','unlock_modal_open','unlock_chariow_click']);
export default async function handler(req,res){
  if(req.method==='POST'){
    const b=req.body||{},eventName=String(b.eventName||'');
    if(!allowed.has(eventName))return json(res,400,{error:'Invalid eventName'});
    const payload={source:String(b.source||'unknown').slice(0,40),device:String(b.device||'unknown').slice(0,20),listing_id:b.listingId||null};
    const r=await db('analytics_events',{method:'POST',body:JSON.stringify({event_name:eventName,payload,session_id:String(b.sessionId||'').slice(0,80)||null,path:String(b.path||'/').slice(0,200)})});
    if(!r.ok)return json(res,500,{error:'Analytics unavailable'});return json(res,202,{tracked:true});
  }
  if(req.method==='GET'){
    const a=await requireAdmin(req,res);if(!a.ok)return json(res,a.status,{error:a.error});
    const r=await db('analytics_events?select=id,event_name,payload,session_id,path,created_at&order=created_at.desc&limit=500');if(!r.ok)return json(res,500,{error:'Analytics unavailable'});
    const summary={};for(const e of r.data||[])summary[e.event_name]=(summary[e.event_name]||0)+1;return json(res,200,{summary,events:r.data||[]});
  }
  return json(res,405,{error:'Method not allowed'});
}