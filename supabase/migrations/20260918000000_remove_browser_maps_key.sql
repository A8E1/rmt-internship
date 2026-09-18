-- UNAPPLIED: use only in the isolated test project after reviewing its schema.
-- Remove both current nested and legacy flat settings shapes. This does not rotate a key.
update public.app_settings
set value = (value::jsonb #- '{data,gkey}') #- '{gkey}'
where key = 'ops';
