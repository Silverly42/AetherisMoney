# Aetheris Money

A small Minecraft-server economy web app with Lucca, Conor, Rhys, and Aleesha accounts, transfers, payment requests, transaction history, Supabase persistence, and an admin-only Bank.

## Run

```bash
ADMIN_PASSWORD='choose-a-private-password' START_PASSWORD='player-starter-password' npm start
```

Open `http://localhost:3000`. Data is stored in `data/money.json` and is ignored by Git.

## Supabase + GitHub Pages

Run `supabase/schema.sql` once in the Supabase SQL Editor. Create confirmed users with these exact emails in Authentication: `lucca@aetheris.money`, `conor@aetheris.money`, `rhys@aetheris.money`, and `aleesha@aetheris.money`. Rhys is the administrator. GitHub Pages serves the repository from `main`.

The legacy local Node server remains useful for offline testing, but the published site uses Supabase. The publishable browser key is intentionally public; never commit a service-role key or database password.
