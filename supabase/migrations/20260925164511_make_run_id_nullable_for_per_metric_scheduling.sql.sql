/*
# Make campaign_run_id nullable for per-metric independent scheduling

## Overview
Previously all metrics shared a single set of campaign_runs with the same
run count and timing. This forced metrics with very different quantities
(e.g. 50000 views vs 500 likes) into the same number of runs, producing
nonsensical distributions.

Each metric now gets its own independent run count and schedule within
the shared campaign time window. campaign_run_items no longer requires
a campaign_run_id since runs are per-metric, not per-campaign.

## Changes
- campaign_run_items.campaign_run_id becomes nullable
*/

ALTER TABLE public.campaign_run_items
  ALTER COLUMN campaign_run_id DROP NOT NULL;