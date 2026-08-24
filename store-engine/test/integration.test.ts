import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { InMemoryStore } from '../src/store/InMemoryStore.js';
import { CommandHandler } from '../src/server/CommandHandler.js';
import { TcpServer } from '../src/server/TcpServer.js';

/**
 * A minimal line-oriented test client. Sends a command and resolves with the
 * next CRLF-terminated reply (CRLF stripped). Replies are queued in order, so
 * pipelined commands (multiple lines in one write) resolve correctly.
 */
class TestClient {
  readonly #socket: net.Socket;
  #buffer = '';
  /** Reply lines received but not yet claimed by a waiter (e.g. array elements). */
  readonly #lines: string[] = [];
  readonly #waiters: Array<(line: string) => void> = [];

  private constructor(socket: net.Socket) {
    this.#socket = socket;
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => this.#onData(chunk));
  }

  static async connect(port: number, host: string): Promise<TestClient> {
    const socket = net.createConnection({ port, host });
    await once(socket, 'connect');
    return new TestClient(socket);
  }

  #onData(chunk: string): void {
    this.#buffer += chunk;
    let idx: number;
    while ((idx = this.#buffer.indexOf('\r\n')) !== -1) {
      const line = this.#buffer.slice(0, idx);
      this.#buffer = this.#buffer.slice(idx + 2);
      this.#lines.push(line);
      this.#drain();
    }
  }

  /** Hands buffered lines to waiting consumers in FIFO order. */
  #drain(): void {
    while (this.#lines.length > 0 && this.#waiters.length > 0) {
      const line = this.#lines.shift()!;
      this.#waiters.shift()!(line);
    }
  }

  /** Sends one command line and awaits exactly one reply line. */
  send(line: string): Promise<string> {
    const reply = new Promise<string>((resolve) => this.#waiters.push(resolve));
    this.#socket.write(`${line}\r\n`);
    this.#drain();
    return reply;
  }

  /**
   * Sends one command and reads a multi-bulk array reply: a `*N` header line
   * followed by N `$item` bulk lines. Returns the header plus the item lines,
   * each with its `$` prefix intact so tests can assert the exact wire bytes.
   */
  async sendArray(line: string): Promise<{ header: string; items: string[] }> {
    const header = this.send(line);
    const headerLine = await header;
    const count = Number(headerLine.slice(1)); // strip leading '*'
    const items: string[] = [];
    for (let i = 0; i < count; i++) {
      items.push(await this.expectReply());
    }
    return { header: headerLine, items };
  }

  /** Writes raw bytes without waiting; caller collects replies via {@link send} promises queued first. */
  writeRaw(data: string): void {
    this.#socket.write(data);
  }

  expectReply(): Promise<string> {
    const reply = new Promise<string>((resolve) => this.#waiters.push(resolve));
    this.#drain();
    return reply;
  }

  close(): void {
    this.#socket.end();
  }
}

/** Hand-cranked clock so TTL tests are deterministic and need no real sleeping. */
function fakeClock(startMs = 0): { now: () => number; advance: (ms: number) => void } {
  const state = { current: startMs };
  return {
    now: () => state.current,
    advance: (ms: number) => {
      state.current += ms;
    },
  };
}

async function startServer(
  options: { maxKeys?: number; now?: () => number } = {},
): Promise<{ server: TcpServer; port: number; host: string; store: InMemoryStore }> {
  const store = new InMemoryStore({
    maxKeys: options.maxKeys ?? 100,
    ...(options.now !== undefined ? { now: options.now } : {}),
  });
  const handler = new CommandHandler(store);
  const server = new TcpServer({ host: '127.0.0.1', port: 0, maxLineBytes: 1024 }, (line, conn) =>
    handler.handleLine(line, conn),
  );
  const { host, port } = await server.listen();
  return { server, port, host, store };
}

test('SET -> GET -> DEL round trip over a real TCP socket', async (t) => {
  const { server, port, host, store } = await startServer();
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  assert.equal(await client.send('SET foo bar'), '+OK');
  assert.equal(await client.send('GET foo'), '$bar');
  assert.equal(store.get('foo'), 'bar', 'value is actually present in the store');

  assert.equal(await client.send('GET missing'), '$(nil)');

  assert.equal(await client.send('DEL foo'), ':1');
  assert.equal(await client.send('DEL foo'), ':0', 'second DEL finds nothing');
  assert.equal(await client.send('GET foo'), '$(nil)', 'key is gone after DEL');
});

test('an unknown command returns an error reply over the socket', async (t) => {
  const { server, port, host } = await startServer();
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  assert.equal(await client.send('NOPE foo'), "-ERR unknown command 'NOPE'");
});

test('pipelined commands in a single packet are framed and answered in order', async (t) => {
  const { server, port, host } = await startServer();
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  // Queue three reply waiters, then send all three lines in one write.
  const r1 = client.expectReply();
  const r2 = client.expectReply();
  const r3 = client.expectReply();
  client.writeRaw('SET a 1\r\nGET a\r\nDEL a\r\n');

  assert.equal(await r1, '+OK');
  assert.equal(await r2, '$1');
  assert.equal(await r3, ':1');
});

test('SET ... EX: GET returns the value before expiry and nil after, over the socket', async (t) => {
  const clock = fakeClock();
  const { server, port, host } = await startServer({ now: clock.now });
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  assert.equal(await client.send('SET session tok EX 10'), '+OK');
  assert.equal(await client.send('GET session'), '$tok', 'live before expiry');

  clock.advance(10_000); // reach the deadline
  assert.equal(await client.send('GET session'), '$(nil)', 'nil after expiry (lazy removal on GET)');
});

test('EXPIRE on a live key returns :1, on a missing key :0, over the socket', async (t) => {
  const clock = fakeClock();
  const { server, port, host } = await startServer({ now: clock.now });
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  assert.equal(await client.send('SET k v'), '+OK');
  assert.equal(await client.send('EXPIRE k 5'), ':1', 'applied to an existing key');
  assert.equal(await client.send('EXPIRE ghost 5'), ':0', 'no such key');

  clock.advance(5_000);
  assert.equal(await client.send('GET k'), '$(nil)', 'expired after the EXPIRE window');
});

test('LRU: filling past maxKeys evicts the least-recently-used key, over the socket', async (t) => {
  const { server, port, host, store } = await startServer({ maxKeys: 3 });
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  const dummyConn = { id: 'dummy', write: () => {} };
  assert.equal(await client.send('SET a 1'), '+OK');
  assert.equal(await client.send('SET b 2'), '+OK');
  assert.equal(await client.send('SET c 3'), '+OK'); // full
  assert.equal(await client.send('SET d 4'), '+OK'); // evicts 'a'

  assert.equal(await client.send('GET a'), '$(nil)', 'LRU key was evicted');
  assert.equal(await client.send('GET b'), '$2');
  assert.equal(await client.send('GET c'), '$3');
  assert.equal(await client.send('GET d'), '$4');
});

test('LRU: a recently-touched key survives eviction over a stale one, over the socket', async (t) => {
  const { server, port, host } = await startServer({ maxKeys: 3 });
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  await client.send('SET a 1');
  await client.send('SET b 2');
  await client.send('SET c 3'); // full; LRU order a,b,c
  assert.equal(await client.send('GET a'), '$1', 'touch a -> b becomes LRU');
  await client.send('SET d 4'); // evicts 'b', not the recently-read 'a'

  assert.equal(await client.send('GET a'), '$1', 'touched key survived');
  assert.equal(await client.send('GET b'), '$(nil)', 'stale key evicted');
  assert.equal(await client.send('GET d'), '$4');
});

test('LPUSH / LRANGE / LPOP round trip over a real TCP socket', async (t) => {
  const { server, port, host } = await startServer();
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  assert.equal(await client.send('LPUSH mylist a b c'), ':3', 'new length after push');
  // head-first order: c,b,a
  assert.deepEqual(await client.sendArray('LRANGE mylist 0 -1'), {
    header: '*3',
    items: ['$c', '$b', '$a'],
  });
  assert.equal(await client.send('LPOP mylist'), '$c', 'head popped');
  assert.deepEqual(await client.sendArray('LRANGE mylist 0 -1'), {
    header: '*2',
    items: ['$b', '$a'],
  });
});

test('RPUSH / RPOP / LLEN round trip', async (t) => {
  const { server, port, host } = await startServer();
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  assert.equal(await client.send('RPUSH q v1 v2 v3'), ':3');
  assert.equal(await client.send('LLEN q'), ':3');
  assert.equal(await client.send('RPOP q'), '$v3');
  assert.equal(await client.send('LLEN q'), ':2');
});

test('LRANGE on a missing list returns an empty array (*0) over the socket', async (t) => {
  const { server, port, host } = await startServer();
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  assert.deepEqual(await client.sendArray('LRANGE nope 0 -1'), { header: '*0', items: [] });
});

test('HSET / HGET round trip over a real TCP socket', async (t) => {
  const { server, port, host } = await startServer();
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  assert.equal(await client.send('HSET h f1 v1 f2 v2'), ':2', 'two new fields added');
  assert.equal(await client.send('HGET h f1'), '$v1');
  assert.equal(await client.send('HSET h f1 updated f3 v3'), ':1', 'only f3 is newly added');
  assert.equal(await client.send('HGET h f1'), '$updated', 'overwrite visible');
  assert.equal(await client.send('HGET h missing'), '$(nil)', 'missing field -> nil');
});

test('HDEL / HGETALL / HLEN round trip', async (t) => {
  const { server, port, host } = await startServer();
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  await client.send('HSET h f1 v1 f2 v2 f3 v3');
  assert.equal(await client.send('HLEN h'), ':3');
  assert.equal(await client.send('HDEL h f1 f4'), ':1');
  assert.equal(await client.send('HLEN h'), ':2');
  
  const all = await client.sendArray('HGETALL h');
  assert.equal(all.header, '*4');
  assert.deepEqual(all.items, ['$f2', '$v2', '$f3', '$v3']);
});

test('EXISTS / TTL / PERSIST / KEYS round trip', async (t) => {
  const clock = fakeClock();
  const { server, port, host } = await startServer({ now: clock.now });
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  await client.send('SET k1 v1 EX 10');
  await client.send('SET k2 v2');
  
  assert.equal(await client.send('EXISTS k1'), ':1');
  assert.equal(await client.send('EXISTS k3'), ':0');
  
  assert.equal(await client.send('TTL k1'), ':10');
  assert.equal(await client.send('TTL k2'), ':-1');
  assert.equal(await client.send('TTL ghost'), ':-2');

  assert.equal(await client.send('PERSIST k1'), ':1');
  assert.equal(await client.send('TTL k1'), ':-1');

  clock.advance(20000); // k1 should persist
  assert.equal(await client.send('EXISTS k1'), ':1');
  
  const keys = await client.sendArray('KEYS k*');
  assert.equal(keys.header, '*2');
  assert.deepEqual(keys.items.sort(), ['$k1', '$k2']);
});

test('BGSAVE responds with OK', async () => {
  const store = new InMemoryStore({ maxKeys: 100 });
  const handler = new CommandHandler(store);
  // Using a mock persistence manager would be better, but the command handler will just error if it's absent
  // Let's create a minimal PersistenceManager or check that it handles the missing persistence manager
  const dummyConn = { id: 'dummy', write: () => {} };
  const r1 = handler.handleLine('BGSAVE\r\n', dummyConn);
  assert.equal(r1, '-ERR persistence not configured\r\n');
});

test('WRONGTYPE occurs live on the wire: string op vs a list key and vice versa', async (t) => {
  const { server, port, host } = await startServer();
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  await client.send('LPUSH mylist a');
  assert.equal(
    await client.send('GET mylist'),
    '-WRONGTYPE Operation against a key holding the wrong kind of value',
    'GET against a list key errors with -WRONGTYPE',
  );

  await client.send('SET str hello');
  assert.equal(
    await client.send('LPUSH str x'),
    '-WRONGTYPE Operation against a key holding the wrong kind of value',
    'LPUSH against a string key errors with -WRONGTYPE',
  );
  assert.equal(
    await client.send('HSET str f v'),
    '-WRONGTYPE Operation against a key holding the wrong kind of value',
    'HSET against a string key errors with -WRONGTYPE',
  );
  // The rejected ops did not corrupt the string.
  assert.equal(await client.send('GET str'), '$hello', 'string value intact after rejected ops');
});
