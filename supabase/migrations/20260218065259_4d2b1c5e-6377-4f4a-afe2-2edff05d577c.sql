-- Force PostgREST schema cache refresh by notifying
NOTIFY pgrst, 'reload schema';