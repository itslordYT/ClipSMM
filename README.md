# ClipSMM

Private single-user clipping-campaign command center.

## Authentication Setup

### 1. Connect Supabase to Bolt

Your Supabase project is already provisioned and connected. The following environment variables must be present in `.env`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

These are set automatically by Bolt. Do **not** put the service-role key (`SUPABASE_SERVICE_ROLE_KEY`) in any client-side code — it is only for server/edge use.

### 2. Enable the Email Provider

1. Go to your **Supabase Dashboard** → **Authentication** → **Providers**.
2. Click **Email**.
3. Make sure **Enable Email provider** is toggled **on**.
4. Under **Email confirmations**:
   - **Disable** "Confirm email" (recommended for this private single-user app) so you can log in immediately after creating the account.
   - If you leave it enabled, you will need to click the confirmation link in the email before you can sign in. You can re-enable it later from the same settings page.

### 3. Create the Owner Account

Since ClipSMM is a private app with no public registration page:

1. Go to **Supabase Dashboard** → **Authentication** → **Users**.
2. Click **Add user** → **Create new user**.
3. Enter your email address and a secure password.
4. Click **Create user**.
5. If email confirmation is enabled, the user will receive a confirmation email. Open it and click the link before trying to log in.

### 4. Log In to ClipSMM

1. Open the app — you will be redirected to `/login`.
2. Enter the email and password you just created in Supabase.
3. Click **Sign In**.
4. You will be redirected to the dashboard.

### 5. Session Persistence

- Your session is stored in cookies and persists across page refreshes and browser restarts.
- Protected routes redirect to `/login` if you are not authenticated.
- Visiting `/login` while already logged in redirects you to `/dashboard`.
- Click **Logout** in the sidebar or mobile menu to sign out — this clears the session and returns you to `/login`.

### 6. Forgot Password

The login page includes a "Forgot password" link. Enter your email in the email field, then click "Forgot password" to receive a password reset email from Supabase. For this to work:

- Go to **Supabase Dashboard** → **Authentication** → **URL Configuration**.
- Set the **Site URL** to your app's URL (e.g., `https://your-app.vercel.app`).
- Add the same URL to **Redirect URLs**.
- Ensure the email template for "Reset Password" is enabled under **Authentication** → **Email Templates**.

### 7. Diagnostics

Visit `/diagnostics` in the app to check whether:
- Supabase environment variables are configured.
- The database is reachable.
- Required tables (`profiles`, `app_settings`) exist.
- An auth session is active.

This page never exposes API keys, service-role keys, passwords, or secrets — it only reports "configured" or "missing" status.
