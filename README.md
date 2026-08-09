# Nimbus

A personal exploration map, and the photographs your friends leave behind in the places it uncovers.

The world starts under cloud. Walking through somewhere burns the fog off **your** map — and only yours. Photographs work the other way round: leave one at a place and it joins a collection your friends can find, provided they have uncovered that ground themselves.

One identity per device, made on first launch. You add people by a six-character friend code, and that is the only thing that changes whose photographs you see.

Two halves, deliberately kept apart:

| | Personal exploration | Shared memories |
|---|---|---|
| what | where you have been | photos left at a place |
| who can see it | you, and nobody else | you and the friends you have added |
| where it lives | this device's own storage | `server/data/nimbus.db` |
| can a friend's travel change it | **no** | n/a |

That separation is structural, not a promise. Exploration state never crosses the network, and the server has no table, column or endpoint that could return it. Friendship shares photographs; there is nowhere for it to share movement even if it wanted to.

---

## Running it

Two pieces: a Node server holding the shared photos, and an Expo app that runs in **Expo Go** — no Xcode, no native build, no signing.

### 1. The server

Needs Node 22.5+ (uses the built-in `node:sqlite`). **No `npm install` — there are no dependencies.**

```bash
cd server && node seed.js && node server.js
```

That generates 59 photographs from 8 fictional people across 12 landmarks, then serves them on `http://localhost:8788`. It prints a LAN address too, for running the app on a real phone.

### 2. The app

```bash
cd mobile && npm install && npx expo start
```

Then scan the QR code with **Expo Go** on your phone, or press `i` for an iOS simulator / `a` for an Android emulator.

The app finds the server by itself: Expo Go loads the JS bundle from this Mac, so the machine running `node server.js` is already known, and port 8788 is added to it. Nothing to configure, on a simulator or on a real phone on the same wifi.

To point somewhere else, set `EXPO_PUBLIC_NIMBUS_SERVER` in `mobile/.env`:

```
EXPO_PUBLIC_NIMBUS_SERVER=http://192.168.1.20:8788
```

**The SDK is pinned to 54 on purpose.** Expo Go only runs projects built for the exact SDK it ships with, and the App Store build is 54 — newer SDKs exist on npm, but the Expo Go you can install on a phone cannot open them. Bumping this means everyone testing on a real device needs a development build instead, which is the thing the port was for. `npx expo start --tunnel` does not help either: it moves the JS bundle, not the photo server.

---

## The demo, in order

1. **Open the app.** The **Friends** tab is you: your name, your friend code, and eight sample people already added so there is something to find. The **Map** tab is the whole world, under cloud.
2. **Map** → **Travel** → tap *Eiffel Tower*. The map flies there, and a short walk uncovers a few streets. Watch the cloud burn off along the path.
3. **Camera** → take a photo or pick one from the library → add a note → *Leave this photo here*.
4. **Six of your friends have stood here.** Their photos are all within 100m. Tap one — Julien Rocher, 27m away, last March.
5. **Travel** → *Griffith Observatory*, then take another photo. This time the sheet says **widened**: fewer than three memories within 100m, so the search expanded to 250m. That is the fallback firing, visibly.
6. **Pan to somewhere you have not been.** The top-right reads *"N still under cloud"* — your friends' photos are there, the map knows it, and it will not show them until you have earned that ground. **This is the point of the whole thing.**
7. **Map** → *History* → *Cloud this map over again* clouds your map back over without deleting a single photo or dropping a friend. Handy for a second run-through.

### Showing the friends half properly

That needs two identities, which means two devices — the identity lives in the app's own storage, so a second simulator (or a second phone) is a second person.

1. Open the app on a second device. It comes up as its own explorer with its own code and its own fully clouded map.
2. Read one device's code off its **Friends** tab and type it into the other's *Add a friend* field. Friendship is mutual and takes effect in both directions at once.
3. Walk the second device to the Eiffel Tower and take a photo. Each one now finds the other's photograph sitting among the samples — and neither map has uncovered so much as a street for the other.

---

## How it works

### Fog

`mobile/src/map/FogLayer.tsx`. An SVG layer covering the viewport, sitting **above** the map so place names hide under cloud too. The cloud is a filled rect; the reveals are punched out of it by an SVG luminance mask whose white ground is fog and whose radial gradients are the parts you have earned — soft edges, cloud dissolving rather than a cookie cutter.

Each location fix uncovers 150m. Fixes within 60m of an existing breadcrumb are discarded, which keeps the point set small. Zoomed out to the whole planet a 150m hole would be sub-pixel, so the erase radius has an on-screen floor and a life of travel still reads as a constellation.

Sitting above the map is also why nothing on the map is a `<Marker>`: a native annotation would be *underneath* an opaque overlay and therefore invisible. The cloud, the photo pins and the explorer's own dot are all projected onto the map's current region by hand (`mobile/src/map/projection.ts`), which is what keeps them registered against each other.

### Exploration

`mobile/src/services/explorationStore.ts`. Breadcrumbs, first-visit history and an area statistic, in one JSON record per explorer. A coarse spatial index keeps `isExplored` off a linear scan; a finer grid measures uncovered area without double-counting overlapping circles.

### Location

`mobile/src/services/locationProvider.ts`. One interface, two implementations: a simulator (for demos) and `expo-location` (real, toggleable in the Travel sheet). The distinction that matters is that **walking** emits a stream of fixes and leaves a trail through the fog, while **flying** emits a single fix on arrival. A plane should not uncover a stripe across the planet.

`liveLocationProvider.ts` documents the change to true background tracking. That one needs a development build rather than Expo Go — background location is not among the entitlements Expo Go carries.

### Identity and friends

`mobile/src/model/explorer.ts` and `server/db.js`. One identity per install, made on first launch and kept in `AsyncStorage`; `POST /users` announces it on every launch, which is also how a rename propagates. The server allocates a six-character code from an alphabet with no `O`, `0`, `I`, `1` or `L` in it, because these get read aloud across a table.

Friendship is stored symmetrically — two rows per pair — which costs nothing at this size and removes every `OR` from the read path. "Whose photographs may I see" becomes one primary-key lookup, and the answer feeds a single `IN (…)` clause shared by the map query and the radius search, so the two can never drift apart.

The eight seeded people are befriended on every registration rather than only the first, so it does not matter whether `node seed.js` or the app went first.

### Discovery

`server/db.js`, `findNearby`. A bounding-box prefilter SQLite serves from an index, then an exact haversine pass — a box is not a circle, and its corners would otherwise admit results 41% too far away.

Search 100m. If that finds fewer than **3 photos from your friends** — your own shots do not count as company — widen to 250m and report `expanded: true` so the UI can explain itself. All three numbers live in `server/config.json`.

A stranger standing next to you is not company either: the scope is applied before the count, so three photos from someone you have not added do not stop the search widening to find one from someone you have.

### Seed photographs

`server/artwork.js` and `server/png.js` draw them: a PNG encoder over `node:zlib`, a small raster canvas, and a hero silhouette per landmark rendered under a seeded time of day. Nothing is downloaded, so the gallery does not go blank when the venue wifi does. Seeds derive from photo id, so regenerating produces identical images.

`GET /sample-shot` (`server/sampleShot.js`) draws a stand-in photograph on the same canvas and hands it back as base64, for a machine with no camera at all. Nothing in the app calls it any more — the button it existed for is gone — but it costs nothing to leave standing for a `curl`.

### Pixel art

The icon set is hackernoon/pixel-icon-library (MIT), vendored as SVG path data in `mobile/src/ui/pixelGlyphs.ts` and tinted like SF Symbols. The source PDFs are in `mobile/tools/pixel-icons`; `tools/pdf2paths.py` regenerates the module from them.

Cards and photographs have corners drawn as a staircase of right-angle steps rather than a curve — a rounded corner as pixel art would draw one (`mobile/src/ui/pixelShape.ts`). React Native clips to a corner *radius* and nothing else, so rather than clipping, the four corner offcuts are painted over the top in whatever colour the box sits on. Same result, one overlay instead of an offscreen render pass on a live map.

---

## Tests

```bash
cd server && node --test
```

Sixteen tests over the parts that are easy to get quietly wrong. The search: haversine accuracy, bounding-box corners being rejected, ordering, the 100m case, the 250m fallback, own-photos-don't-count, empty ocean, the antimeridian and poles. And the friends scope: strangers excluded from both the map query and the radius search, a stranger not blocking the widen, mutual friendship, codes surviving a rename, codes read back the way a person types them, and a fresh install landing with the sample people already added.

```bash
cd mobile && npm test
```

Forty-six tests, in three groups.

Ten over the exploration model — including the one the product rests on: *a map is keyed to one identity and no other can uncover it*, before or after a reload. `ExplorationStore` takes its storage as an argument, so these run against a dictionary in memory: no device, no simulator, no network.

Eight over the map projection, which is new. MapKit used to hand the fog renderer a map-point space and a zoom scale and none of that arithmetic existed; react-native-maps reports a region and nothing else, so it is the app's own now — and everything drawn over the map is only registered against the map if it is right.

Twenty-eight over the Supabase backend, against a scripted `fetch`. Mostly the audience filter — the rule the server enforces in SQL and this has to enforce in a query string — and the columns a merge-duplicates upsert must not touch. A friend code is allocated by a second write, which SQLite did in one statement and PostgREST cannot: a row inserted first and a code claimed second is a race, a retry, and a column that has to survive every later upsert. Friend stats have the mirror-image problem — leaving a photo upserts the user but knows nothing about how far they have walked, so sending a zero would reset their leaderboard row on every capture.

```bash
cd mobile && npm run typecheck
```

Type-checks every file, app and tests alike.

---

## Swapping the backend

`PhotoService` (`mobile/src/services/photoService.ts`) is an interface with two implementations. `NimbusAPI` talks to the local server, which exists because it needs no accounts, no keys and no network. `SupabasePhotoService` talks to Supabase — PostgREST and Storage over plain `fetch`, no SDK — and is a port of `server/db.js` and the routes in front of it: users, friend codes, friendships, friend stats and their leaderboard ranking, the audience filter, the radius search and its fallback.

Which one a build uses is a matter of configuration rather than a code change. Run the schema in `mobile/src/services/supabase/schema.sql` (Supabase SQL editor, or `supabase db push`; re-running it is safe), then put the project's publishable credentials in `mobile/.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...
```

That is the whole of it: a build that has them uses Supabase, a build that does not keeps the Node server. `EXPO_PUBLIC_NIMBUS_BACKEND=server` forces the local server back on without unsetting anything, which is how to check a change against both.

One thing differs from the server, and it is worth knowing before this is pointed at anything real.

**The audience filter is applied by the client.** Against the server, "you see your friends' photographs and no one else's" is a `WHERE` clause the server writes and the client cannot influence. Against Supabase it is a `user_id=in.(…)` the client writes, because the publishable key carries no identity for a row-level policy to test — so RLS lets any holder of that key read every row, and the filter narrows what the app asks for rather than what the database will answer. Closing that means Supabase Auth and policies written against `auth.uid()`. The policies in `schema.sql` are demo policies and say so.
