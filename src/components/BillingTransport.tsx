'use client';
import { useEffect, useState } from 'react';

export type TransportLine = { description: string; quantity: number; unitPrice: number; vatRate: number };
type Vehicle = { id: number; name: string; amount: number };
const money = (value: number) => value.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
const rentalRate = (name: string) => /bakwagen|vrachtwagen/i.test(name) ? 100 : /bestelbus/i.test(name) ? 80 : /bestelauto|auto\b/i.test(name) ? 40 : null;

export default function BillingTransport({ id }: {
  id: string; lines: TransportLine[]; canManage: boolean; onChange: (lines: TransportLine[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [oneWayKm, setOneWayKm] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/planning/billing/hours/' + encodeURIComponent(id))
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Rentman niet beschikbaar')))
      .then(data => {
        if (active) setOneWayKm(typeof data.rentmanOneWayKm === 'number' && Number.isFinite(data.rentmanOneWayKm) ? data.rentmanOneWayKm : null);
        if (active) setVehicles((data.rows || [])
          .filter((row: {type?: string; name: string}) => row.type === 'vehicle_function' || /bakwagen|bestelbus|bestelauto|vrachtwagen|transport/i.test(row.name))
          .map((row: Vehicle) => ({id: row.id, name: row.name, amount: row.amount})));
      })
      .catch(() => { if (active) setVehicles([]); });
    return () => { active = false; };
  }, [id]);
  const planned = vehicles.map(vehicle => ({
    ...vehicle,
    rate: rentalRate(vehicle.name),
  }));
  const total = planned.reduce((sum, vehicle) => sum + (vehicle.rate ?? 0) * vehicle.amount, 0);
  return <section className="card" style={{padding:12,marginBottom:10}}>
    <button type="button" onClick={() => setExpanded(value => !value)} style={{display:'flex',justifyContent:'space-between',width:'100%',background:'transparent',border:0,padding:4,cursor:'pointer',textAlign:'left'}}>
      <strong>Transport & logistiek ({planned.length})</strong><span>{money(total)} {expanded?'▴':'▾'}</span>
    </button>
    {expanded && <div style={{marginTop:12}}>
      <div style={{overflowX:'auto'}}>
        <div style={{minWidth:400}}>
          <div style={{display:'grid',gridTemplateColumns:'minmax(150px,2fr) 70px 90px 90px',gap:8,fontSize:12,opacity:.7}}>
            <span>Omschrijving</span><span>Aantal</span><span>Tarief</span><span>Totaal</span>
          </div>
          {planned.map(vehicle => <div key={vehicle.id} style={{display:'grid',gridTemplateColumns:'minmax(150px,2fr) 70px 90px 90px',gap:8,padding:'7px 0',borderTop:'1px solid var(--border,#ddd)',alignItems:'center'}}>
            <span>{vehicle.name}</span><span>{vehicle.amount}</span><span>{vehicle.rate === null ? '—' : money(vehicle.rate)}</span><strong>{vehicle.rate === null ? '—' : money(vehicle.amount * vehicle.rate)}</strong>
          </div>)}
          {!planned.length && <p style={{fontSize:13,color:'var(--muted)'}}>Geen transport gepland in Rentman.</p>}
        </div>
      </div>
      {oneWayKm !== null && <div style={{display:'flex',justifyContent:'space-between',gap:12,padding:'8px 0',borderTop:'1px solid var(--border,#ddd)'}}><span>Afstand volgens Rentman (retour)</span><strong>{(oneWayKm * 2).toLocaleString('nl-NL')} km</strong></div>}
      <div style={{textAlign:'right',marginTop:10}}><strong>Totaal: {money(total)}</strong></div>
    </div>}
  </section>;
}
