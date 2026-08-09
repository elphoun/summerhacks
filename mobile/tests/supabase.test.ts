// Tests for the Supabase backend.
//
// Everything here runs against a scripted `fetch`, so what is being checked is
// the half that is ours: the requests this builds. Two of those matter more
// than the rest.
//
// The first is the audience filter. Against the Node server it is a WHERE
// clause the server writes; here the client writes it, and a query that
// forgets it hands back photographs left by strangers — the one bug that would
// be invisible in a demo where everyone is already friends.
//
// The second is friend-code allocation, which SQLite did in one statement and
// PostgREST cannot: the row is inserted first and the code claimed second,
// which is a race, a retry loop, and a column that must survive every
// subsequent upsert.

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';

const { NimbusDatabase } = require('../src/services/supabase/database') as typeof import('../src/services/supabase/database');
const { NimbusPhotoStore } = require('../src/services/supabase/photoStore') as typeof import('../src/services/supabase/photoStore');
const { SupabasePhotoService } = require('../src/services/supabase/supabasePhotoService') as typeof import('../src/services/supabase/supabasePhotoService');

// MARK: A scripted server

interface Recorded {
  method: string;
  url: string;
  body: unknown;
}

interface Reply {
  status?: number;
  body?: unknown;
}

let calls: Recorded[] = [];
let replies: Reply[] = [];

/** The next answers this test's server will give, in order. */
const willReply = (...next: Reply[]) => replies.push(...next);

const urls = () => calls.map((call) => call.url);

/** Everything after `/rest/v1/`, which is the part a test is ever about. */
const paths = () => urls().map((url) => url.replace('https://test.supabase.co/rest/v1/', ''));

beforeEach(() => {
  calls = [];
  replies = [];

  global.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({
      method: init.method ?? 'GET',
      url: String(url),
      // A storage upload sends raw bytes; everything else sends JSON.
      body: typeof init.body === 'string' ? JSON.parse(init.body) : (init.body ?? null),
    });

    const reply = replies.shift() ?? { body: [] };
    const text = reply.body === undefined ? '' : JSON.stringify(reply.body);
    const status = reply.status ?? 200;

    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
      headers: { get: () => '0-0/0' },
    };
  }) as unknown as typeof fetch;
});

const userRow = (
  id: string,
  code: string | null = 'ABC234',
  stats: { steps?: number; explored_percent?: number; display_name?: string } = {}
) => ({
  id,
  display_name: stats.display_name ?? 'Explorer',
  color: '#6EA8FF',
  is_seed: false,
  friend_code: code,
  steps: stats.steps ?? 0,
  explored_percent: stats.explored_percent ?? 0,
});

const photoRow = (id: string, userId: string, lat: number, lon: number) => ({
  id,
  user_id: userId,
  lat,
  lon,
  taken_at: 1_700_000_000_000,
  caption: '',
  media_file: `${id}.png`,
  place_name: null,
  users: { display_name: 'Explorer', color: '#6EA8FF' },
});

const PARIS = { latitude: 48.8584, longitude: 2.2945 };

// MARK: Friend codes

test('a returning user keeps the code they already had', async () => {
  willReply({ body: [userRow('alex', 'QRS789')] });

  const user = await new NimbusDatabase().upsertUser('alex', 'Alex', '#6EA8FF');

  expect(user.friendCode).toBe('QRS789');
  // One request: no allocation was needed.
  expect(calls).toHaveLength(1);
});

test('an upsert never sends the friend code, so a rename cannot blank it', async () => {
  willReply({ body: [userRow('alex', 'QRS789')] });

  await new NimbusDatabase().upsertUser('alex', 'Alex Renamed', '#FF9F68');

  const [insert] = calls;
  expect(insert.method).toBe('POST');
  expect(insert.body).toEqual([
    { id: 'alex', display_name: 'Alex Renamed', color: '#FF9F68', is_seed: false },
  ]);
  expect(JSON.stringify(insert.body)).not.toContain('friend_code');
});

// MARK: Friend stats

test('an upsert with no stats leaves the ones already there alone', async () => {
  willReply({ body: [userRow('alex', 'QRS789', { steps: 4_000 })] });

  // Leaving a photo upserts the user but knows nothing about how far they have
  // walked. A merge-duplicates upsert writes what it is given, so sending a
  // zero here would reset the leaderboard row on every capture.
  await new NimbusDatabase().upsertUser('alex', 'Alex', '#6EA8FF');

  expect(JSON.stringify(calls[0].body)).not.toContain('steps');
  expect(JSON.stringify(calls[0].body)).not.toContain('explored_percent');
});

test('registering reports this device travels', async () => {
  willReply(
    { body: [userRow('alex', 'QRS789', { steps: 12_000, explored_percent: 0.42 })] },
    { body: [] },
    { body: [] }
  );

  await new NimbusPhotoStore().registerUser('alex', 'Alex', '#6EA8FF', {
    steps: 12_000,
    exploredPercent: 0.42,
  });

  expect(calls[0].body).toMatchObject([{ steps: 12_000, explored_percent: 0.42 }]);
});

test('friends are ranked the way the server ranks them', async () => {
  willReply(
    { body: [{ friend_id: 'sam' }, { friend_id: 'jo' }, { friend_id: 'kit' }] },
    {
      body: [
        // Returned in display order, which is not the leaderboard order.
        userRow('jo', 'JO1234', { display_name: 'Jo', steps: 900, explored_percent: 0.10 }),
        userRow('kit', 'KIT234', { display_name: 'Kit', steps: 50, explored_percent: 0.90 }),
        userRow('sam', 'SAM234', { display_name: 'Sam', steps: 8_000, explored_percent: 0.10 }),
      ],
    }
  );

  const friends = await new NimbusPhotoStore().friends('alex');

  // Ground uncovered first, then steps as the tie-break.
  expect(friends.map((friend) => [friend.displayName, friend.leaderboardRank])).toEqual([
    ['Jo', 3],
    ['Kit', 1],
    ['Sam', 2],
  ]);
  // The list itself keeps the order it was fetched in.
  expect(friends.map((friend) => friend.id)).toEqual(['jo', 'kit', 'sam']);
});

test('a friend the server has never heard from ranks at the bottom, not out', async () => {
  willReply(
    { body: [{ friend_id: 'sam' }, { friend_id: 'new' }] },
    {
      body: [
        { ...userRow('new', 'NEW234', { display_name: 'New' }), steps: null, explored_percent: null },
        userRow('sam', 'SAM234', { display_name: 'Sam', steps: 10, explored_percent: 0.5 }),
      ],
    }
  );

  const friends = await new NimbusPhotoStore().friends('alex');

  expect(friends[0]).toMatchObject({ displayName: 'New', steps: 0, exploredPercent: 0, leaderboardRank: 2 });
});

test('stats reach the app in the shape the friends list reads', async () => {
  willReply(
    { body: [userRow('alex', 'QRS789')] },
    { body: [] },
    { body: [{ friend_id: 'sam' }] },
    { body: [userRow('sam', 'SAM234', { display_name: 'Sam', steps: 8_000, explored_percent: 0.4 })] }
  );

  const response = await new SupabasePhotoService().register(
    { id: 'alex', displayName: 'Alex', colorHex: '#6EA8FF', friendCode: 'QRS789' },
    { steps: 12_000, exploredPercent: 0.42 }
  );

  expect(response.friends[0]).toMatchObject({
    displayName: 'Sam',
    steps: 8_000,
    exploredPercent: 0.4,
    leaderboardRank: 1,
  });
});

test('a new user is given a code by a second, conditional write', async () => {
  willReply(
    { body: [userRow('new', null)] },
    { body: [userRow('new', 'ZZZ234')] } // the PATCH, echoing what it wrote
  );

  const user = await new NimbusDatabase().upsertUser('new', 'New', '#6EA8FF');

  expect(calls[1].method).toBe('PATCH');
  // `friend_code=is.null` is what makes two devices racing safe.
  expect(paths()[1]).toBe('users?id=eq.new&friend_code=is.null');
  expect(user.friendCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
});

test('a collision on the unique index is retried', async () => {
  willReply(
    { body: [userRow('new', null)] },
    { status: 409, body: { message: 'duplicate key value violates unique constraint' } },
    { body: [userRow('new', 'ZZZ234')] }
  );

  const user = await new NimbusDatabase().upsertUser('new', 'New', '#6EA8FF');

  expect(calls).toHaveLength(3);
  expect(user.friendCode).not.toBeNull();
});

test('losing the race reads back the winner rather than overwriting it', async () => {
  willReply(
    { body: [userRow('new', null)] },
    { body: [] }, // the conditional PATCH updated nothing: someone else got there
    { body: [userRow('new', 'WON456')] }
  );

  const user = await new NimbusDatabase().upsertUser('new', 'New', '#6EA8FF');

  expect(user.friendCode).toBe('WON456');
});

test('a code is matched however it was typed', async () => {
  willReply({ body: [userRow('friend', 'ABC234')] });

  await new NimbusDatabase().findUserByCode(' abc-234 ');

  expect(paths()[0]).toContain('friend_code=eq.ABC234');
});

// MARK: Friendship

test('friendship is written both ways round', async () => {
  willReply({});

  await new NimbusDatabase().addFriendship('alex', 'sam');

  expect(calls[0].body).toEqual([
    { user_id: 'alex', friend_id: 'sam' },
    { user_id: 'sam', friend_id: 'alex' },
  ]);
});

test('nobody is befriended to themselves', async () => {
  await new NimbusDatabase().addFriendship('alex', 'alex');
  expect(calls).toHaveLength(0);
});

// MARK: The audience filter

test('a bbox query asks only for the viewer and their friends', async () => {
  willReply(
    { body: [{ friend_id: 'sam' }, { friend_id: 'jo' }] },
    { body: [photoRow('p1', 'sam', 48.8, 2.3)] }
  );

  await new NimbusPhotoStore().photosInBBox(
    { minLat: 48, maxLat: 49, minLon: 2, maxLon: 3 },
    'alex'
  );

  expect(paths()[1]).toContain('user_id=in.("alex","sam","jo")');
});

test('a viewer with no friends still sees their own photographs', async () => {
  willReply({ body: [] }, { body: [photoRow('mine', 'alex', 48.8, 2.3)] });

  const photos = await new NimbusPhotoStore().photosInBBox(
    { minLat: 48, maxLat: 49, minLon: 2, maxLon: 3 },
    'alex'
  );

  expect(paths()[1]).toContain('user_id=in.("alex")');
  expect(photos).toHaveLength(1);
});

test('an anonymous query is left unscoped, as it is on the server', async () => {
  willReply({ body: [] });

  await new NimbusDatabase().photosInBBox({ minLat: 48, maxLat: 49, minLon: 2, maxLon: 3 }, null);

  expect(paths()[0]).not.toContain('user_id=in.');
});

test('an empty audience asks for nothing at all', async () => {
  const photos = await new NimbusDatabase().photosInBBox(
    { minLat: 48, maxLat: 49, minLon: 2, maxLon: 3 },
    []
  );

  expect(photos).toEqual([]);
  expect(calls).toHaveLength(0);
});

test('the nearby search carries the audience into both radii', async () => {
  willReply(
    { body: [{ friend_id: 'sam' }] },
    { body: [] }, // primary radius: nothing, so it expands
    { body: [photoRow('p1', 'sam', 48.8584, 2.2946)] }
  );

  const result = await new NimbusPhotoStore().nearby(PARIS, 'alex');

  expect(result.expanded).toBe(true);
  expect(result.radiusUsed).toBe(250);
  for (const path of paths().slice(1)) {
    expect(path).toContain('user_id=in.("alex","sam")');
  }
});

test('an id with a comma in it cannot widen the filter', async () => {
  willReply({ body: [{ friend_id: 'sam","everyone' }] }, { body: [] });

  await new NimbusPhotoStore().photosInBBox(
    { minLat: 48, maxLat: 49, minLon: 2, maxLon: 3 },
    'alex'
  );

  expect(paths()[1]).toContain('user_id=in.("alex","sam\\",\\"everyone")');
});

// MARK: Health

test('a refused key is not mistaken for an empty database', async () => {
  willReply({ status: 401, body: { message: 'invalid api key' } });

  // The health check gates registration, so answering "reachable" here would
  // send everything after it at a project that will refuse all of it.
  expect(await new SupabasePhotoService().health()).toBe(false);
});

test('a project that answers is reachable', async () => {
  willReply({ body: [] });
  expect(await new SupabasePhotoService().health()).toBe(true);
});

// MARK: The service the app actually holds

test('registering befriends the seeded people and returns the code', async () => {
  willReply(
    { body: [userRow('alex', 'QRS789')] }, // upsert
    { body: [{ id: 'seed-1' }] }, // seed lookup
    {}, // friendship insert
    { body: [{ friend_id: 'seed-1' }] }, // friend ids
    { body: [userRow('seed-1', 'SEED22')] } // the friends themselves
  );

  const response = await new SupabasePhotoService().register({
    id: 'alex',
    displayName: 'Alex',
    colorHex: '#6EA8FF',
    friendCode: null,
  });

  expect(response.user.friendCode).toBe('QRS789');
  expect(response.friends.map((friend) => friend.id)).toEqual(['seed-1']);
});

test('a code nobody has is refused in the words the UI shows', async () => {
  willReply({ body: [] });

  await expect(new SupabasePhotoService().addFriend('ZZZZZZ', 'alex')).rejects.toMatchObject({
    serverMessage: 'no one has that code',
    status: 404,
  });
});

test('your own code is refused', async () => {
  willReply({ body: [userRow('alex', 'ABC234')] });

  await expect(new SupabasePhotoService().addFriend('ABC234', 'alex')).rejects.toMatchObject({
    serverMessage: 'that is your own code',
  });
});

test("a PostgREST error arrives as the message it came with, not its status", async () => {
  willReply({ status: 403, body: { message: 'new row violates row-level security policy' } });

  await expect(new SupabasePhotoService().friends('alex')).rejects.toMatchObject({
    status: 403,
    serverMessage: 'new row violates row-level security policy',
  });
});

test('an upload writes the media, the row and the neighbourhood', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUg==';
  willReply(
    { body: [userRow('alex', 'QRS789')] }, // upsert
    {}, // storage upload
    {}, // photo insert
    { body: [photoRow('new', 'alex', PARIS.latitude, PARIS.longitude)] }, // read back
    { body: [] }, // friend ids
    { body: [photoRow('new', 'alex', PARIS.latitude, PARIS.longitude)] }, // nearby
    { body: [] } // the second radius, since only your own shot is in the first
  );

  const response = await new SupabasePhotoService().upload({
    imageBase64: png,
    coordinate: PARIS,
    caption: 'here',
    explorer: { id: 'alex', displayName: 'Alex', colorHex: '#6EA8FF', friendCode: 'QRS789' },
    placeName: 'Eiffel Tower',
  });

  const upload = calls.find((call) => call.url.includes('/storage/v1/'));
  expect(upload?.method).toBe('POST');
  expect(upload?.url).toContain('/storage/v1/object/media/');
  // The extension comes from the magic number, not from the caller.
  expect(upload?.url.endsWith('.png')).toBe(true);

  const insert = calls.find((call) => call.url.includes('/rest/v1/photos') && call.method === 'POST');
  expect(insert?.body).toMatchObject([
    { user_id: 'alex', lat: PARIS.latitude, lon: PARIS.longitude, place_name: 'Eiffel Tower' },
  ]);

  expect(response.photo.isYours).toBe(true);
  // Storage is public, so the app is handed an absolute URL rather than a path.
  expect(response.photo.imagePath).toBe(
    'https://test.supabase.co/storage/v1/object/public/media/new.png'
  );
});

test('a caption longer than the column is cut, not rejected', async () => {
  willReply(
    { body: [userRow('alex', 'QRS789')] },
    {},
    {},
    { body: [photoRow('new', 'alex', PARIS.latitude, PARIS.longitude)] },
    { body: [] },
    { body: [] },
    { body: [] }
  );

  await new NimbusPhotoStore().uploadPhoto({
    imageBase64: 'iVBORw0KGgo=',
    userId: 'alex',
    coordinate: PARIS,
    caption: 'x'.repeat(400),
  });

  const insert = calls.find((call) => call.url.includes('/rest/v1/photos') && call.method === 'POST');
  expect((insert?.body as { caption: string }[])[0].caption).toHaveLength(280);
});

test('a photo is mapped into the shape the map already reads', async () => {
  willReply({ body: [] }, { body: [photoRow('p1', 'sam', 48.8, 2.3)] });

  const [photo] = await new NimbusPhotoStore().photosInBBox(
    { minLat: 48, maxLat: 49, minLon: 2, maxLon: 3 },
    'alex'
  );

  expect(photo).toMatchObject({
    id: 'p1',
    userId: 'sam',
    displayName: 'Explorer',
    color: '#6EA8FF',
    lat: 48.8,
    lon: 2.3,
  });
});

// MARK: Delete

test("resetting removes only that explorer's photos, and their media files", async () => {
  willReply(
    { body: [{ media_file: 'a.png' }, { media_file: 'b.png' }] }, // delete photos
    {}, // storage bulk delete
    {} // recount
  );

  await new SupabasePhotoService().deleteMyPhotos('alex');

  const deletePhotos = calls.find(
    (call) => call.method === 'DELETE' && call.url.includes('/rest/v1/photos')
  );
  expect(deletePhotos?.url).toContain('user_id=eq.alex');

  const deleteMedia = calls.find(
    (call) => call.method === 'DELETE' && call.url.includes('/storage/v1/object/media')
  );
  expect(deleteMedia?.body).toEqual({ prefixes: ['a.png', 'b.png'] });
});

test('deleting nobody\'s photos does not bother Storage at all', async () => {
  willReply({ body: [] });

  await new NimbusDatabase().deletePhotosByUser('nobody');

  expect(calls.some((call) => call.url.includes('/storage/v1/'))).toBe(false);
});
