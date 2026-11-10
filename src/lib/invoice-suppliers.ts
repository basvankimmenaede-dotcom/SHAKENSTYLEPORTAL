export const INVOICE_SUPPLIER_CATEGORIES=[
 'algemeen','werkplaats','magazijn','voorraad','transport',
 'marketing','abonnementen','projectkosten','overig'
] as const;
export type InvoiceCostCategory=typeof INVOICE_SUPPLIER_CATEGORIES[number];
export const INVOICE_COST_CATEGORY_LABELS:Record<InvoiceCostCategory,string>={
 algemeen:'Algemene kosten',werkplaats:'Werkplaats',magazijn:'Magazijn / opslag',
 voorraad:'Voorraad',transport:'Transport',marketing:'Marketing',
 abonnementen:'Abonnementen',projectkosten:'Projectkosten',overig:'Overig'
};
export function isValidSupplierEmail(email:string):boolean{
 return email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&!/[<>\r\n]/.test(email);
}
export type InvoiceSupplier={id:string;company_name:string;contact_email:string|null;default_cost_category:InvoiceCostCategory};
export function isSupplierInvoice(crewMemberId:string|null,supplierId:string|null):boolean{
 return crewMemberId===null&&Boolean(supplierId);
}
