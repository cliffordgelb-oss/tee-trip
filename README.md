# Tee Trip

A hosted, no-code golf-trip tournament scoring app. Sign in with Google or
Apple, set up your trip (players, rounds, courses, scoring), share the link
with your group, and run a live PGA-style tournament across the weekend.

Spiritually the SaaS sibling of
[forkable-golf-trip-tournament](https://github.com/cliffordgelb-oss/forkable-golf-trip-tournament).
That repo is for groups who want to self-host. This one is the hosted app —
one deployment, multi-tenant, you don't touch any code or SQL.

## Stack

- React 19 + Vite (PWA, installable to home screen on iOS / Android)
- Supabase: Postgres (multi-tenant w/ RLS), Auth (Google + Apple OAuth),
  Realtime, Edge Functions
- Web Push for live birdie / message notifications

## Status

Early MVP scaffold. What's in:

- [x] Repo scaffold + routing
- [x] Multi-tenant schema + RLS
- [x] Supabase OAuth shell (Google + Apple)
- [x] Dashboard listing your tournaments
- [ ] Setup wizard (players, rounds, scoring)
- [ ] Scoring engine + leaderboard / live / heatmap / awards / chat
- [ ] Push notifications
- [ ] Public share / view-only links

## Local dev

```bash
npm install
cp .env.example .env  # fill in Supabase URL + anon key
npm run dev
```

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Enable extensions: **pg_net** and **pgcrypto**.
3. Run [`db/schema.sql`](db/schema.sql) in the SQL editor.
4. Set the project ref so the notification dispatcher knows where to call:
   ```sql
   alter database postgres set "app.project_ref" = 'your-project-ref';
   ```
5. **Auth → Providers**: enable Google and Apple, paste the OAuth client ids /
   secrets per the Supabase docs.
6. Deploy the `send-push` Edge Function (coming) and set VAPID secrets.

## License

MIT.
