'use client';
import { useEffect, useState } from 'react';

export type TransportLine = { description: string; quantity: number; unitPrice: number; vatRate: number };
type VehicleTrip = {id:number; name:string; direction:string|null; legs:number|null; kilometers:number|null};
type Vehicle = { id: number; name: string; amount: number; rateName: string | null; fixedFromRentman: number | null };
const money = (value: number) => value.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
const rateFromName = (name: string | null) => { const amounts = [...(name ?? '').matchAll(/€\s*([0-9]+(?:[.,][0-9]+)?)/g)].map(m => Number(m[1].replace(',', '.'))); return amounts.length >= 2 ? { km: amounts[0], fixed: amounts[1] } : null; };
const keyFor = (id: number, part: string) => 'Rentman transport #' + id + ' ' + part;

export default function BillingTransport({ id, lines, canManage, onChange }: {
  id: string; lines: TransportLine[]; canManage: boolean; onChange: (lines: TransportLine[]) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleTrips, setVehicleTrips] = useState<VehicleTrip[]>([]);
  useEffect(() => {
    let active = true;
    fetch('/api/planning/billing/hours/' + encodeURIComponent(id))
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Rentman niet beschikbaar')))
      .then(data => {
        if (active) setVehicleTrips(Array.isArray(data.vehicleTrips) ? data.vehicleTrips : []);
        if (active) setVehicles((data.rows || [])
          .filter((row: {type?: string; name: string}) => row.type === 'vehicle_function' || /bakwagen|bestelbus|bestelauto|vrachtwagen|transport/i.test(row.name))
          .map((row: {id:number;name:string;amount:number;priceRate?:{name?:string;factors?:{fixed:number|null}[]}|null}) => ({id: row.id, name: row.name, amount: row.amount, rateName: row.priceRate?.name ?? null, fixedFromRentman: row.priceRate?.factors?.[0]?.fixed ?? null})));
      })
      .catch(() => { if (active) setVehicles([]); });
    return () => { active = false; };
  }, [id]);
  const planned = vehicles.map(vehicle => ({ ...vehicle, rate: rateFromName(vehicle.rateName) }));
  const override = (vehicleId: number, part: string) => lines.find(line => line.description === keyFor(vehicleId, part));
  const write = (vehicleId: number, part: string, quantity: number, unitPrice: number) => onChange([...lines.filter(line => line.description !== keyFor(vehicleId, part)), { description: keyFor(vehicleId, part), quantity, unitPrice, vatRate: 21 }]);
  const totalKm = vehicleTrips.reduce((sum, trip) => sum + (trip.kilometers ?? 0), 0);
  const unknownTrips = vehicleTrips.filter(trip => trip.kilometers === null).length;
  const plannedRows = planned.map(vehicle => {
    const a = vehicle.name.toLowerCase();
    const matches = vehicleTrips.filter(trip => { const b = trip.name.toLowerCase(); return b.includes(a) || a.includes(b) || (/bakwagen/.test(a) && /bakwagen/.test(b)) || (/bestelbus/.test(a) && /bestelbus/.test(b)); });
    const initialKm = matches.length && matches.every(trip => trip.kilometers !== null) ? matches.reduce((sum, trip) => sum + (trip.kilometers ?? 0), 0) : null;
    const kmLine = override(vehicle.id, 'kilometers'), fixedLine = override(vehicle.id, 'vast');
    const km = kmLine?.quantity ?? initialKm, kmRate = kmLine?.unitPrice ?? vehicle.rate?.km ?? null, fixed = fixedLine?.unitPrice ?? vehicle.fixedFromRentman ?? vehicle.rate?.fixed ?? null, amount = fixedLine?.quantity ?? vehicle.amount;
    return { ...vehicle, km, kmRate, fixed, amount, subtotal: km !== null && kmRate !== null && fixed !== null ? Math.round((km * kmRate + amount * fixed) * 100) / 100 : null };
  });
  const missingRates = plannedRows.some(vehicle => vehicle.subtotal === null);
  const total = plannedRows.reduce((sum, vehicle) => sum + (vehicle.subtotal ?? 0), 0);
  return <section className="card" style={{padding:20,marginBottom:14,minWidth:0}}>
    <button type="button" onClick={() => setExpanded(value => !value)} style={{display:'flex',justifyContent:'space-between',width:'100%',background:'transparent',border:0,padding:4,cursor:'pointer',textAlign:'left'}}>
      <strong style={{fontSize:17}}>Transport & logistiek ({planned.length})</strong><span>{missingRates ? 'Tarief ontbreekt' : money(total)} {expanded?'▴':'▾'}</span>
    </button>
    {expanded && <div style={{marginTop:12}}>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',minWidth:700,borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style={{textAlign:'left',color:'var(--muted)',borderBottom:'1px solid var(--border,#ddd)'}}>
            <th>Voertuig</th><th>Aantal</th><th>Kilometers</th><th>€ / km</th><th>Vast €</th><th style={{textAlign:'right'}}>Totaal</th>
          </tr></thead>
          <tbody>{plannedRows.map(vehicle => <tr key={vehicle.id} style={{borderBottom:'1px solid var(--border,#ddd)'}}>
            <td style={{padding:'12px 8px',fontWeight:600}}>{vehicle.name}<div style={{fontSize:11,color:'var(--muted)',fontWeight:400}}>{vehicle.rateName ?? 'Rentman-tarief ontbreekt'}</div></td>
            {(['amount','km','kmRate','fixed'] as const).map(part => <td key={part} style={{padding:'8px 4px'}}>
              <input className="input" aria-label={part+' '+vehicle.name} type="number" min="0" step="any" disabled={!canManage} value={vehicle[part] ?? ''} placeholder="—" onChange={event => {
                const value = Math.max(0, Number(event.target.value) || 0);
                if (part === 'amount' || part === 'fixed') write(vehicle.id, 'vast', part === 'amount' ? value : vehicle.amount, part === 'fixed' ? value : vehicle.fixed ?? 0);
                else write(vehicle.id, 'kilometers', part === 'km' ? value : vehicle.km ?? 0, part === 'kmRate' ? value : vehicle.kmRate ?? 0);
              }} style={{width:'100%',minWidth:64,padding:'6px'}}/>
            </td>)}
            <td style={{padding:'12px 8px',textAlign:'right',fontWeight:700,whiteSpace:'nowrap'}}>{vehicle.subtotal === null ? 'Tarief ontbreekt' : money(vehicle.subtotal)}</td>
          </tr>)}</tbody>
        </table>
        {!planned.length && <p style={{fontSize:13,color:'var(--muted)'}}>Geen transport gepland in Rentman.</p>}
      </div>
      {vehicleTrips.length > 0 && <div style={{borderTop:'1px solid var(--border,#ddd)',paddingTop:8}}>
        {vehicleTrips.map(trip => <div key={trip.id} style={{display:'flex',justifyContent:'space-between',gap:12,padding:'4px 0'}}>
          <span>{trip.name} · {trip.direction === 'round_trip' ? 'heen en terug' : trip.direction === 'one_way' ? 'enkele reis' : trip.direction === 'only_way_there' ? 'heen' : trip.direction === 'only_way_back' ? 'terug' : 'rit onbekend'}</span>
          <strong>{trip.kilometers === null ? '—' : trip.kilometers.toLocaleString('nl-NL') + ' km'}</strong>
        </div>)}
        <div style={{display:'flex',justifyContent:'space-between',gap:12,padding:'6px 0'}}><strong>{unknownTrips ? 'Bekende geplande kilometers' : 'Totaal geplande kilometers'}</strong><strong>{totalKm.toLocaleString('nl-NL')} km</strong></div>
      </div>}
      <div style={{textAlign:'right',marginTop:10}}><strong>{missingRates ? 'Totaal onvolledig: vul ontbrekende tarieven of kilometers in' : 'Totaal: ' + money(total)}</strong></div>
    </div>}
  </section>;
}
