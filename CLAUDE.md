# CLAUDE.md — Amble

> **Maintenance rule — read first.** This file MUST be updated **in the same change** whenever a
> feature is added, or a change alters how the app or one of its subsystems works (new screen,
> endpoint, schema field, data flow, dependency/SDK bump, env var, fallback behaviour, …). Edit the
> relevant section in place rather than appending a changelog, and delete anything that becomes
> untrue. A change isn't done until this file describes the code as it now is.

## What Amble is

A mobile app for **walks that go nowhere in particular**. The user picks a length (Stroll / Wander /
Roam) and where they start — and either loops back or picks somewhere to finish; Amble returns a
route that never walks the same street twice if it can help it, guides them along it with **turn-by-turn
navigation** (a heading-up map in Amble's own palette, voice and haptic cues, automatic rerouting),
and **reveals curiosities** (niche, hidden and scenic places from OpenStreetMap) one at a time as the
walker gets close. The design comes from a 17-screen Claude Design project: warm paper, soft sage
accent, Spectral over Instrument Sans.

## Stack & layout

pnpm 11 monorepo (Node 24). No lint setup; Prettier only.

```
apps/api/         Fastify 5 + Prisma (SQLite) + Zod (fastify-type-provider-zod), run with tsx, tests with vitest
apps/mobile/      Expo SDK 57 (RN 0.86, React 19.2) + Expo Router + NativeWind 4 (Tailwind 3.4)
                  + TanStack Query 5 + Zustand 5 + Reanimated 4; TypeScript 6; vitest for pure modules
packages/shared/  Zod schemas + inferred types = the API ⇄ mobile contract (raw TS, never built)
```

## Commands

```bash
pnpm install
cp apps/api/.env.example apps/api/.env          # then fill in ORS_API_KEY (optional)
pnpm --filter @amble/api prisma:migrate         # first-time DB (see gotcha below for new migrations)
pnpm --filter @amble/api seed                   # ~12 curiosities around Covent Garden, London
pnpm api                                        # API on :3000 (tsx watch)
pnpm mobile                                     # Expo dev server; open in Expo Go
pnpm typecheck                                  # tsc --noEmit in api, mobile, shared
pnpm test                                       # vitest in api + mobile
cd apps/mobile && CI=1 npx expo-doctor          # SDK/config health (should be 21/21)
cd apps/mobile && npx expo export --platform android --output-dir <tmp>   # full Metro bundle check
```

- Export `android` / `ios` separately — `--platform all` includes web, which isn't set up
  (no `react-native-web`).
- `pnpm build:shared` (root script) is **broken and unnecessary** — shared has no build.
- `prisma:migrate` hard-codes `--name init`; for new migrations run
  `pnpm --filter @amble/api exec prisma migrate dev --name <change>`.
- After changing Prisma schema: `prisma generate` (client lives in node_modules).
- Prisma refuses destructive commands (`db push --force-reset`, `migrate reset`) when run by an AI
  agent. Don't work around it; the API tests don't need them (see Tests).

## Environment

API (`apps/api/.env`, validated by Zod in `src/config.ts` at import time):

| Var | Purpose |
|---|---|
| `DATABASE_URL` | SQLite file, `file:./dev.db` → `apps/api/prisma/dev.db` |
| `PORT` / `HOST` | default `3000` / `0.0.0.0` (0.0.0.0 so a phone on the LAN can reach it) |
| `OSM_CONTACT` | goes into the User-Agent for Overpass/Nominatim/ORS (OSM usage policy) |
| `ORS_API_KEY` | OpenRouteService key. **Optional**: without it every walk is `source: 'synthetic'` (no turn-by-turn) and rerouting answers 503 |

There is no dotenv: `.env` is loaded by the Prisma client when `src/db.ts` is first imported, which
happens before `config.ts` in the import graph. Keep it that way (or add explicit env loading).

Mobile: `EXPO_PUBLIC_API_URL` overrides the API base; otherwise it's the Metro host's IP on port
**3000** (`src/api/client.ts`) — change both if `PORT` changes.

## API (`apps/api`)

- `src/app.ts` `buildApp({ logger?, router? })` → Fastify with Zod validator/serializer compilers,
  CORS, `authPlugin`, six route plugins. Each route file exports a `FastifyPluginAsyncZod`; shared
  schemas go straight into `schema: { body, params, querystring, response }`. `router` (default
  `orsRouter`) is passed to `walkRoutes` and used for planning, reshuffling and rerouting — tests
  inject a fake.
- **Auth** (`plugins/auth.ts`, `lib/token.ts`): anonymous devices only. `POST /devices` returns a
  random bearer token; only its SHA-256 is stored. `fastify.requireDevice` sets `req.deviceId` or
  401s. Applied via `addHook('preHandler', …)` in walks/saved/geo and per-route in settings/curiosities.
  Ownership is always checked with `findFirst({ where: { id, deviceId } })`.
- **Routes**: `GET /health` · `POST /devices` (only unauthenticated one) · `GET|PATCH /settings` ·
  `POST /walks/plan` · `POST /walks/:id/{reshuffle,start,pause,resume,complete}` ·
  `POST /walks/:id/reroute` · `POST /walks/:id/curiosities/:cid/found` · `GET /walks` (excludes
  `planned`) · `GET /walks/:id` · `GET|POST /saved`, `DELETE /saved/:curiosityId` ·
  `GET /curiosities/:id` · `GET /curiosities/:id/details` · `GET /geo/search?q=`,
  `GET /geo/reverse?lat=&lng=`.
  Errors: `reply.code(n).send({ error })`.
- **Prisma** (`prisma/schema.prisma`, SQLite): `Device`, `Settings`, `Curiosity`, `Walk`,
  `WalkCuriosity`, `SavedCuriosity`. Enum-like fields are `String` (validated by shared Zod); JSON is
  stored as strings (`Walk.routeGeoJson`, `Walk.stepsJson`, `Curiosity.meta` = raw OSM tags,
  `Curiosity.detailsJson` + `detailsAt`). `Walk.endLat/endLng/endLabel` are null for a loop. DTO
  mapping lives in `lib/serialize.ts` (`toWalk`, `toCuriosity`, …).
- **Planning never fails** (`services/route.ts` `generateWander({ start, end?, minutes, … })`):
  target metres = `minutes × PACE_METRES_PER_MIN[pace]`; with an `end` (> `MIN_END_M` = 150 m away,
  else it's a loop) it's `max(direct × 1.15, that)`, so the length decides how much to wander.
  - Stops (2–5, `stopCount = clamp(round(min/12), 2, 5)`): a **loop** takes curiosities near the ideal
    radius `target/2π`, spread round the compass and ordered by bearing; an **A→B** walk takes them
    from an ellipse with the two ends as foci (`d(s,c)+d(c,e) ≤ target/1.25`), one per stretch of
    the start→end axis, ordered along it.
  - **Never the same street twice** (`services/legs.ts` `routeLegs`): the route is asked for one leg
    at a time, each with ORS `avoid_polygons` = thin strips (~10 m half-width, ≤ 150 of them) along
    every street used so far, lifted within `LEG_EXCLUDE_M` = 60 m of that leg's own ends. A leg that
    can't be routed that way (dead end, only bridge) is retried without avoidance. `joinLegs` stitches
    legs into one path (one arrive step, `waypointIndices` rebuilt). `reusedFraction` measures reuse
    in tests.
  1. `'through'` — legs start → stops → finish. **No out-and-backs** (`services/spurs.ts`): where the
     route still doubles back around a stop (a curiosity up a side street), its waypoint becomes the
     spur's junction if the curiosity is within `SPUR_REACH_M = 45`, else the stop is dropped; then
     one re-route (on failure the first route is kept). All stops dropped → 2;
  2. `'loop'` — no stops: legs round a ring of 3 made-up waypoints (loop; ORS `round_trip` if that
     fails), or via one point off to the side when an A→B walk has distance to spare; curiosities
     within 45 m of the result are attached (within the app's 60 m reveal radius);
  3. `'synthetic'` — any router error: stylized bowed lines through the stops to the finish, **no
     steps**.
  The walk routes search curiosities round the start (loop) or the start–end midpoint (A→B).
- **Routing** (`services/routing.ts`): ORS `foot-walking` GeoJSON, `instructions: true`, 12 s timeout,
  10-min in-memory cache (keyed on the waypoints + a hash of any `avoid` polygons); throws on
  anything so callers can fall back. `routeThrough(coords, { avoid? })` sends `avoid` as
  `options.avoid_polygons`. `parseOrsResponse` (pure) maps
  steps to `RouteStep { instruction, distanceM, wayName, type, startIndex, exitNumber? }` (ORS type
  codes 0–13) and keeps ORS `way_points` as `waypointIndices` (where each waypoint lands on the
  geometry; spur detection needs it). It keeps the **final arrive step** (type 10) but drops arrivals at intermediate
  waypoints (those are curiosities, revealed by proximity instead), and drops other zero-length steps.
- **Rerouting** (`services/reroute.ts` `planReroute`, `POST /walks/:id/reroute`):
  - `rejoin` — keep the walked prefix `coords[0..fromIndex]`, then route (leg by leg, avoiding the
    walked prefix) from the walker through the unfound curiosities still ahead (by ordered position
    along the route) to the finish (`walkEnd`: the end point, or the start for a loop); steps are
    shifted past the prefix and `distanceKm` recomputed. Side-street curiosities within reach
    are passed at their junction, as in planning (stored stops can't be dropped, so far ones keep
    their out-and-back).
  - `approach` — route from the walker to the start, then the original route (for an address start
    far away).
  - A synthetic walk is always re-planned from here (becomes `'through'`).
  - 409 if the walk isn't `active` or `coordsCount` doesn't match the stored route (stale client);
    429 from a per-walk 10 s in-memory throttle; 503 (`RoutingUnavailableError`) when routing fails,
    leaving the walk untouched.
- **Curiosity details** (`services/curiosityDetails.ts` `fetchCuriosityDetails`,
  `GET /curiosities/:id/details`): facts from OSM tags (built, architect, artist, inscription,
  listed, opening hours, website…), plus Wikipedia's REST page summary (text, photo, link) via the
  `wikipedia` tag or `wikidata` → enwiki sitelink; photo fallbacks: Wikidata P18, then
  `wikimedia_commons` / `image` tags (Commons `Special:FilePath?width=1000`). 6 s timeouts, fails
  soft to facts only. Stored on the `Curiosity` row, refreshed after 30 days. One entry point, so
  another source can be added later.
- **OSM** (`services/osm.ts`, `services/curiosityStore.ts`): Overpass for curiosities (per-category tag
  filters, retry once, 10-min cache), upserted into `Curiosity` by `osmId`; queries always read back
  from the DB so seeded/cached rows count. Nominatim geocoding is throttled to ≥1.1 s between calls;
  a 429 becomes `NominatimBusyError` → 503 with a friendly message.
- **Tests** (`vitest`): `services/*.test.ts` are pure/offline; `routes/*.test.ts` use
  `app.inject()` against a real SQLite DB. `test/globalSetup.ts` creates a **fresh temp-dir DB file
  per run** with a plain `prisma db push` and deletes it afterwards — never the dev DB, never a reset.
  Files run sequentially (`fileParallelism: false`).

## Shared contract (`packages/shared`)

- `common.ts` (enums `Category`/`Pace`/`Units`/`WalkStatus`, `PACE_METRES_PER_MIN`, `Coord`,
  `RouteGeometry`, `WALK_LENGTHS` = named lengths Stroll / Wander / Roam (20 / 40 / 65 min; the app
  never shows the minutes) + `lengthFor(minutes)` (nearest, so old 15/30/45/60 values still map)),
  `walk.ts` (`PlanWalkRequest` with optional `end { lat, lng, label? }`, `RouteStep`,
  `RerouteRequest`/`Strategy`, `Walk` with nullable `endLat/endLng/endLabel`, `walkEnd()`,
  `isRoundTrip()`, summaries), `curiosity.ts` (incl. `CuriosityDetails`), `settings.ts`
  (`DEFAULT_SETTINGS`, default length 40), `device.ts`, `geo.ts`.
- Naming: `XSchema` + `type X = z.infer<typeof XSchema>`.
- Consumed as **raw TS** (`main`/`exports` → `src/index.ts`): the API via tsx, mobile via Metro
  (`metro.config.js` `watchFolders` = workspace root). **Imports inside shared must be
  extensionless** (`'./common'`) or Metro can't resolve them. (The API's own relative imports use
  `.js` suffixes; mobile's are extensionless.)
- Adding a field to a persisted JSON shape (e.g. `RouteStep`) must stay backward compatible with
  walks already stored — make it optional.

## Mobile (`apps/mobile`)

**Screens** (`app/`, Expo Router; each opens with a `/** NN · Name — … */` comment matching the design
mockup number):

- `_layout.tsx` — loads fonts, bootstraps the device token (retries with backoff), QueryClient
  (`retry 1`, `staleTime 30s`), Stack. `address` is a modal; `discovery`, `paused`, `end-walk` are
  `transparentModal`s (the walk screen underneath stays mounted).
- `index.tsx` gate → `(onboarding)/welcome` → `(onboarding)/location` (asks permission, then carries
  on while locating) → `(tabs)`: `index` (Set off: named length chips, start point card with a
  pulsing "Finding your location…" state, **Ending** = Back here | Somewhere else (+ end point card),
  categories), `saved`, `wanders`, `settings` (segmented controls for length / pace / units,
  optimistic updates).
- Walk flow: `walk/finding` (plans, passing `end`) → `walk/route` (preview: "A wander, looping home" /
  "A stroll to X", reshuffle, directions; curiosity **names only, not tappable**) → `walk/active`
  (navigation; the expanded sheet lists **Found so far**, which open `curiosity/[id]`) → `discovery`
  on reveal → `paused` / `end-walk` → `walk/complete` (only **found** curiosities, with thumbnails,
  tappable; missed ones are a count — "2 more slipped by"). Loop vs A→B wording ("Home again" / "You
  made it to X", banner, voice) follows `isRoundTrip(walk)`.
- `discovery` is the **only** way to see an unfound curiosity: it opens by proximity alone, once,
  shows the curiosity in full (`components/CuriosityView`, shared with `curiosity/[id]`: photo with
  credit, blurb, "From Wikipedia" summary + Read more, "Good to know" facts, via
  `useCuriosityDetails`),
  records the find on open (`useMarkFound`) and has a footer bookmark icon button (save) + "Keep
  wandering" (no buttons over the photo; `curiosity/[id]` keeps only a back arrow there). Nothing on the walk
  screen opens one early.
- Others: `address` (debounced Nominatim search; `?for=end` picks the finish; "Use my location"
  re-locates the start), `curiosity/[id]` (already-found places: Saved, the walk's Found so far,
  the complete screen).

**Data**: `src/api/client.ts` (fetch wrapper, bearer token, `ApiError`, optional `timeoutMs` via
AbortController, one-shot 401 self-heal via `setReauthHandler`), `src/api/device.ts`
(`ensureDevice`, token in SecureStore), `src/api/hooks.ts` (query keys `qk.*`; walk mutations incl.
`useReroute` write the returned `Walk` into `qk.walk(id)` with `setQueryData`). Responses are typed
with shared types but **not Zod-parsed** on the client.

**State** (Zustand): `store/startPoint.ts` (start point + `status` idle/locating/naming/ready/denied/
failed, `locate({ ask? })` via `lib/location.ts` `locateOnce` (last-known fix, else a fresh one
within 15 s), and the optional `end`); `store/walkSession.ts` (`walkId`, the latest real GPS
`fix`, `revealedIds` — deliberately no assumed position before the first fix);
`store/navPrefs.ts` (`muted`, `threeD`, persisted in SecureStore via `lib/storage.ts`).

### Maps (`src/lib/map/*`, `components/WebMap.tsx`)

- MapLibre GL JS **5.24.0 (pinned, jsDelivr)** in `react-native-webview`, drawing
  `buildAmbleStyle()` (`lib/map/style.ts`): Amble's own style on **OpenFreeMap** vector tiles (free,
  no key; source = TileJSON `tiles.openfreemap.org/planet`, never the versioned tile URL). Includes
  a toggleable `building-3d` fill-extrusion, and our own sources `route-walked` (dotted),
  `route-remaining` (solid sage + casing, with `route-arrows` chevrons along it showing the way
  round the loop) and `stops` (`state`: start/end/next/unfound/found). The style has no sprite: the
  page draws the chevron (`ROUTE_ARROW_IMAGE`) on `styleimagemissing`.
- `lib/map/html.ts` builds the page: the style and starting camera are embedded; a small runtime
  (a **plain ES2017 string**, see gotchas) handles messages, the walker puck (one DOM marker lying on
  the map: accuracy halo, heading cone, dot), the follow camera, overview fit, 3D, gesture detection
  and a frame-rate probe.
- `lib/map/bridge.ts`: typed protocol. RN → page messages are state (`insets`, `route`, `stops`,
  `progress`, `threeD`, `camera`, `puck`, `bearing`, `animating`); a coalescing queue keeps the
  latest per type and flushes ≤ once per frame as one `injectJavaScript('window.__amble.recv([...])')`,
  held until `ready` and re-sent in full after a remount. Page → RN: `boot`, `ready`, `error`,
  `gesture` (user panned → free camera), `perf` (3D too slow → app switches to 2D), `log`.
- `WebMap` props: `mode` `'preview'` (north-up overview; route preview) or `'nav'` (rotatable, follow
  camera), plus the state above. **Fallback to the SVG `StylizedMap`** when the page doesn't boot in
  10 s or load in 20 s, or errors before load; errors after load are only logged. A crashed WebView
  process is remounted up to twice. `StylizedMap` is also used deliberately for the walk-complete
  summary and `WalkThumb`.

### Navigation (`src/lib/nav/*`, `src/hooks/*`, `components/nav/*`)

- **Engine** (`lib/nav`, pure TS, unit-tested — `nav.test.ts`; tuning in `constants.ts`):
  - `routeIndex` — flat local projection, cumulative distances, steps placed along the route (adds a
    virtual arrive step for older walks), `locate()` with tie-breaks for routes that pass the same
    spot twice (`expectAlongM`: closest to where the walker should be; `preferAtLeastM`: earliest).
  - `fixFilter` — raw GPS → smoothed fix: per-axis constant-velocity Kalman in local metres
    (accuracy² as measurement noise, `FILTER_ACCEL_MPS2` process noise), drops readings implying
    > `OUTLIER_MPS` unless `OUTLIER_MAX_REJECTS` in a row agree, restarts after `GAP_MS`. Passes
    the raw accuracy through, so downstream thresholds are unchanged.
  - `tracker` — fix → state: monotonic progress in a window around the last position, off-route
    hysteresis (> 35 m for ≥ 3 fixes over ≥ 6 s; back < 20 m), joining the route wherever the walker
    first meets it (start, or mid-route after a reload), approach detection, arrival (≤ 25 m left);
    the puck snaps to the route when on it and ≤ `SNAP_ACCURACY_M` (35 m), and the snapped puck
    ignores backward steps under `DISPLAY_BACKSTEP_M` (8 m, display only);
    `navView()` gives current step, next maneuver, distance to it, remaining distance.
  - `announcer` + `phrases` — Amble's wording from ORS type codes (`roundTrip: false` makes arriving
    "You've arrived" instead of "back where you started"); "start", "prepare" (~60 m, long
    steps only) and "now" (~15 m) cues once each; "then …" chaining; silent at carry-on steps; a turn
    already mentioned only buzzes if it follows within 8 s.
  - `reroutePolicy` — ≥ 20 s between attempts, 20/40/60 s backoff; never when paused, unfocused,
    arrived, near the end or on a synthetic route. `heading` — circular smoothing, camera bearing
    (route direction when walking, compass when still). `simulator` — fake walks for tests/dev.
- **Hooks**: `useLiveLocation` (GPS fixes at `BestForNavigation`, through `fixFilter`, + smoothed
  compass; in `__DEV__` the **SIM** map button replays a simulated walk with a detour instead, at
  10 m/s but still 1 fix/s so the time-based rules apply, unfiltered) and `useNavigation` (drives the
  tracker, speaks via `lib/voice.ts` (expo-speech; expo-audio `playsInSilentMode`, mixes with other
  audio), buzzes via `lib/haptics.ts` (1 tap left, 2 taps right), reroutes via `useReroute`, reveals
  curiosities within `REVEAL_THRESHOLD_M = 60` — all frozen while paused or while a modal covers the
  screen (`useIsFocused`)). It returns a `status`: `finding | approach | navigating | rerouting |
  rejoin | compass | paused | arrived`.
- **UI** (`app/walk/active.tsx`): full-bleed `WebMap mode="nav"`, `ManeuverBanner` (sage-dark for
  "follow this", ink for finding/rerouting/off-route/paused; `ManeuverIcon` arrows for ORS types),
  `MapControls` (re-centre — always there, sage when the camera isn't following, also leaves
  overview; 2D/3D, mute, overview, dev SIM; a pan also auto re-centres after 15 s), `NavSheet`
  (Reanimated/Gesture Handler, drag/tap on its summary only: ETA, distance, arrival time, progress;
  always visible below it: the next curiosity (not tappable) and Pause / End walk; expanded:
  `DirectionsList` from the current step).
  `useKeepAwake` keeps the screen on. Arriving (status `arrived`: ≤ 25 m left, back at the start or
  at an A→B finish) completes the walk and goes straight to `walk/complete` — once focused, never
  while paused; the banner's Finish button is only a retry if that request fails. Synthetic walks get one automatic attempt to become a real
  route; otherwise the banner points at the next curiosity/the finish ("compass" mode).

## Design system

Tokens live in `src/theme.ts` (for SVG, shadows, WebView HTML) and are mirrored in
`tailwind.config.js` (for `className`) — keep both in sync. The map style derives its tints from
the same palette (`lib/map/style.ts`).

| Token (`colors.*` / Tailwind) | Hex | Use |
|---|---|---|
| `paper` / `paper` | `#F5F1E8` | app background, map ground |
| `paperRaised` / `paper-raised` | `#FFFCF5` | raised surfaces, sheet, map roads |
| `sand` / `sand` · `sandDeep` / `sand-deep` | `#E9E2D2` · `#E4DCCB` | panels, buildings |
| `sage` / `sage` · `sageDark` / `sage-dark` | `#7A8B6F` · `#63735A` | accent, route, nav banner |
| `ink` / `ink` · `inkStrong` / `ink-strong` | `#2E2B26` · `#26241F` | text, puck, alert banner |

- Translucent inks: `theme.ts` `ink60…ink10`, `sageWash`; in className use opacity modifiers
  (`text-ink/60`, `bg-paper/90`, `border-ink/[0.08]`).
- Fonts: Spectral 400/500 (`font-spectral`, via `Serif`), Instrument Sans 400/500/600 (`font-sans`,
  `font-sans-medium`, `font-sans-semibold`); mono = Menlo/`monospace` inline (`Mono`, `Overline`).
  Map labels use Noto Sans (the only fonts OpenFreeMap serves).
- Radii: `rounded-card` 18, `rounded-panel` 20, `rounded-cta` 18, `rounded-chip` 13.
- Building blocks: `Screen`, `Button` (`ink` | `sage` for the main action, `secondary` = raised
  paper with a hairline border beside/below it, `light` on dark; `size` `md` (58 tall, the default everywhere) / `sm` (48); optional
  `icon`, or `iconOnly` for a square icon button like Reshuffle; `loading` keeps the size), `Segmented` (a few named options in one track — use it instead
  of cycling values), `FloatingCard`, `typography.tsx` (`Overline`, `Mono`, `Serif`), `chips.tsx`
  (`LengthChip`, `CategoryChip`, `CategoryTag`), `CuriosityView` / `CuriosityThumb` / `PhotoButton`,
  `icons.tsx` (hand-drawn 20×20 stroke SVGs, `{ size, color }`, incl. `ShuffleIcon`), `ManeuverIcon`
  (32-grid turn arrows in the same style).
- Styling: NativeWind `className` first; inline `style` only for shadows, hairline rgba borders,
  letter-spacing/mono font, computed sizes/transforms, and Reanimated styles (animated views use
  `style`, not `className`).
- **Never give a `Pressable` a function `style` (`({ pressed }) => …`)**: with a `className` on it,
  NativeWind silently drops it (sizes, shadows vanish — buttons collapsed to their text). Use a
  plain style object (as `Button` does for its size), and track pressed state with
  `onPressIn`/`onPressOut` if the look must change. Avoid `active:` classes on the same element.

## Conventions

- Prettier: single quotes, semicolons, trailing commas, width 100.
- Components: named exports, PascalCase files (multi-export files lowercase: `icons.tsx`, `chips.tsx`,
  `typography.tsx`). Screens: default exports; screen-local subcomponents at the bottom of the file.
- lib/store files camelCase; hooks `useX` (in `src/hooks/`); stores `useX`; DTO mappers `toX`;
  schemas `XSchema`.
- Tuning constants in SCREAMING_CASE with unit suffixes (`REVEAL_THRESHOLD_M`, `READY_TIMEOUT_MS`);
  numeric separators (`60_000`).
- Comments: JSDoc explaining **why** and what the fallback is; `// ── Section ─────` dividers.
- `tsconfig.base.json` has `noUncheckedIndexedAccess` (api/shared) — hence `arr[i]!`. Mobile extends
  `expo/tsconfig.base` with `strict`.
- Relative imports only (no path aliases).
- Logic worth testing goes in pure modules (no `react-native` imports) so vitest can run it —
  mobile vitest only includes `src/**/*.test.ts` in a node environment.
- Every external dependency degrades gracefully (routing → synthetic, reroute → rejoin arrow,
  Overpass → DB cache, map → StylizedMap, voice/haptics → silent). Preserve that when adding features.

## Hard constraints & gotchas

- **Expo Go only.** The app must run in the store Expo Go app — no dev client, no custom native code.
  Only add native modules that ship in the Expo SDK, and always via `npx expo install <pkg>` so the
  version matches. Target the SDK version the user's Expo Go reports (currently **57**). Native map
  SDKs (`@maplibre/maplibre-react-native`, Mapbox) need a dev build — that's why the map is a WebView.
- **No background location** in Expo Go: guidance only runs with the app open (keep-awake is on).
- After any SDK/native dependency change: stop the old `expo start`, restart with
  `expo start --clear`, and force-quit Expo Go on the phone — otherwise a stale manifest is served.
- The map page runtime (`PAGE_SCRIPT`) must stay a **string of plain ES2017** (no template literals
  inside it): Hermes compiles app code to bytecode, so `fn.toString()` can't be used to build it.
  Its tests parse it with `new Function`. Embed JSON with `safeJson()` (escapes `<`).
- maplibre-gl is pinned to **5.24.0**: v6 ships ESM only (no plain `<script>` build). OpenFreeMap
  only serves `Noto Sans Regular|Bold|Italic`, and each `text-font` must be a single-entry array.
- MapLibre adds the map's persistent padding (set by the follow camera) to `fitBounds` padding —
  reset it first (see `fitRoute`).
- pnpm 11 can resolve against a stale metadata cache (`ERR_PNPM_NO_MATCHING_VERSION` for versions that
  `npm view` shows exist): `pnpm cache delete "*"` **and** `pnpm cache delete "@*/*"`. pnpm also
  auto-appends `minimumReleaseAgeExclude` entries to `pnpm-workspace.yaml` — expected.
- Must stay **direct** mobile deps under pnpm: `react-native-css-interop` (NativeWind),
  `react-native-worklets` (must match Expo Go's native side), `react-dom` (pinned to avoid a peer
  mismatch), `expo-asset` (peer of `expo-audio`). After dependency changes run `pnpm peers check`;
  `pnpm dedupe` clears stale peer variants.
- Native builds must be allowlisted in `pnpm-workspace.yaml` (`allowBuilds` / `onlyBuiltDependencies`:
  prisma, esbuild).
- `app.json` `plugins` may list only real config plugins. SDK 57 rejects `newArchEnabled` and top-level
  `splash` (splash options live on the `expo-splash-screen` plugin entry). `expo-audio` is configured
  without microphone/background audio.
- RN 0.86: `StyleSheet.absoluteFillObject` is gone (use `absoluteFill`); avoid `AbortSignal.timeout`.
- `WebMap`'s WebView must keep `scrollEnabled` on — disabling it kills pinch-zoom on iOS.
- Nominatim allows ~1 req/s: keep the address search debounced and the server throttle in place.
- Seed data is around **Covent Garden (51.5129, -0.1224)** — set the simulator location there to demo
  offline.

## Known gaps

- `settings.avoidBusyRoads` is stored but not used by routing.
- Pause doesn't stop the walk clock (time left is always from `startedAt`); guidance does freeze.
- Placeholders: "Sign in", "About Amble".
- Only well-documented places (a Wikipedia/Wikidata link or an image tag in OSM) get a photo or
  summary; the rest show the `PhotoBlock` placeholder and whatever facts their tags have.
- Avoiding used streets relies on ORS `avoid_polygons`; where a later leg must *cross* an earlier
  street, the strips can block it and that leg falls back to plain routing (reuse allowed).
- The navigation UI (React Native side) has no automated tests; the engine, map style/page, bridge
  and API do.

## Before calling a change done

1. `pnpm typecheck` and `pnpm test` pass.
2. For mobile dependency/config changes: `expo-doctor` clean and an `expo export` bundle builds.
3. This file updated (see the maintenance rule at the top).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
