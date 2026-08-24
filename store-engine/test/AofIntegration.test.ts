import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { InMemoryStore } from '../src/store/InMemoryStore.js';
import { CommandHandler } from '../src/server/CommandHandler.js';
import { AofWriter } from '../src/store/AofWriter.js';

test('AOF Integration: writes, ungraceful crash, restart and recovery', async (t) => {
  const aofPath = path.join(process.cwd(), 'test-integration.aof');
  
  t.after(() => {
    try { fs.unlinkSync(aofPath); } catch {}
  });

  // 1. Start "Server"
  const store1 = new InMemoryStore({ maxKeys: 100 });
  const aof1 = new AofWriter(aofPath, 'always');
  aof1.start();
  const handler1 = new CommandHandler(store1, undefined, aof1);

  const dummyConn = { id: 'dummy', write: () => {} };

  // 2. Write data
  handler1.handleLine('SET s1 v1', dummyConn);
  handler1.handleLine('SET s2 v2 EX 10', dummyConn);
  handler1.handleLine('LPUSH l1 a b c', dummyConn);
  handler1.handleLine('HSET h1 f1 x f2 y', dummyConn);
  handler1.handleLine('DEL s1', dummyConn);
  handler1.handleLine('EXPIRE h1 20', dummyConn);

  // 3. "Crash" ungracefully
  // We stop aof1 just to close the fd so the test doesn't leak file handles,
  // but we don't save a dump.json (snapshot).
  aof1.stop();

  // 4. Restart server from AOF
  const store2 = new InMemoryStore({ maxKeys: 100 });
  
  if (fs.existsSync(aofPath)) {
    const rl = readline.createInterface({
      input: fs.createReadStream(aofPath),
      crlfDelay: Infinity
    });
    const replayHandler = new CommandHandler(store2);
    for await (const line of rl) {
      if (line.trim().length > 0) {
        replayHandler.handleLine(line, dummyConn);
      }
    }
  }

  // 5. Verify state
  assert.equal(store2.get('s1'), undefined, 's1 should be deleted');
  assert.equal(store2.get('s2'), 'v2');
  
  const l1 = store2.lrange('l1', 0, -1);
  assert.deepEqual(l1, { ok: true, value: ['c', 'b', 'a'] });
  
  const h1 = store2.hgetall('h1');
  assert.deepEqual(h1, { ok: true, value: ['f1', 'x', 'f2', 'y'] });
  
  assert.ok(store2.ttl('s2') > 0);
  assert.ok(store2.ttl('h1') > 0);
});
