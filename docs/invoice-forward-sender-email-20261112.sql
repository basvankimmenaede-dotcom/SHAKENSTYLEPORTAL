-- Applied to the SHAKENSTYLE Supabase project on 2026-11-12.
-- Migration: invoice_forward_sender_email_20261112
-- Empty sender keeps the existing SMTP username; no other portal mails are affected.
alter table public.invoice_processing_settings
  add column if not exists forward_sender_email text not null default '';
alter table public.invoice_processing_settings
  add constraint invoice_processing_forward_sender_email_valid
  check (
    forward_sender_email = ''
    or (char_length(forward_sender_email) <= 254
        and forward_sender_email ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$')
  );
comment on column public.invoice_processing_settings.forward_sender_email is
  'Optional From address for forwarding approved purchase invoices; empty uses CREW_SMTP_USER.';
