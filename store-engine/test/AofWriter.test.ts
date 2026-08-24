import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { InMemoryStore } from '../src/store/InMemoryStore.js';
import { AofWriter } from '../src/store/AofWriter.js';

test('AofWriter writes lines immediately and batches fsync with everysec', async (t) => {
  const aofPath = path.join(process.cwd(), 'test-everysec.aof');
  
  t.after(() => {
    try { fs.unlinkSync(aofPath); } catch {}
  });

  const writer = new AofWriter(aofPath, 'everysec');
  writer.start();

  writer.write('SET k1 v1');
  writer.write('SET k2 v2 EX 10');

  // Verify file has the lines right away
  const content = fs.readFileSync(aofPath, 'utf-8');
  assert.equal(content, 'SET k1 v1\nSET k2 v2 EX 10\n');

  writer.stop();
});

test('AofWriter rewrite compacts the store', async (t) => {
  const aofPath = path.join(process.cwd(), 'test-rewrite.aof');
  
  t.after(() => {
    try { fs.unlinkSync(aofPath); } catch {}
  });

  const store = new InMemoryStore({ maxKeys: 100 });
  store.set('k1', 'v1');
  store.set('k2', 'v2', 10);
  store.rpush('l1', ['a', 'b']);

  const writer = new AofWriter(aofPath, 'always');
  writer.start();

  // Initially we just write some junk that isn't the compact state
  writer.write('SET k1 v1');
  writer.write('DEL k1');
  writer.write('SET k1 v1');

  await writer.rewrite(store);
  writer.stop();

  const content = fs.readFileSync(aofPath, 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  
  assert.ok(lines.includes('SET k1 v1'));
  // TTL might have dropped by 1 second during test, so we match prefix
  assert.ok(lines.some(l => l.startsWith('SET k2 v2 EX ')));
  assert.ok(lines.includes('RPUSH l1 a b'));
  // Ensure the old DEL is gone
  assert.ok(!lines.includes('DEL k1'));
});
