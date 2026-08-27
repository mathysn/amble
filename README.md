# Amble

Walks that go nowhere in particular. Tell Amble how long you have and where you're
starting; it hands you a wandering loop with no destination and reveals surprise
curiosities — niche, hidden, and scenic places — one at a time as you get close.

## Structure

```
apps/
  api/       Fastify + Prisma (SQLite) + Zod REST API
  mobile/    Expo (React Native) + Expo Router + NativeWind
packages/
  shared/    Zod schemas + types shared by api and mobile
```

## Getting started

```bash
pnpm install
pnpm build:shared

# API (http://localhost:3000)
cp apps/api/.env.example apps/api/.env
pnpm --filter @amble/api prisma:migrate
pnpm --filter @amble/api seed
pnpm api

# Mobile (Expo)
pnpm mobile
```

The design foundations (colours, type, components) come from the Amble Claude Design
project and are encoded in `apps/mobile/tailwind.config.js` + `src/theme.ts`.

## Real routes & directions (OpenRouteService)

Amble builds **real street-following walks with turn-by-turn directions**, drawn in the
stylized paper aesthetic (no map tiles). This needs a free routing key:

1. Sign up at <https://openrouteservice.org/dev/#/signup> and create a token.
2. Put it in `apps/api/.env`: `ORS_API_KEY="<your key>"`, then restart the API.

How planning behaves (`POST /walks/plan` — **never fails**, so you can walk anywhere):

- **Curiosities nearby** → routes *through* them on real streets (`source: "through"`).
- **Few / none** → a real round-trip loop of your requested length (`source: "loop"`),
  attaching any curiosities that happen to lie along it.
- **No key / routing unavailable** → a stylized synthetic loop with no turn-by-turn
  (`source: "synthetic"`) — the app still works, just less real.
