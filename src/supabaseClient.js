import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const c=window.FRIKCHANGE_CONFIG||{};
function normalizeSupabaseUrl(value){
  const raw=String(value||'').trim();
  if(!raw) return '';
  try{return new URL(raw).origin}catch{return ''}
}
const supabaseUrl=normalizeSupabaseUrl(c.supabaseUrl);
const supabaseAnonKey=String(c.supabaseAnonKey||'').trim();
if(!supabaseUrl||!supabaseAnonKey) throw new Error('Configuration Supabase manquante ou invalide.');
export const supabase=createClient(supabaseUrl,supabaseAnonKey);