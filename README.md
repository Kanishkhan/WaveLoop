# WaveLoop

A working-asset prototype for the NxtWave Growth Challenge: a referral-first registration and growth engine for **Build Your First AI Project in 60 Minutes** (free, for 2027-batch final-year engineering students; goal: 500 qualified registrations in 7 days on a ₹2,000 budget).

> **Simulation only.** No students were contacted. Simulated figures are model output from our planning assumptions, not campaign results. Every simulated row is flagged `is_simulated = true`.

## What's live
- 30-second registration → personal referral link, one-tap WhatsApp share, copy link
- `?ref=CODE` is pre-filled, remembered, and credits the referrer (student or ambassador)
- Reward ladder at 1 / 3 / 5 **verified** referrals (verified = graduation year 2027), real progress from the database
- Live ambassador leaderboard ranked by verified final-year sign-ups only (polls every 12 s)
- Open campus-ambassador sign-up with personal link, rank and verified count
- Command center (passcode): totals, qualified vs 500 target, channel mix, daily cumulative chart, "just registered" feed, recent sign-ups table + CSV, ambassador table, All / Real / Simulation filter
- Simulation mode: seeds and replays the 7-day plan — exactly **619 sign-ups, 516 qualified** (ambassadors 197, referral loop 111, placement communities 105, social/creator 81, direct 22), Day 7 = yesterday (IST), never two sign-ups in the same minute; reset button deletes only simulated rows
- AI message writer: WhatsApp class-group posts in English, Tamil or Telugu for a given college + ambassador; falls back to hand-written templates if the LLM key is missing or the call fails
- Project-fit finder, workshop experience switcher, light/dark theme, mobile-first layout

## Stack
Static HTML/CSS/JS · one Vercel serverless function (`api/[route].js`) dispatching to small per-endpoint modules in `api/_handlers/` · Supabase Postgres (`db/001_waveloop.sql`) · Claude via `@anthropic-ai/sdk`. Keys are read from environment variables on the server only.

Endpoints (`/api/...`): `health`, `register`, `get-registration`, `referral-progress`, `leaderboard`, `stats`, `channel-breakdown`, `daily-series`, `ambassadors-list`*, `ambassador-signup`, `ambassador-stats`, `admin-login`, `admin-overview`*, `simulate-run`*, `copy-generate`* (* = admin passcode required). Errors are always `{ "ok": false, "error": { "code", "message", "fields?" } }`.

## Environment variables
| Name | Required | What it is |
|---|---|---|
| `SUPABASE_URL` | yes (production) | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | yes (production) | Supabase service-role / secret key. Server only — never put it in client code |
| `ADMIN_PASSCODE` | yes | Passcode for `admin.html` |
| `LLM_API_KEY` | optional | Anthropic API key for the message writer. Without it, templates are used |
| `LLM_MODEL` | optional | Override the model (default `claude-opus-5-5`) |

Copy `.env.example` to `.env.local` for local development. `.env*` files are git-ignored.

## Set up the database (once)
1. Create a Supabase project.
2. SQL Editor → New query → paste `db/001_waveloop.sql` → Run. It is safe to re-run.
3. Copy the Project URL and service-role key into your env vars.

The script creates the tables (`ambassadors`, `registrations`, `referral_events`, `simulation_runs`), indexes, RLS (no public access), and the `wl_*` functions the API calls. `is_qualified` is a generated column (`graduation_year = 2027`), so it can't be set by hand.

## Run locally
```bash
npm install
cp .env.example .env.local      # set ADMIN_PASSCODE at least
npm run dev                     # http://localhost:3000   (command center: /admin.html)
```
If `SUPABASE_URL` is empty, the dev server starts an in-process Postgres (PGlite, data in `.localdb/`) and applies the same migration, so the full flow works with no cloud account. Set `WAVELOOP_DB=memory` for a throwaway database.

### Test
With the dev server running:
```bash
ADMIN_PASSCODE=<same passcode> npm test
```
Checks validation, `?ref=` crediting, the 2027-only rule, the leaderboard, the simulation totals/channel split/timestamps, the message writer in all three languages, and `/api/health`. Against a deployed URL (`BASE_URL=https://… npm test`) it only checks `/api/health` unless you pass `--allow-writes`.

## Run the simulation
1. Open `/admin.html`, enter the passcode.
2. Click **Run 7-day simulation**. It replaces any earlier simulated rows, seeds 12 generic ambassadors ("Sim Ambassador 01"…) and 619 generic sign-ups ("Sim Student 0001"…, `@sim.waveloop.invalid`) over the 7 days ending yesterday (IST), then replays the chart.
3. Use **All / Real only / Simulation** to separate model output from real sign-ups. Wherever simulated rows are counted, the page shows a **Simulation** label and "Model output from our assumptions, not campaign results".
4. **Reset simulation** deletes every `is_simulated` row; real registrations are untouched.

## Deploy (Vercel)
1. Run the SQL migration in Supabase (above).
2. Vercel → Project → Settings → Environment Variables: add `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ADMIN_PASSCODE`, `LLM_API_KEY` (Production + Preview).
3. Framework preset "Other", no build command, output directory = project root (the defaults for this repo).
4. Push to the connected Git branch (or `npx vercel --prod`).
5. Check `https://<your-domain>/api/health` → `{"ok":true,"status":"ok",...}`.
