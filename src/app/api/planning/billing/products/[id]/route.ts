import { NextResponse } from 'next/server';
import { requireModulePermission } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
type Category = 'IJs' | 'Fruit' | 'Spirits' | "Soda's" | 'Overig';
type Section = 'consumption' | 'rental' | 'external_rental' | 'external_sale' | 'review';
type Product = { id: string; section: Section; category: Category; name: string; quantity: number; unit: string; unitPrice: number | null; source: 'rentman' | 'manual' };
const categories: Category[] = ['IJs', 'Fruit', 'Spirits', "Soda's", 'Overig'];
function classify(name: string, group = ''): Category {
  const s = (name + ' ' + group).toLowerCase();
  if (/\b(ijs|ice|crushed|blokjes)\b/.test(s)) return 'IJs';
  if (/\b(fruit|limoen|lime|citroen|lemon|sinaasappel|orange|munt|mint|aardbei|strawberry|garnering|garnish)\b/.test(s)) return 'Fruit';
  if (/\b(vodka|gin|rum|whisk|tequila|mezcal|cognac|liqueur|likeur|bourbon|spirits|jenever)\b/.test(s)) return 'Spirits';
  if (/\b(soda|tonic|cola|sprite|ginger|bitter lemon|frisdrank|soft drink)\b/.test(s)) return "Soda's";
  return 'Overig';
}
function sectionFor(item: Record<string, unknown>): Section {
  const type = String(item.rental_sales ?? '').toLowerCase();
  const temporary = item.temporary === true || item.temporary === 'true';
  if (type === 'sale') return temporary ? 'external_sale' : 'consumption';
  if (type === 'rental') return temporary ? 'external_rental' : 'rental';
  return 'review';
}
function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
async function rentmanRows(path: string): Promise<Record<string, unknown>[]> {
  const token = process.env.RENTMAN_API_TOKEN;
  if (!token) throw new Error('Rentman API-token ontbreekt.');
  const rows: Record<string, unknown>[] = [];
  let next: string | null = 'https://api.rentman.net' + path;
  for (let page = 0; next && page < 20; page++) {
    if (!next.startsWith('https://api.rentman.net/')) throw new Error('Ongeldige Rentman-paginering.');
    const response = await fetch(next, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error('Rentman ophalen mislukt (' + response.status + ').');
    const data: { data?: Record<string, unknown>[]; next_page_url?: string | null } = await response.json();
    rows.push(...(data.data ?? []));
    next = data.next_page_url ?? null;
  }
  return rows;
}
function label(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const x = v as Record<string, unknown>;
    return String(x.displayname ?? x.name ?? '');
  }
  return '';
}
async function sourceProducts(projectId: number): Promise<Product[]> {
  const [equipment, costs] = await Promise.all([
    rentmanRows('/projects/' + projectId + '/projectequipment?fields=id,equipment,quantity,price&expand=equipment&limit=300'),
    rentmanRows('/projects/' + projectId + '/costs?fields=id,name,quantity,sale_price&limit=300'),
  ]);
  const products: Product[] = [];
  const ids = [...new Set(equipment.map(r => Number(typeof r.equipment === 'object' && r.equipment !== null ? (r.equipment as Record<string, unknown>).id : String(r.equipment ?? '').split('/').pop())).filter(Number.isFinite))];
  const catalog = new Map<number, Record<string, unknown>>();
  await Promise.all(ids.map(async id => {
    const rows = await rentmanRows('/equipment?fields=id,name,rental_sales,temporary,unit,price&limit=1&id=' + id);
    if (rows[0] && Number(rows[0].id) === id) catalog.set(id, rows[0]);
  }));
  for (const r of equipment) {
    const equipmentInfo = r.equipment && typeof r.equipment === 'object' ? r.equipment as Record<string, unknown> : {};
    const name = label(r.equipment) || label(r.displayname) || 'Rentman-artikel ' + r.id;
    const equipmentId = Number(equipmentInfo.id ?? String(r.equipment ?? '').split('/').pop());
    const meta = catalog.get(equipmentId) ?? equipmentInfo;
    const group = label(meta.folder);
    products.push({ id: 'equipment:' + r.id, section: sectionFor(meta), category: classify(name, group), name, quantity: number(r.quantity) ?? 0, unit: label(meta.unit) || 'stuks', unitPrice: number(r.price), source: 'rentman' });
  }
  for (const r of costs) {
    const name = String(r.name ?? 'Overige kosten');
    products.push({ id: 'cost:' + r.id, section: 'review', category: classify(name), name, quantity: number(r.quantity) ?? 0, unit: 'stuks', unitPrice: number(r.sale_price), source: 'rentman' });
  }
  return products;
}
async function context(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const admin = createAdminClient();
  const { data: item } = await admin.from('billing_items').select('id,status,rentman_project_id').eq('id', id).maybeSingle();
  return item ? { admin, item } : null;
}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireModulePermission('billing', 'view');
  const { id } = await params;
  const ctx = await context(id);
  if (!ctx) return NextResponse.json({ error: 'Project niet gevonden.' }, { status: 404 });
  const { data: draft, error } = await ctx.admin.from('billing_drafts').select('product_usage').eq('billing_item_id', id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Productgegevens niet beschikbaar.' }, { status: 500 });
  const saved = draft?.product_usage;
  
  if (!ctx.item.rentman_project_id) return NextResponse.json({ products: [], source: 'manual', warning: 'Dit project heeft geen Rentman-koppeling.' });
  try {
    const products = await sourceProducts(Number(ctx.item.rentman_project_id));
    const byId = new Map(products.map(p => [p.id, p]));
    if (Array.isArray(saved)) {
      const merged = saved.map((p: Product) => {
        const live = byId.get(p.id);
        return { ...p, section: live?.section ?? p.section ?? 'review' };
      });
      for (const p of products) if (!merged.some((x: Product) => x.id === p.id)) merged.push(p);
      return NextResponse.json({ products: merged, source: 'saved' });
    }
    return NextResponse.json({ products, source: 'rentman', warning: 'Aantallen zijn de geplande aantallen uit Rentman; controleer het daadwerkelijke verbruik.' });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Rentman ophalen mislukt.' }, { status: 502 });
  }
}
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireModulePermission('billing', 'manage');
  const { id } = await params;
  const ctx = await context(id);
  if (!ctx) return NextResponse.json({ error: 'Project niet gevonden.' }, { status: 404 });
  if (ctx.item.status === 'invoiced') return NextResponse.json({ error: 'Gefactureerde projecten zijn vergrendeld.' }, { status: 409 });
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.products) || body.products.length > 500) return NextResponse.json({ error: 'Ongeldige productregels.' }, { status: 400 });
  const products: Product[] = [];
  for (const p of body.products) {
    const quantity = number(p?.quantity);
    const price = number(p?.unitPrice);
    const name = String(p?.name ?? '').trim();
    const unit = String(p?.unit ?? '').trim();
    const category = p?.category as Category;
    const section = p?.section as Section;
    if (!name || name.length > 250 || !unit || unit.length > 50 || quantity === null || quantity > 1000000 || (price !== null && price > 100000000) || !categories.includes(category) || !['consumption','rental','external_rental','external_sale','review'].includes(section)) {
      return NextResponse.json({ error: 'Controleer naam, categorie, aantal, eenheid en verkoopprijs.' }, { status: 400 });
    }
    products.push({ id: String(p.id ?? '').slice(0, 100), name, section, category, quantity, unit, unitPrice: price, source: p.source === 'rentman' ? 'rentman' : 'manual' });
  }
  const { error } = await ctx.admin.from('billing_drafts').upsert({ billing_item_id: id, product_usage: products, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'billing_item_id' });
  if (error) return NextResponse.json({ error: 'Producten opslaan mislukt.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
