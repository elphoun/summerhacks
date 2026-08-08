// Nimbus shared-memory API. node:http + node:sqlite, no dependencies.
//
//   GET  /health
//   GET  /users
//   POST /users                     register this device's identity
//   GET  /photos/nearby?lat&lon&viewerId
//   GET  /photos/bbox?minLat&maxLat&minLon&maxLon
//   POST /photos                    upload + nearby search in one round trip
//   GET  /media/:file

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  MEDIA_DIR,
  countPhotos,
  findNearby,
  getPhoto,
  insertPhoto,
  listUsers,
  openDatabase,
  upsertUser,
} from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const config = JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8'));

const MEDIA_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.heic': 'image/heic',
};

export function createServer(db) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const route = `${req.method} ${url.pathname}`;

    // The app talks to this over plain http on localhost/LAN; permissive CORS
    // keeps `curl` and a browser tab usable as debugging tools during a demo.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return send(res, 204, null);

    try {
      if (route === 'GET /health') {
        return sendJson(res, 200, { ok: true, photos: countPhotos(db), config });
      }

      if (route === 'GET /users') {
        return sendJson(res, 200, { users: listUsers(db) });
      }

      if (route === 'POST /users') {
        const body = await readJson(req);
        const user = upsertUser(db, {
          id: body.id ?? randomUUID(),
          displayName: requireString(body, 'displayName'),
          color: body.color ?? '#6EA8FF',
          isSeed: false,
        });
        return sendJson(res, 200, { user });
      }

      if (route === 'GET /photos/nearby') {
        const lat = requireFloat(url.searchParams, 'lat');
        const lon = requireFloat(url.searchParams, 'lon');
        const viewerId = url.searchParams.get('viewerId');
        return sendJson(res, 200, findNearby(db, { lat, lon, viewerId, config }));
      }

      if (route === 'GET /photos/bbox') {
        const rows = db
          .prepare(
            `SELECT p.id, p.user_id, p.lat, p.lon, p.taken_at, p.caption, p.media_file,
                    p.place_name, u.display_name, u.color
               FROM photos p JOIN users u ON u.id = p.user_id
              WHERE p.lat BETWEEN ? AND ? AND p.lon BETWEEN ? AND ?
              LIMIT 500`,
          )
          .all(
            requireFloat(url.searchParams, 'minLat'),
            requireFloat(url.searchParams, 'maxLat'),
            requireFloat(url.searchParams, 'minLon'),
            requireFloat(url.searchParams, 'maxLon'),
          );
        return sendJson(res, 200, {
          photos: rows.map((row) => ({
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
          })),
        });
      }

      if (route === 'POST /photos') {
        const body = await readJson(req);
        const lat = requireNumber(body, 'lat');
        const lon = requireNumber(body, 'lon');
        const userId = requireString(body, 'userId');

        // Accept an unknown user id so a freshly installed app can post without
        // a separate registration step.
        upsertUser(db, {
          id: userId,
          displayName: body.displayName ?? 'Explorer',
          color: body.color ?? '#6EA8FF',
        });

        const id = randomUUID();
        const mediaFile = writeMedia(id, requireString(body, 'imageBase64'));

        const photo = insertPhoto(db, {
          id,
          userId,
          lat,
          lon,
          takenAt: Number.isFinite(body.takenAt) ? body.takenAt : Date.now(),
          caption: typeof body.caption === 'string' ? body.caption.slice(0, 280) : '',
          mediaFile,
          placeName: body.placeName ?? null,
        });

        // The whole point of the capture flow is the reveal that follows it, so
        // the upload response already carries the neighbourhood.
        return sendJson(res, 201, {
          photo: { ...photo, isYours: true, distanceM: 0 },
          nearby: findNearby(db, { lat, lon, viewerId: userId, config }),
        });
      }

      if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
        return sendMedia(res, url.pathname.slice('/media/'.length));
      }

      if (req.method === 'GET' && url.pathname.startsWith('/photos/')) {
        const photo = getPhoto(db, url.pathname.slice('/photos/'.length));
        if (photo) return sendJson(res, 200, { photo });
      }

      return sendJson(res, 404, { error: `no route for ${route}` });
    } catch (error) {
      const status = error.statusCode ?? 500;
      if (status >= 500) console.error(`[nimbus] ${route} failed:`, error);
      return sendJson(res, status, { error: error.message });
    }
  });
}

function writeMedia(id, base64) {
  const payload = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length === 0) throw badRequest('imageBase64 did not decode to any bytes');
  if (bytes.length > config.maxUploadBytes) throw badRequest('image too large');

  const file = `${id}${sniffExtension(bytes)}`;
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  fs.writeFileSync(path.join(MEDIA_DIR, file), bytes);
  return file;
}

/** Trust the bytes, not the caller: read the magic number. */
function sniffExtension(bytes) {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return '.png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return '.jpg';
  return '.png';
}

function sendMedia(res, rawName) {
  // Never let a request name a path; only a file inside the media directory.
  const file = path.basename(decodeURIComponent(rawName));
  if (!/^[\w.-]+$/.test(file)) return sendJson(res, 400, { error: 'bad media name' });

  const full = path.join(MEDIA_DIR, file);
  if (!fs.existsSync(full)) return sendJson(res, 404, { error: 'no such image' });

  res.writeHead(200, {
    'Content-Type': MEDIA_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': fs.statSync(full).size,
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(full).pipe(res);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > config.maxUploadBytes * 1.4) {
        reject(badRequest('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(badRequest('body was not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

function requireFloat(params, key) {
  const value = Number.parseFloat(params.get(key));
  if (!Number.isFinite(value)) throw badRequest(`query parameter "${key}" must be a number`);
  return value;
}

function requireNumber(body, key) {
  if (!Number.isFinite(body[key])) throw badRequest(`"${key}" must be a number`);
  return body[key];
}

function requireString(body, key) {
  if (typeof body[key] !== 'string' || body[key].length === 0) {
    throw badRequest(`"${key}" must be a non-empty string`);
  }
  return body[key];
}

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, body == null ? {} : { 'Content-Type': type });
  res.end(body ?? undefined);
};

const sendJson = (res, status, payload) => send(res, status, JSON.stringify(payload));

// Started directly (rather than imported by a test), so listen.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDatabase();
  const port = Number(process.env.PORT ?? config.port);
  // No host argument: Node binds dual-stack, so the app reaches this whether
  // `localhost` resolves to 127.0.0.1 or ::1, and phones can use the LAN address.
  createServer(db).listen(port, () => {
    console.log(`nimbus server listening`);
    console.log(`  simulator / this mac : http://localhost:${port}`);
    for (const address of lanAddresses()) {
      console.log(`  a phone on this wifi : http://${address}:${port}`);
    }
  });
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address);
}
