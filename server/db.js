// Storage for the SHARED half of Nimbus: photographs left behind at a place,
// and the people you have agreed to share them with.
//
// Note what is *not* in this schema: anywhere a user has been. Exploration
// state is private and lives only on the device that earned it (see the iOS
// ExplorationStore). There is deliberately no table, column or endpoint here
// that could leak one user's map to another — friendship shares photographs,
// never movement.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bboxFor, haversineM } from './geo.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_DB_PATH = path.join(here, 'data', 'nimbus.db');
export const MEDIA_DIR = path.join(here, 'data', 'media');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    display_name  TEXT NOT NULL,
    color         TEXT NOT NULL,
    is_seed       INTEGER NOT NULL DEFAULT 0,
    friend_code   TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS users_friend_code ON users(friend_code);

  CREATE TABLE IF NOT EXISTS photos (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    lat         REAL NOT NULL,
    lon         REAL NOT NULL,
    taken_at    INTEGER NOT NULL,
    caption     TEXT NOT NULL DEFAULT '',
    media_file  TEXT NOT NULL,
    place_name  TEXT
  );

  -- The nearby search prefilters on a bounding box, so this is the index that
  -- matters. Latitude first: it is the more selective of the two.
  CREATE INDEX IF NOT EXISTS photos_lat_lon ON photos(lat, lon);

  -- Friendship is stored symmetrically, two rows per pair. It doubles the
  -- storage and removes every "or" from the read path: "whose photos may I
  -- see" is one primary-key lookup rather than a union of two.
  CREATE TABLE IF NOT EXISTS friendships (
    user_id    TEXT NOT NULL REFERENCES users(id),
    friend_id  TEXT NOT NULL REFERENCES users(id),
    PRIMARY KEY (user_id, friend_id)
  );
`;

export function openDatabase(dbPath = DEFAULT_DB_PATH) {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  mkdirSync(MEDIA_DIR, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  db.exec(SCHEMA);
  backfillFriendCodes(db);
  return db;
}

/**
 * `CREATE TABLE IF NOT EXISTS` will not add a column to a database that already
 * exists, and a demo machine may well have one seeded from an earlier build.
 */
function migrate(db) {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .all()
    .map((row) => row.name);
  if (!tables.includes('users')) return;

  const columns = db
    .prepare('PRAGMA table_info(users)')
    .all()
    .map((column) => column.name);
  if (!columns.includes('friend_code')) {
    db.exec('ALTER TABLE users ADD COLUMN friend_code TEXT');
  }
}

// MARK: Users and friend codes

// No O/0, I/1 or L: these get read aloud across a table and typed by someone
// who is not looking at their own screen.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;

/** Uppercase, and forgiving about the spaces and dashes people add. */
export const normaliseCode = (raw) =>
  String(raw ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');

const randomCode = () =>
  Array.from(
    { length: CODE_LENGTH },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
  ).join('');

/** Give a user a code if they have not got one, and return whatever they have. */
function assignFriendCode(db, id) {
  const existing = db.prepare('SELECT friend_code FROM users WHERE id = ?').get(id);
  if (existing?.friend_code) return existing.friend_code;

  for (let attempt = 0; attempt < 25; attempt++) {
    const code = randomCode();
    try {
      db.prepare('UPDATE users SET friend_code = ? WHERE id = ? AND friend_code IS NULL').run(code, id);
      return code;
    } catch {
      // Unique index collision. With 31^6 codes this is vanishingly unlikely,
      // but a retry is cheaper than reasoning about how unlikely.
    }
  }
  throw new Error('could not allocate a friend code');
}

function backfillFriendCodes(db) {
  for (const row of db.prepare('SELECT id FROM users WHERE friend_code IS NULL').all()) {
    assignFriendCode(db, row.id);
  }
}

export function upsertUser(db, { id, displayName, color, isSeed = false }) {
  db.prepare(
    `INSERT INTO users (id, display_name, color, is_seed) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name,
                                     color = excluded.color`,
  ).run(id, displayName, color, isSeed ? 1 : 0);
  assignFriendCode(db, id);
  return getUser(db, id);
}

export function getUser(db, id) {
  const row = db.prepare(`${USER_SELECT} WHERE id = ?`).get(id);
  return row ? toUser(row) : null;
}

export function findUserByCode(db, code) {
  const row = db.prepare(`${USER_SELECT} WHERE friend_code = ?`).get(normaliseCode(code));
  return row ? toUser(row) : null;
}

export function listUsers(db) {
  return db.prepare(`${USER_SELECT} ORDER BY is_seed, display_name`).all().map(toUser);
}

// MARK: Friendship

/** Returns true if this was a new friendship rather than one that already held. */
export function addFriendship(db, a, b) {
  if (!a || !b || a === b) return false;
  const insert = db.prepare('INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)');
  const forward = insert.run(a, b);
  insert.run(b, a);
  return forward.changes > 0;
}

export function friendIds(db, userId) {
  return db
    .prepare('SELECT friend_id FROM friendships WHERE user_id = ?')
    .all(userId)
    .map((row) => row.friend_id);
}

export function listFriends(db, userId) {
  return db
    .prepare(
      `SELECT u.id, u.display_name, u.color, u.is_seed, u.friend_code
         FROM friendships f JOIN users u ON u.id = f.friend_id
        WHERE f.user_id = ?
        ORDER BY u.is_seed, u.display_name`,
    )
    .all(userId)
    .map(toUser);
}

/**
 * Whose photographs this viewer may see: their friends, plus themselves.
 *
 * `null` means "no restriction" and is what an anonymous request gets — useful
 * for poking at the server with curl during a demo, and the reason every call
 * site passes this explicitly rather than letting it default.
 */
export function audienceFor(db, userId) {
  return userId ? [userId, ...friendIds(db, userId)] : null;
}

/**
 * The seeded people are everyone's friends, so a fresh install has something to
 * look at on its first launch. Run on every registration rather than only on
 * the first, so it does not matter whether the app or `node seed.js` went first.
 */
export function befriendSeedUsers(db, userId) {
  let added = 0;
  for (const row of db.prepare('SELECT id FROM users WHERE is_seed = 1').all()) {
    if (addFriendship(db, userId, row.id)) added++;
  }
  return added;
}

// MARK: Photos

export function insertPhoto(db, photo) {
  db.prepare(
    `INSERT INTO photos (id, user_id, lat, lon, taken_at, caption, media_file, place_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    photo.id,
    photo.userId,
    photo.lat,
    photo.lon,
    photo.takenAt,
    photo.caption ?? '',
    photo.mediaFile,
    photo.placeName ?? null,
  );
  return getPhoto(db, photo.id);
}

export function getPhoto(db, id) {
  const row = db.prepare(`${PHOTO_SELECT} WHERE p.id = ?`).get(id);
  return row ? toPhoto(row) : null;
}

export function countPhotos(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM photos').get().n;
}

const USER_SELECT = 'SELECT id, display_name, color, is_seed, friend_code FROM users';

const PHOTO_SELECT = `
  SELECT p.id, p.user_id, p.lat, p.lon, p.taken_at, p.caption, p.media_file, p.place_name,
         u.display_name, u.color
    FROM photos p
    JOIN users u ON u.id = p.user_id`;

/** `AND p.user_id IN (?, ?, …)`, or nothing at all when the audience is open. */
const audienceClause = (audience) =>
  audience ? ` AND p.user_id IN (${audience.map(() => '?').join(',')})` : '';

/** Everything in a map region, for pinning on the map. */
export function findInBox(db, { minLat, maxLat, minLon, maxLon, audience = null, limit = 500 }) {
  if (audience && audience.length === 0) return [];
  return db
    .prepare(
      `${PHOTO_SELECT} WHERE p.lat BETWEEN ? AND ? AND p.lon BETWEEN ? AND ?${audienceClause(audience)}
        ORDER BY p.taken_at DESC LIMIT ?`,
    )
    .all(minLat, maxLat, minLon, maxLon, ...(audience ?? []), limit)
    .map(toPhoto);
}

/**
 * Every photo within `radiusM` of a point, nearest first.
 *
 * Stage 1 is a bounding-box scan SQLite can serve from photos_lat_lon; stage 2
 * is an exact haversine filter, because a box is not a circle and the corners
 * would otherwise sneak in results up to 41% too far away.
 */
export function findWithinRadius(db, { lat, lon, radiusM, audience = null }) {
  if (audience && audience.length === 0) return [];

  const box = bboxFor(lat, lon, radiusM);
  const rows = db
    .prepare(
      `${PHOTO_SELECT} WHERE p.lat BETWEEN ? AND ? AND p.lon BETWEEN ? AND ?${audienceClause(audience)}`,
    )
    .all(box.minLat, box.maxLat, box.minLon, box.maxLon, ...(audience ?? []));

  return rows
    .map((row) => {
      const photo = toPhoto(row);
      photo.distanceM = Math.round(haversineM(lat, lon, photo.lat, photo.lon));
      return photo;
    })
    .filter((photo) => photo.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

/**
 * The core discovery query.
 *
 * Search the primary radius (100m). If that turns up fewer than `minResults`
 * photos *from other people* — your own shots do not count as company —
 * widen to the fallback radius (250m) and say so, so the UI can explain why
 * it is showing something four blocks away.
 *
 * `audience` scopes the whole thing to you and your friends; pass null for an
 * unrestricted search.
 */
export function findNearby(db, { lat, lon, viewerId = null, audience = null, config }) {
  const { primaryRadiusM, fallbackRadiusM, minResults } = config;

  let radiusUsed = primaryRadiusM;
  let photos = findWithinRadius(db, { lat, lon, radiusM: primaryRadiusM, audience });
  let expanded = false;

  if (countOthers(photos, viewerId) < minResults) {
    radiusUsed = fallbackRadiusM;
    expanded = true;
    photos = findWithinRadius(db, { lat, lon, radiusM: fallbackRadiusM, audience });
  }

  return {
    radiusUsed,
    expanded,
    primaryRadiusM,
    fallbackRadiusM,
    othersCount: countOthers(photos, viewerId),
    photos: photos.map((photo) => ({ ...photo, isYours: photo.userId === viewerId })),
  };
}

const countOthers = (photos, viewerId) =>
  photos.filter((photo) => photo.userId !== viewerId).length;

const toUser = (row) => ({
  id: row.id,
  displayName: row.display_name,
  color: row.color,
  isSeed: row.is_seed === 1,
  friendCode: row.friend_code ?? null,
});

const toPhoto = (row) => ({
  id: row.id,
  userId: row.user_id,
  displayName: row.display_name,
  color: row.color,
  lat: row.lat,
  lon: row.lon,
  takenAt: row.taken_at,
  caption: row.caption,
  placeName: row.place_name,
  imagePath: `/media/${row.media_file}`,
});
