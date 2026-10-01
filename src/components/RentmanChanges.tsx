'use client';

import { useState } from 'react';
import { createRentmanChange, updateRentmanChangeStatus } from '@/app/planning/rentman-wijzigingen/actions';

type Change = {
  id:number; report_type:'project_change'|'wrong_item'; project_number:string; project_name:string|null;
  summary:string; item_name:string|null; issue_type:string|null; current_value:string|null; desired_value:string|null;
  change_date:string|null; extra_notes:string|null; status:'open'|'in_progress'|'completed'; created_at:string; reporter:string;
};

export default function RentmanChanges({ changes }: { changes: Change[] }) {
  const [modal,setModal]=useState(false);
  const [type,setType]=useState<'project_change'|'wrong_item'>('project_change');
  const [filter,setFilter]=useState<'all'|'project_change'|'wrong_item'>('all');
  const [query,setQuery]=useState('');
  const shown=changes.filter(x=>(filter==='all'||x.report_type===filter)&&(`${x.project_number} ${x.project_name??''} ${x.summary}`.toLowerCase().includes(query.toLowerCase())));

  return <>
    <section className="rentmanChangesToolbar">
      <div className="rentmanChangeTabs">
        <button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Alle meldingen</button>
        <button className={filter==='project_change'?'active':''} onClick={()=>setFilter('project_change')}>Project wijziging</button>
        <button className={filter==='wrong_item'?'active':''} onClick={()=>setFilter('wrong_item')}>Verkeerd item</button>
      </div>
      <input className="input rentmanChangeSearch" placeholder="Zoeken..." value={query} onChange={e=>setQuery(e.target.value)} />
    </section>

    <section className="rentmanChangeTable">
      <div className="rentmanChangeTableHead"><span>Datum</span><span>Project</span><span>Type</span><span>Omschrijving</span><span>Gemeld door</span><span>Status</span></div>
      {shown.map(row=><div className="rentmanChangeRow" key={row.id}>
        <span>{new Date(row.created_at).toLocaleDateString('nl-NL')}</span>
        <strong>{row.project_number}{row.project_name?` · ${row.project_name}`:''}</strong>
        <span><em className={row.report_type==='wrong_item'?'rentmanTypeBadge wrong':'rentmanTypeBadge'}>{row.report_type==='wrong_item'?'Verkeerd item':'Project wijziging'}</em></span>
        <span>{row.summary}</span><span>{row.reporter}</span>
        <form action={updateRentmanChangeStatus}><input type="hidden" name="id" value={row.id}/><select name="status" className={`rentmanStatus ${row.status}`} defaultValue={row.status} onChange={e=>e.currentTarget.form?.requestSubmit()}><option value="open">Open</option><option value="in_progress">In behandeling</option><option value="completed">Afgerond</option></select></form>
      </div>)}
      {!shown.length?<div className="compactEmpty">Nog geen meldingen gevonden.</div>:null}
    </section>

    <section className="rentmanChangeInfoGrid">
      <div><strong>▣ Project wijziging</strong><p>Datum, tijd, aantallen, locatie, personeel, opbouw/afbouw of andere projectinformatie.</p></div>
      <div className="wrong"><strong>◇ Verkeerd item</strong><p>Een verkeerd of ontbrekend item, fout aantal of verkeerde specificatie.</p></div>
    </section>

    <button className="button orange rentmanNewButton" type="button" onClick={()=>setModal(true)}>＋ Nieuwe melding</button>

    {modal?<div className="planningTaskCreateBackdrop" data-planning-modal-open="true" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false)}}>
      <section className="planningTaskCreateModal rentmanChangeModal" role="dialog" aria-modal="true">
        <button className="planningTaskCreateClose" type="button" onClick={()=>setModal(false)}>×</button>
        <h2>Nieuwe melding</h2>
        <div className="rentmanTypeChoice">
          <button type="button" className={type==='project_change'?'active':''} onClick={()=>setType('project_change')}><strong>▣ Project wijziging</strong><small>Datum, tijd, aantal, locatie, personeel...</small></button>
          <button type="button" className={type==='wrong_item'?'active wrong':''} onClick={()=>setType('wrong_item')}><strong>◇ Verkeerd item</strong><small>Verkeerd item, ontbrekend item, fout aantal...</small></button>
        </div>
        <form action={createRentmanChange} className="rentmanChangeForm" onSubmit={()=>setModal(false)}>
          <input type="hidden" name="report_type" value={type}/>
          <div className="rentmanFormGrid"><div className="field"><label>Projectnummer</label><input className="input" name="project_number" placeholder="Bijv. 11036" required/></div><div className="field"><label>Projectnaam</label><input className="input" name="project_name" placeholder="Bijv. Bentley Event"/></div></div>
          {type==='wrong_item'?<><div className="field"><label>Item</label><input className="input" name="item_name" placeholder="Zoek of vul item in..."/></div><div className="field"><label>Wat klopt er niet?</label><select className="select" name="issue_type"><option>Verkeerd aantal</option><option>Verkeerd item</option><option>Item ontbreekt</option><option>Verkeerde specificatie</option><option>Anders</option></select></div><div className="rentmanFormGrid"><div className="field"><label>Staat nu</label><input className="input" name="current_value"/></div><div className="field"><label>Moet zijn</label><input className="input" name="desired_value"/></div></div></>:null}
          <div className="field"><label>{type==='project_change'?'Wat is er gewijzigd?':'Korte omschrijving'}</label><textarea className="input rentmanTextarea" name="summary" placeholder="Korte omschrijving..." required/></div>
          <div className="rentmanFormGrid"><div className="field"><label>Wanneer (optioneel)</label><input className="input" type="date" name="change_date"/></div><div className="field"><label>Extra toelichting (optioneel)</label><input className="input" name="extra_notes"/></div></div>
          <div className="planningTaskCreateActions"><button className="button secondary" type="button" onClick={()=>setModal(false)}>Annuleren</button><button className="button orange" type="submit">Melding versturen</button></div>
        </form>
      </section>
    </div>:null}
  </>;
}
