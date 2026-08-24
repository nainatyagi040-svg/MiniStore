import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { InMemoryStore } from '../store/InMemoryStore.js';

export interface Snapshot {
  size: number;
  maxKeys: number;
  evictions: number;
  keys: Array<{
    name: string;
    type: string;
    ttl: number;
  }>;
}

export class StatsServer {
  readonly #store: InMemoryStore;
  readonly #port: number;
  readonly #host: string;
  readonly #intervalMs: number;

  #server?: http.Server;
  #wss?: WebSocketServer;
  #timer?: ReturnType<typeof setInterval>;

  constructor(store: InMemoryStore, host = '127.0.0.1', port = 8090, intervalMs = 1000) {
    this.#store = store;
    this.#host = host;
    this.#port = port;
    this.#intervalMs = intervalMs;
  }

  get port(): number {
    const address = this.#server?.address();
    if (address && typeof address !== 'string') {
      return address.port;
    }
    return this.#port;
  }

  async start(): Promise<void> {
    this.#server = http.createServer((req, res) => {
      // Just a simple health check
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });

    this.#wss = new WebSocketServer({ server: this.#server });
    
    this.#wss.on('connection', (ws) => {
      ws.send(JSON.stringify(this.#buildSnapshot()));
    });

    this.#timer = setInterval(() => {
      this.#broadcast();
    }, this.#intervalMs);

    return new Promise((resolve) => {
      this.#server!.listen(this.#port, this.#host, resolve);
    });
  }

  async stop(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    
    return new Promise((resolve, reject) => {
      if (this.#wss) {
        for (const client of this.#wss.clients) {
          client.close();
        }
        this.#wss.close();
      }
      if (this.#server) {
        this.#server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }

  #broadcast(): void {
    if (!this.#wss || this.#wss.clients.size === 0) return;
    const snap = JSON.stringify(this.#buildSnapshot());
    for (const client of this.#wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(snap);
      }
    }
  }

  #buildSnapshot(): Snapshot {
    const keys = [];
    for (const key of this.#store.keysMRU()) {
      const type = this.#store.keyType(key);
      const ttl = this.#store.ttl(key);
      if (type !== undefined) {
        keys.push({ name: key, type, ttl });
      }
    }
    
    return {
      size: this.#store.size,
      maxKeys: this.#store.maxKeys,
      evictions: this.#store.evictions,
      keys
    };
  }
}
