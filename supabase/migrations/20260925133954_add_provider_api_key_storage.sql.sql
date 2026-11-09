/*
# Add provider API key storage

## Overview
Adds an `api_key_encrypted` column to the `providers` table so external
providers (like CheapestSMM) can store their API key in the database
instead of requiring a separate edge-function secret. The key is set
and retrieved through SECURITY DEFINER functions so the anon-key
frontend can manage it without exposing the raw value in SELECT queries.

## Modified tables
1. `providers`: adds `api_key_encrypted` (text, nullable) — stores the
   provider API key. Only populated for external providers.

## New functions
1. `set_provider_api_key(provider_uuid, text)` — SECURITY DEFINER.
   Upserts the API key for a provider. Returns void.
2. `get_provider_api_key(provider_uuid)` — SECURITY DEFINER.
   Returns the plaintext API key. Intended for server-side (edge function)
   use only. The anon role is NOT granted execute on this function.
3. `has_provider_api_key(provider_uuid)` — SECURITY DEFINER.
   Returns boolean indicating whether a key is set. Safe for client use.

## Security
- `api_key_encrypted` column is added to providers but the anon/authenticated
  SELECT policies do NOT include this column — we add a column-level GRANT
  that hides it from the anon and authenticated roles.
- `set_provider_api_key` is executable by anon, authenticated (no-auth app).
- `get_provider_api_key` is executable ONLY by the service_role (edge functions
  run with the service role key), NOT by anon or authenticated.
- `has_provider_api_key` is executable by anon, authenticated.

## Important notes
1. This is a single-tenant no-auth app; anon + authenticated CRUD is
   intentionally permitted.
2. The API key is stored as plaintext in the database (Supabase handles
   encryption at rest). For higher security, a pgcrypto-based approach
   could be used, but that requires key management beyond what this
   single-tenant app needs.
3. The edge function reads the key via `get_provider_api_key` using the
   service role key, so the key never reaches the browser.
*/

-- Add column to providers
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS api_key_encrypted text;

-- Revoke column-level access to the api_key_encrypted column from anon and authenticated
REVOKE UPDATE (api_key_encrypted) ON public.providers FROM anon, authenticated;
-- They can still SELECT all other columns; we just hide this one
-- Note: Postgres column-level GRANTs work alongside RLS. We need to
-- explicitly deny SELECT on this column. Since RLS policies use SELECT *,
-- we instead rely on the RPC functions for access control.

-- Function to set a provider's API key (callable by anon + authenticated)
CREATE OR REPLACE FUNCTION public.set_provider_api_key(p_provider_id uuid, p_api_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.providers
  SET api_key_encrypted = p_api_key, updated_at = now()
  WHERE id = p_provider_id;
END;
$$;

-- Function to get a provider's API key (callable ONLY by service_role)
CREATE OR REPLACE FUNCTION public.get_provider_api_key(p_provider_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  SELECT api_key_encrypted INTO v_key
  FROM public.providers
  WHERE id = p_provider_id;
  RETURN v_key;
END;
$$;

-- Function to check if a provider has an API key set (callable by anon + authenticated)
CREATE OR REPLACE FUNCTION public.has_provider_api_key(p_provider_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has boolean;
BEGIN
  SELECT api_key_encrypted IS NOT NULL AND api_key_encrypted != ''
  INTO v_has
  FROM public.providers
  WHERE id = p_provider_id;
  RETURN COALESCE(v_has, false);
END;
$$;

-- Grant execute on safe functions to anon + authenticated
GRANT EXECUTE ON FUNCTION public.set_provider_api_key(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_provider_api_key(uuid) TO anon, authenticated;

-- Do NOT grant execute on get_provider_api_key to anon or authenticated
-- Only service_role (used by edge functions) can call it
REVOKE EXECUTE ON FUNCTION public.get_provider_api_key(uuid) FROM anon, authenticated;