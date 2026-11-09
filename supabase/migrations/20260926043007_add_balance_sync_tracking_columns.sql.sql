/*
# Add balance sync tracking columns to providers

## Overview
Adds two columns to the providers table to properly track balance sync state:
- `last_balance_error` — stores the error message if the last balance sync failed, NULL if it succeeded
- `conversion_rate_to_inr` — optional conversion rate from the provider's currency to INR

## Modified Tables
- `providers`
  - `last_balance_error` (text, nullable) — error message from last failed balance sync
  - `conversion_rate_to_inr` (numeric, nullable) — multiply provider currency by this to get INR

## Security
- No RLS changes (existing policies still apply)
*/

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS last_balance_error text;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS conversion_rate_to_inr numeric;
