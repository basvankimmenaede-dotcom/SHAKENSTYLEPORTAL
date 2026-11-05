import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type CodeKind = 'email' | 'invite' | 'recovery';
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// Never reuse an administrator's cookie session when activating another account.
export function createCodeClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function verifyEmailCode(client: SupabaseClient, email: string, token: string, type: CodeKind) {
  const { data, error } = await client.auth.verifyOtp({ email: normalizeEmail(email), token: token.trim(), type });
  if (error) throw error;
  if (!data.session || !data.user || normalizeEmail(data.user.email ?? '') !== normalizeEmail(email)) {
    throw new Error('invalid_identity');
  }
  return data.user.id;
}

export async function saveCodePassword(client: SupabaseClient, userId: string, email: string, password: string) {
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || user.id !== userId || normalizeEmail(user.email ?? '') !== normalizeEmail(email)) {
    throw new Error('invalid_identity');
  }
  const result = await client.auth.updateUser({ password });
  if (result.error) throw result.error;
}

export function authErrorMessage(error: { code?: string; status?: number }, stage: 'login' | 'request' | 'verify' | 'password') {
  if (error.status === 429 || error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit') {
    return 'Te veel pogingen. Wacht even voordat je het opnieuw probeert.';
  }
  if (error.code === 'email_not_confirmed') return 'Je account is nog niet geactiveerd. Kies hieronder Account activeren.';
  if (stage === 'login') return error.code === 'invalid_credentials'
    ? 'E-mailadres of wachtwoord klopt niet.' : 'Inloggen lukt nu niet. Probeer het opnieuw.';
  if (stage === 'request') return 'De code kon niet worden aangevraagd. Probeer het later opnieuw.';
  if (stage === 'verify') return 'Deze code is onjuist of verlopen. Gebruik de nieuwste mail of vraag een nieuwe code aan.';
  if (error.code === 'same_password') return 'Kies een ander wachtwoord dan je huidige wachtwoord.';
  return 'Het wachtwoord is niet opgeslagen. Probeer opnieuw of vraag een nieuwe code aan.';
}
