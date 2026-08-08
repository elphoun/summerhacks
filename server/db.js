// Storage for the SHARED half of Nimbus: photographs left behind at a place.
//
// Note what is *not* in this schema: anywhere a user has been. Exploration
// state is private and lives only on the device that earned it (see the iOS
// ExplorationStore). There is deliberately no table, column or endpoint here
// that could leak one user's map to another.

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
    is_seed       INTEGER NOT NULL DEFAULT 0
  );

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
`;

export function openDatabase(dbPath = DEFAULT_DB_PATH) {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  mkdirSync(MEDIA_DIR, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

export function upsertUser(db, { id, displayName, color, isSeed = false }) {
  db.prepare(
    `INSERT INTO users (id, display_name, color, is_seed) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name,
                                     color = excluded.color`,
  ).run(id, displayName, color, isSeed ? 1 : 0);
  return { id, displayName, color, isSeed };
}

export function listUsers(db) {
  return db
    .prepare('SELECT id, display_name, color, is_seed FROM users ORDER BY is_seed, display_name')
    .all()
    .map(toUser);
}

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

const PHOTO_SELECT = `
  SELECT p.id, p.user_id, p.lat, p.lon, p.taken_at, p.caption, p.media_file, p.place_name,
         u.display_name, u.color
    FROM photos p
    JOIN users u ON u.id = p.user_id`;

/**
 * Every photo within `radiusM` of a point, nearest first.
 *
 * Stage 1 is a bounding-box scan SQLite can serve from photos_lat_lon; stage 2
 * is an exact haversine filter, because a box is not a circle and the corners
 * would otherwise sneak in results up to 41% too far away.
 */
export function findWithinRadius(db, { lat, lon, radiusM }) {
  const box = bboxFor(lat, lon, radiusM);
  const rows = db
    .prepare(`${PHOTO_SELECT} WHERE p.lat BETWEEN ? AND ? AND p.lon BETWEEN ? AND ?`)
    .all(box.minLat, box.maxLat, box.minLon, box.maxLon);

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
 */
export function findNearby(db, { lat, lon, viewerId = null, config }) {
  const { primaryRadiusM, fallbackRadiusM, minResults } = config;

  let radiusUsed = primaryRadiusM;
  let photos = findWithinRadius(db, { lat, lon, radiusM: primaryRadiusM });
  let expanded = false;

  if (countOthers(photos, viewerId) < minResults) {
    radiusUsed = fallbackRadiusM;
    expanded = true;
    photos = findWithinRadius(db, { lat, lon, radiusM: fallbackRadiusM });
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
