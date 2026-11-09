/*
# Add approval timestamp to engagement orders

1. Modified Tables
- `campaigns`: new nullable column `approved_at` (timestamptz).
  - NULL means the order is a New Submission awaiting approval.
  - A timestamp means the order has been approved and is in Approved Submissions.

2. Existing Data
- Existing orders are left with NULL, so they appear under New Submissions until approved.

3. Security
- No new tables. Existing grants and row level security policies on `campaigns` already cover the new column.

4. Notes
- Adding a column does not remove or change any data.
*/

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS approved_at timestamptz;
