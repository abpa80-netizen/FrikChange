import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const c=window.FRIKCHANGE_CONFIG||{};
export const supabase=createClient(c.supabaseUrl||'',c.supabaseAnonKey||'');