-- Rename the generic run file types to the credit-domain categories used by the
-- New Run page. Updates in place so existing run_file rows keep their FK ids.
-- (Idempotent: no-ops on fresh databases already seeded with the new names.)

update public.run_file_type set description = 'Financial Statement'  where description = 'Document';
update public.run_file_type set description = 'Rating Report'         where description = 'Spreadsheet';
update public.run_file_type set description = 'Credit Paper Example'  where description = 'Example';
