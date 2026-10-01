import RentmanChanges from '@/components/RentmanChanges';
import { requirePlanningUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function RentmanChangesPage() {
  const { supabase } = await requirePlanningUser();
  const admin=createAdminClient();
  const { data }=await supabase.from('rentman_changes').select('*').order('created_at',{ascending:false});
  const ids=Array.from(new Set((data??[]).map(x=>x.reported_by).filter(Boolean).map(String)));
  const {data:people}=ids.length?await admin.from('profiles').select('id,full_name').in('id',ids):{data:[] as Array<{id:string;full_name:string|null}>};
  const names=new Map((people??[]).map(p=>[String(p.id),String(p.full_name||'Onbekend').replace(/@shakenstyle\.com$/i,'')]));
  const changes=(data??[]).map(x=>({
    id:Number(x.id), report_type:(x.report_type==='wrong_item'?'wrong_item':'project_change') as 'wrong_item'|'project_change',
    project_number:String(x.project_number), project_name:x.project_name?String(x.project_name):null, summary:String(x.summary),
    item_name:x.item_name?String(x.item_name):null, issue_type:x.issue_type?String(x.issue_type):null,
    current_value:x.current_value?String(x.current_value):null, desired_value:x.desired_value?String(x.desired_value):null,
    change_date:x.change_date?String(x.change_date):null, extra_notes:x.extra_notes?String(x.extra_notes):null,
    status:(x.status==='in_progress'?'in_progress':x.status==='completed'?'completed':'open') as 'open'|'in_progress'|'completed',
    created_at:String(x.created_at), reporter:x.reported_by?names.get(String(x.reported_by))??'Onbekend':'Onbekend'
  }));
  return <main className="container rentmanChangesPage"><header className="rentmanChangesHeader"><div><span className="usersAdminEyebrow">Rentman</span><h1>Rentman wijzigingen</h1><p>Meld hier snel wijzigingen of onjuistheden in Rentman.</p></div></header><RentmanChanges changes={changes}/></main>;
}
