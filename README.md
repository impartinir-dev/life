# Life

A shared "manage our life" app for two people: shopping lists and to-dos today, with more modules to come.
It's a phone-first web app (install it to your home screen), works offline in the supermarket, and
syncs live between both phones. Available in English and German.

- **Live site:** https://impartinir-dev.github.io/life/
- **Hosting:** GitHub Pages (free) · **Database & logins:** Supabase (free tier)

## Connect Supabase (one-time, ~5 minutes)

The site is deployed, but until these steps are done it shows "Almost there".

1. **Create a project.** Sign up at [supabase.com](https://supabase.com) (free, no card), then click
   *New project*. Choose any name, a strong database password, and a region near you (e.g. Frankfurt).
2. **Create the tables.** In the project open **SQL Editor → New query**, paste the whole of
   [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. It should say "Success. No rows returned".
3. **Set the website address.** Go to **Authentication → URL Configuration**:
   - *Site URL*: `https://impartinir-dev.github.io/life/`
   - *Redirect URLs*: add `https://impartinir-dev.github.io/life/`
4. **Give the site the project's address and public key.** Go to **Project Settings → API Keys**
   (or **Data API**) and copy the *Project URL* and the *publishable* key (`sb_publishable_…`, or the
   legacy `anon` key). Never use the `secret` / `service_role` key here. Then run:

   ```bash
   gh variable set SUPABASE_URL --repo impartinir-dev/life --body "https://YOUR-PROJECT.supabase.co"
   gh variable set SUPABASE_ANON_KEY --repo impartinir-dev/life --body "YOUR-PUBLISHABLE-KEY"
   gh workflow run deploy.yml --repo impartinir-dev/life
   ```

   (Or add them in GitHub under **Settings → Secrets and variables → Actions → Variables**, then re-run
   the "Test and deploy" workflow.) The publishable key is meant to be public; the database access
   rules are what protect your data.

5. **Sign up and invite.** Open the site, create your account, confirm the email, create your household,
   then go to **More → Invite someone** and enter your partner's email. Send them the link; once they
   sign up with that email they'll see a **Join** button.

> **Free tier note:** Supabase pauses a free project after 7 days without any use. Nothing is lost —
> open the project in the Supabase dashboard and click *Restore*. With daily use this won't happen.
>
> Supabase's built-in email sender only allows a few emails per hour. That's plenty for sign-up and
> password resets for two people.

## Install on your phone

- **iPhone (Safari):** Share → *Add to Home Screen*
- **Android (Chrome):** menu ⋮ → *Install app* / *Add to Home screen*

## How it works

- `src/` — React + TypeScript app built with Vite, installable as a PWA.
- `src/data/engine.ts` — keeps a local copy of the household's data in IndexedDB, applies changes
  locally first, queues them while offline, and syncs to Supabase (plus live updates via Realtime).
  Rows get their ids on the phone, so a queued change can be safely replayed. If both of you edit the
  same thing offline, the last change to reach the server wins.
- `supabase/schema.sql` — tables and row level security: every row belongs to a household, and only
  members of that household can read or write it. Joining a household is only possible through an
  invite addressed to your email.
- `src/i18n/` — all UI text in `en.ts` and `de.ts`; a test checks both have the same keys.
- Deleting things is a soft delete with *Undo*. **More → Download a backup** exports everything as JSON.

## Develop

```bash
npm install
npm run dev
npm test
```

For local development, create `.env.local` with `VITE_SUPABASE_URL=…` and `VITE_SUPABASE_ANON_KEY=…`.

`npm test` covers the date/repeat logic, the offline queue, suggestions, translations, and the
database access rules (run against an in-memory Postgres with [PGlite](https://pglite.dev)).

## Roadmap

1. ✅ Foundation: accounts, household, invites, EN/DE, offline sync
2. ✅ Shopping lists
3. ✅ To-dos and chores (with repeats)
4. Calendar and appointments
5. Money: bills, subscriptions, shared expenses
6. Meal planning and recipes (feeding the shopping list)
7. Documents and important info
8. Reminders / push notifications
