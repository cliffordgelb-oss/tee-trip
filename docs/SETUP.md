# Ship-it walkthrough

End-to-end setup from a fresh clone to a live URL you can hand to a golf
group. Roughly **30–45 minutes** of clicking + waiting if everything goes
smoothly.

Pre-reqs:

- A Google account (for Supabase + Google Cloud + Vercel logins).
- A GitHub account with the [`cliffordgelb-oss/tee-trip`](https://github.com/cliffordgelb-oss/tee-trip) repo pushed.
- Node 20+ locally (optional — only if you want to run the app locally before deploy).

> Apple sign-in is intentionally **disabled for v1** — re-enabling it
> requires a paid Apple Developer account ($99/yr). The auth helper is
> still in `src/lib/auth.jsx`; add the button back to `src/pages/Login.jsx`
> when you're ready.

---

## 1. Create the Supabase project (~5 min)

1. Go to <https://supabase.com> → sign in with Google.
2. **New project**:
   - Name: `tee-trip` (or whatever).
   - Database password: generate one and **save it in a password manager**. You'll basically never need it again, but save it.
   - Region: pick the one closest to you.
   - Pricing plan: **Free** is fine. (Free covers 500MB DB, 50K monthly auth users, 2GB egress — far more than this app will use.)
3. Click **Create new project** and wait ~2 minutes for provisioning.

Once it's up, **stay on this tab** — you'll grab the URL and anon key in step 4.

---

## 2. Enable Postgres extensions (~30 sec)

In the Supabase dashboard for your new project:

1. Left sidebar → **Database** → **Extensions**.
2. Search **`pg_net`** → toggle it on.
3. Search **`pgcrypto`** → toggle it on (it may already be enabled).

Both extensions are required: `pg_net` is how the database fires the
edge-function HTTP call for push notifications; `pgcrypto` provides
`gen_random_uuid()`.

---

## 3. Run the schema (~30 sec)

1. Left sidebar → **SQL Editor** → **New query**.
2. Open [`db/schema.sql`](../db/schema.sql) from the repo, copy the whole file (~470 lines), paste it into the editor.
3. Click **Run**.

You should see a green success toast. Errors usually mean an extension
isn't enabled — go back to step 2 if so.

To verify it worked:

```sql
select count(*) from tournaments;            -- → 0
select fn_is_member('00000000-0000-0000-0000-000000000000'); -- → false
```

Then, in the same SQL editor, set the project ref so the push dispatcher
knows where to call (replace `YOUR_REF` with the part before `.supabase.co`
in your Supabase URL — find it under **Project Settings → General** as
"Reference ID"):

```sql
alter database postgres set "app.project_ref" = 'YOUR_REF';
```

This won't be used until you wire push notifications later, but set it
now so it's not forgotten.

---

## 4. Grab the Supabase URL + anon key

1. Left sidebar → **Project Settings** → **API**.
2. Copy these two values somewhere temporary:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon / public key** — long JWT string starting with `eyJ...`

These go into Vercel env vars in step 7. Optionally drop them into
`.env.local` in the repo root if you want to test locally first:

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

---

## 5. Google OAuth — Google Cloud Console (~10 min)

This is the fiddliest step. Take your time.

1. Go to <https://console.cloud.google.com>.
2. Top bar → project dropdown → **New project** → name it `tee-trip` → **Create**.
3. Make sure the new project is selected (top bar dropdown).
4. Left nav → **APIs & Services** → **OAuth consent screen**:
   - User type: **External** → Create.
   - App name: `Tee Trip`
   - User support email: your email
   - App logo (optional): upload [`public/logo-icon.png`](../public/logo-icon.png)
   - App domain → Application home page: `https://tee-trip.vercel.app` (or your custom domain when you have it — placeholder is fine for now)
   - Developer contact email: your email
   - **Save and continue**.
   - **Scopes** screen: just **Save and continue**, no scopes needed.
   - **Test users**: add your own email and any beta testers. → **Save and continue**.
   - **Summary** → **Back to dashboard**.
   - Publishing status will say "Testing". You can **Publish app** when you're ready to allow signups from anyone; for now Testing is fine.
5. Left nav → **APIs & Services** → **Credentials** → **+ Create Credentials** → **OAuth client ID**:
   - Application type: **Web application**
   - Name: `tee-trip web`
   - Authorized JavaScript origins:
     - `https://<your-supabase-ref>.supabase.co`
     - `http://localhost:5173` (for local dev)
   - Authorized redirect URIs:
     - `https://<your-supabase-ref>.supabase.co/auth/v1/callback` — Supabase handles the redirect, not Vercel.
   - **Create**.
6. A modal pops up with your **Client ID** and **Client secret**. Copy both.

---

## 6. Wire Google OAuth into Supabase (~1 min)

Back in the Supabase dashboard:

1. Left sidebar → **Authentication** → **Providers**.
2. Find **Google** → toggle it on.
3. Paste the **Client ID** and **Client Secret** from step 5.6.
4. **Save**.

While you're there, in **Authentication → URL Configuration**:

- **Site URL**: leave it as Supabase's default for now; update to your Vercel URL after deploy.
- **Redirect URLs** (allow-list): add
  - `http://localhost:5173/dashboard`
  - `https://tee-trip.vercel.app/dashboard` (or your custom domain)

These are the URLs the user gets bounced back to *after* the Google round-trip. They must match what `signInWithOAuth` passes as `redirectTo` (we set this to `${window.location.origin}/dashboard` in [`src/lib/auth.jsx`](../src/lib/auth.jsx)).

---

## 7. Deploy to Vercel (~5 min)

1. Go to <https://vercel.com> → sign in with GitHub (use your **cliffordgelb-oss** account).
2. **Add new** → **Project**.
3. Pick `cliffordgelb-oss/tee-trip` → **Import**.
4. Framework preset: Vite (auto-detected).
5. Expand **Environment Variables**:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
6. **Deploy**.

First deploy takes ~1 min. When it's done you'll get a URL like
`tee-trip-cliffordgelb-oss.vercel.app` (or just `tee-trip.vercel.app` if
you grabbed the project name). Visit it.

> **Vercel Hobby gotcha** — every push must come from a commit whose
> author email matches a verified email on the Vercel account. This repo's
> local git config already sets `user.email cliffordgelb@gmail.com`, so
> you should be fine. If a future push triggers a "deployment was blocked
> because the commit author did not have contributing access" error, see
> the existing memory file `feedback_vercel_commit_author.md`.

---

## 8. Update OAuth allow-lists with the live URL

Once Vercel hands you the URL:

1. Back in Google Cloud Console → **Credentials** → your OAuth client → edit:
   - Authorized JavaScript origins: add `https://<your-vercel-domain>`
   - Save.
2. In Supabase → **Authentication → URL Configuration**:
   - Site URL: `https://<your-vercel-domain>`
   - Redirect URLs: make sure `https://<your-vercel-domain>/dashboard` is there.
   - Save.

---

## 9. Smoke test

Visit your live URL. Run through:

1. Land on `/login` — see the Tee Trip logo + "Continue with Google" button.
2. Click **Continue with Google** → Google account picker → consent screen
   (only on first run) → bounced back to `/dashboard`.
3. Dashboard says "No tournaments yet. Start one — takes about 5 minutes."
4. Click **New tournament** → run through the 5-step wizard. Use ~6
   players, default rounds. Create.
5. Lands on `/t/<slug>`. Leaderboard tab shows 6 players, all `0` total.
6. Click **Rounds** tab → first round → setup card prompts for handicaps
   + groups. Fill those in, save.
7. Enter a couple of scores in the scorecard grid. Tab/blur — watch the
   cell color flip (birdies green with a pencil circle, bogeys brown,
   etc). The leaderboard updates via realtime when you flip back.

If any of that breaks, copy the error (browser console + the network tab
if it's a Supabase request) and ping me.

---

## What's not wired yet (v2 backlog)

- **Chat** — UI is a stub; the DB schema is ready. Port from [BamaApp's `App.jsx` Chat section](https://github.com/cliffordgelb-oss/bama-golf-app).
- **Push notifications** — needs the `send-push` edge function multi-tenanted + a VAPID key pair.
- **Apple sign-in** — needs the Apple Developer account; the auth helper in `src/lib/auth.jsx` is ready.
- **Settings editor** — today you can't edit per-hole pars or invite new members post-creation.
- **Public/share read-only links** — non-members can't view a leaderboard yet.
- **Live PGA-style view + awards + heatmap** — BamaApp has them; not yet ported.

---

## Useful URLs for your bookmarks bar

- Supabase dashboard: <https://supabase.com/dashboard>
- Google Cloud Console: <https://console.cloud.google.com>
- Vercel dashboard: <https://vercel.com/dashboard>
- Live app: `https://<your-vercel-domain>`
- GitHub repo: <https://github.com/cliffordgelb-oss/tee-trip>
