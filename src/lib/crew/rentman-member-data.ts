/** Rentman owns roster identity and planning-active status, not portal access. */
export type RentmanCrewRaw={id:number;firstname?:string|null;lastname?:string|null;email?:string|null;active?:boolean|null};
export type NormalizedRentmanCrew={rentman_crew_id:number;full_name:string;rentman_email:string|null;active:boolean};
export function normalizeRentmanCrew(raw:RentmanCrewRaw):NormalizedRentmanCrew|null{
 if(!Number.isSafeInteger(raw.id)||raw.id<=0)return null;
 const name=[raw.firstname||'',raw.lastname||''].join(' ').trim().replace(/\s+/g,' ');
 if(name.length<2||name.length>160)return null;
 const address=String(raw.email||'').trim().toLowerCase();
 const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)&&address.length<=254?address:null;
 return {rentman_crew_id:raw.id,full_name:name,rentman_email:email,active:raw.active!==false};
}
