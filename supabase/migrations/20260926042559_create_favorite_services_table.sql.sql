/*
# Create favorite_services table

## Overview
Adds a favorites system so users can star preferred provider services and
optionally set a default service per metric. Favorites persist across
service sync/rate updates because they are keyed by provider_id +
external_service_id, not by the service row's primary key.

## New Tables
- `favorite_services`
  - `id` (uuid, PK)
  - `provider_id` (uuid, FK to providers, NOT NULL)
  - `external_service_id` (text, NOT NULL) — the provider's external service ID
  - `metric` (text, NOT NULL) — which metric this favorite is for (views, likes, etc.)
  - `is_default` (boolean, default false) — if true, this is the default service for this metric
  - `notes` (text, nullable) — optional user notes
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

## Constraints
- Unique constraint on (provider_id, external_service_id) — one favorite per external service

## Security
- RLS enabled
- Single-tenant app: anon + authenticated CRUD (no sign-in screen)
*/

CREATE TABLE IF NOT EXISTS public.favorite_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  external_service_id text NOT NULL,
  metric text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.favorite_services ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_favorite_services_provider_ext
  ON public.favorite_services (provider_id, external_service_id);

CREATE INDEX IF NOT EXISTS idx_favorite_services_metric
  ON public.favorite_services (metric);

-- Single-tenant: allow anon + authenticated full CRUD
DROP POLICY IF EXISTS "anon_select_favorites" ON public.favorite_services;
CREATE POLICY "anon_select_favorites" ON public.favorite_services
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_favorites" ON public.favorite_services;
CREATE POLICY "anon_insert_favorites" ON public.favorite_services
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_favorites" ON public.favorite_services;
CREATE POLICY "anon_update_favorites" ON public.favorite_services
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_favorites" ON public.favorite_services;
CREATE POLICY "anon_delete_favorites" ON public.favorite_services
  FOR DELETE TO anon, authenticated USING (true);
