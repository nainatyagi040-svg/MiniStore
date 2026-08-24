import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { InMemoryStore } from '../src/store/InMemoryStore.js';
import { CommandHandler } from '../src/server/CommandHandler.js';
import { TcpServer } from '../src/server/TcpServer.js';

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
  const handler = new CommandHandler(store);
  const server = new TcpServer({ host: '127.0.0.1', port: 0, maxLineBytes: 1024 }, (line, conn) =>
    handler.handleLine(line, conn),
  );
  const { host, port } = await server.listen();
  return { server, port, host, store };
}

test('MULTI / EXEC: queues commands and executes them atomically', async (t) => {
  const { server, port, host } = await startServer();
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  assert.equal(await client.send('MULTI'), '+OK');
  assert.equal(await client.send('SET txkey txval'), '+QUEUED');
  assert.equal(await client.send('GET txkey'), '+QUEUED');
  
  const execReply = await client.sendArray('EXEC');
  assert.equal(execReply.header, '*2');
  assert.deepEqual(execReply.items, ['+OK', '$txval']);
});

test('MULTI / DISCARD: clears queue without executing', async (t) => {
  const { server, port, host, store } = await startServer();
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  assert.equal(await client.send('MULTI'), '+OK');
  assert.equal(await client.send('SET disc 1'), '+QUEUED');
  assert.equal(await client.send('DISCARD'), '+OK');
  
  assert.equal(store.exists('disc'), false, 'Discarded commands should not execute');
  
  // Subsequent commands work normally
  assert.equal(await client.send('SET disc 2'), '+OK');
  assert.equal(await client.send('GET disc'), '$2');
});

test('MULTI: nesting MULTI returns an error', async (t) => {
  const { server, port, host } = await startServer();
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  assert.equal(await client.send('MULTI'), '+OK');
  assert.equal(await client.send('MULTI'), '-ERR MULTI calls can not be nested');
});

test('EXEC / DISCARD without MULTI returns error', async (t) => {
  const { server, port, host } = await startServer();
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  assert.equal(await client.send('EXEC'), '-ERR EXEC without MULTI');
  assert.equal(await client.send('DISCARD'), '-ERR DISCARD without MULTI');
});

test('EXEC: continues on wrong-type error just like Redis', async (t) => {
  const { server, port, host } = await startServer();
  const client = await TestClient.connect(port, host);
  t.after(async () => {
    client.close();
    await server.close();
  });

  await client.send('SET k1 v1');

  assert.equal(await client.send('MULTI'), '+OK');
  assert.equal(await client.send('LPUSH k1 val'), '+QUEUED'); // Wrong type, but queues
  assert.equal(await client.send('SET k2 v2'), '+QUEUED');
  
  const execReply = await client.sendArray('EXEC');
  assert.equal(execReply.header, '*2');
  assert.equal(execReply.items[0], '-WRONGTYPE Operation against a key holding the wrong kind of value');
  assert.equal(execReply.items[1], '+OK');
  
  assert.equal(await client.send('GET k2'), '$v2', 'Later commands still executed');
});
