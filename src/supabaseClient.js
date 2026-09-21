import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const c=window.FRIKCHANGE_CONFIG||{};
const supabaseUrl=String(c.supabaseUrl||'').replace(/\/$/,'');
const supabaseAnonKey=c.supabaseAnonKey||'';
if(!supabaseUrl||!supabaseAnonKey) throw new Error('Configuration Supabase manquante.');
export const supabase=createClient(supabaseUrl,supabaseAnonKey);