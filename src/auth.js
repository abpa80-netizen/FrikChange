import {supabase} from './supabaseClient.js';
const origin=()=>window.location.origin.replace(/\/$/,'');
const rateLimit=e=>e?.status===429||/rate.?limit|too many|over_email_send_rate_limit/i.test(String(e?.message||e?.code||''));
const normalize=e=>{if(rateLimit(e))return new Error('Trop de tentatives d’inscription rapprochées. Veuillez patienter quelques minutes avant de réessayer ou vérifier votre boîte mail.');return new Error(e?.message||'Une erreur est survenue.');};
export async function signUp({email,password,fullName,phone,referralCode}){try{return await supabase.auth.signUp({email,password,options:{emailRedirectTo:origin(),data:{full_name:fullName||'',phone_whatsapp:phone||'',referral_code:referralCode||''}}})}catch(e){throw normalize(e)}}
export async function signIn(email,password){try{return await supabase.auth.signInWithPassword({email,password})}catch(e){throw normalize(e)}}
export async function signOut(){const r=await supabase.auth.signOut();if(r.error)throw normalize(r.error);return r}
export async function resetPassword(email){if(!email)throw new Error('Saisissez votre email.');try{return await supabase.auth.resetPasswordForEmail(email,{redirectTo:origin()})}catch(e){throw normalize(e)}}