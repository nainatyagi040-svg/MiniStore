import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { InMemoryStore } from '../src/store/InMemoryStore.js';
import { CommandHandler } from '../src/server/CommandHandler.js';
import { TcpServer } from '../src/server/TcpServer.js';
import { PubSubManager } from '../src/server/PubSubManager.js';

class TestClient {
  readonly #socket: net.Socket;
  #buffer = '';
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

  #drain(): void {
    while (this.#lines.length > 0 && this.#waiters.length > 0) {
      const line = this.#lines.shift()!;
      this.#waiters.shift()!(line);
    }
  }

  send(line: string): Promise<string> {
    const reply = new Promise<string>((resolve) => this.#waiters.push(resolve));
    this.#socket.write(`${line}\r\n`);
    this.#drain();
    return reply;
  }

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

  async readArray(): Promise<{ header: string; items: string[] }> {
    const headerLine = await this.expectReply();
    if (!headerLine.startsWith('*')) {
      throw new Error(`Expected array header, got ${headerLine}`);
    }
    const count = Number(headerLine.slice(1));
    const items: string[] = [];
    for (let i = 0; i < count; i++) {
      items.push(await this.expectReply());
    }
    return { header: headerLine, items };
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

async function startServer(): Promise<{ server: TcpServer; port: number; host: string; store: InMemoryStore }> {
  const store = new InMemoryStore({ maxKeys: 100 });
  const pubSubManager = new PubSubManager();
  const handler = new CommandHandler(store, undefined, undefined, pubSubManager);
  const server = new TcpServer({ 
    host: '127.0.0.1', 
    port: 0, 
    maxLineBytes: 1024,
    onConnectionClose: (conn) => pubSubManager.removeConnection(conn)
  }, (line, conn) => handler.handleLine(line, conn));
  const { host, port } = await server.listen();
  return { server, port, host, store };
}

test('PubSub Integration - subscribe, publish, unsubscribe', async (t) => {
  const { server, port, host } = await startServer();
  const sub1 = await TestClient.connect(port, host);
  const sub2 = await TestClient.connect(port, host);
  const pub = await TestClient.connect(port, host);

  t.after(async () => {
    sub1.close();
    sub2.close();
    pub.close();
    await server.close();
  });

  // Subscribe sub1 to 'news'
  const r1 = await sub1.sendArray('SUBSCRIBE news');
  assert.deepEqual(r1, { header: '*3', items: ['$subscribe', '$news', '$1'] });

  // Subscribe sub2 to 'news' and 'sports'
  const r2a = await sub2.sendArray('SUBSCRIBE news sports');
  assert.deepEqual(r2a, { header: '*3', items: ['$subscribe', '$news', '$1'] });
  const r2b = await sub2.readArray();
  assert.deepEqual(r2b, { header: '*3', items: ['$subscribe', '$sports', '$2'] });

  // Publish from pub
  assert.equal(await pub.send('PUBLISH news breaking'), ':2');
  
  // Both subs should receive the message
  const msg1 = await sub1.readArray();
  assert.deepEqual(msg1, { header: '*3', items: ['$message', '$news', '$breaking'] });
  
  const msg2 = await sub2.readArray();
  assert.deepEqual(msg2, { header: '*3', items: ['$message', '$news', '$breaking'] });

  // sub1 tries to run SET, which should fail
  assert.equal(await sub1.send('SET foo bar'), '-ERR only (P)SUBSCRIBE / (P)UNSUBSCRIBE / PING / QUIT allowed in this context');

  // sub1 unsubscribes
  const r3 = await sub1.sendArray('UNSUBSCRIBE');
  assert.deepEqual(r3, { header: '*3', items: ['$unsubscribe', '$news', '$0'] });

  // Publish again
  assert.equal(await pub.send('PUBLISH news update'), ':1');
  const msg3 = await sub2.readArray();
  assert.deepEqual(msg3, { header: '*3', items: ['$message', '$news', '$update'] });

  // sub1 can now run SET
  assert.equal(await sub1.send('SET foo bar'), '+OK');
});
