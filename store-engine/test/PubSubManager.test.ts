import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PubSubManager } from '../src/server/PubSubManager.js';
import type { ClientConnection } from '../src/server/TcpServer.js';
import { reply } from '@ministore/protocol';

function createMockConnection(id: string): ClientConnection & { writes: string[] } {
  return {
    id,
    writes: [],
    write(data: string) {
      this.writes.push(data);
    }
  };
}

test('PubSubManager - subscribe and publish', (t) => {
  const manager = new PubSubManager();
  const conn1 = createMockConnection('c1');
  const conn2 = createMockConnection('c2');

  const replies1 = manager.subscribe(conn1, ['news', 'sports']);
  assert.equal(replies1.length, 2);
  assert.equal(replies1[0], reply.subscribe('news', 1));
  assert.equal(replies1[1], reply.subscribe('sports', 2));

  assert.ok(manager.isSubscribed(conn1));
  assert.equal(manager.isSubscribed(conn2), false);

  const replies2 = manager.subscribe(conn2, ['news']);
  assert.equal(replies2.length, 1);
  assert.equal(replies2[0], reply.subscribe('news', 1));

  // Publish to 'news' (both should get it)
  const countNews = manager.publish('news', 'hello news');
  assert.equal(countNews, 2);
  assert.equal(conn1.writes.length, 1);
  assert.equal(conn2.writes.length, 1);
  assert.equal(conn1.writes[0], reply.pushMessage('news', 'hello news'));
  assert.equal(conn2.writes[0], reply.pushMessage('news', 'hello news'));

  // Publish to 'sports' (only c1 should get it)
  const countSports = manager.publish('sports', 'hello sports');
  assert.equal(countSports, 1);
  assert.equal(conn1.writes.length, 2);
  assert.equal(conn2.writes.length, 1);
  assert.equal(conn1.writes[1], reply.pushMessage('sports', 'hello sports'));

  // Publish to 'none' (nobody gets it)
  const countNone = manager.publish('none', 'hello');
  assert.equal(countNone, 0);
});

test('PubSubManager - unsubscribe', (t) => {
  const manager = new PubSubManager();
  const conn = createMockConnection('c1');

  manager.subscribe(conn, ['ch1', 'ch2', 'ch3']);
  assert.ok(manager.isSubscribed(conn));

  // Unsubscribe from one channel
  const replies1 = manager.unsubscribe(conn, ['ch2']);
  assert.equal(replies1.length, 1);
  assert.equal(replies1[0], reply.unsubscribe('ch2', 2));
  assert.ok(manager.isSubscribed(conn));

  // Unsubscribe from all
  const replies2 = manager.unsubscribe(conn);
  assert.equal(replies2.length, 2);
  assert.equal(replies2[0], reply.unsubscribe('ch1', 1));
  assert.equal(replies2[1], reply.unsubscribe('ch3', 0));
  assert.equal(manager.isSubscribed(conn), false);

  // Unsubscribe when not subscribed
  const replies3 = manager.unsubscribe(conn, ['ch1']);
  assert.equal(replies3.length, 1);
  assert.equal(replies3[0], reply.unsubscribe('ch1', 0));
});

test('PubSubManager - removeConnection', (t) => {
  const manager = new PubSubManager();
  const conn1 = createMockConnection('c1');
  const conn2 = createMockConnection('c2');

  manager.subscribe(conn1, ['ch1']);
  manager.subscribe(conn2, ['ch1']);

  manager.removeConnection(conn1);
  assert.equal(manager.isSubscribed(conn1), false);
  
  const count = manager.publish('ch1', 'msg');
  assert.equal(count, 1);
  assert.equal(conn2.writes.length, 1);
  assert.equal(conn1.writes.length, 0);
});
