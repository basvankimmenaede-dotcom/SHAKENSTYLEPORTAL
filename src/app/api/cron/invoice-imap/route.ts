import {NextRequest,NextResponse} from 'next/server';
import {synchronizeInvoiceInbox} from '@/lib/invoice-imap-sync';
import {synchronizeRentmanCrewMembers} from '@/lib/crew/synchronize-members';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get('authorization')!=='Bearer '+secret)
  return NextResponse.json({error:'Geen toegang'},{status:401});
 try{
  // Use the existing daily cron instead of adding a second scheduled job.
  // A Rentman error must not interrupt invoice intake.
  const [inbox,crew]=await Promise.allSettled([
   synchronizeInvoiceInbox(),synchronizeRentmanCrewMembers()
  ]);
  if(crew.status==='rejected')console.error('Daily Rentman roster sync failed',crew.reason instanceof Error?crew.reason.message:'unknown');
  if(inbox.status==='rejected')throw inbox.reason;
  return NextResponse.json({...inbox.value,
   crew:crew.status==='fulfilled'?{ok:true,...crew.value}:{ok:false,error:'Crew synchronisatie niet beschikbaar'}
  },{status:inbox.value.ok?200:503});
 }catch(error){
  console.error('Invoice IMAP cron failed',error instanceof Error?error.message:'unknown');
  return NextResponse.json({error:'Synchronisatie niet beschikbaar'},{status:503});
 }
}
