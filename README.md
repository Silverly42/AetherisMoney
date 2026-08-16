# Aetheris Money

A small Minecraft-server economy web app with Lucca, Conor, and Rhys accounts, transfers, payment requests, transaction history, and password-protected treasury grants.

## Run

```bash
ADMIN_PASSWORD='choose-a-private-password' START_PASSWORD='player-starter-password' npm start
```

Open `http://localhost:3000`. Data is stored in `data/money.json` and is ignored by Git.

## Important deployment note

GitHub Pages can host the contents of `public/`, but cannot run `server.js`. For real shared balances, deploy the Node server to a server or replace its API with Supabase/another hosted backend. Never put the admin password in frontend JavaScript.

This MVP uses in-memory login sessions, a JSON datastore, and one starter password for all three seeded accounts. For public production use, add HTTPS, individual password setup/reset, a persistent session store, rate limiting, audit backups, and a database.
