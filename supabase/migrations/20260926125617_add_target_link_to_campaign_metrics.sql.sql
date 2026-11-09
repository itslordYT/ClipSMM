/*
# Add target_link column to campaign_metrics

## Overview
Each campaign metric needs its own target link (post URL, profile URL, or channel URL)
so that when we submit the order to the provider API, the correct link is sent for each metric.

## Modified Tables
- campaign_metrics: add target_link text column (nullable, stores the specific URL for that metric)
*/

ALTER TABLE public.campaign_metrics
  ADD COLUMN IF NOT EXISTS target_link text;
