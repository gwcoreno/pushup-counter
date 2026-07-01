# PushOff (Push-Up Counter)

Next.js app with Supabase auth, workout sessions, and 1v1 battles.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (runs Supabase locally)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started): `brew install supabase/tap/supabase`

## Local Supabase (Docker)

Supabase runs in Docker via the CLI. Migrations in `supabase/migrations/` are applied on start.

```bash
# 1. Start local Supabase (Postgres, Auth, API, Studio, etc.)
npm run supabase:start
# Writes `.env.development.local` with keys from the running stack.

# 2. Run the Next.js dev server
npm run dev
```

If you previously used a **hosted** Supabase project, remove or rename `.env.local` so it does not override local settings.

Useful commands:

| Command | Description |
|---------|-------------|
| `npm run supabase:status` | URLs and keys for the running stack |
| `npm run supabase:env` | Sync `.env.development.local` from `supabase status` |
| `npm run supabase:stop` | Stop Docker containers |
| `npm run supabase:reset` | Re-run migrations + seed |
| `npm run supabase:studio` | Open Supabase Studio (`http://127.0.0.1:54323`) |

**Local endpoints**

- API (app connects here): `http://127.0.0.1:54321`
- Studio: `http://127.0.0.1:54323`
- Inbucket (test emails): `http://127.0.0.1:54324`

### Environment variables

Development defaults live in **`.env.development`**. After `npm run supabase:start`, **`.env.development.local`** (gitignored) is generated with keys from your running Docker stack and takes precedence in `npm run dev`.

To use a **hosted** Supabase project while developing, create **`.env.local`** (gitignored) with your remote URL and anon key — it overrides `.env.development`.

Copy `.env.example` as a reference for production / Vercel.

### Auth settings (local)

`supabase/config.toml` enables:

- Anonymous sign-ins (battle guests)
- Manual linking (guest → email on same user id)
- Email sign-up without confirmation

## Production

Deploy to Vercel (or similar) and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to your hosted project. Apply migrations with `supabase db push` against the linked remote.

## Tests

```bash
npm test
```

Integration tests use `SUPABASE_SERVICE_ROLE_KEY` from `.env.development` when local Supabase is running.
