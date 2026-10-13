'use client';
import { useEffect, useState } from 'react';

export type TransportLine = { description: string; quantity: number; unitPrice: number; vatRate: number };
const options = [
  { name: 'Huur bakwagen', rate: 100, unit: 'dag' },
  { name: 'Huur bestelbus', rate: 80, unit: 'dag' },
  { name: 'Huur bestelauto', rate: 40, unit: 'dag' },
  { name: 'Kilometers overig vervoer', rate: 0.55, unit: 'km' },
  { name: 'Kilometers eigen vervoer', rate: 0.23, unit: 'km' },
];
const money = (value: number) => value.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
export default function BillingTransport({ id, lines, canManage, onChange }: {
  id: string; lines: TransportLine[]; canManage: boolean; onChange: (lines: TransportLine[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [vehicles, setVehicles] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    fetch('/api/planning/billing/hours/' + encodeURIComponent(id))
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Rentman niet beschikbaar')))
      .then(data => {
        if (active) setVehicles((data.rows || []).filter((row: {type?:string;name:string}) =>
          row.type === 'vehicle_function' || /bakwagen|bestelbus|bestelauto|vrachtwagen|transport/i.test(row.name)
        ).map((row: {name:string;amount:number}) => row.name + ' (' + row.amount + '× gepland)'));
      }).catch(() => { if (active) setVehicles([]); });
    return () => { active = false; };
  }, [id]);
  const transport = lines.map((line, index) => ({...line,index})).filter(line => line.description.startsWith('[Transport] '));
  const total = transport.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  function update(index: number, patch: Partial<TransportLine>) {
    onChange(lines.map((line, i) => i === index ? {...line,...patch} : line));
  }
  function add(option: typeof options[number]) {
    onChange([...lines, {description:'[Transport] ' + option.name,quantity:1,unitPrice:option.rate,vatRate:21}]);
    setExpanded(true);
  }
  return <section className="card" style={{padding:12,marginBottom:10}}>
    <button type="button" onClick={() => setExpanded(v=>!v)} style={{display:'flex',justifyContent:'space-between',width:'100%',background:'transparent',border:0,padding:4,cursor:'pointer',textAlign:'left'}}>
      <strong>Transport & logistiek ({transport.length})</strong><span>{money(total)} {expanded?'▴':'▾'}</span>
    </button>
    {expanded && <div style={{marginTop:12}}>
      <p style={{fontSize:12,color:'var(--muted)'}}>Voertuigen in Rentman: {vehicles.length ? vehicles.join(' · ') : 'Geen voertuigplanning gevonden'}. Controleer huurperiodes en kilometers; deze worden niet automatisch uit een route geschat.</p>
      <div style={{overflowX:'auto'}}><div style={{minWidth:530}}>
        <div style={{display:'grid',gridTemplateColumns:'minmax(170px,2fr) 80px 95px 95px 30px',gap:8,fontSize:12,opacity:.7}}><span>Omschrijving</span><span>Aantal</span><span>Tarief</span><span>Totaal</span><span/></div>
        {transport.map(line=><div key={line.index} style={{display:'grid',gridTemplateColumns:'minmax(170px,2fr) 80px 95px 95px 30px',gap:8,padding:'7px 0',borderTop:'1px solid var(--border,#ddd)',alignItems:'center'}}>
          <input className="input" aria-label="Transportomschrijving" disabled={!canManage} value={line.description.replace(/^\\[Transport\\] /,'')} onChange={e=>update(line.index,{description:'[Transport] '+e.target.value})}/>
          <input className="input" aria-label="Aantal dagen of kilometers" type="number" min="0" step="0.01" disabled={!canManage} value={line.quantity} onChange={e=>update(line.index,{quantity:Math.max(0,Number(e.target.value)||0)})}/>
          <input className="input" aria-label="Tarief" type="number" min="0" step="0.01" disabled={!canManage} value={line.unitPrice} onChange={e=>update(line.index,{unitPrice:Math.max(0,Number(e.target.value)||0)})}/>
          <strong>{money(line.quantity*line.unitPrice)}</strong>
          {canManage&&<button type="button" aria-label="Transportregel verwijderen" onClick={()=>onChange(lines.filter((_,i)=>i!==line.index))}>×</button>}
        </div>)}
      </div></div>
      {canManage&&<div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:12}}>{options.map(option=><button type="button" className="button secondary" key={option.name} onClick={()=>add(option)} style={{fontSize:12,padding:'6px 9px'}}>+ {option.name}</button>)}</div>}
      <p style={{fontSize:12,color:'var(--muted)'}}>Aantal bij huur = dagen; bij kilometers = gereden kilometers (heen- en terugreis samen). Parkeer- en tolkosten op nacalculatie. Controleer dat voertuighuur niet ook bij Materiaal & verhuur staat.</p>
      <strong>Totaal transport: {money(total)}</strong>
      <p style={{fontSize:12}}>Transportregels worden samen met het concept opgeslagen, niet automatisch naar Rentman geschreven.</p>
    </div>}
  </section>;
}
