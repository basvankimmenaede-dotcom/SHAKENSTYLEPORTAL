import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {getPlanningProjects,getPlanningProjectFunctionsForProject,getPlanningProjectFunctionsForRange,getPlanningCrewAssignmentsForRange} from '@/lib/rentman';

export const dynamic='force-dynamic';
const refId=(v:unknown)=>typeof v==='number'?v:typeof v==='string'?Number(v.split('/').pop()):v&&typeof v==='object'&&'id' in v?Number((v as {id:unknown}).id):NaN;
const customText=(custom:Record<string,unknown>|undefined,id:number)=>{
 const value=custom?.['custom_'+id]??custom?.[String(id)];
 if(value==null||value==='')return null;
 if(typeof value!=='string'&&typeof value!=='number')return null;
 return String(value).replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(p|div|li)>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim()||null;
};
export async function GET(request:NextRequest){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user?.email)return NextResponse.json({error:'Niet ingelogd'},{status:401});
 const {data:member}=await supabase.from('crew_portal_members').select('id,email,rentman_crew_id').eq('active',true).maybeSingle();
 if(!member||member.email?.trim().toLowerCase()!==user.email.trim().toLowerCase())return NextResponse.json({error:'Geen Crew-toegang'},{status:403});
 const assignmentId=request.nextUrl.searchParams.get('assignmentId');
 if(!assignmentId)return NextResponse.json({error:'Dienst ontbreekt'},{status:400});
 const {data:assignment}=await supabase.from('crew_portal_assignments').select('id,rentman_project_id,starts_at').eq('id',assignmentId).eq('crew_member_id',member.id).maybeSingle();
 if(!assignment)return NextResponse.json({error:'Dienst niet gevonden'},{status:404});
 const projectId=Number(assignment.rentman_project_id);
 if(!Number.isSafeInteger(projectId)||projectId<=0)return NextResponse.json({eventInfo:null,daySchedule:[],openShifts:[]});
 try{
  const [planning,functions]=await Promise.all([getPlanningProjects(),getPlanningProjectFunctionsForProject(projectId)]);
  const project=planning.allProjects.find(p=>p.id===projectId);
  const location=project?.location,contact=project?.cust_contact;
  const eventInfo=project?{
   number:project.number==null?null:String(project.number),
   customer:project.customer?.displayname||project.customer?.name||null,
   type:project.project_type?.displayname||project.project_type?.name||null,
   address:[location?.visit_street,location?.visit_number].filter(Boolean).join(' ')||null,
   postalCity:[location?.visit_postalcode,location?.visit_city].filter(Boolean).join(' ')||null,
   contactName:contact?.displayname||[contact?.firstname,contact?.middle_name,contact?.lastname].filter(Boolean).join(' ')||null,
   locationContactName:project.loc_contact?.displayname||[project.loc_contact?.firstname,project.loc_contact?.middle_name,project.loc_contact?.lastname].filter(Boolean).join(' ')||null,
   locationContactPhone:project.loc_contact?.mobilephone||project.loc_contact?.phone||null,
   eventDescription:customText(project.custom,30),cocktailCount:customText(project.custom,40),
   cocktails:customText(project.custom,34),bar:customText(project.custom,38),brand:customText(project.custom,79)
  }:null;
  const daySchedule=functions.filter(fn=>{
   const start=fn.planperiod_start||fn.usageperiod_start;
   return Boolean(start&&start.slice(0,10)===assignment.starts_at.slice(0,10)&&fn.type!=='remark');
  }).map(fn=>({label:fn.displayname||fn.name||'Gepland onderdeel',start:fn.planperiod_start||fn.usageperiod_start||'',end:fn.planperiod_end||fn.usageperiod_end||''})).filter(fn=>fn.start&&fn.end).sort((a,b)=>a.start.localeCompare(b.start)).slice(0,30);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const end=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const [allFunctions,crew]=await Promise.all([getPlanningProjectFunctionsForRange(today,end),getPlanningCrewAssignmentsForRange(today,end)]);
  const filled=new Map<number,number>();
  for(const item of crew)if(item.function?.id)filled.set(item.function.id,(filled.get(item.function.id)||0)+1);
  const openShifts=allFunctions.filter(fn=>fn.type==='crew_function'&&refId(fn.project)===projectId).map(fn=>({
   id:fn.id,projectId,projectName:project?.name||'',projectNumber:project?.number==null?'':String(project.number),
   functionName:fn.displayname||fn.name||'Crew',start:fn.planperiod_start||fn.usageperiod_start||'',
   end:fn.planperiod_end||fn.usageperiod_end||'',available:Math.max(0,Number(fn.amount||0)-(filled.get(fn.id)||0))
  })).filter(s=>s.available>0&&s.start&&s.end);
  return NextResponse.json({eventInfo,daySchedule,openShifts});
 }catch(error){console.error('Crew detail load failed',error);return NextResponse.json({error:'Projectgegevens tijdelijk niet beschikbaar'},{status:503});}
}
