import Link from 'next/link';
import ClosingChecklist from '@/components/ClosingChecklist';
import { createAdminClient } from '@/lib/supabase/admin';
import { permissionAtLeast, requireModulePermission } from '@/lib/auth';
import {
  addDateDays,
  amsterdamDateKey,
  eachDate,
  formatClosingDate,
  isWeekend,
  monthStart,
} from '@/lib/closingChecklist';
import { setClosingExemption } from './actions';

type SearchParams = Promise<{ date?: string }>;

export default async function ClosingChecklistPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { supabase, user, profile, permissionLevel } = await requireModulePermission('checklists', 'view');
  const admin = createAdminClient();
  const params = await searchParams;
  const today = amsterdamDateKey();
  const requestedDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const selectedDate = requestedDate > today ? today : requestedDate;
  const weekend = isWeekend(selectedDate);
  const canManage = profile.role === 'admin' || permissionAtLeast(permissionLevel, 'manage');

  const [{ data: settings }, { data: exemptions }] = await Promise.all([
    supabase.from('closing_checklist_settings').select('required_from_date').eq('id', 1).single(),
    supabase
      .from('closing_checklist_exemptions')
      .select('checklist_date,reason')
      .gte('checklist_date', monthStart(today))
      .lte('checklist_date', today),
  ]);

  const requiredFrom = String(settings?.required_from_date ?? today);
  const exemptionMap = new Map((exemptions ?? []).map((row) => [String(row.checklist_date), String(row.reason ?? 'Vrije dag')]));
  const selectedExemption = exemptionMap.get(selectedDate) ?? null;
  const selectedRequired = selectedDate >= requiredFrom && !weekend && !selectedExemption;

  if (selectedDate === today && selectedRequired) {
    await supabase.rpc('ensure_closing_checklist', { p_date: selectedDate });
  }

  const { data: list } = await supabase
    .from('closing_checklists')
    .select('id,checklist_date,status,completed_at,completed_by,todoist_task_id,closing_checklist_items(id,label,sort_order,item_type,section_id,completed,completed_at,completed_by)')
    .eq('checklist_date', selectedDate)
    .maybeSingle();

  const itemRows = [...(list?.closing_checklist_items ?? [])]
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order) || Number(a.id) - Number(b.id));

  const sectionIds = Array.from(new Set(itemRows.map((item) => item.section_id).filter(Boolean).map(Number)));
  const { data: sections } = sectionIds.length
    ? await supabase.from('closing_checklist_sections').select('id,name,sort_order').in('id', sectionIds)
    : { data: [] as Array<{ id: number; name: string; sort_order: number }> };
  const sectionById = new Map((sections ?? []).map((section) => [Number(section.id), {
    name: String(section.name),
    sort_order: Number(section.sort_order),
  }]));

  const completedByIds = Array.from(new Set(itemRows.map((item) => item.completed_by).filter(Boolean).map(String)));
  const { data: people } = completedByIds.length
    ? await admin.from('profiles').select('id,full_name').in('id', completedByIds)
    : { data: [] as Array<{ id: string; full_name: string | null }> };
  const personById = new Map((people ?? []).map((person) => [
    String(person.id),
    String(person.full_name || '').replace(/@shakenstyle\.com$/i, ''),
  ]));

  const items = itemRows.map((item) => ({
    id: Number(item.id),
    label: String(item.label),
    item_type: (item.item_type === 'heading' ? 'heading' : 'item') as 'heading' | 'item',
    section_id: item.section_id == null ? null : Number(item.section_id),
    section_name: item.section_id == null ? 'Overig' : sectionById.get(Number(item.section_id))?.name ?? 'Overig',
    section_sort_order: item.section_id == null ? 9999 : sectionById.get(Number(item.section_id))?.sort_order ?? 9999,
    completed: Boolean(item.completed),
    completed_at: item.completed_at ? String(item.completed_at) : null,
    completed_by_name: item.completed_by ? personById.get(String(item.completed_by)) ?? null : null,
  }));

  const statStart = requiredFrom > monthStart(today) ? requiredFrom : monthStart(today);
  const statDates = statStart <= today ? eachDate(statStart, today) : [];
  const requiredDates = statDates.filter((date) => !isWeekend(date) && !exemptionMap.has(date));

  const { data: monthLists } = requiredDates.length
    ? await supabase
        .from('closing_checklists')
        .select('checklist_date,status,completed_at')
        .in('checklist_date', requiredDates)
    : { data: [] as Array<{ checklist_date: string; status: string; completed_at: string | null }> };

  const listByDate = new Map((monthLists ?? []).map((row) => [String(row.checklist_date), row]));
  const successfulDates = requiredDates.filter((date) => {
    const row = listByDate.get(date);
    if (!row || row.status !== 'completed' || !row.completed_at) return false;
    return amsterdamDateKey(new Date(String(row.completed_at))) === date;
  });
  const successPercent = requiredDates.length ? Math.round((successfulDates.length / requiredDates.length) * 100) : 100;

  return (
    <main className="container closingPage">
      <section className="closingPageHeader">
        <div>
          <span className="usersAdminEyebrow">Dagelijkse routine</span>
          <h1>Afsluitlijst</h1>
          <p>De vaste checklist voor het einde van iedere werkdag.</p>
        </div>
        {profile.role === 'admin' ? (
          <Link className="button secondary" href="/planning/afsluitlijst/beheer">Beheer lijst</Link>
        ) : null}
      </section>

      <section className="closingSuccessCard">
        <div className="closingSuccessCopy">
          <span>Succes deze maand</span>
          <strong>{successfulDates.length} van {requiredDates.length} werkdagen</strong>
          <small>Alleen op tijd afgeronde werkdagen tellen mee. Weekenden en vrije dagen zijn uitgesloten.</small>
        </div>
        <div className="closingSuccessScore">{successPercent}%</div>
        <div className="closingSuccessTrack"><span style={{ width: `${successPercent}%` }} /></div>
      </section>

      <section className="closingDateNav">
        <Link className="button secondary" href={`/planning/afsluitlijst?date=${addDateDays(selectedDate, -1)}`}>← Vorige dag</Link>
        <div>
          <strong>{selectedDate === today ? 'Vandaag' : formatClosingDate(selectedDate)}</strong>
          <span>{selectedDate}</span>
        </div>
        {selectedDate < today ? (
          <Link className="button secondary" href={`/planning/afsluitlijst?date=${addDateDays(selectedDate, 1)}`}>Volgende dag →</Link>
        ) : <span />}
      </section>

      {weekend ? (
        <section className="closingDayState free">
          <strong>Weekend</strong>
          <span>Vandaag is de afsluitlijst niet verplicht.</span>
        </section>
      ) : selectedExemption ? (
        <section className="closingDayState free">
          <strong>Vrije dag</strong>
          <span>{selectedExemption} · telt niet mee in het succespercentage.</span>
        </section>
      ) : selectedDate < requiredFrom ? (
        <section className="closingDayState free">
          <strong>Nog niet van toepassing</strong>
          <span>De afsluitlijstverplichting start vanaf {requiredFrom}.</span>
        </section>
      ) : list ? (
        <ClosingChecklist items={items} canManage={canManage} />
      ) : (
        <section className="closingDayState missed">
          <strong>Niet afgerond</strong>
          <span>Voor deze verplichte werkdag is geen afgeronde afsluitlijst geregistreerd.</span>
        </section>
      )}

      {profile.role === 'admin' && !weekend ? (
        <section className="card closingExemptionCard">
          <div>
            <span className="usersAdminEyebrow">Daginstelling</span>
            <h2>Vrije dag</h2>
            <p>Markeer een doordeweekse dag als vrij. Deze dag telt dan niet mee voor de afsluitlijst of het succespercentage.</p>
          </div>
          <form action={setClosingExemption} className="closingExemptionForm">
            <input type="hidden" name="date" value={selectedDate} />
            <label>
              <input type="checkbox" name="exempt" defaultChecked={Boolean(selectedExemption)} />
              <span>Niet verplicht op {selectedDate}</span>
            </label>
            <input className="input" name="reason" defaultValue={selectedExemption ?? ''} placeholder="Reden, bijv. feestdag / kantoor gesloten" />
            <button className="button orange" type="submit">Daginstelling opslaan</button>
          </form>
        </section>
      ) : null}

    </main>
  );
}
