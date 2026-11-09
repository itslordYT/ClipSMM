/*
# Create profiles and app_settings tables for ClipSMM

## Overview
Creates the foundational database tables for ClipSMM — a private single-user
clipping-campaign command center. This migration establishes:
1. A `profiles` table linked to Supabase Auth users.
2. An `app_settings` table for per-user application preferences.
3. Row Level Security policies so each user can only access their own data.
4. A database trigger that automatically creates a profile and app_settings
   row whenever a new auth user is created.

## New Tables

### profiles
- `id` (uuid, primary key) — references `auth.users(id)` with CASCADE delete.
- `full_name` (text, nullable) — the user's display name.
- `avatar_url` (text, nullable) — optional avatar image URL.
- `created_at` (timestamptz, default now()) — record creation time.
- `updated_at` (timestamptz, default now()) — last update time.

### app_settings
- `id` (uuid, primary key, default gen_random_uuid()) — unique settings row ID.
- `user_id` (uuid, unique, not null) — references `profiles(id)` with CASCADE delete.
- `app_name` (text, default 'ClipSMM') — application display name.
- `default_currency` (text, default 'INR') — default currency code.
- `timezone` (text, default 'Asia/Kolkata') — default timezone.
- `created_at` (timestamptz, default now()) — record creation time.
- `updated_at` (timestamptz, default now()) — last update time.

## Security
- RLS enabled on both `profiles` and `app_settings`.
- `profiles`: users can SELECT and UPDATE only their own row (id = auth.uid()).
  INSERT is handled by the trigger function (SECURITY DEFINER), so no direct
  INSERT policy is needed for authenticated users.
- `app_settings`: users can SELECT and UPDATE only rows where user_id = auth.uid().
- A `SECURITY DEFINER` trigger function handles automatic profile + settings
  creation on new user signup, bypassing RLS safely.

## Indexes
- `app_settings.user_id` — unique index for fast lookups.

## Important Notes
1. The trigger `on_auth_user_created` fires AFTER INSERT on `auth.users`,
   creating both a profile and app_settings row automatically.
2. `updated_at` is automatically maintained by a trigger on both tables.
3. No customer-facing or public access — all policies require authentication.
*/

-- ============================================================
-- profiles table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
CREATE POLICY "select_own_profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- app_settings table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  app_name text NOT NULL DEFAULT 'ClipSMM',
  default_currency text NOT NULL DEFAULT 'INR',
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_app_settings" ON public.app_settings;
CREATE POLICY "select_own_app_settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_app_settings" ON public.app_settings;
CREATE POLICY "update_own_app_settings"
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_app_settings" ON public.app_settings;
CREATE POLICY "insert_own_app_settings"
  ON public.app_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- updated_at trigger function (shared)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS app_settings_set_updated_at ON public.app_settings;
CREATE TRIGGER app_settings_set_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Auto-create profile + app_settings on new user
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');

  INSERT INTO public.app_settings (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
