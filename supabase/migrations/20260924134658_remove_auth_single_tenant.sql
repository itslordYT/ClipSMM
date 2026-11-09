/*
# Remove auth requirement — switch to single-tenant (no-login) mode

## Overview
ClipSMM is a personal single-user app with no login screen. This migration
removes all auth-based access controls and switches the tables to allow
the anon-key client to read and write directly.

## Changes

### profiles
- Drop foreign key constraint to auth.users (no longer tied to auth)
- Set default id to gen_random_uuid() (standalone rows, not from auth)
- Replace authenticated-only RLS policies with anon+authenticated policies

### app_settings
- Drop foreign key constraint to profiles
- Drop unique constraint on user_id
- Make user_id nullable (no auth user to reference)
- Replace authenticated-only RLS policies with anon+authenticated policies

### Triggers
- Drop the on_auth_user_created trigger (no auth signup)
- Drop the handle_new_user function (no longer needed)

## Security
- RLS remains enabled on both tables
- Policies now allow anon+authenticated full access (USING true)
- This is correct for a single-tenant no-auth app where all data is shared

## Important Notes
1. No data exists in these tables yet, so no data loss occurs.
2. The anon key client can now read and write both tables directly.
3. No auth.users entry is required to use the app.
*/

-- Drop auth trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- profiles: remove FK to auth.users, allow standalone rows
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Replace authenticated-only policies with anon-accessible ones
DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;

CREATE POLICY "anon_select_profiles" ON public.profiles
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_profiles" ON public.profiles
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_profiles" ON public.profiles
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_profiles" ON public.profiles
  FOR DELETE TO anon, authenticated USING (true);

-- app_settings: remove FK to profiles, make user_id nullable
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_user_id_fkey;
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_user_id_key;
ALTER TABLE public.app_settings ALTER COLUMN user_id DROP NOT NULL;

-- Replace authenticated-only policies with anon-accessible ones
DROP POLICY IF EXISTS "select_own_app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "update_own_app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "insert_own_app_settings" ON public.app_settings;

CREATE POLICY "anon_select_app_settings" ON public.app_settings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_app_settings" ON public.app_settings
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_app_settings" ON public.app_settings
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_app_settings" ON public.app_settings
  FOR DELETE TO anon, authenticated USING (true);
