import {
  addChecklistTemplateItem,
  createChecklistTemplate,
  deleteChecklistTemplateItem,
  updateChecklistTemplate,
  updateChecklistTemplateItem,
} from './actions';
import { requireAdmin } from '@/lib/auth';
import { getRentmanProjectTypes } from '@/lib/rentman';

type TemplateItem = {
  id: number;
  label: string;
  sort_order: number;
  is_required: boolean;
  deadline_offset_days: number | null;
};

type Template = {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  rentman_project_type_id: number | null;
  rentman_project_type_name: string | null;
  checklist_template_items: TemplateItem[];
};

export default async function ChecklistTemplatesPage() {
  const { supabase } = await requireAdmin();

  const [{ data, error }, projectTypes] = await Promise.all([
    supabase
      .from('checklist_templates')
      .select('id,name,description,is_active,rentman_project_type_id,rentman_project_type_name,checklist_template_items(id,label,sort_order,is_required,deadline_offset_days)')
      .order('name'),
    getRentmanProjectTypes(),
  ]);

  if (error) throw new Error(error.message);

  const templates = ((data ?? []) as Template[]).map((template) => ({
    ...template,
    checklist_template_items: [...(template.checklist_template_items ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
  }));

  return (
    <main className="container planningTemplatesPage">
      <section className="hero planningHero">
        <div>
          <div className="eyebrowLink">Planningbeheer</div>
          <h1>Checklist-templates</h1>
          <p>
            Pas hier de standaard checklists aan. Wijzigingen gelden voor nieuwe projectchecklists;
            bestaande projectchecklists blijven ongewijzigd.
          </p>
        </div>
      </section>

      <section className="card templateCreateCard">
        <div>
          <h2>Nieuwe template</h2>
          <p className="muted">Maak een checklist en koppel hem optioneel aan een Rentman-projecttype. Die template wordt dan alleen voorgeselecteerd, nooit automatisch aangemaakt.</p>
        </div>
        <form action={createChecklistTemplate} className="templateCreateForm">
          <input className="input" name="name" placeholder="Naam template" required />
          <input className="input" name="description" placeholder="Omschrijving (optioneel)" />
          <select className="select" name="rentman_project_type_id" defaultValue="">
            <option value="">Geen standaard projecttype</option>
            {projectTypes.map((type) => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>
          <button className="button orange" type="submit">Template toevoegen</button>
        </form>
      </section>

      <div className="templateStack">
        {templates.map((template) => (
          <section className={template.is_active ? 'card templateCard' : 'card templateCard templateInactive'} key={template.id}>
            <form action={updateChecklistTemplate} className="templateHeaderForm">
              <input type="hidden" name="template_id" value={template.id} />
              <div className="templateHeaderFields">
                <input className="input templateNameInput" name="name" defaultValue={template.name} required />
                <input
                  className="input"
                  name="description"
                  defaultValue={template.description ?? ''}
                  placeholder="Omschrijving"
                />
                <select
                  className="select templateProjectTypeSelect"
                  name="rentman_project_type_id"
                  defaultValue={template.rentman_project_type_id ?? ''}
                >
                  <option value="">Geen standaard projecttype</option>
                  {projectTypes.map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>
              <label className="templateActiveToggle">
                <input type="checkbox" name="is_active" defaultChecked={template.is_active} />
                <span>Actief</span>
              </label>
              <button className="button secondary" type="submit">Template opslaan</button>
            </form>

            <div className="templateItemHeader">
              <div>
                <strong>Checklist-items</strong>
                <small>Deadline is in dagen t.o.v. showdag. -3 = drie dagen ervoor, 0 = showdag, +1 = dag erna. Met een deadline wordt automatisch een To Do-taak aangemaakt.</small>
              </div>
              <span>{template.checklist_template_items.length} items</span>
            </div>

            <div className="templateItemList">
              {template.checklist_template_items.map((item) => (
                <div className="templateItemRow" key={item.id}>
                  <form action={updateChecklistTemplateItem} className="templateItemEditForm">
                    <input type="hidden" name="item_id" value={item.id} />
                    <input
                      className="input templateOrderInput"
                      type="number"
                      name="sort_order"
                      defaultValue={item.sort_order}
                      title="Volgorde"
                    />
                    <input className="input" name="label" defaultValue={item.label} required />
                    <label className="templateDeadlineField">
                      <span>Deadline</span>
                      <input
                        className="input templateDeadlineInput"
                        type="number"
                        name="deadline_offset_days"
                        defaultValue={item.deadline_offset_days ?? ''}
                        placeholder="geen"
                        title="Aantal dagen ten opzichte van showdag; negatief is vóór de showdag"
                      />
                    </label>
                    <label className="templateRequiredToggle">
                      <input type="checkbox" name="is_required" defaultChecked={item.is_required} />
                      <span>Verplicht</span>
                    </label>
                    <button className="button secondary templateSaveItem" type="submit">Opslaan</button>
                  </form>
                  <form action={deleteChecklistTemplateItem}>
                    <input type="hidden" name="item_id" value={item.id} />
                    <button className="templateDeleteButton" type="submit" title="Checklist-item verwijderen">
                      Verwijderen
                    </button>
                  </form>
                </div>
              ))}
            </div>

            <form action={addChecklistTemplateItem} className="templateAddItemForm">
              <input type="hidden" name="template_id" value={template.id} />
              <input className="input" name="label" placeholder="Nieuw checklist-item" required />
              <label className="templateDeadlineField">
                <span>Deadline</span>
                <input
                  className="input templateDeadlineInput"
                  type="number"
                  name="deadline_offset_days"
                  placeholder="-3"
                  title="Aantal dagen ten opzichte van showdag; negatief is vóór de showdag"
                />
              </label>
              <label className="templateRequiredToggle">
                <input type="checkbox" name="is_required" defaultChecked />
                <span>Verplicht</span>
              </label>
              <button className="button orange" type="submit">Item toevoegen</button>
            </form>
          </section>
        ))}
      </div>
    </main>
  );
}
