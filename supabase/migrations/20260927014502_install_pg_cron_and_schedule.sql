/*
# Install pg_cron and schedule the submit-due-runs edge function

## Purpose
The browser-based scheduler only submits due runs while the page is open.
This installs pg_cron + pg_net so the database pings the submit-due-runs
edge function every 2 minutes, ensuring runs are submitted even with no
browser open.

## Changes
1. Install pg_cron extension.
2. Install pg_net extension.
3. Schedule submit-due-runs every 2 minutes.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated;

-- Remove existing job if present, then schedule
DO $_$
BEGIN
  PERFORM cron.unschedule('clipsmm_submit_due_runs');
EXCEPTION WHEN OTHERS THEN NULL;
END
$_$;

SELECT cron.schedule(
  'clipsmm_submit_due_runs',
  '*/2 * * * *',
  'SELECT net.http_post(
    url := ''https://eibsgvwcavycwqdwvrxn.supabase.co/functions/v1/submit-due-runs'',
    headers := jsonb_build_object(''Content-Type'', ''application/json''),
    body := ''{}''::jsonb
  );'
);