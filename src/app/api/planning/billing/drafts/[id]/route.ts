import { NextResponse } from 'next/server';
import { requireModulePermission } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
type Line = { description: string; quantity: number; unitPrice: number; vatRate: number };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireModulePermission('billing', 'view');
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: 'Ongeldig project.' }, { status: 400 });
  const admin = createAdminClient();
  const { data: item, error: itemError } = await admin.from('billing_items')
    .select('id,project_name,customer_name,rentman_project_number,status').eq('id', id).maybeSingle();
  if (itemError || !item) return NextResponse.json({ error: 'Project niet gevonden.' }, { status: 404 });
  const { data: draft, error } = await admin.from('billing_drafts').select('*').eq('billing_item_id', id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Concept kon niet worden geladen.' }, { status: 500 });
  return NextResponse.json({ item, draft });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireModulePermission('billing', 'manage');
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: 'Ongeldig project.' }, { status: 400 });
  const admin = createAdminClient();
  const { data: item } = await admin.from('billing_items').select('id,status').eq('id', id).maybeSingle();
  if (!item) return NextResponse.json({ error: 'Project niet gevonden.' }, { status: 404 });
  if (item.status === 'invoiced') return NextResponse.json({ error: 'Een gefactureerd project is vergrendeld. Heropen het eerst.' }, { status: 409 });
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.lines) || body.lines.length > 100) {
    return NextResponse.json({ error: 'Ongeldige factuurregels.' }, { status: 400 });
  }
  const lines: Line[] = [];
  for (const raw of body.lines) {
    const description = String(raw?.description ?? '').trim();
    const quantity = Number(raw?.quantity);
    const unitPrice = Number(raw?.unitPrice);
    const vatRate = Number(raw?.vatRate);
    if (!description || description.length > 500 || !Number.isFinite(quantity) || quantity < 0 || quantity > 1000000 ||
      !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 100000000 || ![0, 9, 21].includes(vatRate)) {
      return NextResponse.json({ error: 'Controleer de omschrijving, aantallen, prijzen en btw van iedere regel.' }, { status: 400 });
    }
    lines.push({ description, quantity, unitPrice, vatRate });
  }
  const field = (key: string, max = 1000) => String(body[key] ?? '').trim().slice(0, max);
  const { error } = await admin.from('billing_drafts').upsert({
    billing_item_id: id,
    reference: field('reference', 200),
    customer_name: field('customer_name', 300),
    customer_email: field('customer_email', 300),
    customer_address: field('customer_address', 1000),
    description: field('description', 1000),
    notes: field('notes', 3000),
    currency: 'EUR',
    lines,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'billing_item_id' });
  if (error) return NextResponse.json({ error: 'Concept kon niet worden opgeslagen.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
