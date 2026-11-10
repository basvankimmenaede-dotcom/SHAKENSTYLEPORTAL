'use client';
import { useState, useTransition } from 'react';
import { updateIncomingInvoiceEmail } from '@/app/planning/actions';
import { useToast } from '@/components/ToastProvider';

export default function InvoiceEmailSettings({email}:{email:string}){
  const [value,setValue]=useState(email);
  const [pending,startTransition]=useTransition();
  const {showToast}=useToast();
  const save=(formData:FormData)=>{
    startTransition(async()=>{
      const result=await updateIncomingInvoiceEmail(formData);
      showToast(result.message,result.ok?'success':'error');
    });
  };
  return <form action={save} className="settingsFormRow">
    <div><strong>Ontvangstadres</strong>
      <span>Dit adres gebruiken we straks voor inkomende facturen en eventuele correcties.</span>
      <span>Alleen het adres wordt hier opgeslagen. De mailbox en automatische ontvangst moeten nog apart worden aangesloten.</span>
    </div>
    <div style={{flex:'1 1 280px',minWidth:180,maxWidth:390}}>
      <label htmlFor="incoming_invoice_email" className="sr-only">Factuur e-mailadres</label>
      <input id="incoming_invoice_email" name="incoming_invoice_email" type="email"
        className="input" style={{width:'100%'}} maxLength={254}
        autoComplete="off" placeholder="facturen@shakenstyle.com"
        value={value} onChange={e=>setValue(e.target.value)} />
    </div>
    <button type="submit" className="button orange" disabled={pending}>{pending?'Opslaan…':'Opslaan'}</button>
  </form>;
}
