import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import type {RentmanPlanningProject} from '@/lib/rentman';
import {recognizeInvoiceProjects,type ProjectReferenceResult} from '@/lib/invoice-project-recognition';

export type CrewProjectCatalogRow={rentman_project_id:number;project_number:string;project_name:string};
const numberPattern=/^\d{4,8}$/;
const possibleNumbers=(text:string,filename:string):string[]=>{
 const header=(filename+'\n'+text.slice(0,1800)).normalize('NFKC');
 const out=new Set<string>();
 // Start with explicit references, but also verify real public project numbers appearing in the invoice header.
 const explicit=header.matchAll(/\b(?:project(?:nummer|nr|no|number)?|opdracht(?:nummer|nr)?|job\s*(?:number|no))\s*[#:.\-]?\s*(\d{4,8})\b/gi);
 for(const m of explicit)out.add(m[1]);
 for(const m of header.matchAll(/(?<!\d)(1\d{4,5})(?!\d)/g))out.add(m[1]);
 return [...out].slice(0,8);
};
/** Fetch at most a handful of verified project numbers. Unverified tokens are never accepted. */
async function lookupRentmanProjectNumber(projectNumber:string):Promise<CrewProjectCatalogRow|null>{
 if(!numberPattern.test(projectNumber)||!process.env.RENTMAN_API_TOKEN)return null;
 try{
  const qs=new URLSearchParams({fields:'id,number,name',number:projectNumber,limit:'5'});
  const res=await fetch('https://api.rentman.net/projects?'+qs.toString(),{
   headers:{Authorization:'Bearer '+process.env.RENTMAN_API_TOKEN,Accept:'application/json'},
   cache:'no-store',signal:AbortSignal.timeout(8000)
  });
  if(!res.ok)return null;
  const payload=await res.json() as {data?:{id:number;number:number|string;name:string}[]};
  const matches=(payload.data||[]).filter(p=>String(p.number)===projectNumber&&Number.isSafeInteger(Number(p.id)));
  if(matches.length!==1)return null;
  return {rentman_project_id:Number(matches[0].id),project_number:projectNumber,project_name:matches[0].name||''};
 }catch(error){
  console.error('Crew project number resolution failed',projectNumber,error instanceof Error?error.message:'unknown');
  return null;
 }
}
export async function listCrewProjectCatalog():Promise<CrewProjectCatalogRow[]>{
 const {data,error}=await createAdminClient().from('crew_invoice_project_catalog')
  .select('rentman_project_id,project_number,project_name').limit(2500);
 if(error)throw new Error('Projectcatalogus niet beschikbaar.');
 return (data||[]) as CrewProjectCatalogRow[];
}
export async function recognizeCrewInvoiceProjects(text:string,filename:string):Promise<ProjectReferenceResult>{
 const initial=await listCrewProjectCatalog();
 const byNumber=new Map(initial.map(row=>[row.project_number,row]));
 const hints=possibleNumbers(text,filename).filter(n=>!byNumber.has(n));
 // This is a read-only lookup in Rentman. It never creates or changes a Rentman project.
 if(hints.length){
  const found=await Promise.all(hints.map(lookupRentmanProjectNumber));
  const records=found.filter((v):v is CrewProjectCatalogRow=>Boolean(v));
  if(records.length){
   const {error}=await createAdminClient().from('crew_invoice_project_catalog')
    .upsert(records.map(row=>({...row,updated_at:new Date().toISOString()})),{onConflict:'rentman_project_id'});
   if(error)console.error('Crew invoice project catalog could not be extended',error.message);
   for(const record of records)byNumber.set(record.project_number,record);
  }
 }
 return recognizeInvoiceProjects(text,filename,[...byNumber.keys()]);
}
export async function updateCrewProjectCatalogFromPlanning(projects:RentmanPlanningProject[]){
 const rows=projects.filter(p=>p.number!=null&&numberPattern.test(String(p.number))&&Number.isSafeInteger(p.id))
  .map(p=>({rentman_project_id:p.id,project_number:String(p.number),project_name:String(p.name||''),updated_at:new Date().toISOString()}));
 const db=createAdminClient();
 for(let i=0;i<rows.length;i+=150){
  const {error}=await db.from('crew_invoice_project_catalog').upsert(rows.slice(i,i+150),{onConflict:'rentman_project_id'});
  if(error)throw new Error('Projectnummers konden niet worden gesynchroniseerd.');
 }
 return rows.length;
}
