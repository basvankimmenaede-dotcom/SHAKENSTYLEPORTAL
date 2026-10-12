import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
const generic = {message:'Als dit e-mailadres bij SHAKENSTYLE Crew bekend is, ontvang je een persoonlijke inloglink.'};

export async function POST(request:NextRequest){
 let email='';
 try {const body=await request.json();email=String(body.email||'').trim().toLowerCase();}catch{return NextResponse.json({error:'Ongeldig verzoek.'},{status:400})}
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return NextResponse.json({error:'Vul een geldig e-mailadres in.'},{status:400});
 if(!process.env.RESEND_API_KEY||!process.env.CREW_EMAIL_FROM)return NextResponse.json({error:'De crewmail is nog niet geconfigureerd.'},{status:503});
 const admin=createAdminClient();
 const {data:member,error:memberError}=await admin.from('crew_portal_members').select('id,full_name').eq('email',email).eq('active',true).maybeSingle();
 if(memberError)return NextResponse.json({error:'Inloggen is tijdelijk niet beschikbaar.'},{status:503});
 if(!member)return NextResponse.json(generic);
 const now=new Date();
 const {data:recent,error:recentError}=await admin.from('crew_login_requests').select('id').eq('email',email).gte('requested_at',new Date(now.getTime()-2*60000).toISOString()).limit(1);
 if(recentError)return NextResponse.json({error:'Inloggen is tijdelijk niet beschikbaar.'},{status:503});
 if(recent?.length)return NextResponse.json(generic);
 const {error:logError}=await admin.from('crew_login_requests').insert({email});
 if(logError)return NextResponse.json({error:'Inloggen is tijdelijk niet beschikbaar.'},{status:503});
 const {data,error}=await admin.auth.admin.generateLink({type:'magiclink',email});
 if(error||!data?.properties?.hashed_token)return NextResponse.json({error:'De inloglink kon niet worden gemaakt.'},{status:503});
 const origin=process.env.CREW_PUBLIC_ORIGIN || request.nextUrl.origin;
 const link=new URL('/auth/crew/verify',origin);
 link.searchParams.set('token_hash',data.properties.hashed_token);
 const safeName=String(member.full_name||'').split(' ')[0].replace(/[<>&"']/g,'');
 const response=await fetch('https://api.resend.com/emails',{
 method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},
 body:JSON.stringify({from:process.env.CREW_EMAIL_FROM,to:[email],subject:'Jouw persoonlijke toegang – SHAKENSTYLE Crew',
 html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#181818"><h2>SHAKENSTYLE Crew</h2><p>Hi ${safeName},</p><p>Via onderstaande knop kun je jouw diensten bekijken en na afloop je shiftrapport invullen.</p><p style="margin:32px 0"><a href="${link.toString().replace(/&/g,'&amp;')}" style="background:#f37021;color:#fff;padding:14px 24px;text-decoration:none;border-radius:8px;font-weight:bold">Bekijk mijn diensten</a></p><p>Deze persoonlijke inloglink is eenmalig te gebruiken en tijdelijk geldig. Deel deze link niet met anderen.</p><p>Groetjes,<br>Team SHAKENSTYLE</p></div>`})
 });
 if(!response.ok)return NextResponse.json({error:'Het versturen van de crewmail is mislukt.'},{status:503});
 return NextResponse.json(generic);
}
