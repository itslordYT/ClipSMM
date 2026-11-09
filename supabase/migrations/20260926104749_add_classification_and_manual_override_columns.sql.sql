/*
# Add classification tracking and manual override columns

## Overview
Adds classification source tracking and manual platform/metric override columns
to provider_services, plus a platform column to favorite_services for per-
provider+platform+metric default scoping.

## Modified Tables
- provider_services: classification_source, manual_platform, manual_metric
- favorite_services: platform column
*/

ALTER TABLE public.provider_services
  ADD COLUMN IF NOT EXISTS classification_source text DEFAULT 'inferred';
ALTER TABLE public.provider_services
  ADD COLUMN IF NOT EXISTS manual_platform text;
ALTER TABLE public.provider_services
  ADD COLUMN IF NOT EXISTS manual_metric text;

ALTER TABLE public.favorite_services
  ADD COLUMN IF NOT EXISTS platform text;
