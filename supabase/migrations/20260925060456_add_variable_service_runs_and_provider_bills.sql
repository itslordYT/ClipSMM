/*
# Add variable per-service scheduling and provider bill fields

## Overview
Extends the existing single-tenant ClipSMM order model so every selected
metric/service can have its own generated run history. This mirrors the
mobile organic-order workflow without requiring users to manually create each
run.

## New table
- `campaign_run_items`: one row per service/metric per scheduled run, with the
  exact integer planned quantity, delivery, provider order ID, status, charge,
  and optional provider start count.

## Modified tables
- `campaigns`: adds `variation_percent` for automatic quantity variation.
- `campaign_metrics`: adds `variation_percent` so each service can retain the
  variation setting used for generation.
- `provider_orders`: adds currency, delivered quantity, start count, and
  provider response timing fields.
- `expenses`: adds provider ID and currency for API bills.

## Security
- RLS is enabled on the new table.
- This app is single-tenant and has no sign-in screen, so anon and
  authenticated CRUD policies are intentionally used.

## Important notes
1. Run quantities are integers and must be greater than zero.
2. Submitted or completed run items are represented by their status and are
   not changed by future scheduling edits.
3. Provider credentials remain outside database/frontend data and belong in the
   server-side provider adapter secrets.
*/

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS variation_percent integer NOT NULL DEFAULT 0
  CHECK (variation_percent >= 0 AND variation_percent <= 100);

ALTER TABLE public.campaign_metrics
  ADD COLUMN IF NOT EXISTS variation_percent integer NOT NULL DEFAULT 0
  CHECK (variation_percent >= 0 AND variation_percent <= 100);

ALTER TABLE public.provider_orders
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS delivered_quantity integer NOT NULL DEFAULT 0 CHECK (delivered_quantity >= 0),
  ADD COLUMN IF NOT EXISTS start_count integer,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS checked_at timestamptz;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR';

CREATE TABLE IF NOT EXISTS public.campaign_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  campaign_metric_id uuid NOT NULL REFERENCES public.campaign_metrics(id) ON DELETE CASCADE,
  campaign_run_id uuid NOT NULL REFERENCES public.campaign_runs(id) ON DELETE CASCADE,
  run_number integer NOT NULL CHECK (run_number > 0),
  planned_at timestamptz NOT NULL,
  planned_quantity integer NOT NULL CHECK (planned_quantity > 0),
  delivered_quantity integer NOT NULL DEFAULT 0 CHECK (delivered_quantity >= 0),
  remaining_quantity integer NOT NULL DEFAULT 0 CHECK (remaining_quantity >= 0),
  provider_order_id text,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'SUBMITTED', 'PROCESSING', 'COMPLETED', 'PAUSED', 'FAILED', 'CANCELLED')),
  charge_paise bigint NOT NULL DEFAULT 0 CHECK (charge_paise >= 0),
  currency text NOT NULL DEFAULT 'INR',
  start_count integer,
  submitted_at timestamptz,
  completed_at timestamptz,
  editable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_metric_id, run_number)
);

CREATE INDEX IF NOT EXISTS campaign_run_items_campaign_idx ON public.campaign_run_items(campaign_id, planned_at);
CREATE INDEX IF NOT EXISTS campaign_run_items_metric_idx ON public.campaign_run_items(campaign_metric_id, run_number);
CREATE INDEX IF NOT EXISTS campaign_run_items_provider_order_idx ON public.campaign_run_items(provider_order_id);
CREATE INDEX IF NOT EXISTS provider_orders_external_id_idx ON public.provider_orders(external_order_id);
CREATE INDEX IF NOT EXISTS expenses_provider_idx ON public.expenses(provider_id, expense_date DESC);

ALTER TABLE public.campaign_run_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_campaign_run_items" ON public.campaign_run_items;
CREATE POLICY "anon_select_campaign_run_items" ON public.campaign_run_items FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_campaign_run_items" ON public.campaign_run_items;
CREATE POLICY "anon_insert_campaign_run_items" ON public.campaign_run_items FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_campaign_run_items" ON public.campaign_run_items;
CREATE POLICY "anon_update_campaign_run_items" ON public.campaign_run_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_campaign_run_items" ON public.campaign_run_items;
CREATE POLICY "anon_delete_campaign_run_items" ON public.campaign_run_items FOR DELETE TO anon, authenticated USING (true);
