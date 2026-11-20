import { NextResponse } from 'next/server';
import { getUserPermissionLevel, permissionAtLeast } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getTvAgendaSnapshot } from '@/lib/rentman-planning-tv';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: 'Log opnieuw in om de TV-agenda te bekijken.' }, { status: 401, headers });

    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('role').eq('id', user.id).maybeSingle();
    if (profileError) throw new Error('Toegang kon niet worden gecontroleerd.');
    if (!profile) return NextResponse.json({ error: 'Geen toegang tot de planning.' }, { status: 403, headers });
    if (profile.role !== 'admin') {
      const level = await getUserPermissionLevel(supabase, user.id, 'planning');
      if (!permissionAtLeast(level, 'view')) return NextResponse.json({ error: 'Geen toegang tot de planning.' }, { status: 403, headers });
    }

    const snapshot = await getTvAgendaSnapshot();
    return NextResponse.json(snapshot, { headers });
  } catch {
    return NextResponse.json({ error: 'De TV-agenda kon niet volledig worden bijgewerkt. De laatste complete gegevens blijven zichtbaar.' }, { status: 502, headers });
  }
}
