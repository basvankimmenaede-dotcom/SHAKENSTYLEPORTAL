import Link from 'next/link';
import type {ReactNode} from 'react';
import SettingsNav from '@/components/SettingsNav';
type Props={active:string;title:string;description:string;children:ReactNode};
export default function SettingsWorkspace({active,title,description,children}:Props){
 return <main className="container settingsPage">
  <section className="usersAdminHeader">
   <div><span className="usersAdminEyebrow">SHAKENSTYLE Portal / Portaalinstellingen</span>
     <h1>{title}</h1><p>{description}</p></div>
   <Link className="button secondary" href="/admin/accounts">Accounts & toegang</Link>
  </section>
  <section className="settingsWorkspace">
   <SettingsNav active={active}/>
   <div className="settingsEditorPane settingsMain">{children}</div>
  </section>
 </main>;
}
