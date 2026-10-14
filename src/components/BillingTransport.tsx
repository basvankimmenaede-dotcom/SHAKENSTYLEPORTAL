'use client';
import { useEffect, useState } from 'react';

export type TransportLine = { description: string; quantity: number; unitPrice: number; vatRate: number };
type VehicleTrip = {id:number; name:string; direction:string|null; legs:number|null; kilometers:number|null};
type Vehicle = { id: number; name: string; amount: number };
const money = (value: number) => value.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
const rentalRate = (_name: string): number | null => null;

export default function BillingTransport({ id }: {
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
          .map((row: Vehicle) => ({id: row.id, name: row.name, amount: row.amount})));
      })
      .catch(() => { if (active) setVehicles([]); });
    return () => { active = false; };
  }, [id]);
  const planned = vehicles.map(vehicle => ({
    ...vehicle,
    rate: rentalRate(vehicle.name),
  }));
  const totalKm = vehicleTrips.reduce((sum, trip) => sum + (trip.kilometers ?? 0), 0);
  const unknownTrips = vehicleTrips.filter(trip => trip.kilometers === null).length;
  const total = planned.reduce((sum, vehicle) => sum + (vehicle.rate ?? 0) * vehicle.amount, 0);
  const missingRates = planned.some(vehicle => vehicle.rate === null);
  return <section className="card" style={{padding:20,marginBottom:14,minWidth:0}}>
    <button type="button" onClick={() => setExpanded(value => !value)} style={{display:'flex',justifyContent:'space-between',width:'100%',background:'transparent',border:0,padding:4,cursor:'pointer',textAlign:'left'}}>
      <strong style={{fontSize:17}}>Transport & logistiek ({planned.length})</strong><span>{missingRates ? 'Tarief ontbreekt' : money(total)} {expanded?'▴':'▾'}</span>
    </button>
    {expanded && <div style={{marginTop:12}}>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',minWidth:600,borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style={{textAlign:'left',color:'var(--muted)',borderBottom:'1px solid var(--border,#ddd)'}}>
            <th style={{padding:'10px 8px'}}>Voertuig</th>
            <th style={{padding:'10px 8px',textAlign:'right'}}>Aantal</th>
            <th style={{padding:'10px 8px',textAlign:'right'}}>Km gepland</th>
            <th style={{padding:'10px 8px',textAlign:'right'}}>Tarief</th>
            <th style={{padding:'10px 8px',textAlign:'right'}}>Totaal</th>
          </tr></thead>
          <tbody>{planned.map(vehicle => {
            const matchingTrips=vehicleTrips.filter(trip=>{
              const vehicleName=vehicle.name.toLowerCase();
              const tripName=trip.name.toLowerCase();
              return tripName.includes(vehicleName) || vehicleName.includes(tripName) ||
                (/bakwagen/i.test(vehicleName) && /bakwagen/i.test(tripName) && !/bestelbus/i.test(vehicleName)) ||
                (/bestelbus/i.test(vehicleName) && /bestelbus/i.test(tripName));
            });
            const kilometers=matchingTrips.length && matchingTrips.every(trip=>trip.kilometers!==null)
              ? matchingTrips.reduce((sum,trip)=>sum+(trip.kilometers??0),0) : null;
            return <tr key={vehicle.id} style={{borderBottom:'1px solid var(--border,#ddd)'}}>
              <td style={{padding:'12px 8px',fontWeight:600}}>{vehicle.name}</td>
              <td style={{padding:'12px 8px',textAlign:'right'}}>{vehicle.amount}</td>
              <td style={{padding:'12px 8px',textAlign:'right'}}>{kilometers===null?'Zie ritten':kilometers.toLocaleString('nl-NL')+' km'}</td>
              <td style={{padding:'12px 8px',textAlign:'right'}}>{vehicle.rate===null?'—':money(vehicle.rate)}</td>
              <td style={{padding:'12px 8px',textAlign:'right',fontWeight:700}}>{vehicle.rate===null?'—':money(vehicle.amount*vehicle.rate)}</td>
            </tr>;
          })}</tbody>
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
      <div style={{textAlign:'right',marginTop:10}}><strong>{missingRates ? 'Totaal niet beschikbaar: Rentman-tarieven ophalen' : 'Totaal: ' + money(total)}</strong></div>
    </div>}
  </section>;
}
