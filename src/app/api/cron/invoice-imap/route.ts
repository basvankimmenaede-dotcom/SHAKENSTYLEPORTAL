import {NextRequest,NextResponse} from 'next/server';
import {synchronizeInvoiceInbox} from '@/lib/invoice-imap-sync';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get('authorization')!=='Bearer '+secret)
  return NextResponse.json({error:'Geen toegang'},{status:401});
 try{
  const result=await synchronizeInvoiceInbox();
  return NextResponse.json(result,{status:result.ok?200:503});
 }catch(error){
  console.error('Invoice IMAP cron failed',error instanceof Error?error.message:'unknown');
  return NextResponse.json({error:'Synchronisatie niet beschikbaar'},{status:503});
 }
}
