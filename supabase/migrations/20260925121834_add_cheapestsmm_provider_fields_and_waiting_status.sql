/*
# Add CheapestSMM provider fields, WAITING status, and balance snapshots

## Overview
Extends the schema to support the CheapestSMM panel API integration:
- Provider services gain external IDs and raw API metadata fields.
- Campaign run items gain the WAITING status (next run waits while a
  previous order is still processing).
- Campaigns gain PARTIAL status (already in app types, now in DB constraint).
- Provider orders gain balance_before/balance_after snapshot columns.
- Provider balance snapshots gain currency and balance_before columns.

## Modified tables
1. `provider_services`: adds `external_service_id` (the provider's own
   service ID), `service_type`, `service_category`, `rate_usd` (original
   USD rate from API), `refill_supported` (boolean), `cancel_supported`
   (boolean), `raw_data` (JSONB of the full service response row).
2. `campaign_run_items`: adds 'WAITING' to the status CHECK constraint.
3. `campaigns`: adds 'PARTIAL' to the status CHECK constraint.
4. `provider_orders`: adds `balance_before_paise`, `balance_after_paise`
   columns to record balance snapshots at order time.
5. `provider_balance_snapshots`: adds `currency` and `balance_before_paise`
   columns.

## Security
- No new tables. All existing RLS policies remain in effect.
- This is a single-tenant no-auth app; anon + authenticated CRUD is
  intentionally permitted on all tables.

## Important notes
1. All new columns are nullable or have safe defaults so existing rows
   are not broken.
2. `rate_usd` preserves the original USD rate from the provider API.
   INR conversion is displayed only when a conversion rate is configured;
   no automatic 7% discount is applied.
3. `raw_data` stores the full service object returned by the API so
   nothing is lost — speed, average time, and other undocumented fields
   are preserved but never invented.
*/

-- provider_services: add external API fields
ALTER TABLE public.provider_services
  ADD COLUMN IF NOT EXISTS external_service_id text,
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS service_category text,
  ADD COLUMN IF NOT EXISTS rate_usd numeric,
  ADD COLUMN IF NOT EXISTS refill_supported boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancel_supported boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS raw_data jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS provider_services_external_id_idx
  ON public.provider_services(provider_id, external_service_id);

-- campaign_run_items: add WAITING status
ALTER TABLE public.campaign_run_items
  DROP CONSTRAINT IF EXISTS campaign_run_items_status_check;
ALTER TABLE public.campaign_run_items
  ADD CONSTRAINT campaign_run_items_status_check
  CHECK (status IN ('SCHEDULED', 'WAITING', 'SUBMITTED', 'PROCESSING', 'COMPLETED', 'PAUSED', 'FAILED', 'CANCELLED'));

-- campaigns: add PARTIAL status
ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('DRAFT', 'SCHEDULED', 'PROCESSING', 'PARTIAL', 'COMPLETED', 'FAILED', 'CANCELLED'));

-- provider_orders: add balance snapshot columns
ALTER TABLE public.provider_orders
  ADD COLUMN IF NOT EXISTS balance_before_paise bigint,
  ADD COLUMN IF NOT EXISTS balance_after_paise bigint;

-- provider_balance_snapshots: add currency and before balance
ALTER TABLE public.provider_balance_snapshots
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS balance_before_paise bigint;
