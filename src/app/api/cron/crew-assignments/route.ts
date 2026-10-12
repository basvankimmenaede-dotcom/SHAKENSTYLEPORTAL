import {NextRequest,NextResponse} from 'next/server';
import {synchronizeCrewAssignments} from '@/app/api/crew/admin/sync-assignments/route';

export const runtime='nodejs';
export const maxDuration=60;

// Vercel Cron sends CRON_SECRET as a Bearer token. Never run unauthenticated.
export async function GET(request:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret || request.headers.get('authorization')!==`Bearer ${secret}`){
  return NextResponse.json({error:'Unauthorized'},{status:401});
 }
 return synchronizeCrewAssignments();
}
