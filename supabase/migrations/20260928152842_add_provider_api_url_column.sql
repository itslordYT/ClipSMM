/*
# Add api_url column to providers table

1. Modified Tables
- `providers`
  - Added `api_url` (text, nullable) column to store the SMM panel's API endpoint URL.
  - This allows each provider to point to a different SMM panel API (e.g. CheapestSMM, JustAnotherPanel, etc.)
  - When null, the edge function falls back to the default CheapestSMM URL for backward compatibility.
2. Security
- No RLS policy changes needed — the column is readable/writable through existing provider policies.
3. Notes
- Backward compatible: existing providers with null api_url will use the default CheapestSMM API URL.
- The provider settings form will include an API URL field so users can paste any SMM panel's API endpoint.
*/

ALTER TABLE providers ADD COLUMN IF NOT EXISTS api_url text;
