/*
# Create ClipSMM personal campaign system

## Overview
Adds the durable data model for a private, single-user ClipSMM workspace.
The app uses no login, so all tables are intentionally shared with the anon
client behind RLS and are not exposed as a public marketplace.

## New tables
1. `providers`: provider profiles, Mock Provider status, and balance display.
2. `provider_services`: provider service catalogue with metric limits and pricing in INR paise.
3. `campaigns`: personal campaign plans, URLs, budgets, revenue, schedule and lifecycle status.
4. `campaign_metrics`: enabled metric quantities and delivery progress per campaign.
5. `campaign_runs`: planned schedule runs with deterministic run quantities.
6. `provider_orders`: mock provider order records; no real provider calls.
7. `provider_balance_snapshots`: historical provider balance values.
8. `wallet_transactions`: internal personal ledger entries in INR paise.
9. `expenses`: manual and API/provider expenses in INR paise.
10. `revenues`: campaign revenue records in INR paise.
11. `activity_logs`: recent activity feed.

## Security
- Every new table has RLS enabled.
- Because this is a no-login personal app, anon and authenticated roles receive CRUD access.
- No provider API keys are stored in browser-visible tables.

## Important notes
1. All money values are integer INR paise.
2. Provider services are seeded only for the clearly labelled Mock Provider.
3. Real provider execution is intentionally not implemented.
*/

CREATE TABLE IF NOT EXISTS public.providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'mock' CHECK (kind IN ('mock', 'external')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
  balance_paise bigint NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
  currency text NOT NULL DEFAULT 'INR',
  last_balance_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.provider_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  name text NOT NULL,
  platform text NOT NULL,
  metric text NOT NULL CHECK (metric IN ('views', 'likes', 'comments', 'shares', 'reposts', 'saves', 'followers', 'subscribers')),
  min_quantity integer NOT NULL DEFAULT 1 CHECK (min_quantity > 0),
  max_quantity integer NOT NULL DEFAULT 1000000 CHECK (max_quantity >= min_quantity),
  rate_paise_per_1000 integer NOT NULL DEFAULT 0 CHECK (rate_paise_per_1000 >= 0),
  refill_days integer NOT NULL DEFAULT 0 CHECK (refill_days >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  platform text NOT NULL,
  post_url text NOT NULL,
  provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SCHEDULED', 'PROCESSING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED')),
  revenue_paise bigint NOT NULL DEFAULT 0 CHECK (revenue_paise >= 0),
  budget_paise bigint NOT NULL DEFAULT 0 CHECK (budget_paise >= 0),
  notes text NOT NULL DEFAULT '',
  start_at timestamptz,
  end_at timestamptz,
  interval_minutes integer CHECK (interval_minutes IS NULL OR interval_minutes > 0),
  run_count integer NOT NULL DEFAULT 1 CHECK (run_count > 0),
  first_run_mode text NOT NULL DEFAULT 'at_start' CHECK (first_run_mode IN ('at_start', 'after_interval')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaign_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric IN ('views', 'likes', 'comments', 'shares', 'reposts', 'saves', 'followers', 'subscribers')),
  service_id uuid REFERENCES public.provider_services(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  delivered_quantity integer NOT NULL DEFAULT 0 CHECK (delivered_quantity >= 0),
  estimated_cost_paise bigint NOT NULL DEFAULT 0 CHECK (estimated_cost_paise >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, metric)
);

CREATE TABLE IF NOT EXISTS public.campaign_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  run_number integer NOT NULL CHECK (run_number > 0),
  planned_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, run_number)
);

CREATE TABLE IF NOT EXISTS public.provider_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  run_id uuid REFERENCES public.campaign_runs(id) ON DELETE SET NULL,
  metric_id uuid REFERENCES public.campaign_metrics(id) ON DELETE SET NULL,
  provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.provider_services(id) ON DELETE SET NULL,
  external_order_id text,
  quantity integer NOT NULL CHECK (quantity > 0),
  charge_paise bigint NOT NULL DEFAULT 0 CHECK (charge_paise >= 0),
  status text NOT NULL DEFAULT 'MOCKED' CHECK (status IN ('PENDING', 'MOCKED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  response_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.provider_balance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  balance_paise bigint NOT NULL CHECK (balance_paise >= 0),
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('credit', 'debit', 'provider_recharge', 'refund', 'adjustment')),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  description text NOT NULL,
  provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  expense_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('editing', 'promotion', 'tools', 'provider_api', 'other')),
  description text NOT NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  provider_order_id uuid REFERENCES public.provider_orders(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'api')), 
  expense_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.revenues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  description text NOT NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  revenue_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_services_provider_idx ON public.provider_services(provider_id);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS campaigns_created_idx ON public.campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS campaign_metrics_campaign_idx ON public.campaign_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_runs_campaign_idx ON public.campaign_runs(campaign_id, planned_at);
CREATE INDEX IF NOT EXISTS provider_orders_campaign_idx ON public.provider_orders(campaign_id);
CREATE INDEX IF NOT EXISTS expenses_date_idx ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS revenues_date_idx ON public.revenues(revenue_date DESC);
CREATE INDEX IF NOT EXISTS activity_logs_created_idx ON public.activity_logs(created_at DESC);

ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_balance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['providers','provider_services','campaigns','campaign_metrics','campaign_runs','provider_orders','provider_balance_snapshots','wallet_transactions','expenses','revenues','activity_logs'] LOOP
    FOREACH policy_name IN ARRAY ARRAY['anon_select_' || table_name,'anon_insert_' || table_name,'anon_update_' || table_name,'anon_delete_' || table_name] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
    END LOOP;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', 'anon_select_' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (true)', 'anon_insert_' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)', 'anon_update_' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO anon, authenticated USING (true)', 'anon_delete_' || table_name, table_name);
  END LOOP;
END $$;

INSERT INTO public.providers (name, slug, kind, status, balance_paise)
VALUES ('Mock Provider', 'mock-provider', 'mock', 'active', 250000)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.provider_services (provider_id, name, platform, metric, min_quantity, max_quantity, rate_paise_per_1000, refill_days)
SELECT p.id, service.name, service.platform, service.metric, service.min_quantity, service.max_quantity, service.rate_paise_per_1000, service.refill_days
FROM public.providers p
CROSS JOIN (VALUES
  ('Instagram Views', 'Instagram', 'views', 100, 1000000, 2500, 0),
  ('Instagram Likes', 'Instagram', 'likes', 10, 100000, 18000, 30),
  ('Instagram Comments', 'Instagram', 'comments', 5, 10000, 45000, 0),
  ('Instagram Shares', 'Instagram', 'shares', 10, 100000, 12000, 0),
  ('Instagram Saves', 'Instagram', 'saves', 10, 100000, 9000, 0),
  ('YouTube Views', 'YouTube', 'views', 100, 1000000, 3500, 0),
  ('TikTok Views', 'TikTok', 'views', 100, 1000000, 2200, 0),
  ('TikTok Likes', 'TikTok', 'likes', 10, 100000, 15000, 0),
  ('Followers', 'Instagram', 'followers', 100, 100000, 55000, 30),
  ('Subscribers', 'YouTube', 'subscribers', 100, 100000, 70000, 30)
) AS service(name, platform, metric, min_quantity, max_quantity, rate_paise_per_1000, refill_days)
WHERE p.slug = 'mock-provider'
  AND NOT EXISTS (SELECT 1 FROM public.provider_services existing WHERE existing.provider_id = p.id AND existing.name = service.name);
