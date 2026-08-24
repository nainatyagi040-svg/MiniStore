import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryStore } from '../src/store/InMemoryStore.js';

/** A hand-cranked clock so TTL behaviour is deterministic and needs no sleeping. */
function fakeClock(startMs = 0): { now: () => number; advance: (ms: number) => void } {
  let current = startMs;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

// --- Basic get/set/del (carried over from the day 1-3 slice) ---

test('get returns undefined for a missing key', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  assert.equal(store.get('missing'), undefined);
});

test('set then get returns the stored value', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.set('foo', 'bar');
  assert.equal(store.get('foo'), 'bar');
});

test('set overwrites an existing value', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.set('foo', 'bar');
  store.set('foo', 'baz');
  assert.equal(store.get('foo'), 'baz');
});

test('del removes an existing key and reports true', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.set('foo', 'bar');
  assert.equal(store.del('foo'), true);
  assert.equal(store.get('foo'), undefined);
});

test('del on a missing key reports false', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  assert.equal(store.del('nope'), false);
});

test('size reflects the number of stored keys', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  assert.equal(store.size, 0);
  store.set('a', '1');
  store.set('b', '2');
  assert.equal(store.size, 2);
  store.del('a');
  assert.equal(store.size, 1);
});

test('maxKeys must be a positive integer', () => {
  assert.throws(() => new InMemoryStore({ maxKeys: 0 }), /maxKeys/);
  assert.throws(() => new InMemoryStore({ maxKeys: -3 }), /maxKeys/);
  assert.throws(() => new InMemoryStore({ maxKeys: 1.5 }), /maxKeys/);
});

// --- TTL: lazy expiration ---

test('SET with a TTL: value is live before expiry and gone after (lazy on GET)', () => {
  const clock = fakeClock();
  const expired: string[] = [];
  const store = new InMemoryStore({ maxKeys: 100, now: clock.now, onExpired: (k) => expired.push(k) });

  store.set('k', 'v', 10); // expires at t=10_000ms
  clock.advance(9_999);
  assert.equal(store.get('k'), 'v', 'still live just before the deadline');

  clock.advance(1); // now at exactly 10_000ms
  assert.equal(store.get('k'), undefined, 'expired at the deadline');
  assert.equal(store.size, 0, 'lazy GET actually removed it');
  assert.deepEqual(expired, ['k'], 'onExpired fired once');
});

test('a plain SET clears a previously set TTL', () => {
  const clock = fakeClock();
  const store = new InMemoryStore({ maxKeys: 100, now: clock.now });
  store.set('k', 'v', 10); // TTL set
  store.set('k', 'v2'); // plain SET -> persistent
  clock.advance(60_000);
  assert.equal(store.get('k'), 'v2', 'no longer expires after a plain overwrite');
});

test('DEL on an already-expired key reports false and cleans it up', () => {
  const clock = fakeClock();
  const expired: string[] = [];
  const store = new InMemoryStore({ maxKeys: 100, now: clock.now, onExpired: (k) => expired.push(k) });
  store.set('k', 'v', 1);
  clock.advance(1_000);
  assert.equal(store.del('k'), false, 'expired key is treated as absent');
  assert.equal(store.size, 0);
  assert.deepEqual(expired, ['k']);
});

// --- TTL: EXPIRE command semantics ---

test('EXPIRE sets a TTL on an existing key and returns true', () => {
  const clock = fakeClock();
  const store = new InMemoryStore({ maxKeys: 100, now: clock.now });
  store.set('k', 'v');
  assert.equal(store.expire('k', 5), true);
  clock.advance(4_999);
  assert.equal(store.get('k'), 'v');
  clock.advance(1);
  assert.equal(store.get('k'), undefined);
});

test('EXPIRE on a missing key returns false', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  assert.equal(store.expire('ghost', 5), false);
});

test('EXPIRE on an already-expired key returns false', () => {
  const clock = fakeClock();
  const store = new InMemoryStore({ maxKeys: 100, now: clock.now });
  store.set('k', 'v', 1);
  clock.advance(1_000);
  assert.equal(store.expire('k', 5), false);
});

// --- TTL: EXISTS, TTL, PERSIST ---

test('EXISTS returns true for live key, false for absent/expired', () => {
  const clock = fakeClock();
  const store = new InMemoryStore({ maxKeys: 100, now: clock.now });
  assert.equal(store.exists('k'), false);
  store.set('k', 'v', 1);
  assert.equal(store.exists('k'), true);
  clock.advance(1000);
  assert.equal(store.exists('k'), false);
});

test('TTL returns remaining seconds, -1 if persistent, -2 if absent/expired', () => {
  const clock = fakeClock();
  const store = new InMemoryStore({ maxKeys: 100, now: clock.now });
  assert.equal(store.ttl('k'), -2);
  store.set('k', 'v');
  assert.equal(store.ttl('k'), -1);
  store.set('k', 'v', 10);
  assert.equal(store.ttl('k'), 10);
  clock.advance(5000);
  assert.equal(store.ttl('k'), 5);
  clock.advance(5000);
  assert.equal(store.ttl('k'), -2);
});

test('PERSIST clears expiry and returns true if an expiry existed', () => {
  const clock = fakeClock();
  const store = new InMemoryStore({ maxKeys: 100, now: clock.now });
  assert.equal(store.persist('k'), false);
  store.set('k', 'v');
  assert.equal(store.persist('k'), false);
  store.set('k', 'v', 10);
  assert.equal(store.persist('k'), true);
  assert.equal(store.ttl('k'), -1);
  clock.advance(20000);
  assert.equal(store.exists('k'), true);
});

test('KEYS matches keys and excludes expired keys', () => {
  const clock = fakeClock();
  const store = new InMemoryStore({ maxKeys: 100, now: clock.now });
  store.set('user:1', 'a');
  store.set('user:2', 'b', 1);
  store.set('admin:1', 'c');
  assert.deepEqual(store.keys('user:*').sort(), ['user:1', 'user:2']);
  assert.deepEqual(store.keys('*'), ['user:1', 'user:2', 'admin:1']);
  clock.advance(1000);
  assert.deepEqual(store.keys('user:*'), ['user:1']);
});

// --- TTL: active sweep ---

test('sweepExpired reclaims expired keys and reports the count', () => {
  const clock = fakeClock();
  const expired: string[] = [];
  const store = new InMemoryStore({ maxKeys: 100, now: clock.now, onExpired: (k) => expired.push(k) });
  store.set('a', '1', 1);
  store.set('b', '2', 1);
  store.set('c', '3'); // no TTL
  clock.advance(1_000);

  const removed = store.sweepExpired(20);
  assert.equal(removed, 2);
  assert.equal(store.size, 1, 'only the un-expiring key remains');
  assert.equal(store.get('c'), '3');
  assert.deepEqual(expired.sort(), ['a', 'b']);
});

// --- LRU eviction ---

test('at max size, inserting a new key evicts the least-recently-used', () => {
  const evicted: string[] = [];
  const store = new InMemoryStore({ maxKeys: 3, onEvicted: (k) => evicted.push(k) });
  store.set('a', '1');
  store.set('b', '2');
  store.set('c', '3'); // full
  store.set('d', '4'); // evicts 'a' (LRU)

  assert.equal(store.size, 3);
  assert.equal(store.get('a'), undefined);
  assert.equal(store.get('b'), '2');
  assert.equal(store.get('d'), '4');
  assert.deepEqual(evicted, ['a']);
});

test('a read refreshes recency, so a touched key survives over a stale one', () => {
  const evicted: string[] = [];
  const store = new InMemoryStore({ maxKeys: 3, onEvicted: (k) => evicted.push(k) });
  store.set('a', '1');
  store.set('b', '2');
  store.set('c', '3');
  store.get('a'); // touch 'a' -> 'b' is now the LRU
  store.set('d', '4'); // evicts 'b'

  assert.equal(store.get('a'), '1', 'recently-read key survived');
  assert.equal(store.get('b'), undefined, 'stale key evicted');
  assert.deepEqual(evicted, ['b']);
});

test('overwriting an existing key does not trigger eviction', () => {
  const evicted: string[] = [];
  const store = new InMemoryStore({ maxKeys: 2, onEvicted: (k) => evicted.push(k) });
  store.set('a', '1');
  store.set('b', '2'); // full
  store.set('a', '1-updated'); // overwrite, not a new key
  assert.equal(store.size, 2);
  assert.deepEqual(evicted, [], 'nothing evicted on overwrite');
  assert.equal(store.get('a'), '1-updated');
  assert.equal(store.get('b'), '2');
});

// --- TTL x LRU interaction ---

test('lazily expiring a key frees an LRU slot (no dangling node blocks a live insert)', () => {
  const clock = fakeClock();
  const evicted: string[] = [];
  const expired: string[] = [];
  const store = new InMemoryStore({
    maxKeys: 2,
    now: clock.now,
    onEvicted: (k) => evicted.push(k),
    onExpired: (k) => expired.push(k),
  });

  store.set('a', '1', 1); // 'a' will expire; it is the LRU
  store.set('b', '2'); // 'b' is live, MRU
  clock.advance(2_000); // 'a' now expired but not yet swept

  // Inserting 'c' is at capacity; the LRU victim 'a' is expired, so it is
  // reclaimed as an expiry (not counted as an eviction), and 'b' survives.
  store.set('c', '3');
  assert.equal(store.get('b'), '2', 'live key not evicted in favour of a stale one');
  assert.equal(store.get('c'), '3');
  assert.equal(store.size, 2);
  assert.deepEqual(expired, ['a'], 'stale victim reported as expired');
  assert.deepEqual(evicted, [], 'no true eviction happened');
});

test('an expired key removed lazily also drops out of the LRU order', () => {
  const clock = fakeClock();
  const evicted: string[] = [];
  const store = new InMemoryStore({ maxKeys: 2, now: clock.now, onEvicted: (k) => evicted.push(k) });

  store.set('stale', 'x', 1); // LRU, expires at t=1_000
  store.set('live', 'y'); // MRU, no TTL
  clock.advance(2_000);

  assert.equal(store.get('stale'), undefined, 'lazy GET removes the expired key');
  assert.equal(store.size, 1, 'and its slot is freed (LRU node gone, not dangling)');

  store.set('x', '1'); // size 1 -> 2, no eviction
  store.set('y', '2'); // at capacity -> evicts the real LRU, which is now "live"

  assert.deepEqual(evicted, ['live'], 'the stale node never resurfaces as a victim');
  assert.equal(store.get('x'), '1');
  assert.equal(store.get('y'), '2');
});

// --- Lists ---

test('LPUSH creates a list and returns its new length', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  const r = store.lpush('l', ['a']);
  assert.deepEqual(r, { ok: true, value: 1 });
  assert.equal(store.keyType('l'), 'list');
});

test('LPUSH pushes onto the head; leftmost argument ends up furthest left', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.lpush('l', ['a', 'b', 'c']); // c pushed last -> head; order is c,b,a
  const r = store.lrange('l', 0, -1);
  assert.deepEqual(r, { ok: true, value: ['c', 'b', 'a'] });
});

test('LPUSH onto an existing list appends to the head and grows the length', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.lpush('l', ['a']);
  const r = store.lpush('l', ['b']);
  assert.deepEqual(r, { ok: true, value: 2 });
  assert.deepEqual(store.lrange('l', 0, -1), { ok: true, value: ['b', 'a'] });
});

test('LPOP removes and returns the head, dropping the key when the list empties', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.lpush('l', ['a', 'b']); // head=b
  assert.deepEqual(store.lpop('l'), { ok: true, value: 'b' });
  assert.deepEqual(store.lpop('l'), { ok: true, value: 'a' });
  assert.deepEqual(store.lpop('l'), { ok: true, value: undefined }, 'empty list -> nil');
  assert.equal(store.keyType('l'), undefined, 'emptied list key is removed');
  assert.equal(store.size, 0);
});

test('LPOP on a missing key returns nil (ok, undefined)', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  assert.deepEqual(store.lpop('nope'), { ok: true, value: undefined });
});

test('LRANGE clamps out-of-range bounds and supports negative indices', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.lpush('l', ['a', 'b', 'c', 'd', 'e']); // stored head->tail: e,d,c,b,a
  assert.deepEqual(store.lrange('l', 0, -1), { ok: true, value: ['e', 'd', 'c', 'b', 'a'] }, 'whole list');
  assert.deepEqual(store.lrange('l', 1, 3), { ok: true, value: ['d', 'c', 'b'] }, 'inner slice');
  assert.deepEqual(store.lrange('l', -2, -1), { ok: true, value: ['b', 'a'] }, 'last two');
  assert.deepEqual(store.lrange('l', 0, 100), { ok: true, value: ['e', 'd', 'c', 'b', 'a'] }, 'stop clamped');
  assert.deepEqual(store.lrange('l', -100, 0), { ok: true, value: ['e'] }, 'start clamped to 0');
});

test('LRANGE with start past stop yields an empty list', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.lpush('l', ['a', 'b', 'c']);
  assert.deepEqual(store.lrange('l', 2, 1), { ok: true, value: [] });
});

test('LRANGE on a missing key yields an empty list', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  assert.deepEqual(store.lrange('nope', 0, -1), { ok: true, value: [] });
});

test('RPUSH pushes onto the tail and returns length', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  const r = store.rpush('l', ['a', 'b']);
  assert.deepEqual(r, { ok: true, value: 2 });
  store.rpush('l', ['c']);
  assert.deepEqual(store.lrange('l', 0, -1), { ok: true, value: ['a', 'b', 'c'] });
});

test('RPOP removes from the tail and returns value', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.rpush('l', ['a', 'b']);
  assert.deepEqual(store.rpop('l'), { ok: true, value: 'b' });
  assert.deepEqual(store.rpop('l'), { ok: true, value: 'a' });
  assert.deepEqual(store.rpop('l'), { ok: true, value: undefined });
});

test('LLEN returns list length', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  assert.deepEqual(store.llen('nope'), { ok: true, value: 0 });
  store.rpush('l', ['a', 'b']);
  assert.deepEqual(store.llen('l'), { ok: true, value: 2 });
});

// --- Hashes ---

test('HSET on a new key returns the count of newly added fields', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  const r = store.hset('h', [['f1', 'v1'], ['f2', 'v2']]);
  assert.deepEqual(r, { ok: true, value: 2 });
  assert.equal(store.keyType('h'), 'hash');
});

test('HSET counts only newly-added fields, not overwrites', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.hset('h', [['f1', 'v1']]);
  // f1 overwritten (not counted), f2 is new (counted) -> 1
  const r = store.hset('h', [['f1', 'v1-updated'], ['f2', 'v2']]);
  assert.deepEqual(r, { ok: true, value: 1 });
  assert.deepEqual(store.hget('h', 'f1'), { ok: true, value: 'v1-updated' }, 'overwrite took effect');
});

test('HGET returns a field value, or nil for a missing field', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.hset('h', [['f1', 'v1']]);
  assert.deepEqual(store.hget('h', 'f1'), { ok: true, value: 'v1' });
  assert.deepEqual(store.hget('h', 'nope'), { ok: true, value: undefined }, 'missing field -> nil');
});

test('HGET on a missing key returns nil (ok, undefined)', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  assert.deepEqual(store.hget('ghost', 'f1'), { ok: true, value: undefined });
});

test('HDEL removes fields and returns count', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.hset('h', [['f1', 'v1'], ['f2', 'v2'], ['f3', 'v3']]);
  assert.deepEqual(store.hdel('h', ['f1', 'f4']), { ok: true, value: 1 });
  assert.deepEqual(store.hdel('h', ['f2', 'f3']), { ok: true, value: 2 });
  assert.equal(store.exists('h'), false);
});

test('HGETALL returns alternating fields and values', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  assert.deepEqual(store.hgetall('nope'), { ok: true, value: [] });
  store.hset('h', [['f1', 'v1'], ['f2', 'v2']]);
  assert.deepEqual(store.hgetall('h'), { ok: true, value: ['f1', 'v1', 'f2', 'v2'] });
});

test('HLEN returns number of fields', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  assert.deepEqual(store.hlen('nope'), { ok: true, value: 0 });
  store.hset('h', [['f1', 'v1'], ['f2', 'v2']]);
  assert.deepEqual(store.hlen('h'), { ok: true, value: 2 });
});

// --- WRONGTYPE: type mismatches in both directions ---

test('string ops against a list/hash key are reported by keyType (WRONGTYPE at the handler)', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.lpush('l', ['a']);
  store.hset('h', [['f', 'v']]);
  // get() itself returns undefined for a non-string kind; the *kind* is what the
  // handler uses to distinguish absent from wrong-type.
  assert.equal(store.get('l'), undefined);
  assert.equal(store.keyType('l'), 'list');
  assert.equal(store.keyType('h'), 'hash');
});

test('list ops against a string key return WRONGTYPE', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.set('s', 'v');
  assert.deepEqual(store.lpush('s', ['a']), { ok: false, error: 'WRONGTYPE' });
  assert.deepEqual(store.lpop('s'), { ok: false, error: 'WRONGTYPE' });
  assert.deepEqual(store.lrange('s', 0, -1), { ok: false, error: 'WRONGTYPE' });
});

test('list ops against a hash key return WRONGTYPE', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.hset('h', [['f', 'v']]);
  assert.deepEqual(store.lpush('h', ['a']), { ok: false, error: 'WRONGTYPE' });
  assert.deepEqual(store.lpop('h'), { ok: false, error: 'WRONGTYPE' });
  assert.deepEqual(store.lrange('h', 0, -1), { ok: false, error: 'WRONGTYPE' });
});

test('hash ops against a string key return WRONGTYPE', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.set('s', 'v');
  assert.deepEqual(store.hset('s', [['f', 'v']]), { ok: false, error: 'WRONGTYPE' });
  assert.deepEqual(store.hget('s', 'f'), { ok: false, error: 'WRONGTYPE' });
});

test('hash ops against a list key return WRONGTYPE', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.lpush('l', ['a']);
  assert.deepEqual(store.hset('l', [['f', 'v']]), { ok: false, error: 'WRONGTYPE' });
  assert.deepEqual(store.hget('l', 'f'), { ok: false, error: 'WRONGTYPE' });
});

test('a WRONGTYPE-rejected op does not mutate the existing value', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.set('s', 'original');
  store.lpush('s', ['a']); // rejected
  store.hset('s', [['f', 'v']]); // rejected
  assert.equal(store.get('s'), 'original', 'string value untouched by rejected ops');
  assert.equal(store.keyType('s'), 'string');
});

test('SET overwrites a list or hash key with a string (Redis-faithful, no WRONGTYPE)', () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  store.lpush('l', ['a', 'b']);
  store.set('l', 'now-a-string'); // allowed
  assert.equal(store.keyType('l'), 'string');
  assert.equal(store.get('l'), 'now-a-string');

  store.hset('h', [['f', 'v']]);
  store.set('h', 'also-a-string');
  assert.equal(store.keyType('h'), 'string');
  assert.equal(store.get('h'), 'also-a-string');
});

// --- TTL and LRU apply to list/hash keys the same as strings (key-level) ---

test('EXPIRE + lazy expiry work on a list key just like a string key', () => {
  const clock = fakeClock();
  const expired: string[] = [];
  const store = new InMemoryStore({ maxKeys: 100, now: clock.now, onExpired: (k) => expired.push(k) });
  store.lpush('l', ['a', 'b']);
  assert.equal(store.expire('l', 5), true);
  clock.advance(4_999);
  assert.deepEqual(store.lrange('l', 0, -1), { ok: true, value: ['b', 'a'] }, 'live before deadline');
  clock.advance(1);
  assert.deepEqual(store.lrange('l', 0, -1), { ok: true, value: [] }, 'gone at the deadline');
  assert.equal(store.keyType('l'), undefined);
  assert.deepEqual(expired, ['l'], 'onExpired fired for the list key');
});

test('a hash key expires via the active sweep like any other key', () => {
  const clock = fakeClock();
  const expired: string[] = [];
  const store = new InMemoryStore({ maxKeys: 100, now: clock.now, onExpired: (k) => expired.push(k) });
  store.hset('h', [['f', 'v']]);
  store.expire('h', 1);
  clock.advance(1_000);
  assert.equal(store.sweepExpired(20), 1, 'sweep reclaimed the hash key');
  assert.equal(store.size, 0);
  assert.deepEqual(expired, ['h']);
});

test('LRU eviction treats list/hash keys identically to string keys', () => {
  const evicted: string[] = [];
  const store = new InMemoryStore({ maxKeys: 3, onEvicted: (k) => evicted.push(k) });
  store.lpush('list', ['x']); // key 1
  store.hset('hash', [['f', 'v']]); // key 2
  store.set('str', 'v'); // key 3 -> full; LRU order: list, hash, str
  store.set('new', 'v'); // evicts 'list' (the LRU)

  assert.equal(store.size, 3);
  assert.equal(store.keyType('list'), undefined, 'LRU list key evicted');
  assert.equal(store.keyType('hash'), 'hash');
  assert.deepEqual(evicted, ['list']);
});

test('reading a list/hash key refreshes its recency so it survives eviction', () => {
  const evicted: string[] = [];
  const store = new InMemoryStore({ maxKeys: 3, onEvicted: (k) => evicted.push(k) });
  store.lpush('list', ['x']);
  store.hset('hash', [['f', 'v']]);
  store.set('str', 'v'); // full; LRU order: list, hash, str
  store.lrange('list', 0, -1); // touch 'list' -> hash becomes LRU
  store.set('new', 'v'); // evicts 'hash'

  assert.equal(store.keyType('list'), 'list', 'touched list survived');
  assert.equal(store.keyType('hash'), undefined, 'stale hash evicted');
  assert.deepEqual(evicted, ['hash']);
});
