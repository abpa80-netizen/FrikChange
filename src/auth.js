import {supabase} from './supabaseClient.js';
export async function signUp(v){const {data,error}=await supabase.auth.signUp({email:v.email,password:v.password,options:{data:{full_name:v.fullName,phone_whatsapp:v.phone,referral_code:v.referralCode}}});if(error)throw error;return data}
export async function signIn(email,password){const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;return data}
export async function signOut(){const {error}=await supabase.auth.signOut();if(error)throw error}
export async function resetPassword(email){const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/?reset=1'});if(error)throw error}