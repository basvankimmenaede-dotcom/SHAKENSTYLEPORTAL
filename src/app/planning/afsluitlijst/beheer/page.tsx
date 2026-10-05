import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import ClosingChecklistManager from '@/components/ClosingChecklistManager';
import SettingsNav from '@/components/SettingsNav';
export default async function ClosingChecklistManagePage(){
 const {supabase}=await requireAdmin();
 const [{data:sections},{data:templateItems}]=await Promise.all([
  supabase.from('closing_checklist_sections').select('id,name,sort_order,is_active').eq('is_active',true).order('sort_order').order('id'),
  supabase.from('closing_checklist_template_items').select('id,label,section_id,is_active,recurrence_type,interval_days,recurrence_start_date').eq('item_type','item').order('sort_order').order('id')
 ]);
 return <main className="container settingsPage"><section className="usersAdminHeader"><div><span className="usersAdminEyebrow">Instellingen</span><h1>Afsluitlijst</h1><p>Beheer koppen, dagelijkse taken en periodieke werkzaamheden vanuit één editor.</p></div><Link className="button secondary" href="/planning/afsluitlijst">Open afsluitlijst</Link></section>
  <section className="settingsWorkspace"><SettingsNav active="closing"/><div className="settingsEditorPane"><ClosingChecklistManager
    sections={[...((templateItems??[]).some(item=>item.section_id==null)?[{id:0,name:'Overige',sort_order:9999,is_active:true}]:[]),...(sections??[]).map(section=>({id:Number(section.id),name:String(section.name),sort_order:Number(section.sort_order),is_active:Boolean(section.is_active)}))]}
    tasks={(templateItems??[]).map(item=>({id:Number(item.id),label:String(item.label),section_id:item.section_id==null?null:Number(item.section_id),is_active:Boolean(item.is_active),recurrence_type:item.recurrence_type==='weekly'||item.recurrence_type==='interval'?item.recurrence_type:'daily',interval_days:item.interval_days==null?null:Number(item.interval_days),recurrence_start_date:String(item.recurrence_start_date)}))}
  /></div></section></main>
}
