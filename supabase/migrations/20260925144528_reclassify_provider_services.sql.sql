/*
# Reclassify existing provider services with correct platform and metric

## Overview
The initial sync hardcoded all services as metric='views' and used the
raw category string as the platform. This migration reclassifies every
existing provider_service row by examining its name and category text
to determine the correct platform (Instagram, YouTube, TikTok, etc.)
and metric (views, likes, followers, comments, shares, saves, etc.).

## Changes
- Updates `platform` and `metric` columns on all rows in
  `provider_services` based on pattern matching against `name` and
  `service_category`.
- No schema changes, no data loss — only two columns are updated.

## Security
- No RLS or policy changes.
*/

UPDATE public.provider_services SET platform = CASE
  WHEN name ILIKE '%instagram%' OR service_category ILIKE '%instagram%' THEN 'Instagram'
  WHEN name ILIKE '%youtube%' OR service_category ILIKE '%youtube%' OR name ILIKE '%subscriber%' THEN 'YouTube'
  WHEN name ILIKE '%tiktok%' OR service_category ILIKE '%tiktok%' THEN 'TikTok'
  WHEN name ILIKE '%twitter%' OR service_category ILIKE '%twitter%' THEN 'Twitter/X'
  WHEN name ILIKE '%facebook%' OR service_category ILIKE '%facebook%' THEN 'Facebook'
  WHEN name ILIKE '%telegram%' OR service_category ILIKE '%telegram%' THEN 'Telegram'
  WHEN name ILIKE '%spotify%' OR service_category ILIKE '%spotify%' THEN 'Spotify'
  WHEN name ILIKE '%snapchat%' OR service_category ILIKE '%snapchat%' THEN 'Snapchat'
  WHEN name ILIKE '%whatsapp%' OR service_category ILIKE '%whatsapp%' THEN 'WhatsApp'
  WHEN name ILIKE '%linkedin%' OR service_category ILIKE '%linkedin%' THEN 'LinkedIn'
  WHEN name ILIKE '%twitch%' OR service_category ILIKE '%twitch%' THEN 'Twitch'
  WHEN name ILIKE '%website%' OR service_category ILIKE '%website%' OR service_category ILIKE '%traffic%' THEN 'Website'
  ELSE 'Other'
END;

UPDATE public.provider_services SET metric = CASE
  WHEN name ILIKE '%subscriber%' THEN 'subscribers'
  WHEN name ILIKE '%follower%' OR name ILIKE '%member%' THEN 'followers'
  WHEN name ILIKE '%comment%' OR name ILIKE '%reply%' THEN 'comments'
  WHEN name ILIKE '%repost%' OR name ILIKE '%retweet%' THEN 'reposts'
  WHEN name ILIKE '%save%' OR name ILIKE '%bookmark%' THEN 'saves'
  WHEN name ILIKE '%share%' THEN 'shares'
  WHEN name ILIKE '%like%' OR name ILIKE '%reaction%' OR name ILIKE '%favorite%' OR name ILIKE '%favourite%' THEN 'likes'
  WHEN name ILIKE '%view%' OR name ILIKE '%play%' OR name ILIKE '%impression%' OR name ILIKE '%reach%' OR name ILIKE '%stream%' OR name ILIKE '%watch%' THEN 'views'
  ELSE 'views'
END;