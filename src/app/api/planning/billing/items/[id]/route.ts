import { NextResponse } from 'next/server';
import { requireModulePermission } from '@/lib/auth';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await requireModulePermission('billing', 'manage');
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const status = String(body.status ?? '');

  if (!id || !['open', 'invoiced', 'skip'].includes(status)) {
    return NextResponse.json({ ok: false, error: 'Ongeldige facturatiestatus.' }, { status: 400 });
  }

  const completedAt = status === 'open' ? null : new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('billing_items')
    .update({
      status,
      completed_at: completedAt,
      completed_by: status === 'open' ? null : user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id,status,completed_at')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!updated || updated.status !== status) {
    return NextResponse.json({ ok: false, error: 'De status is niet opgeslagen. Controleer de databaserechten en probeer opnieuw.' }, { status: 409 });
  }

  return NextResponse.json({ ok: true, status: updated.status, completedAt: updated.completed_at });
}
