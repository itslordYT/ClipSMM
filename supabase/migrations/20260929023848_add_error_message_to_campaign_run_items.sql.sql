/*
# Add error_message column to campaign_run_items

1. New Columns
- `campaign_run_items.error_message` (text, nullable) — stores the provider error
  returned when a run submission fails, so users can see WHY a run failed instead
  of just seeing a FAILED status with no explanation.

2. Security
- No RLS policy changes. Existing policies still apply.
*/

ALTER TABLE campaign_run_items
ADD COLUMN IF NOT EXISTS error_message text;
