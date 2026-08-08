# Nimbus

A personal exploration map, and the photographs people leave behind in the places it uncovers.

The world starts under cloud. Walking through somewhere burns the fog off **your** map — and only yours. Photographs work the other way round: leave one at a place and it joins a collection anyone who later stands there can find, provided they have uncovered that ground themselves.

Two halves, deliberately kept apart:

| | Personal exploration | Shared memories |
|---|---|---|
| what | where you have been | photos left at a place |
| who can see it | you | everyone who gets there |
| where it lives | a file in the app's container, keyed by explorer | `server/data/nimbus.db` |
| can someone else's travel change it | **no** | n/a |

That separation is structural, not a promise. Exploration state never crosses the network, and the server has no table, column or endpoint that could return it.

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

1. **Open the app.** You are Alex Rivera. The world is under cloud except a patch around San Francisco — the only place Alex has been.
2. **Travel** → tap *Eiffel Tower*. The map flies there, and a short walk uncovers a few streets. Watch the cloud burn off along the path.
3. **Camera** → *Use a sample shot* → add a note → *Leave this photo here*.
4. **Six other people have stood here.** Their photos are all within 100m. Tap one — Julien Rocher, 27m away, last March.
5. **Travel** → *Griffith Observatory*, then take another photo. This time the sheet says **widened**: fewer than three memories within 100m, so the search expanded to 250m. That is the fallback firing, visibly.
6. **Switch explorer** (top-left chip) → *Sam Chen*. Sam's map is fully clouded except Tokyo. Paris is gone — Alex going there did nothing for Sam. **This is the point of the whole thing.**
7. **Travel Sam to the Eiffel Tower** and take a photo. Sam finds Alex's photo from step 3, sitting among the others.

Two more things worth showing:

- Pan to somewhere neither explorer has been. The top-right reads *"N still under cloud"* — photos are there, the map knows it, and it will not show them until you have earned that ground.
- *History* → *Cloud this map over again* resets one explorer without touching anyone else's map, or any photo. Handy for a second run-through.

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

### Discovery

`server/db.js`, `findNearby`. A bounding-box prefilter SQLite serves from an index, then an exact haversine pass — a box is not a circle, and its corners would otherwise admit results 41% too far away.

Search 100m. If that finds fewer than **3 photos from other people** — your own shots do not count as company — widen to 250m and report `expanded: true` so the UI can explain itself. All three numbers live in `server/config.json`.

### Seed photographs

`server/artwork.js` and `server/png.js` draw them: a PNG encoder over `node:zlib`, a small raster canvas, and a hero silhouette per landmark rendered under a seeded time of day. Nothing is downloaded, so the gallery does not go blank when the venue wifi does. Seeds derive from photo id, so regenerating produces identical images.

---

## Tests

```bash
cd server && node --test
```

Nine tests over the part that is easy to get quietly wrong: haversine accuracy, bounding-box corners being rejected, ordering, the 100m case, the 250m fallback, own-photos-don't-count, empty ocean, and the antimeridian and poles.

```bash
cd ios && ./logic-tests.sh
```

Ten tests over the exploration model, compiled and run natively on macOS with no simulator involved — including the one the product rests on: *one explorer travelling never uncovers anything for another*, before or after a reload.

```bash
cd ios && ./typecheck.sh
```

Type-checks every Swift file against the simulator SDK in a couple of seconds. Useful as the inner loop, and it works even when no simulator runtime is installed (a full bundle build needs one, because `actool` refuses without it).

---

## Swapping the backend

`PhotoService` (`ios/Nimbus/Services/PhotoService.swift`) is a protocol; `NimbusAPI` is the only implementation. A `SupabasePhotoService` conforming to it drops in with no changes to any view — the local server exists because it needs no accounts, no keys and no network.
