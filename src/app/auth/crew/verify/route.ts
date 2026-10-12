import { NextRequest,NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request:NextRequest){
 const token_hash=request.nextUrl.searchParams.get('token_hash');
 if(!token_hash)return NextResponse.redirect(new URL('/crew?error=link',request.url));
 const supabase=await createClient();
 const {error}=await supabase.auth.verifyOtp({token_hash,type:'magiclink'});
 if(error)return NextResponse.redirect(new URL('/crew?error=link',request.url));
 return NextResponse.redirect(new URL('/crew',request.url));
}
