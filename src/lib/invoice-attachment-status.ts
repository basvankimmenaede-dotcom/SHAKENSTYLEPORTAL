
export type AttachmentResolution={attachment_index:number;linked_invoice_id?:string|null};
export function allInvoiceAttachmentsReviewed(
  expectedCount:number,
  invoiceLinks:AttachmentResolution[],
  dispositions:{attachment_index:number}[]
):boolean{
 if(!Number.isInteger(expectedCount)||expectedCount<1||expectedCount>10)return false;
 const handled=new Set<number>();
 for(const item of invoiceLinks){
  if(item.linked_invoice_id)handled.add(item.attachment_index);
 }
 for(const item of dispositions)handled.add(item.attachment_index);
 return Array.from({length:expectedCount},(_,index)=>index).every(index=>handled.has(index));
}
