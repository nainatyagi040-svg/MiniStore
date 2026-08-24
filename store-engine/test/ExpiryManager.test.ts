import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExpiryManager } from '../src/store/ExpiryManager.js';

test('a key with no expiry is never expired and has undefined remaining', () => {
  const em = new ExpiryManager();
  assert.equal(em.has('k'), false);
  assert.equal(em.isExpired('k', 1_000), false);
  assert.equal(em.remainingMs('k', 1_000), undefined);
});

test('isExpired flips exactly at the deadline (>= is expired)', () => {
  const em = new ExpiryManager();
  em.set('k', 1_000);
  assert.equal(em.isExpired('k', 999), false);
  assert.equal(em.isExpired('k', 1_000), true, 'expiry is inclusive at the deadline');
  assert.equal(em.isExpired('k', 1_001), true);
});

test('remainingMs counts down and never goes negative', () => {
  const em = new ExpiryManager();
  em.set('k', 1_000);
  assert.equal(em.remainingMs('k', 400), 600);
  assert.equal(em.remainingMs('k', 1_000), 0);
  assert.equal(em.remainingMs('k', 5_000), 0);
});

test('set overwrites an existing deadline without duplicating tracking', () => {
  const em = new ExpiryManager();
  em.set('k', 1_000);
  em.set('k', 2_000);
  assert.equal(em.size, 1);
  assert.equal(em.isExpired('k', 1_500), false);
  assert.equal(em.isExpired('k', 2_000), true);
});

test('clear removes a deadline and reports whether one existed', () => {
  const em = new ExpiryManager();
  em.set('k', 1_000);
  assert.equal(em.clear('k'), true);
  assert.equal(em.has('k'), false);
  assert.equal(em.size, 0);
  assert.equal(em.clear('k'), false);
});

test('clear uses swap-remove but keeps every other key trackable', () => {
  const em = new ExpiryManager();
  em.set('a', 10);
  em.set('b', 20);
  em.set('c', 30);
  assert.equal(em.clear('a'), true); // 'c' swaps into a's slot internally
  assert.equal(em.size, 2);
  // b and c must still be individually clearable (positions stayed consistent)
  assert.equal(em.clear('c'), true);
  assert.equal(em.clear('b'), true);
  assert.equal(em.size, 0);
});

test('collectExpired returns only keys past the deadline, without mutating', () => {
  const em = new ExpiryManager();
  em.set('a', 100);
  em.set('b', 200);
  em.set('c', 300);
  const expired = em.collectExpired(250, 10);
  assert.deepEqual(expired.sort(), ['a', 'b']);
  // Non-mutating: c remains, and a/b are still tracked until the caller clears them.
  assert.equal(em.size, 3);
});

test('collectExpired examines at most `limit` keys per call', () => {
  const em = new ExpiryManager();
  for (let i = 0; i < 100; i++) em.set(`k${i}`, 10); // all long-expired at now=1000
  const first = em.collectExpired(1_000, 20);
  assert.equal(first.length, 20, 'bounded to the sample size, not the whole keyspace');
});

test('collectExpired advances a rotating cursor across successive calls', () => {
  const em = new ExpiryManager();
  for (let i = 0; i < 10; i++) em.set(`k${i}`, 10); // all expired at now=1000
  const seen = new Set<string>();
  // Five calls of size 2 should, without any clearing, walk all 10 distinct keys once.
  for (let call = 0; call < 5; call++) {
    for (const k of em.collectExpired(1_000, 2)) seen.add(k);
  }
  assert.equal(seen.size, 10, 'cursor rotated through the full keyspace');
});

test('collectExpired on an empty manager returns nothing', () => {
  const em = new ExpiryManager();
  assert.deepEqual(em.collectExpired(1_000, 20), []);
});

test('collectExpired with non-positive limit returns nothing', () => {
  const em = new ExpiryManager();
  em.set('a', 10);
  assert.deepEqual(em.collectExpired(1_000, 0), []);
});
