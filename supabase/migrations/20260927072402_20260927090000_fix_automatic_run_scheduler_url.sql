/*
# Fix automatic run scheduler endpoint

1. Purpose
- Updates the existing pg_cron job so due campaign runs are sent to the deployed scheduler for this project.
- Keeps automatic submission independent from whether the orders page is open.

2. Modified scheduler
- `clipsmm_submit_due_runs`
- Runs every minute.
- Posts to the deployed `submit-due-runs` Edge Function.

3. Security
- No table, column, or RLS policy changes.
- The scheduler continues to use the existing server-side function, which reads provider credentials without exposing them to the browser.

4. Important notes
- This change only affects future due runs. It does not cancel provider orders that were already submitted.
- Existing waiting runs remain in the database and will be picked up automatically once their planned time has arrived.
*/

select cron.unschedule('clipsmm_submit_due_runs');

select cron.schedule(
  'clipsmm_submit_due_runs',
  '* * * * *',
  $$select net.http_post(
    url := 'https://jcjcyusuxnvhhisoopck.supabase.co/functions/v1/submit-due-runs',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );$$
);