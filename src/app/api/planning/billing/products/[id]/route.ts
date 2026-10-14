import { NextResponse } from 'next/server';
import { requireModulePermission } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
type Category = string;
type IngredientMode = 'sets' | 'loose';
type Section = 'consumption' | 'rental' | 'external_rental' | 'external_sale' | 'review';
type Product = { id: string; section: Section; category: Category; folderPath?: string; name: string; quantity: number; unit: string; unitPrice: number | null; source: 'rentman' | 'manual'; billingMode?: IngredientMode };
const categories: Category[] = ['Ijs', 'Fruit / Groentes', 'Spirits', "Soda's", 'Overig'];
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
async function sourceProducts(projectId: number, mode: IngredientMode): Promise<Product[]> {
  const [equipment, costs] = await Promise.all([
    rentmanRows('/projects/' + projectId + '/projectequipment?fields=id,equipment,parent,quantity,quantity_total,unit_price,factor,discount&expand=equipment&limit=300'),
    rentmanRows('/projects/' + projectId + '/costs?fields=id,name,quantity,sale_price&limit=300'),
  ]);
  const products: Product[] = [];
  const [catalogRows, folderRows] = await Promise.all([rentmanRows('/equipment?fields=id,name,rental_sales,temporary,unit,price,folder,type&limit=1500'), rentmanRows('/folders?fields=id,name,parent,itemtype&limit=1500')]);
  const folderById = new Map(folderRows.map(folder => [Number(folder.id), folder]));
  const folderId = (value: unknown): number | null => { const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>).id : value; const match = String(raw ?? '').match(/([0-9]+)$/); return match ? Number(match[1]) : null; };
  const folderPath = (value: unknown): string => { const names: string[] = []; let id = folderId(value); const seen = new Set<number>(); while (id !== null && !seen.has(id)) { seen.add(id); const folder = folderById.get(id); if (!folder) break; names.unshift(String(folder.name ?? '')); id = folderId(folder.parent); } return names.join('/'); };
  const catalog = new Map(catalogRows.map(item => [Number(item.id), item]));
  const projectRowById = new Map(equipment.map(row => [Number(row.id), row]));
  const rowParentId = (value: unknown): number | null => {
    const ref = value && typeof value === 'object' ? (value as Record<string, unknown>).id : value;
    const match = String(ref ?? '').match(/([0-9]+)$/);
    return match ? Number(match[1]) : null;
  };
  const ancestorKind = (row: Record<string, unknown>): 'rental' | 'sale' | 'unknown' | null => {
    const seen = new Set<number>();
    let parentId = rowParentId(row.parent);
    let kind: 'rental' | 'sale' | null = null;
    while (parentId !== null && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = projectRowById.get(parentId);
      if (!parent) return 'unknown';
      const ref = parent.equipment && typeof parent.equipment === 'object' ? parent.equipment as Record<string, unknown> : {};
      const meta = catalog.get(Number(ref.id ?? String(parent.equipment ?? '').split('/').pop())) ?? ref;
      const saleType = String(meta.rental_sales ?? '').toLowerCase();
      if (saleType === 'rental') return 'rental';
      if (saleType === 'sale') kind = 'sale';
      parentId = rowParentId(parent.parent);
    }
    return kind;
  };
  for (const r of equipment) {
    const equipmentInfo = r.equipment && typeof r.equipment === 'object' ? r.equipment as Record<string, unknown> : {};
    const name = label(r.equipment) || label(r.displayname) || 'Rentman-artikel ' + r.id;
    const equipmentId = Number(equipmentInfo.id ?? String(r.equipment ?? '').split('/').pop());
    const meta = catalog.get(equipmentId) ?? equipmentInfo;
    const ancestor = ancestorKind(r);
    if (ancestor === 'rental' || ancestor === 'unknown') continue;
    const saleSet = String(meta.type ?? '').toLowerCase() === 'set' && String(meta.rental_sales ?? '').toLowerCase() === 'sale';
    if (mode === 'sets' && ancestor === 'sale') continue;
    if (mode === 'loose' && saleSet) continue;
    const path = folderPath(meta.folder);
    const ingredientIndex = path.split('/').indexOf('Ingrediënten');
    const ingredientFolder = ingredientIndex >= 0 ? path.split('/').slice(ingredientIndex + 1).join('/') : '';
    const section = ingredientIndex >= 0 || saleSet || ancestor === 'sale' ? 'consumption' : sectionFor(meta);
    const segments = path.split('/').filter(Boolean);
    const folderName = saleSet ? 'Cocktails / sets' : ingredientIndex >= 0 ? (ingredientFolder || 'Ingrediënten') : (segments.length ? segments.slice(-2).join(' / ') : 'Zonder Rentman-map');
    const unitPrice = number(r.unit_price) ?? number(meta.price);
    const quantity = number(r.quantity_total) ?? number(r.quantity) ?? 0;
    // A repeated booking of the same article at the same price is one invoice row with summed quantity.
    // Different prices remain separate to avoid hiding project-specific pricing.
    const existing = products.find(p => p.source === 'rentman' && p.id.startsWith('equipment:') && p.name === name && p.section === section && p.folderPath === path && p.unitPrice === unitPrice && p.unit === (label(meta.unit) || 'stuks'));
    if (existing) existing.quantity += quantity;
    else products.push({ id: 'equipment:' + r.id, section, category: folderName, folderPath: path, name, quantity, unit: label(meta.unit) || 'stuks', unitPrice, source: 'rentman' });
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
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireModulePermission('billing', 'view');
  const { id } = await params;
  const ctx = await context(id);
  if (!ctx) return NextResponse.json({ error: 'Project niet gevonden.' }, { status: 404 });
  const { data: draft, error } = await ctx.admin.from('billing_drafts').select('product_usage').eq('billing_item_id', id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Productgegevens niet beschikbaar.' }, { status: 500 });
  const stored = draft?.product_usage;
  const saved = Array.isArray(stored) ? stored : (stored && typeof stored === 'object' && Array.isArray(stored.products) ? stored.products : null);
  const savedMode: IngredientMode = (!Array.isArray(stored) && stored?.mode === 'loose') || (Array.isArray(saved) && saved[0]?.billingMode === 'loose') ? 'loose' : 'sets';
  const requested = new URL(request.url).searchParams.get('mode');
  const mode: IngredientMode = requested === 'loose' ? 'loose' : requested === 'sets' ? 'sets' : savedMode;
  
  if (!ctx.item.rentman_project_id) return NextResponse.json({ products: [], source: 'manual', warning: 'Dit project heeft geen Rentman-koppeling.' });
  try {
    const products = await sourceProducts(Number(ctx.item.rentman_project_id), mode);
    const byId = new Map(products.map(p => [p.id, p]));
    if (Array.isArray(saved) && mode === savedMode) {
      const merged = saved.map((p: Product) => {
        const live = byId.get(p.id);
        return live ? { ...p, name: live.name, quantity: live.quantity, unit: live.unit, section: live.section, category: live.category, folderPath: live.folderPath, unitPrice: p.unitPrice ?? live.unitPrice } : p.source === 'manual' ? p : null;
      }).filter((p): p is Product => p !== null);
      for (const p of products) if (!merged.some((x: Product) => x.id === p.id)) merged.push(p);
      return NextResponse.json({ products: merged, source: 'saved', mode });
    }
    return NextResponse.json({ products, source: 'rentman', mode, warning: 'Aantallen zijn de geplande aantallen uit Rentman; controleer het daadwerkelijke verbruik.' });
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
  const mode: IngredientMode = body.mode === 'loose' ? 'loose' : 'sets';
  const products: Product[] = [];
  for (const p of body.products) {
    const quantity = number(p?.quantity);
    const price = number(p?.unitPrice);
    const name = String(p?.name ?? '').trim();
    const unit = String(p?.unit ?? '').trim();
    const category = p?.category as Category;
    const section = p?.section as Section;
    if (!name || name.length > 250 || !unit || unit.length > 50 || quantity === null || quantity > 1000000 || (price !== null && price > 100000000) || (typeof category !== 'string' || !category.trim() || category.length > 180) || !['consumption','rental','external_rental','external_sale','review'].includes(section)) {
      return NextResponse.json({ error: 'Controleer naam, categorie, aantal, eenheid en verkoopprijs.' }, { status: 400 });
    }
    products.push({ id: String(p.id ?? '').slice(0, 100), name, section, category, folderPath: typeof p.folderPath === 'string' ? p.folderPath.slice(0, 400) : undefined, quantity, unit, unitPrice: price, source: p.source === 'rentman' ? 'rentman' : 'manual', billingMode: mode });
  }
  const { error } = await ctx.admin.from('billing_drafts').upsert({ billing_item_id: id, product_usage: products, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'billing_item_id' });
  if (error) return NextResponse.json({ error: 'Producten opslaan mislukt.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
