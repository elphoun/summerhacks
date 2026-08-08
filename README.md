# Nimbus

A personal exploration map, and the photographs your friends leave behind in the places it uncovers.

The world starts under cloud. Walking through somewhere burns the fog off **your** map — and only yours. Photographs work the other way round: leave one at a place and it joins a collection your friends can find, provided they have uncovered that ground themselves.

One identity per device, made on first launch. You add people by a six-character friend code, and that is the only thing that changes whose photographs you see.

Two halves, deliberately kept apart:

| | Personal exploration | Shared memories |
|---|---|---|
| what | where you have been | photos left at a place |
| who can see it | you, and nobody else | you and the friends you have added |
| where it lives | a file in the app's container | `server/data/nimbus.db` |
| can a friend's travel change it | **no** | n/a |

That separation is structural, not a promise. Exploration state never crosses the network, and the server has no table, column or endpoint that could return it. Friendship shares photographs; there is nowhere for it to share movement even if it wanted to.

---

## Running it

Two pieces: a Node server holding the shared photos, and an iOS app.

### 1. The server

Needs Node 22.5+ (uses the built-in `node:sqlite`). **No `npm install` — there are no dependencies.**

```bash
cd server && node seed.js && node server.js
```

That generates 59 photographs from 8 fictional people across 12 landmarks, then serves them on `http://localhost:8788`. It prints a LAN address too, for running the app on a real phone.

### 2. The app

```bash
open ios/Nimbus.xcodeproj
```

Pick any iPhone simulator and hit Run. The simulator reaches the server on `localhost` with no configuration.

To run on a physical phone, set `NIMBUS_SERVER` to your Mac's LAN address in the scheme's environment variables (Product → Scheme → Edit Scheme → Run → Arguments), and pick your development team under Signing.

---

## The demo, in order

1. **Open the app.** The whole world is under cloud. Tap the chip top-left: that is you, with a friend code, and eight sample people already added as friends so there is something to find.
2. **Travel** → tap *Eiffel Tower*. The map flies there, and a short walk uncovers a few streets. Watch the cloud burn off along the path.
3. **Camera** → *Use a sample shot* → add a note → *Leave this photo here*.
4. **Six of your friends have stood here.** Their photos are all within 100m. Tap one — Julien Rocher, 27m away, last March.
5. **Travel** → *Griffith Observatory*, then take another photo. This time the sheet says **widened**: fewer than three memories within 100m, so the search expanded to 250m. That is the fallback firing, visibly.
6. **Pan to somewhere you have not been.** The top-right reads *"N still under cloud"* — your friends' photos are there, the map knows it, and it will not show them until you have earned that ground. **This is the point of the whole thing.**
7. *History* → *Cloud this map over again* clouds your map back over without deleting a single photo or dropping a friend. Handy for a second run-through.

### Showing the friends half properly

That needs two identities, which means two devices — the identity lives in the app container, so a second simulator is a second person.

1. Boot a second simulator and run the app there. It comes up as its own explorer with its own code and its own fully clouded map.
2. Read one device's code off the top-left chip and type it into the other's *Add a friend* field. Friendship is mutual and takes effect in both directions at once.
3. Walk the second device to the Eiffel Tower and take a photo. Each one now finds the other's photograph sitting among the samples — and neither map has uncovered so much as a street for the other.

---

## How it works

### Fog

`ios/Nimbus/Map/FogOverlay.swift`. An `MKOverlay` covering `MKMapRect.world`, drawn above map labels so place names hide under cloud too. The renderer fills each tile with the cloud layer, then switches to `CGBlendMode.destinationOut` and erases a **radial gradient** per explored point — soft edges, cloud dissolving rather than a cookie cutter.

Each location fix uncovers 150m. Fixes within 60m of an existing breadcrumb are discarded, which keeps the point set small. Zoomed out to the whole planet a 150m hole would be sub-pixel, so the erase radius has an on-screen floor and a life of travel still reads as a constellation.

### Exploration

`ios/Nimbus/Services/ExplorationStore.swift`. Breadcrumbs, first-visit history and an area statistic, in a JSON file per explorer. A coarse spatial index keeps `isExplored` off a linear scan; a finer grid measures uncovered area without double-counting overlapping circles.

### Location

`ios/Nimbus/Services/LocationProvider.swift`. One protocol, two implementations: a simulator (for demos) and `CLLocationManager` (real, toggleable in the Travel sheet). The distinction that matters is that **walking** emits a stream of fixes and leaves a trail through the fog, while **flying** emits a single fix on arrival. A plane should not uncover a stripe across the planet.

`LiveLocationProvider` documents the three-line change to true background tracking; the Info.plist entitlements and usage strings are already in place.

### Identity and friends

`ios/Nimbus/Model/Explorer.swift` and `server/db.js`. One identity per install, made on first launch and kept in `UserDefaults`; `POST /users` announces it on every launch, which is also how a rename propagates. The server allocates a six-character code from an alphabet with no `O`, `0`, `I`, `1` or `L` in it, because these get read aloud across a table.

Friendship is stored symmetrically — two rows per pair — which costs nothing at this size and removes every `OR` from the read path. "Whose photographs may I see" becomes one primary-key lookup, and the answer feeds a single `IN (…)` clause shared by the map query and the radius search, so the two can never drift apart.

The eight seeded people are befriended on every registration rather than only the first, so it does not matter whether `node seed.js` or the app went first.

### Discovery

`server/db.js`, `findNearby`. A bounding-box prefilter SQLite serves from an index, then an exact haversine pass — a box is not a circle, and its corners would otherwise admit results 41% too far away.

Search 100m. If that finds fewer than **3 photos from your friends** — your own shots do not count as company — widen to 250m and report `expanded: true` so the UI can explain itself. All three numbers live in `server/config.json`.

A stranger standing next to you is not company either: the scope is applied before the count, so three photos from someone you have not added do not stop the search widening to find one from someone you have.

### Seed photographs

`server/artwork.js` and `server/png.js` draw them: a PNG encoder over `node:zlib`, a small raster canvas, and a hero silhouette per landmark rendered under a seeded time of day. Nothing is downloaded, so the gallery does not go blank when the venue wifi does. Seeds derive from photo id, so regenerating produces identical images.

---

## Tests

```bash
cd server && node --test
```

Sixteen tests over the parts that are easy to get quietly wrong. The search: haversine accuracy, bounding-box corners being rejected, ordering, the 100m case, the 250m fallback, own-photos-don't-count, empty ocean, the antimeridian and poles. And the friends scope: strangers excluded from both the map query and the radius search, a stranger not blocking the widen, mutual friendship, codes surviving a rename, codes read back the way a person types them, and a fresh install landing with the sample people already added.

```bash
cd ios && ./logic-tests.sh
```

Ten tests over the exploration model, compiled and run natively on macOS with no simulator involved — including the one the product rests on: *a map is keyed to one identity and no other can uncover it*, before or after a reload.

```bash
cd ios && ./typecheck.sh
```

Type-checks every Swift file against the simulator SDK in a couple of seconds. Useful as the inner loop, and it works even when no simulator runtime is installed (a full bundle build needs one, because `actool` refuses without it).

---

## Swapping the backend

`PhotoService` (`ios/Nimbus/Services/PhotoService.swift`) is a protocol; `NimbusAPI` is the only implementation. A `SupabasePhotoService` conforming to it drops in with no changes to any view — the local server exists because it needs no accounts, no keys and no network.
