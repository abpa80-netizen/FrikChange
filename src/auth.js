import {supabase} from './supabaseClient.js';
function cleanOrigin(){return window.location.origin.replace(/\/$/,'')||window.location.origin}
function isRateLimitError(error){
  const text=String(error?.message||error?.code||'').toLowerCase();
  return error?.status===429 || text.includes('rate limit') || text.includes('rate_limit') || text.includes('too many requests') || text.includes('over_email_send_rate_limit');
}
function authError(error){
  if(isRateLimitError(error)){
    const e=new Error('Trop de tentatives d'inscription rapprochées. Veuillez patienter 5 minutes ou vérifier vos mails.');
    e.code='EMAIL_RATE_LIMIT';
    e.status=429;
    return e;
  }
  return error;
}
export async function signUp(v){
  const email=String(v.email||'').trim().toLowerCase();
  const redirect=cleanOrigin();
  let storedRef='';
  try{storedRef=(localStorage.getItem('frik_ref')||'').trim().toUpperCase()}catch{}
  const referralCode=storedRef||String(v.referralCode||'').trim().toUpperCase();
  try{
    const {data,error}=await supabase.auth.signUp({
      email,password:v.password,
      options:{emailRedirectTo:redirect,data:{full_name:v.fullName||'',phone_whatsapp:v.phone||'',referral_code:referralCode}}
    });
    if(error)throw authError(error);
    try{if(referralCode)localStorage.removeItem('frik_ref')}catch{}
    return data;
  }catch(error){
    throw authError(error);
  }
}
export async function signIn(email,password){
  const {data,error}=await supabase.auth.signInWithPassword({email:String(email).trim().toLowerCase(),password});
  if(error)throw error;
  return data;
}
export async function signOut(){const {error}=await supabase.auth.signOut();if(error)throw error}
export async function resetPassword(email){const {error}=await supabase.auth.resetPasswordForEmail(String(email).trim().toLowerCase(),{redirectTo:cleanOrigin()});if(error)throw error}
