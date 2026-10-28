'use server';
import { revalidatePath } from 'next/cache';
import { requirePlanningUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { saveRecurringTodoistTask, deleteRecurringTodoistTask } from '@/lib/todoist';

export async function updateFuelCardDistanceSetting(formData:FormData){
  const {supabase,user,profile}=await requirePlanningUser(); if(profile.role!=='admin')return;
  const value=Math.round(Number(formData.get('fuel_card_distance_km'))); if(!Number.isFinite(value)||value<1)return;
  const {error}=await supabase.from('planning_settings').upsert({id:1,fuel_card_distance_km:value,updated_at:new Date().toISOString(),updated_by:user.id},{onConflict:'id'});
  if(error)throw new Error(error.message); revalidatePath('/planning'); revalidatePath('/planning/instellingen');
}

type RecurringTaskKey='closing'|'billing';
export async function updateRecurringTaskSetting(formData:FormData){
  const {supabase,user,profile}=await requirePlanningUser(); if(profile.role!=='admin')return {ok:false,message:'Geen toegang.'};
  const key=String(formData.get('task_key')??'') as RecurringTaskKey; if(!['closing','billing'].includes(key))return {ok:false,message:'Onbekende terugkerende taak.'};
  // The session client has read-only RLS access to planning_settings. Only after
  // verifying the user is an admin, use the server-side service-role client.
  const settingsAdmin = createAdminClient();
  const {data:row,error:readError}=await settingsAdmin.from('planning_settings').select('recurring_tasks').eq('id',1).maybeSingle();
  if(readError)return {ok:false,message:`Instellingen laden mislukt: ${readError.message}`};
  const current=(row?.recurring_tasks&&typeof row.recurring_tasks==='object')?row.recurring_tasks as Record<string,Record<string,unknown>>:{};
  const title=String(formData.get('title')??'').trim(); const active=formData.get('active')==='on'; const raw=String(formData.get('task_area')??(key==='closing'?'both':'office')); const task_area=['office','warehouse','both'].includes(raw)?raw:'office'; const weekday=Math.min(7,Math.max(1,Number(formData.get('weekday')??3)));
  current[key]={...(current[key]??{}),title:title||(key==='closing'?'Afsluitlijst afronden':'Facturatie'),active,task_area,schedule:key==='closing'?'weekdays':'weekly',...(key==='billing'?{weekday}:{})};
  const {error}=await settingsAdmin.from('planning_settings').upsert({id:1,recurring_tasks:current,updated_at:new Date().toISOString(),updated_by:user.id},{onConflict:'id'});
  if(error)return {ok:false,message:error.message}; revalidatePath('/planning/instellingen'); revalidatePath('/planning'); return {ok:true,message:'Terugkerende taak opgeslagen.'};
}

type CustomRecurringConfig = {
  id: string; title: string; active: boolean; task_area: 'office' | 'warehouse' | 'both';
  frequency: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'selected';
  weekday: number; weekdays: number[]; dayOfMonth: number;
  todoist_task_id?: string | null;
};
const weekdayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
function recurringSchedule(task: CustomRecurringConfig) {
  if (task.frequency === 'daily') return 'every day';
  if (task.frequency === 'weekdays') return 'every weekday';
  if (task.frequency === 'monthly') return `every month on the ${task.dayOfMonth}`;
  if (task.frequency === 'selected') return `every ${task.weekdays.map(d => weekdayNames[d - 1]).join(', ')}`;
  return `every ${weekdayNames[task.weekday - 1]}`;
}
export async function saveCustomRecurringTask(formData: FormData) {
  const { user, profile } = await requirePlanningUser();
  if (profile.role !== 'admin') return { ok: false, message: 'Geen toegang.' };
  const title = String(formData.get('title') ?? '').trim();
  if (!title || title.length > 180) return { ok: false, message: 'Vul een geldige taaknaam in.' };
  const frequency = String(formData.get('frequency') ?? 'weekly');
  if (!['daily','weekdays','weekly','monthly','selected'].includes(frequency)) return { ok: false, message: 'Ongeldige frequentie.' };
  const area = String(formData.get('task_area') ?? 'office');
  if (!['office','warehouse','both'].includes(area)) return { ok: false, message: 'Ongeldig taaktype.' };
  const weekday = Math.min(7, Math.max(1, Number(formData.get('weekday') || 1)));
  const dayOfMonth = Math.min(28, Math.max(1, Number(formData.get('dayOfMonth') || 1)));
  const weekdays = formData.getAll('weekdays').map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 7);
  if (frequency === 'selected' && !weekdays.length) return { ok: false, message: 'Selecteer minimaal één weekdag.' };
  const admin = createAdminClient();
  const { data: row, error: readError } = await admin.from('planning_settings').select('recurring_tasks').eq('id', 1).maybeSingle();
  if (readError) return { ok: false, message: readError.message };
  const settings = (row?.recurring_tasks && typeof row.recurring_tasks === 'object' ? row.recurring_tasks : {}) as Record<string, unknown>;
  const tasks = Array.isArray(settings.custom) ? settings.custom as CustomRecurringConfig[] : [];
  const id = String(formData.get('id') || crypto.randomUUID());
  const old = tasks.find(task => task.id === id);
  if (old && !tasks.some(task => task.id === id)) return { ok: false, message: 'Taak niet gevonden.' };
  const active = formData.get('active') === 'on';
  const config: CustomRecurringConfig = {
    id, title, active, task_area: area as CustomRecurringConfig['task_area'],
    frequency: frequency as CustomRecurringConfig['frequency'], weekday, dayOfMonth,
    weekdays: [...new Set(weekdays)].sort(),
    todoist_task_id: old?.todoist_task_id ?? null,
  };
  try {
    if (active) {
      const task = await saveRecurringTodoistTask({
        taskId: old?.todoist_task_id || undefined, title, schedule: recurringSchedule(config),
        description: `SHAKENSTYLE recurring:${id}`,
      });
      config.todoist_task_id = String(task.id);
    } else if (old?.todoist_task_id) {
      await deleteRecurringTodoistTask(old.todoist_task_id);
      config.todoist_task_id = null;
    }
    const next = old ? tasks.map(task => task.id === id ? config : task) : [...tasks, config];
    const { error } = await admin.from('planning_settings').upsert({
      id: 1, recurring_tasks: { ...settings, custom: next },
      updated_at: new Date().toISOString(), updated_by: user.id,
    }, { onConflict: 'id' });
    if (error) throw error;
    if (config.todoist_task_id) {
      const { error: assignmentError } = await admin.from('planning_task_assignments').upsert({
        todoist_task_id: config.todoist_task_id, assignee_profile_id: null,
        assigned_by: user.id, task_area: config.task_area,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'todoist_task_id' });
      if (assignmentError) throw assignmentError;
    }
    revalidatePath('/planning'); revalidatePath('/planning/instellingen');
    return { ok: true, message: 'Terugkerende taak opgeslagen.' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Opslaan mislukt.' };
  }
}

export async function removeCustomRecurringTask(id: string) {
  const { user, profile } = await requirePlanningUser();
  if (profile.role !== 'admin') return { ok: false, message: 'Geen toegang.' };
  const admin = createAdminClient();
  const { data: row, error: readError } = await admin.from('planning_settings').select('recurring_tasks').eq('id',1).maybeSingle();
  if (readError) return { ok: false, message: readError.message };
  const settings = (row?.recurring_tasks && typeof row.recurring_tasks === 'object' ? row.recurring_tasks : {}) as Record<string, unknown>;
  const tasks = Array.isArray(settings.custom) ? settings.custom as CustomRecurringConfig[] : [];
  const task = tasks.find(item => item.id === id);
  if (!task) return { ok: false, message: 'Taak niet gevonden.' };
  try {
    if (task.todoist_task_id) await deleteRecurringTodoistTask(task.todoist_task_id);
    const { error } = await admin.from('planning_settings').upsert({
      id: 1, recurring_tasks: { ...settings, custom: tasks.filter(item => item.id !== id) },
      updated_at: new Date().toISOString(), updated_by: user.id,
    }, { onConflict: 'id' });
    if (error) throw error;
    revalidatePath('/planning'); revalidatePath('/planning/instellingen');
    return { ok: true, message: 'Terugkerende taak verwijderd.' };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Verwijderen mislukt.' }; }
}
