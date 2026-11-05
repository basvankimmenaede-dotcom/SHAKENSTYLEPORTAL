import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildStaffHourOverview,
  currentWeekMonday,
  isValidMonday,
  type StaffHourContract,
} from '@/lib/personnel-hours';

export const dynamic = 'force-dynamic';

async function authorise() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 }) };

  const { data: profile } = await supabase.from('profiles')
    .select('role').eq('id', user.id).maybeSingle();

  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Alleen beheerders kunnen personeelsuren bekijken.' }, { status: 403 }) };
  }
  return { user };
}

export async function GET(request: NextRequest) {
  const auth = await authorise();
  if (auth.error) return auth.error;

  const currentWeek = currentWeekMonday();
  const week = request.nextUrl.searchParams.get('week') || currentWeek;
  if (!isValidMonday(week) || week > currentWeek || week < '2024-01-01') {
    return NextResponse.json({ error: 'Ongeldige week.' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('staff_hour_contracts')
      .select('rentman_crew_id,weekly_hours,tracking_start_week,opening_balance_hours,is_active')
      .order('rentman_crew_id');

    if (error) throw new Error('Contracturen konden niet worden geladen: ' + error.message);

    const contracts: StaffHourContract[] = (data ?? []).map((row) => ({
      rentman_crew_id: Number(row.rentman_crew_id),
      weekly_hours: Number(row.weekly_hours),
      tracking_start_week: String(row.tracking_start_week),
      opening_balance_hours: Number(row.opening_balance_hours || 0),
      is_active: Boolean(row.is_active),
    }));

    const overview = await buildStaffHourOverview(week, contracts);
    return NextResponse.json({ ...overview, contracts });
  } catch (error) {
    console.error('Personnel hours GET failed', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Urenregistraties konden niet worden geladen.',
    }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorise();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 });
  }

  const crewId = Number(body.crewId);
  if (!Number.isSafeInteger(crewId) || crewId <= 0) {
    return NextResponse.json({ error: 'Selecteer een geldige medewerker.' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    if (body.active === false) {
      const { error } = await admin.from('staff_hour_contracts')
        .update({ is_active: false, updated_by: auth.user!.id, updated_at: new Date().toISOString() })
        .eq('rentman_crew_id', crewId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    const weeklyHours = Number(body.weeklyHours);
    const openingBalanceHours = Number(body.openingBalanceHours ?? 0);
    const trackingStartWeek = String(body.trackingStartWeek ?? currentWeekMonday());
    if (!Number.isFinite(weeklyHours) || weeklyHours <= 0 || weeklyHours > 80
      || !Number.isFinite(openingBalanceHours) || Math.abs(openingBalanceHours) > 10000
      || !isValidMonday(trackingStartWeek) || trackingStartWeek > currentWeekMonday()
      || trackingStartWeek < '2024-01-01') {
      return NextResponse.json({ error: 'Controleer contracturen, beginsaldo en startweek (maandag).' }, { status: 400 });
    }

    const { error } = await admin.from('staff_hour_contracts').upsert({
      rentman_crew_id: crewId,
      weekly_hours: Math.round(weeklyHours * 100) / 100,
      tracking_start_week: trackingStartWeek,
      opening_balance_hours: Math.round(openingBalanceHours * 100) / 100,
      is_active: true,
      updated_by: auth.user!.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'rentman_crew_id' });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Personnel hours POST failed', error);
    return NextResponse.json({ error: 'Contracturen opslaan is mislukt.' }, { status: 500 });
  }
}
