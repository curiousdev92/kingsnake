---
name: change-economy
description: Change KingSnake accounts, rewards, shop, skins, ratings, seasons or the database. Use for apps/api routes, SQL migrations, or packages/meta.
---

# Change accounts and economy

Where things are:

- Prices, formulas, shared types: `packages/meta/src` (`skins.ts`, `progression.ts`, `rating.ts`, `season.ts`, `profile.ts`). Never duplicate them elsewhere.
- Routes: `apps/api/src/app.ts`. Domain logic: `players.ts`, `seasons.ts`.
- Schema: `apps/api/src/migrations.ts`.
- Client: `apps/client/src/account.ts`, `AccountUi.tsx`, `RankedUi.tsx`.

Rules:

- Migrations are append-only: add a new string to `MIGRATIONS`, never edit an old one. They must work on both Postgres and PGlite.
- Select `date` columns as `::text`.
- Anything that moves coins, XP or rating runs in a transaction with `SELECT … FOR UPDATE`.
- Match grants stay idempotent per `(matchId, playerId)`.
- The server grants rewards; the client never claims them.
- Cosmetics only, no pay-to-win.
- Internal routes need `x-internal-key`.
- A new skin is one entry in `SKINS`; it needs no code.
- The client must keep working when the API is down (`status: 'offline'`).

Add tests to `apps/api/test/api.test.ts` (in-memory PGlite) and `packages/meta/test/`, then use the `verify` skill.
