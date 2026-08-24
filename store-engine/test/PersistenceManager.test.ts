import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { InMemoryStore } from '../src/store/InMemoryStore.js';
import { PersistenceManager } from '../src/store/PersistenceManager.js';

test('PersistenceManager round trips data and skips expired', async (t) => {
  const dumpPath = path.join(process.cwd(), 'test-dump.json');
  
  // Cleanup
  t.after(async () => {
    try { await fs.unlink(dumpPath); } catch {}
  });

  const store1 = new InMemoryStore({ maxKeys: 100 });
  const pm1 = new PersistenceManager(store1, dumpPath, 60000);

  // Write some data
  store1.set('s1', 'hello');
  store1.set('s2', 'world', 10);
  store1.set('s3', 'gone', 0); // immediately expired if clock ticks, let's just make it expire soon and wait
  store1.rpush('l1', ['a', 'b']);
  store1.hset('h1', [['f1', 'v1']]);

  // wait a tiny bit and advance time to make s3 expired? The store's TTL logic already uses real time, but let's just use manual `expire` with 0
  store1.expire('s3', 0); // now it is expired

  // Snapshot
  await pm1.save();

  // Verify file was created
  const stat = await fs.stat(dumpPath);
  assert.ok(stat.size > 0);

  // Load into new store
  const store2 = new InMemoryStore({ maxKeys: 100 });
  const pm2 = new PersistenceManager(store2, dumpPath, 60000);

  const restored = await pm2.restore();
  
  assert.equal(restored, 4); // s1, s2, l1, h1 (s3 was expired)
  assert.equal(store2.get('s1'), 'hello');
  assert.equal(store2.get('s3'), undefined); // expired
  
  const ttl2 = store2.ttl('s2');
  assert.ok(ttl2 > 0 && ttl2 <= 10, 'TTL should be preserved');

  const l1 = store2.lrange('l1', 0, -1);
  assert.deepEqual(l1, { ok: true, value: ['a', 'b'] });

  const h1 = store2.hgetall('h1');
  assert.deepEqual(h1, { ok: true, value: ['f1', 'v1'] });
});

test('PersistenceManager handles missing file gracefully on restore', async () => {
  const dumpPath = path.join(process.cwd(), 'non-existent-dump.json');
  const store = new InMemoryStore({ maxKeys: 100 });
  const pm = new PersistenceManager(store, dumpPath, 60000);
  
  const restored = await pm.restore();
  assert.equal(restored, 0);
});
