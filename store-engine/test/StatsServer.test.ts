import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { InMemoryStore } from '../src/store/InMemoryStore.js';
import { StatsServer } from '../src/server/StatsServer.js';
import { CommandHandler } from '../src/server/CommandHandler.js';
import type { Snapshot } from '../src/server/StatsServer.js';

test('StatsServer broadcasts snapshots over WS', async (t) => {
  const store = new InMemoryStore({ maxKeys: 100 });
  const server = new StatsServer(store, '127.0.0.1', 0, 100);
  await server.start();
  
  t.after(async () => {
    await server.stop();
  });

  store.set('k1', 'v1');
  store.lpush('l1', ['a']);
  store.set('k2', 'v2', 10);

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  await once(ws, 'open');

  // Should receive initial snapshot upon connection
  const [msg1] = await once(ws, 'message');
  const snap1 = JSON.parse(msg1.toString()) as Snapshot;
  
  assert.equal(snap1.size, 3);
  assert.equal(snap1.maxKeys, 100);
  assert.equal(snap1.evictions, 0);
  // LRU order: k2, l1, k1 (most recently used is k2)
  assert.deepEqual(snap1.keys.map(k => k.name), ['k2', 'l1', 'k1']);
  
  const k1Stat = snap1.keys.find(k => k.name === 'k1');
  assert.equal(k1Stat?.type, 'string');
  assert.equal(k1Stat?.ttl, -1);

  const k2Stat = snap1.keys.find(k => k.name === 'k2');
  assert.equal(k2Stat?.type, 'string');
  assert.equal(k2Stat?.ttl, 10);

  const l1Stat = snap1.keys.find(k => k.name === 'l1');
  assert.equal(l1Stat?.type, 'list');
  assert.equal(l1Stat?.ttl, -1);

  // Now wait for an interval broadcast
  store.set('k3', 'v3');
  const [msg2] = await once(ws, 'message');
  const snap2 = JSON.parse(msg2.toString()) as Snapshot;
  
  assert.equal(snap2.size, 4);
  assert.deepEqual(snap2.keys.map(k => k.name), ['k3', 'k2', 'l1', 'k1']);

  ws.close();
});

test('StatsServer handles playground websocket connections', async (t) => {
  const store = new InMemoryStore({ maxKeys: 100 });
  const handler = new CommandHandler(store);
  const server = new StatsServer(store, '127.0.0.1', 0, 1000, handler);

  await server.start();
  
  t.after(async () => {
    await server.stop();
  });

  await t.test('executes a command via playground ws', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/playground`);
    await once(ws, 'open');
    ws.send('SET foo bar');
    const [msg] = await once(ws, 'message');
    assert.equal(msg.toString(), '+OK\r\n');
    assert.equal(store.get('foo'), 'bar');
    ws.close();
  });

  await t.test('enforces max command length', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/playground`);
    await once(ws, 'open');
    const big = 'a'.repeat(1025);
    ws.send(`SET big ${big}`);
    const [msg] = await once(ws, 'message');
    assert.equal(msg.toString(), '-ERR command too long\r\n');
    ws.close();
  });
});
