import { NextResponse } from 'next/server';
import { requireModulePermission } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireModulePermission('billing', 'view');
  const { id } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin.from('billing_review_checks').select('check_key').eq('billing_item_id', id);
  if (error) return NextResponse.json({ error: 'Controlepunten laden mislukt.' }, { status: 500 });
  return NextResponse.json({ resolved: (data ?? []).map(row => row.check_key) });
}
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireModulePermission('billing', 'manage');
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const key = String(body?.key ?? '');
  if (!/^[a-z0-9:_-]{1,120}$/.test(key) || typeof body?.resolved !== 'boolean') return NextResponse.json({ error: 'Ongeldig controlepunt.' }, { status: 400 });
  const admin = createAdminClient();
  const { data: item } = await admin.from('billing_items').select('status').eq('id', id).maybeSingle();
  if (!item) return NextResponse.json({ error: 'Project niet gevonden.' }, { status: 404 });
  if (item.status === 'invoiced') return NextResponse.json({ error: 'Project is vergrendeld.' }, { status: 409 });
  const result = body.resolved
    ? await admin.from('billing_review_checks').upsert({ billing_item_id: id, check_key: key, resolved_by: user.id, resolved_at: new Date().toISOString() }, { onConflict: 'billing_item_id,check_key' })
    : await admin.from('billing_review_checks').delete().eq('billing_item_id', id).eq('check_key', key);
  if (result.error) return NextResponse.json({ error: 'Opslaan mislukt.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}