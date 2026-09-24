import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const c=window.FRIKCHANGE_CONFIG||{};
const url=String(c.supabaseUrl||'').trim().replace(/\/$/,'');
const key=String(c.supabaseAnonKey||'').trim();
if(!url||!key)throw new Error('Configuration Supabase manquante.');
export const supabase=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});