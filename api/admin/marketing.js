import {GoogleGenAI} from '@google/genai';
import {requireAdmin,json,db} from './_auth.js';
export default async function handler(req,res){
  const a=await requireAdmin(req,res);if(!a.ok)return json(res,a.status,{error:a.error});
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  if(!process.env.GEMINI_API_KEY)return json(res,503,{error:'GEMINI_API_KEY not configured'});
  const b=req.body||{},topic=String(b.topic||'mise_en_relation').slice(0,80),notes=String(b.customNotes||'').slice(0,2000),audience=String(b.targetAudience||'Maroc et Afrique subsaharienne').slice(0,200);
  try{
    const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
    const prompt='Rédige un contenu marketing FrikChange pour '+audience+'. Sujet: '+topic+'. Notes: '+notes+'. Positionnement obligatoire: plateforme de mise en relation et petites annonces communautaires; ne prétends jamais être un service de change, ne promets aucun taux ni rendement, ne dis pas que FrikChange détient des fonds. Retourne JSON avec headline, subhead, postFr, cta.';
    const response=await ai.models.generateContent({model:process.env.GEMINI_MODEL||'gemini-2.5-flash',contents:[{role:'user',parts:[{text:prompt}]}],config:{responseMimeType:'application/json'}});
    const content=JSON.parse(response.text||'{}');
    await db('admin_audit_log',{method:'POST',body:JSON.stringify({admin_id:a.user.id,action:'GENERATE_MARKETING_AI',target:'marketing',details:{topic,audience}})});
    return json(res,200,{content});
  }catch(e){console.error('marketing-ai',e);return json(res,502,{error:'Marketing AI unavailable'});}
}