import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import {
  addClosingTemplateItem,
  deleteClosingTemplateItem,
  updateClosingTemplateItem,
} from '../actions';

export default async function ClosingChecklistManagePage() {
  const { supabase } = await requireAdmin();

  const { data: templateItems } = await supabase
    .from('closing_checklist_template_items')
    .select('id,label,sort_order,is_active,item_type')
    .order('sort_order')
    .order('id');

  return (
    <main className="container closingPage">
      <section className="closingPageHeader">
        <div>
          <span className="usersAdminEyebrow">Beheer</span>
          <h1>Afsluitlijst beheren</h1>
          <p>Beheer de standaardlijst die voor nieuwe werkdagen wordt gebruikt.</p>
        </div>
        <Link className="button secondary" href="/planning/afsluitlijst">← Terug naar afsluitlijst</Link>
      </section>

      <section className="usersDetail closingAdminPanel">
        <header className="usersDetailHeader">
          <div className="usersDetailIdentity">
            <span className="usersAvatar large">✓</span>
            <div>
              <div className="usersDetailTitle"><h2>Standaard afsluitlijst</h2></div>
              <p>Koppen zijn alleen voor indeling en tellen niet mee als af te vinken punt.</p>
            </div>
          </div>
        </header>

        <div className="usersDetailPanel">
          <form action={addClosingTemplateItem} className="closingTemplateAdd">
            <div className="field">
              <label>Type</label>
              <select className="input" name="item_type" defaultValue="item">
                <option value="item">Checklistpunt</option>
                <option value="heading">Kop</option>
              </select>
            </div>
            <div className="field">
              <label>Naam</label>
              <input className="input" name="label" placeholder="Bijv. Spoel of vaatwasser uitzetten" required />
            </div>
            <button className="button orange" type="submit">Toevoegen</button>
          </form>

          <div className="closingTemplateList">
            {(templateItems ?? []).map((item) => (
              <div className="closingTemplateRow" key={item.id}>
                <form action={updateClosingTemplateItem} className="closingTemplateEdit">
                  <input type="hidden" name="item_id" value={item.id} />
                  <input
                    className="input closingTemplateOrder"
                    type="number"
                    name="sort_order"
                    defaultValue={item.sort_order}
                    aria-label="Volgorde"
                  />
                  <select className="input" name="item_type" defaultValue={item.item_type === 'heading' ? 'heading' : 'item'}>
                    <option value="item">Checklistpunt</option>
                    <option value="heading">Kop</option>
                  </select>
                  <input className="input" name="label" defaultValue={item.label} required aria-label="Naam" />
                  <label className="closingTemplateActive">
                    <input type="checkbox" name="is_active" defaultChecked={item.is_active} />
                    <span>Actief</span>
                  </label>
                  <button className="button secondary" type="submit">Opslaan</button>
                </form>
                <form action={deleteClosingTemplateItem}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <button className="templateDeleteButton" type="submit">Verwijderen</button>
                </form>
              </div>
            ))}
            {!(templateItems ?? []).length ? (
              <div className="compactEmpty">Nog geen standaard afsluitpunten ingesteld.</div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
