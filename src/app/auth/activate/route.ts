import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const formData = await request.formData();
  const tokenHash = String(formData.get('token_hash') ?? '').trim();
  const type = String(formData.get('type') ?? '').trim();

  if (!tokenHash || type !== 'invite') {
    return NextResponse.redirect(new URL('/activate?error=invalid', request.url), 303);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'invite',
  });

  if (error) {
    return NextResponse.redirect(new URL('/activate?error=used-or-expired', request.url), 303);
  }

  return NextResponse.redirect(new URL('/accept-invite', request.url), 303);
}
