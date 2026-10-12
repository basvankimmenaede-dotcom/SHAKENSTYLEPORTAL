'use client';
import { useEffect, useMemo, useState } from 'react';

type Category = 'IJs' | 'Fruit' | 'Spirits' | "Soda's" | 'Overig';
type Section = 'consumption' | 'rental' | 'external_rental' | 'external_sale' | 'review';
type Product = { id: string; section: Section; category: Category; name: string; quantity: number; unit: string; unitPrice: number | null; source: 'rentman' | 'manual' };
const sections: { key: Section; label: string }[] = [{ key: 'consumption', label: 'Product & verbruik' }, { key: 'rental', label: 'Materiaal & verhuur' }, { key: 'external_rental', label: 'Externe inhuur' }, { key: 'external_sale', label: 'Externe verkoop' }, { key: 'review', label: 'Nog indelen' }];
const categories: Category[] = ['IJs', 'Fruit', 'Spirits', "Soda's", 'Overig'];
const money = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);

export default function BillingProductUsage({ id, canManage, locked }: { id: string; canManage: boolean; locked: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState<Category>('IJs');
  const [expanded, setExpanded] = useState<Section | null>(null);
  const [message, setMessage] = useState('Producten laden uit Rentman…');
  const [warning, setWarning] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetch('/api/planning/billing/products/' + encodeURIComponent(id))
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Ophalen mislukt'); return data; })
      .then(data => { if (!active) return; setProducts(data.products); setWarning(data.warning || ''); setMessage(data.source === 'saved' ? 'Eerder opgeslagen productoverzicht geladen' : 'Producten uit Rentman geladen'); setLoading(false); })
      .catch(e => { if (active) { setMessage('Fout: ' + e.message); setLoading(false); } });
    return () => { active = false; };
  }, [id]);
  const total = useMemo(() => products.reduce((sum, p) => sum + p.quantity * (p.unitPrice ?? 0), 0), [products]);
  const missing = products.filter(p => p.unitPrice === null).length;
  const editable = canManage && !locked;
  function change(id: string, key: keyof Product, value: string) {
    setProducts(current => current.map(p => p.id === id ? { ...p, [key]: key === 'quantity' ? Math.max(0, Number(value) || 0) : key === 'unitPrice' ? (value === '' ? null : Math.max(0, Number(value) || 0)) : value } : p));
    setDirty(true); setMessage('Niet-opgeslagen wijzigingen');
  }
  async function save() {
    setSaving(true); setMessage('Producten opslaan…');
    try {
      const response = await fetch('/api/planning/billing/products/' + encodeURIComponent(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ products }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Opslaan mislukt');
      setDirty(false); setMessage('✓ Producten opgeslagen in de portal (Rentman ongewijzigd)');
    } catch (e) { setMessage('Opslaan mislukt: ' + (e instanceof Error ? e.message : 'Onbekende fout')); }
    finally { setSaving(false); }
  }
  return <div>
    {sections.map(section => <section key={section.key} className="card" style={{ padding: 12, marginBottom: 10 }}>
    <button type="button" onClick={() => setExpanded(v => v === section.key ? null : section.key)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', border: 0, background: 'transparent', cursor: 'pointer', padding: 4, textAlign: 'left' }}><strong>{section.label} <small>({products.filter(p => p.section === section.key).length})</small></strong><span>{money(products.filter(p => p.section === section.key).reduce((s,p) => s + p.quantity * (p.unitPrice ?? 0), 0))} &nbsp; {expanded === section.key ? '▴' : '▾'}</span></button>
    {expanded === section.key && <>
    {warning && <p style={{ color: 'var(--color-warning, #b66b00)' }}>{warning}</p>}
    {section.key === "consumption" && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      {categories.map(cat => <button type="button" key={cat} className={'button ' + (category === cat ? 'orange' : 'secondary')} onClick={() => setCategory(cat)}>{cat} ({products.filter(p => p.section === section.key && p.category === cat).length})</button>)}
    </div>}
    {loading ? <p>Laden…</p> : products.filter(p => p.section === section.key && (section.key !== 'consumption' || p.category === category)).length === 0 ? <p>Geen producten in deze categorie.</p> : products.filter(p => p.section === section.key && (section.key !== 'consumption' || p.category === category)).map(p =>
      <div key={p.id} style={{ border: '1px solid var(--border, #ddd)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 2fr) minmax(100px, 1fr)', gap: 8 }}>
          <div className="field"><label>Product</label><input className="input" aria-label="Productnaam" disabled={!editable} value={p.name} onChange={e => change(p.id, 'name', e.target.value)} /></div>
          <div className="field"><label>Indeling</label><select className="input" disabled={!editable} value={p.section} onChange={e => change(p.id, 'section', e.target.value)}>{sections.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select><label>Categorie</label><select className="input" disabled={!editable} value={p.category} onChange={e => change(p.id, 'category', e.target.value)}>{categories.map(cat => <option key={cat}>{cat}</option>)}</select></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div className="field"><label>Aantal</label><input className="input" type="number" min="0" step="0.01" disabled={!editable} value={p.quantity} onChange={e => change(p.id, 'quantity', e.target.value)} /></div>
          <div className="field"><label>Eenheid</label><input className="input" disabled={!editable} value={p.unit} onChange={e => change(p.id, 'unit', e.target.value)} /></div>
          <div className="field"><label>Verkoopprijs / eenheid</label><input className="input" type="number" min="0" step="0.01" placeholder="Controleren" disabled={!editable} value={p.unitPrice ?? ''} onChange={e => change(p.id, 'unitPrice', e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <small>{p.source === 'rentman' ? 'Rentman · bewerkbare kopie' : 'Handmatig toegevoegd'}</small>
          <strong>{p.unitPrice === null ? 'Prijs controleren' : money(p.quantity * p.unitPrice)}</strong>
          {editable && <button type="button" className="button secondary" onClick={() => { setProducts(current => current.filter(x => x.id !== p.id)); setDirty(true); setMessage('Niet-opgeslagen wijzigingen'); }}>Verwijderen</button>}
        </div>
      </div>)}
    {editable && <button type="button" className="button secondary" onClick={() => { setProducts(current => [...current, { id: 'manual:' + Date.now(), section: section.key, category, name: 'Nieuw product', quantity: 1, unit: 'stuks', unitPrice: null, source: 'manual' }]); setDirty(true); setMessage('Niet-opgeslagen wijzigingen'); }}>+ Product toevoegen aan {category}</button>}
    {section.key === 'consumption' && <div style={{ background: 'var(--surface-secondary, #f5f5f5)', padding: 14, borderRadius: 10, marginTop: 16 }}>
      {categories.map(cat => <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><span>{cat}</span><strong>{money(products.filter(p => p.section === section.key && p.category === cat).reduce((sum, p) => sum + p.quantity * (p.unitPrice ?? 0), 0))}</strong></div>)}
      <hr /><div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>Totaal excl. btw</strong><strong>{money(products.filter(p => p.section === section.key).reduce((sum, p) => sum + p.quantity * (p.unitPrice ?? 0), 0))}</strong></div>
      {missing > 0 && <p style={{ marginBottom: 0 }}>{missing} prijs{missing === 1 ? '' : 'en'} nog te controleren. Totaal is voorlopig.</p>}
    </div>}
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
      {editable && <button type="button" className="button orange" disabled={!dirty || saving || loading} onClick={save}>{saving ? 'Opslaan…' : 'Producten opslaan'}</button>}
      <span role="status" aria-live="polite">{message}</span>
    </div>
    </>}
    </section>)}
  </div>;
}
