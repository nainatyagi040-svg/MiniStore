import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LRUTracker } from '../src/store/LRUTracker.js';

test('a fresh tracker is empty', () => {
  const lru = new LRUTracker();
  assert.equal(lru.size, 0);
  assert.equal(lru.peekLRU(), undefined);
  assert.equal(lru.evictLRU(), undefined);
});

test('touch inserts new keys; oldest-inserted is the LRU', () => {
  const lru = new LRUTracker();
  lru.touch('a');
  lru.touch('b');
  lru.touch('c');
  assert.equal(lru.size, 3);
  assert.equal(lru.peekLRU(), 'a');
});

test('re-touching a key promotes it to most-recently-used', () => {
  const lru = new LRUTracker();
  lru.touch('a');
  lru.touch('b');
  lru.touch('c');
  lru.touch('a'); // a is now MRU, b becomes the LRU
  assert.equal(lru.peekLRU(), 'b');
});

test('evictLRU removes and returns keys in least-recently-used order', () => {
  const lru = new LRUTracker();
  lru.touch('a');
  lru.touch('b');
  lru.touch('c');
  lru.touch('a'); // recency order (LRU->MRU): b, c, a
  assert.equal(lru.evictLRU(), 'b');
  assert.equal(lru.evictLRU(), 'c');
  assert.equal(lru.evictLRU(), 'a');
  assert.equal(lru.evictLRU(), undefined);
  assert.equal(lru.size, 0);
});

test('touching the current MRU again is a no-op for order', () => {
  const lru = new LRUTracker();
  lru.touch('a');
  lru.touch('b');
  lru.touch('b'); // already MRU
  assert.equal(lru.peekLRU(), 'a');
});

test('delete removes an interior node without corrupting the list', () => {
  const lru = new LRUTracker();
  lru.touch('a');
  lru.touch('b');
  lru.touch('c'); // LRU->MRU: a, b, c
  assert.equal(lru.delete('b'), true);
  assert.equal(lru.has('b'), false);
  assert.equal(lru.size, 2);
  // Remaining order intact: a is still LRU, c still MRU.
  assert.equal(lru.evictLRU(), 'a');
  assert.equal(lru.evictLRU(), 'c');
});

test('delete of the head (MRU) re-points head correctly', () => {
  const lru = new LRUTracker();
  lru.touch('a');
  lru.touch('b'); // b is head/MRU
  assert.equal(lru.delete('b'), true);
  lru.touch('c'); // c becomes MRU; LRU->MRU: a, c
  assert.equal(lru.evictLRU(), 'a');
  assert.equal(lru.evictLRU(), 'c');
});

test('delete of the tail (LRU) re-points tail correctly', () => {
  const lru = new LRUTracker();
  lru.touch('a'); // tail/LRU
  lru.touch('b');
  assert.equal(lru.delete('a'), true);
  assert.equal(lru.peekLRU(), 'b');
});

test('delete of a missing key reports false', () => {
  const lru = new LRUTracker();
  lru.touch('a');
  assert.equal(lru.delete('zzz'), false);
});

test('delete then re-touch places the key at MRU', () => {
  const lru = new LRUTracker();
  lru.touch('a');
  lru.touch('b');
  lru.delete('a');
  lru.touch('a'); // a re-enters as MRU; LRU->MRU: b, a
  assert.equal(lru.peekLRU(), 'b');
});

test('single-element list: delete empties head and tail together', () => {
  const lru = new LRUTracker();
  lru.touch('only');
  assert.equal(lru.delete('only'), true);
  assert.equal(lru.size, 0);
  assert.equal(lru.peekLRU(), undefined);
  // list is genuinely empty and still usable
  lru.touch('again');
  assert.equal(lru.peekLRU(), 'again');
});
