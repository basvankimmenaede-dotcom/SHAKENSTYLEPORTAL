import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
const generic = {message:'Als dit e-mailadres bij SHAKENSTYLE Crew bekend is, ontvang je een persoonlijke inloglink.'};

export async function POST(request:NextRequest){
 let email='';
 try {const body=await request.json();email=String(body.email||'').trim().toLowerCase();}catch{return NextResponse.json({error:'Ongeldig verzoek.'},{status:400})}
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return NextResponse.json({error:'Vul een geldig e-mailadres in.'},{status:400});

 const admin=createAdminClient();
 const {data:member,error:memberError}=await admin.from('crew_portal_members').select('id,full_name').or(`email.eq.${email},login_email_override.eq.${email}`).eq('active',true).maybeSingle();
 if(memberError)return NextResponse.json({error:'Inloggen is tijdelijk niet beschikbaar.'},{status:503});
 if(!member)return NextResponse.json(generic);
 const now=new Date();
 const {data:recent,error:recentError}=await admin.from('crew_login_requests').select('id').eq('email',email).gte('requested_at',new Date(now.getTime()-2*60000).toISOString()).limit(1);
 if(recentError)return NextResponse.json({error:'Inloggen is tijdelijk niet beschikbaar.'},{status:503});
 if(recent?.length)return NextResponse.json(generic);
 const {error:logError}=await admin.from('crew_login_requests').insert({email});
 if(logError)return NextResponse.json({error:'Inloggen is tijdelijk niet beschikbaar.'},{status:503});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!anon)return NextResponse.json({error:'Supabase Auth is niet geconfigureerd.'},{status:503});
 const origin=process.env.CREW_PUBLIC_ORIGIN || request.nextUrl.origin;
 const redirect=new URL('/auth/callback',origin);
 redirect.searchParams.set('next','/crew');
 const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const {error}=await auth.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:redirect.toString()}});
 if(error)return NextResponse.json({error:'De inlogmail kon niet worden verstuurd.'},{status:503});
 return NextResponse.json(generic);
}
