-- Company and email-based invoice matching for existing Rentman-linked crew profiles.
alter table public.crew_portal_members add column if not exists company_name text, add column if not exists company_alias text, add column if not exists invoice_email text;
alter table public.invoice_pdf_extractions add column if not exists match_reason text, add column if not exists match_strength text;
-- Existing RLS on crew_portal_members and invoice_pdf_extractions remains unchanged.
