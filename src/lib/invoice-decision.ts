/** Office decisions on a received invoice. The second approver may veto a first approval. */
export type InvoiceDecisionState={
 status:string; approved_first_by:string|null; approved_second_by:string|null;
 approval_policy_one:string|null; approval_policy_two:string|null;
 forward_attempted_at:string|null; forwarded_at:string|null;
};
export function canDeclineInvoice(
 invoice:InvoiceDecisionState,actorId:string,canManage:boolean,
 configuredFirst:string|null,configuredSecond:string|null
):boolean{
 if(!canManage||!actorId||!['received','in_review'].includes(invoice.status)
  ||invoice.approved_second_by||invoice.forward_attempted_at||invoice.forwarded_at)return false;
 // Before first approval, preserve existing billing/manage correction permissions.
 if(!invoice.approved_first_by)return true;
 const first=invoice.approval_policy_one||configuredFirst;
 const second=invoice.approval_policy_two||configuredSecond;
 return Boolean(first&&second&&first!==second&&actorId!==invoice.approved_first_by
  &&[first,second].includes(invoice.approved_first_by)&&[first,second].includes(actorId));
}
