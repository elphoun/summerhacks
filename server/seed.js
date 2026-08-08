// Populates the shared photo store so the discovery half of the app has
// something to discover on day one.
//
//   node seed.js            fill an empty database (no-op if already seeded)
//   node seed.js --reset    wipe photos + media and regenerate
//
// Artwork is generated here rather than downloaded: seeds are deterministic
// for a given photo id, so reruns produce byte-identical images and the demo
// never depends on a network.

import fs from 'node:fs';
import path from 'node:path';

import { renderPhoto, hashString, makeRng } from './artwork.js';
import { MEDIA_DIR, countPhotos, insertPhoto, openDatabase, upsertUser } from './db.js';
import { offsetCoordinate } from './geo.js';
import { PLACES, SEED_USERS } from './places.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const reset = process.argv.includes('--reset');
const db = openDatabase();

if (reset) {
  db.exec('DELETE FROM photos;');
  for (const file of fs.readdirSync(MEDIA_DIR)) {
    if (file.startsWith('seed-')) fs.unlinkSync(path.join(MEDIA_DIR, file));
  }
  console.log('cleared existing seed photos');
}

if (countPhotos(db) > 0) {
  console.log(`database already has ${countPhotos(db)} photos — run with --reset to regenerate`);
  process.exit(0);
}

for (const user of SEED_USERS) upsertUser(db, { ...user, isSeed: true });

let written = 0;
const now = Date.now();

for (const place of PLACES) {
  // One rng per place keeps a place's photos stable even if another place's
  // photo count changes.
  const rng = makeRng(hashString(place.id));

  for (let i = 0; i < place.photos; i++) {
    const id = `seed-${place.id}-${i}`;

    // A sparse place scatters its photos beyond the 100m primary radius (bar
    // one), so a capture at its centre has to widen the search to find company.
    const distanceM = place.sparse
      ? i === 0
        ? 88 + rng() * 8
        : 145 + rng() * 90
      : 12 + rng() * 78;

    const { lat, lon } = offsetCoordinate(place.lat, place.lon, distanceM, rng() * 360);
    const author = SEED_USERS[Math.floor(rng() * SEED_USERS.length)];
    const file = `${id}.png`;

    fs.writeFileSync(
      path.join(MEDIA_DIR, file),
      renderPhoto({ hero: place.hero, seed: hashString(id), water: place.water === true }),
    );

    insertPhoto(db, {
      id,
      userId: author.id,
      lat,
      lon,
      takenAt: now - Math.floor((3 + rng() * 420) * DAY_MS) + Math.floor(rng() * DAY_MS),
      caption: place.captions[i % place.captions.length],
      mediaFile: file,
      placeName: place.name,
    });

    written++;
  }

  console.log(
    `  ${place.name.padEnd(22)} ${String(place.photos).padStart(2)} photos` +
      (place.sparse ? '  (scattered — triggers the 250m fallback)' : ''),
  );
}

console.log(`\nseeded ${written} photos from ${SEED_USERS.length} people across ${PLACES.length} places`);
console.log(`images: ${MEDIA_DIR}`);
